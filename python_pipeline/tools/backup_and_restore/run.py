# =========================================================================================
# FILE: run.py (Orchestrator)
#
# OVERVIEW:
#   Main entry point. Now includes a '--commit_timeout' argument for restore operations.
# =========================================================================================

# ====================================================================================
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

# ====================================================================================
# SECTION 2: UTILITIES (Unchanged)
# ====================================================================================
def setup_logging():
    logger = logging.getLogger(__name__)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    return logger

def send_progress(level: str, event_type: str, data: dict, message: str = ""):
    progress_update = { "level": level.upper(), "event_type": event_type, "message": message, "data": data, "timestamp": datetime.utcnow().isoformat() }
    print(f"JSON_PROGRESS: {json.dumps(progress_update)}", file=sys.stderr, flush=True)

def parse_inventory_file(inventory_path: Path) -> list[str]:
    with open(inventory_path, "r", encoding="utf-8") as f: data = yaml.safe_load(f)
    if not isinstance(data, list): raise TypeError(f"Inventory file '{inventory_path.name}' is not a valid YAML list.")
    return [d["ip_address"] for loc in data for dt in ["routers", "switches"] for d in loc.get(dt, []) if d.get("vendor", "").upper() == "JUNIPER" and d.get("ip_address")]

# ====================================================================================
# SECTION 3: MAIN ASYNCHRONOUS ORCHESTRATOR
# ====================================================================================
async def main():
    logger = setup_logging()
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--command', choices=['backup', 'restore'], required=True)
    parser.add_argument('--hostname')
    parser.add_argument('--inventory_file')
    parser.add_argument('--username', required=True)
    parser.add_argument('--password', required=True)
    parser.add_argument('--backup_path', default='/backups')
    parser.add_argument('--config_only', action='store_true')
    parser.add_argument('--backup_file')
    parser.add_argument('--type', default='override')
    parser.add_argument('--confirmed_commit_timeout', type=int, default=0, help="Timeout in minutes for confirmed commit rollback.")
    # <--- NEW: Add an argument for the commit operation's own timeout. Default is 5 minutes (300s).
    parser.add_argument('--commit_timeout', type=int, default=300, help="Timeout in seconds for the commit operation itself.")

    final_results = {}
    try:
        args = parser.parse_args()

        if args.command == 'backup':
            # --- BACKUP WORKFLOW (Unchanged) ---
            if args.inventory_file:
                inventory_filename = Path(args.inventory_file).name
                inventory_path = Path('/data') / inventory_filename
                if not inventory_path.is_file(): raise FileNotFoundError(f"Inventory file '{inventory_filename}' not found in /data.")
                hosts_to_run = parse_inventory_file(inventory_path)
            else:
                hosts_to_run = [h.strip() for h in args.hostname.split(',') if h.strip()]
            if not hosts_to_run: raise ValueError("No target hosts for backup.")
            total_steps, tasks = len(hosts_to_run) * 2, []
            send_progress("info", "OPERATION_START", {"total_steps": total_steps}, f"Starting backup for {len(hosts_to_run)} device(s)")
            for i, h in enumerate(hosts_to_run):
                tasks.append(BackupManager(h, args.username, args.password, Path(args.backup_path), i*2, send_progress).run_backup())
            results = await asyncio.gather(*tasks)
            succeeded = {data['host']: data for status, data in results if status == "SUCCESS"}
            failed = {data['host']: data['error'] for status, data in results if status == "FAILED"}
            is_overall_success = not failed
            final_results = {"success": is_overall_success, "message": f"Backup finished. Succeeded: {len(succeeded)}, Failed: {len(failed)}.", "details": {"succeeded": succeeded, "failed": failed}}

        elif args.command == 'restore':
            # --- RESTORE WORKFLOW ---
            if not args.hostname: raise ValueError("A target hostname is required for the restore command.")
            if not args.backup_file: raise ValueError("A backup file name is required for the restore command.")

            send_progress("info", "OPERATION_START", {"total_steps": 4}, f"Starting restore for {args.hostname}")

            # <--- MODIFIED: Pass the new commit_timeout to the RestoreManager
            manager = RestoreManager(
                host=args.hostname,
                username=args.username,
                password=args.password,
                backup_path=Path(args.backup_path),
                backup_file=args.backup_file,
                restore_type=args.type,
                confirmed_timeout=args.confirmed_commit_timeout,
                commit_timeout=args.commit_timeout, # <--- Pass the new argument
                step_offset=0,
                progress_callback=send_progress
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

# ====================================================================================
# SECTION 4: SCRIPT ENTRY POINT
# ====================================================================================
if __name__ == "__main__":
    asyncio.run(main())
