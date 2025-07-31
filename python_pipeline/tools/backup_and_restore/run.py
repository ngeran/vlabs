#!/usr/bin/env python3
# =========================================================================================
#
# FILE:               run.py (Orchestrator)
#
# OVERVIEW:
#   A high-performance, asynchronous orchestrator for running backup and restore operations
#   on Juniper devices. This script serves as the main entry point, parsing command-line
#   arguments to determine the operation mode and target devices. It uses asyncio to
#   concurrently manage operations on multiple devices and emits structured JSON progress
#   updates for consumption by a frontend application.
#
# KEY FEATURES:
#   - Dual Operation Modes: Supports both 'backup' and 'restore' commands.
#   - Concurrent Operations: Leverages Python's `asyncio` for simultaneous backups.
#   - Flexible Targeting: Accepts a direct `--hostname` or a full path to a YAML
#     `--inventory_file`.
#   - Structured JSON Output: Communicates all progress via structured JSON on stderr.
#   - Robust Argument Parsing: Uses argparse for a rich set of command-line options.
#
# =========================================================================================

# SECTION 1: IMPORTS & DEPENDENCIES
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

from BackupConfig import BackupManager
from RestoreConfig import RestoreManager


# SECTION 2: UTILITIES
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
    print(f"JSON_PROGRESS: {json.dumps(progress_update)}", file=sys.stderr, flush=True)

def parse_inventory_file(inventory_path: Path) -> list[str]:
    """Parses a YAML inventory file and returns a list of Juniper host IPs."""
    with open(inventory_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, list):
        raise TypeError(f"Inventory file '{inventory_path.name}' is not a valid YAML list.")
    return [
        d["ip_address"]
        for loc in data
        for dt in ["routers", "switches"]
        for d in loc.get(dt, [])
        if d.get("vendor", "").upper() == "JUNIPER" and d.get("ip_address")
    ]


# SECTION 3: MAIN ASYNCHRONOUS ORCHESTRATOR
# ====================================================================================
async def main():
    """Parses arguments and orchestrates the backup or restore workflow."""
    logger = setup_logging()

    # --- Argument Parser Setup ---
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

        # --- Backup Workflow ---
        if args.command == 'backup':
            if args.inventory_file:
                # ========== START OF FIX ==========
                # The script now uses the exact path provided by the --inventory_file argument.
                # It no longer incorrectly assumes the file is in a '/data' directory.
                inventory_path = Path(args.inventory_file)

                # The check and error message now use the correct path.
                if not inventory_path.is_file():
                    raise FileNotFoundError(f"Inventory file not found at the specified path: {inventory_path}")
                # ========== END OF FIX ==========

                hosts_to_run = parse_inventory_file(inventory_path)
            elif args.hostname:
                hosts_to_run = [h.strip() for h in args.hostname.split(',') if h.strip()]
            else:
                raise ValueError("No target specified. Use --hostname or --inventory_file for backup.")

            if not hosts_to_run:
                raise ValueError("No target hosts found for backup.")

            total_steps = len(hosts_to_run) * 2
            send_progress("info", "OPERATION_START", {"total_steps": total_steps}, f"Starting backup for {len(hosts_to_run)} device(s)")

            tasks = [
                BackupManager(h, args.username, args.password, Path(args.backup_path), i*2, send_progress).run_backup()
                for i, h in enumerate(hosts_to_run)
            ]
            results = await asyncio.gather(*tasks)

            succeeded = {data['host']: data for status, data in results if status == "SUCCESS"}
            failed = {data['host']: data['error'] for status, data in results if status == "FAILED"}
            is_overall_success = not failed
            final_results = {"success": is_overall_success, "message": f"Backup finished. Succeeded: {len(succeeded)}, Failed: {len(failed)}.", "details": {"succeeded": succeeded, "failed": failed}}

        # --- Restore Workflow (No Changes Needed Here) ---
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

        send_progress("success" if is_overall_success else "error", "OPERATION_COMPLETE", {"status": "SUCCESS" if is_overall_success else "FAILED"}, "All operations finished.")

    except Exception as e:
        error_msg = f"A critical error occurred: {e}"
        logger.error(error_msg, exc_info=True)
        send_progress("error", "OPERATION_COMPLETE", {"status": "FAILED"}, error_msg)
        final_results = {"success": False, "message": error_msg, "traceback": traceback.format_exc()}
        print(json.dumps(final_results, indent=2))
        sys.exit(1)

    print(json.dumps(final_results, indent=2))
    sys.exit(0 if is_overall_success else 1)


# SECTION 4: SCRIPT ENTRY POINT
# ====================================================================================
if __name__ == "__main__":
    asyncio.run(main())
