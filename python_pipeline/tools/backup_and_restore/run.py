# ====================================================================================
# FILE: run.py
#
# OVERVIEW:
#   This script is the main command-line entry point for executing backup and restore
#   operations. It acts as an orchestrator that parses user-provided arguments,
#   establishes a connection to the target Juniper device, and then delegates the
#   actual backup or restore logic to the `BackupManager` or `RestoreManager` classes.
#   It is responsible for top-level error handling and reporting the final success
#   or failure status of the operation in a structured JSON format.
#
# DEPENDENCIES:
#   - Standard Python Libraries: argparse, json, sys, traceback, os, pathlib, logging, getpass
#   - Custom Local Libraries (located in ../utils/):
#       - utils.shared_utils (ProgressTracker, setup_logging)
#       - utils.connect_to_hosts (JuniperConnectionManager)
#       - BackupConfig (BackupManager)
#       - RestoreConfig (RestoreManager)
# ====================================================================================


# ====================================================================================
# SECTION 1: IMPORTS & DEPENDENCIES
# ====================================================================================
import sys
from pathlib import Path

# --- FIX #1: DYNAMICALLY ADD PROJECT ROOT TO PYTHON PATH ---
try:
    project_root = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(project_root))
except NameError:
    project_root = Path.cwd()
    sys.path.insert(0, str(project_root))
# --- END OF FIX #1 ---

import argparse
import json
import traceback
import logging

# --- THIS IS THE FIX ---
# Add the missing import statements for your custom modules and classes.
from utils.shared_utils import ProgressTracker, setup_logging
from utils.connect_to_hosts import JuniperConnectionManager
from BackupConfig import BackupManager
from RestoreConfig import RestoreManager
# --- END OF FIX ---


# ====================================================================================
# SECTION 2: JSON SANITIZATION HELPER
# ====================================================================================
def sanitize_for_json(data):
    """
    FIX #3: Recursively walks a data structure to convert any non-JSON-serializable
    values (like custom objects, tuples, etc.) into plain strings. This prevents
    the script from crashing with a TypeError inside json.dumps() at the very end.
    """
    if isinstance(data, dict):
        return {key: sanitize_for_json(value) for key, value in data.items()}
    elif isinstance(data, list):
        return [sanitize_for_json(item) for item in data]
    elif isinstance(data, (str, int, float, bool)) or data is None:
        return data
    else:
        return str(data)

# ====================================================================================
# SECTION 3: ARGUMENT PARSING & VALIDATION
# (This section is correct and requires no changes)
# ====================================================================================
def parse_arguments():
    # ... (function content is correct)
    parser = argparse.ArgumentParser(description="Juniper Backup and Restore Tool.")
    parser.add_argument('--command', choices=['backup', 'restore'], required=True, help='The command to execute.')
    target_group = parser.add_mutually_exclusive_group(required=True)
    target_group.add_argument('--hostname', help="A single hostname or IP address.")
    target_group.add_argument('--inventory_file', help="Path to an inventory file in the /data directory.")
    parser.add_argument('--username', required=True, help="SSH username")
    parser.add_argument('--password', required=True, help="SSH password")
    parser.add_argument('--backup_path', default='/backups', help='Directory to save backups')
    parser.add_argument('--config_only', action='store_true', help='If set, backup only config files')
    parser.add_argument('--backup_file', help='Path to the backup file to restore. Required for restore command.')
    parser.add_argument('--type', choices=['override', 'set', 'merge'], default='override', help="Type of load operation")
    parser.add_argument('--confirmed_commit_timeout', type=int, default=5, help="Timeout in minutes for confirmed commit")
    logger = logging.getLogger(__name__)
    try:
        args = parser.parse_args()
        logger.debug(f"Raw arguments: {sys.argv}, Parsed arguments: {vars(args)}")
        if args.command == 'restore':
            if not args.backup_file:
                parser.error("argument --backup_file is required when command is 'restore'")
            backup_file = Path(args.backup_file)
            if not backup_file.is_absolute():
                backup_file = Path('/backups').joinpath(args.backup_file).resolve()
            if not backup_file.is_file():
                parser.error(f"Backup file does not exist: {backup_file}")
            args.backup_file = str(backup_file)
        return args
    except SystemExit as e:
        logger.error(f"Argument parsing failed: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error during argument parsing: {e}", exc_info=True)
        parser.error(f"Unexpected error: {e}")


# ====================================================================================
# SECTION 4: MAIN EXECUTION LOGIC
# (This section is correct and requires no changes)
# ====================================================================================
def main():
    # ... (function content is correct)
    logger = setup_logging()
    progress = ProgressTracker()
    final_results = {}
    exit_code = 0
    try:
        logger.info("Starting Juniper Backup and Restore Tool")
        args = parse_arguments()
        host_to_run = args.hostname or ""
        if args.inventory_file:
            raise ValueError("Inventory file mode is not yet implemented.")
        if not host_to_run:
            raise ValueError("A target --hostname must be provided.")
        conn_manager = JuniperConnectionManager()
        progress.start_operation(f"Initiating '{args.command}' on {host_to_run}")
        logger.info(f"Connecting to {host_to_run} for {args.command} operation")
        connection_results = conn_manager.connect_to_hosts(
            hosts=[host_to_run], username=args.username, password=args.password
        )
        if not connection_results or not connection_results[0].success:
            err_msg = connection_results[0].error if connection_results else "Connection failed for unknown reasons."
            raise ConnectionError(err_msg)
        dev = connection_results[0].device
        progress.complete_step("COMPLETED", {"message": f"Connected to {dev.hostname}"})
        logger.info(f"Successfully connected to {dev.hostname}")
        operation_successful = False
        if args.command == 'backup':
            logger.info("Executing backup command...")
            manager = BackupManager(dev, progress, logger)
            operation_successful = manager.run_backup(backup_path=args.backup_path, config_only=args.config_only)
        elif args.command == 'restore':
            logger.info("Executing restore command...")
            manager = RestoreManager(dev, progress, logger)
            operation_successful = manager.run_restore(
                backup_file_path=args.backup_file,
                restore_type=args.type,
                confirmed_timeout=args.confirmed_commit_timeout
            )
        if operation_successful:
            final_results = {
                "success": True,
                "message": f"{args.command.capitalize()} for {host_to_run} completed successfully."
            }
            logger.info(f"Operation {args.command} confirmed successful.")
        else:
            raise RuntimeError(f"{args.command.capitalize()} operation failed. Please check logs for details.")
    except (ValueError, ConnectionError, RuntimeError) as e:
        logger.error(f"Operation failed due to a known error: {e}")
        final_results = {"success": False, "error_type": "Operational Error", "message": str(e)}
        exit_code = 1
    except Exception:
        detailed_error = traceback.format_exc()
        logger.error(f"Caught unexpected exception in main: {detailed_error}")
        final_results = {
            "success": False,
            "error_type": "System Error",
            "message": "A critical and unexpected error occurred.",
            "details": detailed_error
        }
        exit_code = 1
    finally:
        if 'conn_manager' in locals() and conn_manager:
            conn_manager.disconnect_from_all_hosts()
            logger.info("Disconnected from all target devices.")
        if not progress.is_complete():
            progress.complete_operation("FAILED")
        final_results["progress_summary"] = progress.get_summary()
        sanitized_results = sanitize_for_json(final_results)
        print(json.dumps(sanitized_results, indent=2))
        sys.exit(exit_code)

# ====================================================================================
# SECTION 5: SCRIPT ENTRY POINT
# ====================================================================================
if __name__ == "__main__":
    main()
