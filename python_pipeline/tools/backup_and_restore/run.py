# python_pipeline/tools/backup_and_restore/run.py

import argparse
import json
import sys
import os
from pathlib import Path

# Move ProgressTracker and other core utilities to a shared utils file if needed,
# but for now, we can keep it here or in a new 'shared_utils.py'.
# Let's assume you've moved ProgressTracker and the logging setup to a new `shared_utils.py`
from utils.shared_utils import ProgressTracker, setup_logging
from utils.connect_to_hosts import connect_to_hosts, disconnect_from_hosts

# Import your new logic modules
from BackupConfig import BackupManager
from RestoreConfig import RestoreManager

def main():
    # Setup logging and progress tracker
    logger = setup_logging()
    progress = ProgressTracker()

    # --- New Argparse with Sub-commands ---
    parser = argparse.ArgumentParser(description="Juniper Backup and Restore Tool.")
    parser.add_argument('--hostname', required=True, help="Target device hostname or IP")
    parser.add_argument('--username', required=True, help="SSH username")
    parser.add_argument('--password', required=True, help="SSH password")

    subparsers = parser.add_subparsers(dest='command', required=True, help='Available commands')

    # --- Backup Command ---
    parser_backup = subparsers.add_parser('backup', help='Perform a device backup')
    parser_backup.add_argument('--backup_path', default='./backups', help='Directory to save backups')
    parser_backup.add_argument('--config_only', action='store_true', help='Backup only config files')

    # --- Restore Command ---
    parser_restore = subparsers.add_parser('restore', help='Restore a configuration to a device')
    parser_restore.add_argument('backup_file', help='Path to the backup file to restore')
    parser_restore.add_argument('--type', choices=['override', 'set', 'merge'], default='override',
                                help="Type of load operation (override, set, merge)")
    parser_restore.add_argument('--confirmed_commit_timeout', type=int, default=5,
                                help="Timeout in minutes for confirmed commit (0 to disable)")

    args = parser.parse_args()

    # --- Main Logic ---
    connections = []
    try:
        progress.start_operation(f"Connecting to {args.hostname}")
        connections = connect_to_hosts(host=args.hostname, username=args.username, password=args.password)
        dev = connections[0]
        progress.complete_operation("SUCCESS")

        if args.command == 'backup':
            manager = BackupManager(dev, progress)
            manager.run_backup(backup_path=args.backup_path, config_only=args.config_only)

        elif args.command == 'restore':
            manager = RestoreManager(dev, progress)
            manager.run_restore(
                backup_file_path=args.backup_file,
                restore_type=args.type,
                confirmed_timeout=args.confirmed_commit_timeout
            )

    except Exception as e:
        error_msg = f"A critical error occurred: {str(e)}"
        logger.error(error_msg, exc_info=True)
        progress.complete_operation("FAILED")
        # Ensure final results are printed even on failure
        results = {"success": False, "message": error_msg, "progress": progress.get_summary()}
        print(json.dumps(results, indent=2))
        sys.exit(1)

    finally:
        if connections:
            disconnect_from_hosts(connections)
            logger.info("Disconnected from device.")

if __name__ == "__main__":
    main()
