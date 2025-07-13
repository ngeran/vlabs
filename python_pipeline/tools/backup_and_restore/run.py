# vlabs/python_pipeline/tools/backup_and_restore/run.py

# ====================================================================================
# SECTION 1: IMPORTS & DEPENDENCIES
# ====================================================================================
# Description: Imports required Python modules and custom utilities for backup and restore operations.
# Purpose: Sets up the environment for argument parsing, logging, and device management.
import argparse
import json
import sys
import traceback
import os
from pathlib import Path
import logging
import getpass

from utils.shared_utils import ProgressTracker, setup_logging
from utils.connect_to_hosts import JuniperConnectionManager
from BackupConfig import BackupManager
from RestoreConfig import RestoreManager

# ====================================================================================
# SECTION 2: ARGUMENT PARSING & VALIDATION
# ====================================================================================
# Description: Defines and validates command-line arguments for backup and restore operations.
# Purpose: Ensures all required inputs are provided and paths are correctly resolved.
def parse_arguments():
    """
    Parse and validate command-line arguments.

    Returns:
        argparse.Namespace: Validated arguments with resolved paths.

    Raises:
        SystemExit: On invalid or missing arguments, with detailed error messages.
    """
    parser = argparse.ArgumentParser(description="Juniper Backup and Restore Tool.")
    parser.add_argument('--command', choices=['backup', 'restore'], required=True, help='The command to execute.')
    target_group = parser.add_mutually_exclusive_group(required=True)
    target_group.add_argument('--hostname', help="A single hostname or IP address.")
    target_group.add_argument('--inventory_file', help="Path to an inventory file in the /data directory.")
    parser.add_argument('--username', required=True, help="SSH username")
    parser.add_argument('--password', required=True, help="SSH password")
    parser.add_argument('--backup_path', default='/app/backups', help='Directory to save backups')
    parser.add_argument('--config_only', action='store_true', help='If set, backup only config files')
    parser.add_argument('--backup_file', help='Path to the backup file to restore. Required for restore command.')
    parser.add_argument('--type', choices=['override', 'set', 'merge'], default='override', help="Type of load operation")
    parser.add_argument('--confirmed_commit_timeout', type=int, default=5, help="Timeout in minutes for confirmed commit")

    logger = logging.getLogger(__name__)
    try:
        args = parser.parse_args()
        logger.debug(f"Environment: User={getpass.getuser()}, CWD={os.getcwd()}, Script={os.path.abspath(__file__)}")
        logger.debug(f"Raw arguments: {sys.argv}")
        logger.debug(f"Parsed arguments: {vars(args)}")

        if args.command == 'restore':
            if not args.backup_file:
                error_msg = "argument --backup_file is required when command is 'restore'"
                logger.error(error_msg)
                parser.error(error_msg)
            try:
                backup_file = Path(args.backup_file)
                if not backup_file.is_absolute():
                    backup_file = Path('/app/backups').joinpath(args.backup_file).resolve()
                else:
                    backup_file = backup_file.resolve()
                logger.debug(f"Resolved backup_file path: {backup_file}")
            except Exception as e:
                error_msg = f"Failed to resolve backup file path {args.backup_file}: {str(e)}"
                logger.error(error_msg)
                parser.error(error_msg)
            if not backup_file.is_file():
                error_msg = f"Backup file does not exist: {backup_file}"
                logger.error(error_msg)
                parser.error(error_msg)
            if not backup_file.suffix == '.conf':
                error_msg = f"Invalid backup file format: {backup_file} (expected .conf)"
                logger.error(error_msg)
                parser.error(error_msg)
            if not os.access(backup_file, os.R_OK):
                error_msg = f"Backup file is not readable: {backup_file}"
                logger.error(error_msg)
                parser.error(error_msg)
            args.backup_file = str(backup_file)

        return args
    except SystemExit as e:
        logger.error(f"Argument parsing failed: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error during argument parsing: {str(e)}", exc_info=True)
        parser.error(f"Unexpected error: {str(e)}")

# ====================================================================================
# SECTION 3: MAIN EXECUTION LOGIC
# ====================================================================================
# Description: Orchestrates the backup or restore operation on the target device.
# Purpose: Manages device connection, operation execution, and error handling.
def main():
    """
    Main entry point for the backup and restore tool.
    """
    logger = setup_logging()
    progress = ProgressTracker()
    logger.info("Starting Juniper Backup and Restore Tool")

    try:
        args = parse_arguments()
    except SystemExit as e:
        logger.error(f"Failed to parse arguments: {str(e)}")
        progress.complete_operation("FAILED")
        final_results = {
            "success": False,
            "message": f"Argument parsing failed: {str(e)}",
            "progress_summary": progress.get_summary()
        }
        print(json.dumps(final_results, indent=2))
        sys.exit(2)

    host_to_run = args.hostname or ""
    if args.inventory_file:
        error_msg = "Inventory file mode is not yet implemented."
        logger.error(error_msg)
        progress.complete_operation("FAILED")
        final_results = {
            "success": False,
            "message": error_msg,
            "progress_summary": progress.get_summary()
        }
        print(json.dumps(final_results, indent=2))
        sys.exit(1)
    if not host_to_run:
        error_msg = "Could not determine a target host."
        logger.error(error_msg)
        progress.complete_operation("FAILED")
        final_results = {
            "success": False,
            "message": error_msg,
            "progress_summary": progress.get_summary()
        }
        print(json.dumps(final_results, indent=2))
        sys.exit(1)

    conn_manager = JuniperConnectionManager()
    final_results = {}

    try:
        progress.start_operation(f"Initiating '{args.command}' on {host_to_run}")
        logger.info(f"Connecting to {host_to_run} for {args.command} operation")

        connection_results = conn_manager.connect_to_hosts(
            hosts=[host_to_run],
            username=args.username,
            password=args.password
        )

        if not connection_results or not connection_results[0].success:
            error_msg = connection_results[0].error if connection_results else "Connection failed for unknown reasons."
            logger.error(error_msg)
            progress.complete_operation("FAILED")
            final_results = {
                "success": False,
                "message": error_msg,
                "progress_summary": progress.get_summary()
            }
            print(json.dumps(final_results, indent=2))
            sys.exit(1)

        dev = connection_results[0].device
        progress.complete_step("COMPLETED", {"message": f"Connected to {dev.hostname}"})
        logger.info(f"Successfully connected to {dev.hostname}")

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

    except Exception:
        detailed_error = traceback.format_exc()
        error_msg = f"A critical error occurred during '{args.command}':\n\n{detailed_error}"
        logger.error(f"Caught exception in main: {detailed_error}")

        if progress.current_operation:
            progress.complete_operation("FAILED")

        final_results = {
            "success": False,
            "message": error_msg,
            "progress_summary": progress.get_summary()
        }
        print(json.dumps(final_results, indent=2))
        sys.exit(1)

    finally:
        if conn_manager:
            conn_manager.disconnect_from_all_hosts()
            logger.info("Disconnected from all target devices.")

    print(json.dumps(final_results, indent=2))

# ====================================================================================
# SECTION 4: SCRIPT ENTRY POINT
# ====================================================================================
# Description: Entry point for the script, ensuring main() is called when run directly.
# Purpose: Standard Python idiom for script execution.
if __name__ == "__main__":
    main()
