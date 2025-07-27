#!/usr/bin/env python3
# =========================================================================================
#
# FILE:               run.py (Orchestrator)
#
# OVERVIEW:
#   A high-performance, asynchronous orchestrator for running backup and restore operations
#   on Juniper devices. This script serves as the main entry point, parsing command-line
#   arguments to determine the operation mode and target devices. It uses asyncio to
#   concurrently manage operations on multiple devices (for backups) and emits
#   structured JSON progress updates for consumption by a frontend application.
#
# KEY FEATURES:
#   - Dual Operation Modes: Supports both 'backup' and 'restore' commands with
#     dedicated logic and argument sets for each.
#   - Concurrent Operations: Leverages Python's `asyncio` library to run backup
#     operations on multiple devices simultaneously, significantly reducing total runtime.
#   - Flexible Targeting: Can target a single device via `--hostname` or multiple devices
#     defined in a YAML inventory file via `--inventory_file`.
#   - Structured JSON Output: Communicates all progress, results, and errors as
#     structured JSON messages sent to stderr, ideal for real-time UI integration.
#   - Robust Argument Parsing: Uses argparse to handle a rich set of command-line
#     options with clear help messages and defaults.
#   - Centralized Error Handling: A global try/except block ensures that any unexpected
#     failure is caught and reported in a consistent, structured error format.
#
# DEPENDENCIES:
#   - PyYAML: For parsing YAML inventory files.
#   - jnpr-pyez: The official Juniper library for automating Junos devices.
#
# HOW-TO GUIDE:
#   This script is designed to be executed by a backend service within a container. The
#   service is responsible for passing all parameters as CLI arguments. The Python '-u'
#   flag is recommended for unbuffered I/O.
#
#   Backup Example (Single Host):
#   python -u run.py --command backup --hostname "192.168.1.1" --username "user" --password "pass"
#
#   Restore Example:
#   python -u run.py --command restore --hostname "192.168.1.1" --username "user" --password "pass" \
#     --backup_file "20230101_120000_my-router_config.xml" --type override --confirmed_commit_timeout 5
#
# =========================================================================================


# ====================================================================================
# SECTION 1: IMPORTS & DEPENDENCIES
# All necessary standard library and third-party modules are imported here.
# ====================================================================================
import argparse
import json
import sys
import logging
import traceback
import yaml
import asyncio
from pathlib import Path
from datetime import datetime

# Import the worker classes that contain the device-specific logic.
from BackupConfig import BackupManager
from RestoreConfig import RestoreManager


# ====================================================================================
# SECTION 2: UTILITIES
# Helper functions for logging, event emission, and data parsing.
# ====================================================================================

