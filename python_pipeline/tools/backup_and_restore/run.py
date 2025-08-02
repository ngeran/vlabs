#!/usr/bin/env python3
# =================================================================================================
#
# FILE:               run.py (Orchestrator for Backup & Restore)
#
# OVERVIEW:
#   A high-performance, asynchronous orchestrator for running backup and restore operations
#   on Juniper devices. This script serves as the main entry point, parsing command-line
#   arguments to determine the operation mode and target devices. It uses asyncio to
#   concurrently manage operations on multiple devices and emits standardized, single-line
#   JSON progress updates for consumption by a real-time frontend application.
#
# KEY FEATURES:
#   - Standardized JSON Output: Adheres to the unified data contract by sending all UI-facing
#     JSON events (progress and final result) to `stdout` as single, compact lines.
#   - Dual Operation Modes: Supports both 'backup' and 'restore' commands via a simple
#     `--command` flag.
#   - Concurrent Operations: Leverages Python's `asyncio` to perform simultaneous backup
#     operations on multiple devices, dramatically reducing execution time.
#   - Flexible Targeting: Accepts either a direct `--hostname` (single or comma-separated)
#     or a full path to a YAML `--inventory_file` for targeting devices.
#   - Decoupled Worker Logic: Orchestrates the `BackupManager` and `RestoreManager` worker
#     classes, passing them a callback for clean, decoupled progress reporting.
#
# DEPENDENCIES:
#   - PyYAML: For parsing YAML inventory files.
#   - Local Modules: `BackupConfig.py` and `RestoreConfig.py`.
#
# =================================================================================================

# =================================================================================================
# SECTION 1: IMPORTS
# All necessary standard library and local modules are imported here.
# =================================================================================================
import argparse
import json
import sys
import logging
import traceback
import yaml
import asyncio
from pathlib import Path
from datetime import datetime

# Local worker classes that contain the device-specific logic.
from BackupConfig import BackupManager
from RestoreConfig import RestoreManager


# =================================================================================================
# SECTION 2: UTILITIES & CONFIGURATION
# Helper functions for logging, progress reporting, and inventory parsing.
# =================================================================================================

