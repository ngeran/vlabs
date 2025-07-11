# python_pipeline/tools/backup_and_restore/run.py

import argparse
import json
import sys
import logging

# --- FIX 1: Import the manager class and the correct utils ---
from utils.shared_utils import ProgressTracker, setup_logging
from utils.connect_to_hosts import JuniperConnectionManager
from BackupConfig import BackupManager
from RestoreConfig import RestoreManager

def main():
    # Setup standard logging and progress tracking
    logger = setup_logging()
    progress = ProgressTracker()

    parser = argparse.ArgumentParser(description="Juniper Backup and Restore Tool.")
    
    parser.add_argument('--command', choices=['backup', 'restore'], required=True, help='The command to execute.')

    target_group = parser.add_mutually_exclusive_group(required=True)
    target_group.add_argument('--hostname', help="A single hostname or IP address.")
    target_group.add_argument('--inventory_file', help="Path to an inventory file in the /data directory.")

    parser.add_argument('--username', required=True, help="SSH username")
    parser.add_argument('--password', required=True, help="SSH password")

    parser.add_argument('--backup_path', default='./backups', help='Directory to save backups')
    parser.add_argument('--config_only', action='store_true', help='If set, backup only config files')

    parser.add_argument('--backup_file', help='Path to the backup file to restore. Required for restore command.')
    parser.add_argument('--type', choices=['override', 'set', 'merge'], default='override', help="Type of load operation")
    parser.add_argument('--confirmed_commit_timeout', type=int, default=5, help="Timeout in minutes for confirmed commit")
    
    try:
        args, unknown = parser.parse_known_args()
        if args.command == 'restore' and not args.backup_file:
            parser.error("argument --backup_file is required when command is 'restore'")
    except SystemExit as e:
        print(f"DEBUG: argparse failed with SystemExit: {e}", file=sys.stderr)
        raise

    host_to_run = ""
    if args.hostname:
        host_to_run = args.hostname
        logger.info(f"Manual mode: Targeting host '{host_to_run}'")
    elif args.inventory_file:
        logger.info(f"Inventory mode: Using file '{args.inventory_file}'.")
        raise NotImplementedError("Inventory file parsing is not yet fully implemented in this script.")

    if not host_to_run:
        raise ValueError("Could not determine a target host.")

    # --- FIX 1 (continued): Instantiate and use the connection manager ---
    conn_manager = JuniperConnectionManager()
    final_results = {}
    try:
        progress.start_operation(f"Initiating '{args.command}' on {host_to_run}")
        
        # Use the manager's method which returns ConnectionResult objects
        connection_results = conn_manager.connect_to_hosts(
            hosts=[host_to_run], 
            username=args.username, 
            password=args.password
        )
                
        # This check will now work because connection_results[0] is a ConnectionResult object
        if not connection_results or not connection_results[0].success:
            error_msg = connection_results[0].error if connection_results else "Connection failed for unknown reasons."
            raise ConnectionError(error_msg)

        # Get the device object from the successful connection result
        dev = connection_results[0].device
        
        progress.complete_step("COMPLETED", {"message": f"Connected to {dev.hostname} running {dev.facts.get('version', 'N/A')}"})
        
        if args.command == 'backup':
            logger.info("Executing backup command...")
            manager = BackupManager(dev, progress, logger)
            manager.run_backup(backup_path=args.backup_path, config_only=args.config_only)
            final_results = {"success": True, "message": f"Backup for {host_to_run} completed successfully."}

        elif args.command == 'restore':
            logger.info("Executing restore command...")
            manager = RestoreManager(dev, progress, logger)
            manager.run_restore(
                backup_file_path=args.backup_file,
                restore_type=args.type,
                confirmed_timeout=args.confirmed_commit_timeout
            )
            final_results = {"success": True, "message": f"Restore on {host_to_run} completed successfully."}
        
        progress.complete_operation("SUCCESS")
        final_results["progress_summary"] = progress.get_summary()

    except Exception as e:
        # Create a final error message that includes the traceback
        error_msg = f"A critical error occurred during '{args.command}':\n\n{detailed_error}"

        # Log the full error to the console (for server-side debugging)
        logger.error(f"Caught exception in main: {e}", exc_info=False)
        
        if progress.current_operation:
            progress.complete_operation("FAILED")
        
        # This final_results object is what gets sent to the frontend
        final_results = {
            "success": False,
            # The 'message' field will now contain the full traceback
            "message": error_msg,
            "progress_summary": progress.get_summary()
        }
        # Print the JSON result to standard output
        print(json.dumps(final_results, indent=2))
        
        # Exit with an error code
        sys.exit(1)
    finally:
        # --- FIX 1 (continued): Use the manager to disconnect ---
        if conn_manager:
            conn_manager.disconnect_from_all_hosts()
            logger.info(f"Disconnected from all target devices.")

    print(json.dumps(final_results, indent=2))

if __name__ == "__main__":
    main()
