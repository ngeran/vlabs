# python_pipeline/tools/backup_and_restore/run.py

import argparse
import json
import sys
import logging

# Import the utility functions and manager classes
from utils.shared_utils import ProgressTracker, setup_logging
from utils.connect_to_hosts import connect_to_hosts, disconnect_from_hosts
from BackupConfig import BackupManager
from RestoreConfig import RestoreManager

def main():
    # Setup standard logging and progress tracking
    logger = setup_logging() # Creates and configures the logger
    progress = ProgressTracker()

    # --- Argparse setup to match metadata.yml ---
    parser = argparse.ArgumentParser(description="Juniper Backup and Restore Tool.")
    
    # Common arguments for both backup and restore
     # It makes --hostname and --inventory_file mutually exclusive, and one of them is required.
    target_group = parser.add_mutually_exclusive_group(required=True)
    target_group.add_argument('--hostname', help="A single hostname or IP address.")
    target_group.add_argument('--inventory_file', help="Path to an inventory file in the /data directory.")

    # --- Standard auth arguments ---
    parser.add_argument('--username', required=True, help="SSH username")
    parser.add_argument('--password', required=True, help="SSH password")

    # Define the sub-commands ('backup' and 'restore')
    subparsers = parser.add_subparsers(dest='command', required=True, help='Available commands')

    # --- Define Arguments for the 'backup' Command ---
    parser_backup = subparsers.add_parser('backup', help='Perform a device backup')
    parser_backup.add_argument('--backup_path', default='./backups', help='Directory to save backups')
    parser_backup.add_argument('--config_only', action='store_true', help='If set, backup only config files')

    # --- Define Arguments for the 'restore' Command ---
    parser_restore = subparsers.add_parser('restore', help='Restore a configuration to a device')
    # --- FIX 1: Changed from a positional to a named argument to match the UI ---
    parser_restore.add_argument('--backup_file', required=True, help='Path to the backup file to restore')
    parser_restore.add_argument('--type', choices=['override', 'set', 'merge'], default='override', help="Type of load operation")
    parser_restore.add_argument('--confirmed_commit_timeout', type=int, default=5, help="Timeout in minutes for confirmed commit")

    # Parse arguments sent from the Node.js backend
    args = parser.parse_args()

    # --- NEW LOGIC: Determine the target host from the inputs ---
    host_to_run = ""
    if args.hostname:
        host_to_run = args.hostname
        logger.info(f"Manual mode: Targeting host '{host_to_run}'")
    elif args.inventory_file:
        # In a real implementation, you would parse the YAML file here.
        # For now, we'll just log it and raise an error if not implemented.
        logger.info(f"Inventory mode: Using file '{args.inventory_file}'.")
        # Example parsing:
        # with open(f'/data/{args.inventory_file}') as f:
        #     inventory = yaml.safe_load(f)
        #     host_to_run = inventory['hosts'][0]['ip'] # or similar logic
        raise NotImplementedError("Inventory file parsing is not yet fully implemented in this script.")

    if not host_to_run:
        raise ValueError("Could not determine a target host.")

    connections = []
    final_results = {}
    try:
        # Use stderr for live progress updates, which gets captured by the WebSocket stream
        progress.start_operation(f"Initiating '{args.command}' on {args.hostname}")
        
        # --- FIX 2: Pass hostname as a list, as expected by the connection manager ---
        connection_results = connect_to_hosts([host_to_run], args.username, args.password)
                
        # Check if the connection was successful
        if not connection_results or not connection_results[0].success:
            error_msg = connection_results[0].error if connection_results else "Connection failed for unknown reasons."
            raise ConnectionError(error_msg)

        # Get the device object from the successful connection
        dev = connection_results[0].device
        connections.append(dev) # Keep track for final disconnection
        
        progress.complete_step("SUCCESS", {"message": f"Connected to {dev.hostname} running {dev.facts.get('version', 'N/A')}"})
        

        # --- Main Logic: Execute based on the chosen command ---
        if args.command == 'backup':
            logger.info("Executing backup command...")
            # --- IMPROVEMENT: Pass logger instance to the manager ---
            manager = BackupManager(dev, progress, logger)
            manager.run_backup(backup_path=args.backup_path, config_only=args.config_only)
            final_results = {"success": True, "message": f"Backup for {args.hostname} completed successfully."}

        elif args.command == 'restore':
            logger.info("Executing restore command...")
            # --- IMPROVEMENT: Pass logger instance to the manager ---
            manager = RestoreManager(dev, progress, logger)
            manager.run_restore(
                backup_file_path=args.backup_file,
                restore_type=args.type,
                confirmed_timeout=args.confirmed_commit_timeout
            )
            final_results = {"success": True, "message": f"Restore on {args.hostname} completed successfully."}
        
        # Add progress summary to the final results
        progress.complete_operation("SUCCESS")
        final_results["progress_summary"] = progress.get_summary()

    except Exception as e:
        error_msg = f"A critical error occurred during '{args.command}': {str(e)}"
        logger.error(error_msg, exc_info=True)
        if progress.current_operation:
            progress.complete_operation("FAILED")
        
        # Create a structured error message for the UI
        final_results = {
            "success": False, 
            "message": error_msg, 
            "progress_summary": progress.get_summary()
        }
        # Print final JSON to stdout and exit with an error code
        print(json.dumps(final_results, indent=2))
        sys.exit(1)

    finally:
        if connections:
            disconnect_from_hosts(connections)
            logger.info(f"Disconnected from all target devices.")

    # --- IMPROVEMENT: On success, print the final structured JSON result to stdout ---
    # This gives the UI a definitive final message.
    print(json.dumps(final_results, indent=2))

if __name__ == "__main__":
    main()