def setup_logging():
    """Configures a basic logger to stderr for internal diagnostics."""
    logger = logging.getLogger(__name__)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        formatter = logging.Formatter('%(asctime)s - [ORCHESTRATOR] - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    return logger

def send_progress(level: str, event_type: str, data: dict, message: str = ""):
    """Constructs and prints a structured JSON event to stderr."""
    progress_update = {
        "level": level.upper(),
        "event_type": event_type,
        "message": message,
        "data": data,
        "timestamp": datetime.utcnow().isoformat()
    }
    # Send all progress updates to stderr to keep stdout clean for the final result.
    print(f"JSON_PROGRESS: {json.dumps(progress_update)}", file=sys.stderr, flush=True)

def parse_inventory_file(inventory_path: Path) -> list[str]:
    """Parses a YAML inventory file and returns a list of Juniper host IPs."""
    with open(inventory_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, list):
        raise TypeError(f"Inventory file '{inventory_path.name}' is not a valid YAML list.")
    # Extract IP addresses for devices explicitly marked as 'JUNIPER'.
    return [
        d["ip_address"]
        for loc in data
        for dt in ["routers", "switches"]
        for d in loc.get(dt, [])
        if d.get("vendor", "").upper() == "JUNIPER" and d.get("ip_address")
    ]


# ====================================================================================
# SECTION 3: MAIN ASYNCHRONOUS ORCHESTRATOR
# Contains the primary business logic for the script.
# ====================================================================================
async def main():
    """Parses arguments and orchestrates the backup or restore workflow."""
    logger = setup_logging()

    # --- Argument Parser Setup ---
    # Using a single parser clearly defines all possible arguments for the script.
    parser = argparse.ArgumentParser(description="Juniper Backup and Restore Orchestrator")
    parser.add_argument('--command', choices=['backup', 'restore'], required=True, help="The operation to perform.")
    # Target selection group
    parser.add_argument('--hostname', help="A single hostname or a comma-separated list of hostnames.")
    parser.add_argument('--inventory_file', help="Path to a YAML inventory file for targeting multiple devices.")
    # Universal arguments
    parser.add_argument('--username', required=True, help="The username for device authentication.")
    parser.add_argument('--password', required=True, help="The password for device authentication.")
    parser.add_argument('--backup_path', default='/backups', help="The directory where backups are stored.")
    # Restore-specific arguments
    parser.add_argument('--backup_file', help="The specific backup file to restore.")
    parser.add_argument('--type', default='override', choices=['override', 'merge', 'update'], help="The restore method.")
    parser.add_argument('--confirmed_commit_timeout', type=int, default=0, help="Timeout in minutes for confirmed commit rollback (0 to disable).")
    parser.add_argument('--commit_timeout', type=int, default=300, help="Timeout in seconds for the commit operation itself.")

    final_results = {}
    is_overall_success = False
    try:
        args = parser.parse_args()

        # --- Backup Workflow ---
        if args.command == 'backup':
            if args.inventory_file:
                inventory_filename = Path(args.inventory_file).name
                inventory_path = Path('/data') / inventory_filename
                if not inventory_path.is_file():
                    raise FileNotFoundError(f"Inventory file '{inventory_filename}' not found in /data.")
                hosts_to_run = parse_inventory_file(inventory_path)
            elif args.hostname:
                hosts_to_run = [h.strip() for h in args.hostname.split(',') if h.strip()]
            else:
                raise ValueError("No target specified. Use --hostname or --inventory_file for backup.")

            if not hosts_to_run:
                raise ValueError("No target hosts found for backup.")

            total_steps = len(hosts_to_run) * 2  # Each host has 2 steps: connect and backup
            send_progress("info", "OPERATION_START", {"total_steps": total_steps}, f"Starting backup for {len(hosts_to_run)} device(s)")

            # Create a list of async tasks, one for each host.
            tasks = [
                BackupManager(h, args.username, args.password, Path(args.backup_path), i*2, send_progress).run_backup()
                for i, h in enumerate(hosts_to_run)
            ]
            # Run all tasks concurrently and wait for them to complete.
            results = await asyncio.gather(*tasks)

            # Process the results from all tasks.
            succeeded = {data['host']: data for status, data in results if status == "SUCCESS"}
            failed = {data['host']: data['error'] for status, data in results if status == "FAILED"}
            is_overall_success = not failed
            final_results = {"success": is_overall_success, "message": f"Backup finished. Succeeded: {len(succeeded)}, Failed: {len(failed)}.", "details": {"succeeded": succeeded, "failed": failed}}

        # --- Restore Workflow ---
        elif args.command == 'restore':
            if not args.hostname: raise ValueError("A target --hostname is required for the restore command.")
            if not args.backup_file: raise ValueError("A --backup_file name is required for the restore command.")

            send_progress("info", "OPERATION_START", {"total_steps": 4}, f"Starting restore for {args.hostname}")

            manager = RestoreManager(
                host=args.hostname,
                username=args.username,
                password=args.password,
                backup_path=Path(args.backup_path),
                backup_file=args.backup_file,
                restore_type=args.type,
                confirmed_timeout=args.confirmed_commit_timeout,
                commit_timeout=args.commit_timeout,
                step_offset=0,
                progress_callback=send_progress
            )
            status, data = await manager.run_restore()

            is_overall_success = status == "SUCCESS"
            final_results = {"success": is_overall_success, "message": data.get("message", data.get("error")), "details": data}

        send_progress("success" if is_overall_success else "error", "OPERATION_COMPLETE", {"status": "SUCCESS" if is_overall_success else "FAILED"}, "All operations finished.")

    except Exception as e:
        # Global error handler for any uncaught exceptions (e.g., arg parsing, file not found).
        error_msg = f"A critical error occurred: {e}"
        logger.error(error_msg, exc_info=True)
        send_progress("error", "OPERATION_COMPLETE", {"status": "FAILED"}, error_msg)
        final_results = {"success": False, "message": error_msg, "traceback": traceback.format_exc()}
        # Print the final result to stdout so the backend can capture it.
        print(json.dumps(final_results, indent=2))
        sys.exit(1)

    # On success, print the final result to stdout.
    print(json.dumps(final_results, indent=2))
    sys.exit(0 if is_overall_success else 1)


# ====================================================================================
# SECTION 4: SCRIPT ENTRY POINT
# This block executes when the script is run directly.
# ====================================================================================
if __name__ == "__main__":
    asyncio.run(main())