def setup_logging():
    """
    Configures a logger for internal diagnostics, directing all output to stderr.
    This separates developer-facing logs from the UI-facing JSON on stdout.
    """
    logger = logging.getLogger(__name__)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        formatter = logging.Formatter('%(asctime)s - [ORCHESTRATOR] - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    return logger

def send_progress(level: str, event_type: str, data: dict, message: str = ""):
    """
    Constructs a structured JSON event and prints it to stdout.
    This is the single, unified channel for all real-time UI communication.
    """
    progress_update = {
        "level": level.upper(),
        "event_type": event_type,
        "message": message,
        "data": data,
        "timestamp": datetime.utcnow().isoformat()
    }
    # --- ### STANDARDIZATION FIX ### ---
    # By printing to `sys.stdout` and removing the "JSON_PROGRESS:" prefix, this script
    # now adheres to the same data contract as the File Uploader and JSNAPy runners.
    # The `flush=True` is critical for real-time streaming.
    print(json.dumps(progress_update), file=sys.stdout, flush=True)

def parse_inventory_file(inventory_path: Path) -> list[str]:
    """
    Parses a YAML inventory file and returns a list of Juniper host IPs.
    This function is designed to understand a specific, structured YAML format.
    """
    with open(inventory_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, list):
        raise TypeError(f"Inventory file '{inventory_path.name}' is not a valid YAML list.")
    # Extract IP addresses for all Juniper devices found in the inventory.
    return [
        d["ip_address"]
        for loc in data
        for dt in ["routers", "switches"]
        for d in loc.get(dt, [])
        if d.get("vendor", "").upper() == "JUNIPER" and d.get("ip_address")
    ]


# =================================================================================================
# SECTION 3: MAIN ASYNCHRONOUS ORCHESTRATOR
# This is the core control-flow function that manages the entire operation.
# =================================================================================================
async def main():
    """Parses arguments and orchestrates the backup or restore workflow."""
    logger = setup_logging()

    # ---------------------------------------------------------------------------------------------
    # Subsection 3.1: Argument Parsing
    # ---------------------------------------------------------------------------------------------
    parser = argparse.ArgumentParser(description="Juniper Backup and Restore Orchestrator")
    parser.add_argument('--command', choices=['backup', 'restore'], required=True, help="The operation to perform.")
    parser.add_argument('--hostname', help="A single hostname or a comma-separated list of hostnames.")
    parser.add_argument('--inventory_file', help="Path to a YAML inventory file for targeting multiple devices.")
    parser.add_argument('--username', required=True, help="The username for device authentication.")
    parser.add_argument('--password', required=True, help="The password for device authentication.")
    parser.add_argument('--backup_path', default='/backups', help="The directory where backups are stored.")
    parser.add_argument('--backup_file', help="The specific backup file to restore.")
    parser.add_argument('--type', default='override', choices=['override', 'merge', 'update'], help="The restore method.")
    parser.add_argument('--confirmed_commit_timeout', type=int, default=0, help="Timeout for confirmed commit rollback.")
    parser.add_argument('--commit_timeout', type=int, default=300, help="Timeout for the commit operation itself.")

    final_results = {}
    is_overall_success = False
    try:
        args = parser.parse_args()

        # ---------------------------------------------------------------------------------------------
        # Subsection 3.2: Backup Workflow
        # ---------------------------------------------------------------------------------------------
        if args.command == 'backup':
            # Determine the list of target hosts from either the inventory or hostname argument.
            if args.inventory_file:
                inventory_path = Path(args.inventory_file)
                if not inventory_path.is_file():
                    raise FileNotFoundError(f"Inventory file not found at the specified path: {inventory_path}")
                hosts_to_run = parse_inventory_file(inventory_path)
            elif args.hostname:
                hosts_to_run = [h.strip() for h in args.hostname.split(',') if h.strip()]
            else:
                raise ValueError("No target specified. Use --hostname or --inventory_file for backup.")

            if not hosts_to_run:
                raise ValueError("No target hosts found for backup.")

            # Announce the start of the operation for the UI.
            total_steps = len(hosts_to_run) * 2 # (Connect + Backup per host)
            send_progress("info", "OPERATION_START", {"total_steps": total_steps}, f"Starting backup for {len(hosts_to_run)} device(s)")

            # Create an asynchronous task for each host.
            tasks = [
                BackupManager(h, args.username, args.password, Path(args.backup_path), i*2, send_progress).run_backup()
                for i, h in enumerate(hosts_to_run)
            ]
            # Wait for all backup tasks to complete concurrently.
            results = await asyncio.gather(*tasks)

            # Collate the results from all tasks.
            succeeded = {data['host']: data for status, data in results if status == "SUCCESS"}
            failed = {data['host']: data['error'] for status, data in results if status == "FAILED"}
            is_overall_success = not failed
            final_results = {"success": is_overall_success, "message": f"Backup finished. Succeeded: {len(succeeded)}, Failed: {len(failed)}.", "details": {"succeeded": succeeded, "failed": failed}}

        # ---------------------------------------------------------------------------------------------
        # Subsection 3.3: Restore Workflow
        # ---------------------------------------------------------------------------------------------
        elif args.command == 'restore':
            if not args.hostname: raise ValueError("A target --hostname is required for the restore command.")
            if not args.backup_file: raise ValueError("A --backup_file name is required for the restore command.")
            send_progress("info", "OPERATION_START", {"total_steps": 4}, f"Starting restore for {args.hostname}")
            manager = RestoreManager(
                host=args.hostname, username=args.username, password=args.password,
                backup_path=Path(args.backup_path), backup_file=args.backup_file,
                restore_type=args.type, confirmed_timeout=args.confirmed_commit_timeout,
                commit_timeout=args.commit_timeout, step_offset=0, progress_callback=send_progress
            )
            status, data = await manager.run_restore()
            is_overall_success = status == "SUCCESS"
            final_results = {"success": is_overall_success, "message": data.get("message", data.get("error")), "details": data}

        # Announce the completion of the entire operation.
        send_progress("success" if is_overall_success else "error", "OPERATION_COMPLETE", {"status": "SUCCESS" if is_overall_success else "FAILED"}, "All operations finished.")

    except Exception as e:
        # ---------------------------------------------------------------------------------------------
        # Subsection 3.4: Global Error Handling
        # ---------------------------------------------------------------------------------------------
        error_msg = f"A critical error occurred in the orchestrator: {e}"
        logger.error(error_msg, exc_info=True)
        send_progress("error", "OPERATION_COMPLETE", {"status": "FAILED"}, error_msg)
        final_results = {"success": False, "message": error_msg, "traceback": traceback.format_exc()}
        # Print the final error object as a single line to stdout for the backend.
        print(json.dumps(final_results))
        sys.exit(1) # Exit with a non-zero code to indicate failure.

    # ---------------------------------------------------------------------------------------------
    # Subsection 3.5: Final Output
    # ---------------------------------------------------------------------------------------------
    # --- ### STANDARDIZATION FIX ### ---
    # The final result object is printed as a single, compact JSON line to stdout.
    # This allows the Node.js backend to reliably parse it as the definitive result.
    print(json.dumps(final_results))
    sys.exit(0 if is_overall_success else 1)


# =================================================================================================
# SECTION 4: SCRIPT ENTRY POINT
# This block ensures the `asyncio.run(main())` is called only when the script is executed directly.
# =================================================================================================
if __name__ == "__main__":
    asyncio.run(main())
