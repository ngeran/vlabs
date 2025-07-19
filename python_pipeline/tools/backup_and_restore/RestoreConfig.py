#s python_pipeline/tools/backup_and_restore/RestoreConfig.py

# ====================================================================================
# SECTION 1: IMPORTS AND DEPENDENCIES
# ====================================================================================
# Import standard and third-party libraries for file handling, device interaction, and error management
from pathlib import Path
import os  # Added for file access checks
from jnpr.junos import Device
from jnpr.junos.utils.config import Config
from jnpr.junos.exception import CommitError, ConfigLoadError, RpcError
import logging

# ====================================================================================
# SECTION 2: RESTORE MANAGER CLASS
# ====================================================================================
class RestoreManager:
    """
    Manages the configuration restore process for a Juniper device.
    Handles file validation, configuration loading, diff checking, and committing changes.
    """

    # --------------------------------------------------------------------------------
    # Subsection 2.1: Initialization
    # --------------------------------------------------------------------------------
    def __init__(self, device: Device, progress_tracker, logger: logging.Logger):
        """
        Initialize the RestoreManager with a device connection, progress tracker, and logger.

        Args:
            device (Device): Connected Juniper device instance.
            progress_tracker: Tracks operation progress for frontend updates.
            logger (logging.Logger): Logger for detailed error and info logging.
        """
        self.dev = device
        self.progress = progress_tracker
        self.logger = logger
        self.config = Config(self.dev)

    # --------------------------------------------------------------------------------
    # Subsection 2.2: File Validation
    # --------------------------------------------------------------------------------
    def validate_file(self, backup_file_path: str) -> tuple[bool, str]:
        """
        Validate the backup file for existence, readability, and format.

        Args:
            backup_file_path (str): Path to the backup configuration file.

        Returns:
            tuple[bool, str]: (is_valid, message) indicating validation result and details.
        """
        self.logger.info(f"Step 1: VALIDATE_FILE - Checking backup file: {backup_file_path}")
        self.progress.start_step("VALIDATE_FILE", f"Checking backup file: {backup_file_path}")

        try:
            backup_file = Path(backup_file_path)

            # Check if file exists
            if not backup_file.is_file():
                error_msg = f"Backup file does not exist: {backup_file_path}"
                self.logger.error(error_msg)
                self.progress.complete_step("FAILED", {"error": error_msg})
                return False, error_msg

            # Check if file is readable
            if not os.access(backup_file, os.R_OK):
                error_msg = f"Backup file is not readable: {backup_file_path}"
                self.logger.error(error_msg)
                self.progress.complete_step("FAILED", {"error": error_msg})
                return False, error_msg

            # Check if file is empty
            if backup_file.stat().st_size == 0:
                error_msg = f"Backup file is empty: {backup_file_path}"
                self.logger.error(error_msg)
                self.progress.complete_step("FAILED", {"error": error_msg})
                return False, error_msg

            # Check file extension
            if not backup_file_path.endswith('.conf'):
                error_msg = f"Invalid file format: {backup_file_path} (expected .conf)"
                self.logger.error(error_msg)
                self.progress.complete_step("FAILED", {"error": error_msg})
                return False, error_msg

            # Validate file content (basic check for configuration format)
            with open(backup_file, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if not content:
                    error_msg = f"Backup file has no valid content: {backup_file_path}"
                    self.logger.error(error_msg)
                    self.progress.complete_step("FAILED", {"error": error_msg})
                    return False, error_msg
                # Check for common Junos config keywords (e.g., 'system', 'interfaces')
                if not any(keyword in content for keyword in ['system', 'interfaces', 'routing-options']):
                    error_msg = f"Backup file does not appear to be a valid Junos configuration: {backup_file_path}"
                    self.logger.error(error_msg)
                    self.progress.complete_step("FAILED", {"error": error_msg})
                    return False, error_msg

            self.logger.info(f"Backup file validated successfully: {backup_file_path}")
            self.progress.complete_step("COMPLETED", {"file": str(backup_file)})
            return True, "Validation successful"

        except Exception as e:
            error_msg = f"Error validating backup file {backup_file_path}: {str(e)}"
            self.logger.error(error_msg, exc_info=True)
            self.progress.complete_step("FAILED", {"error": error_msg})
            return False, error_msg

    # --------------------------------------------------------------------------------
    # Subsection 2.3: Main Restore Orchestration
    # --------------------------------------------------------------------------------
    def run_restore(self, backup_file_path: str, restore_type: str, confirmed_timeout: int):
        """
        Orchestrates the entire restore process: validate file, load config, check diff, and commit.

        Args:
            backup_file_path (str): Path to the backup configuration file.
            restore_type (str): Type of restore operation ('override', 'merge', 'set').
            confirmed_timeout (int): Timeout in minutes for confirmed commit.

        Raises:
            Exception: If any step in the restore process fails.
        """
        self.progress.start_operation(f"Restore on '{self.dev.hostname}' using type '{restore_type}'")
        self.logger.info(f"Starting restore for {self.dev.hostname} with file {backup_file_path}")

        try:
            # Step 1: Validate file
            is_valid, message = self.validate_file(backup_file_path)
            if not is_valid:
                raise ValueError(message)

            # Step 2: Load and Diff
            self.progress.start_step("LOAD_AND_DIFF", "Loading config and checking differences")
            load_args = {'path': str(backup_file_path)}
            if restore_type == 'merge':
                load_args['merge'] = True
            elif restore_type == 'set':
                load_args['format'] = 'set'

            self.logger.info(f"Loading config from '{backup_file_path}' with args: {load_args}")
            self.progress.update_step(message=f"Loading configuration with mode: {restore_type}")

            try:
                self.config.lock()
                self.config.load(**load_args)
                self.progress.update_step(message="Calculating configuration diff...")
                diff = self.config.diff()

                if not diff:
                    self.progress.complete_step("COMPLETED", {"status": "NO_CHANGES", "message": "No configuration changes to commit."})
                    self.progress.complete_operation("SUCCESS")
                    self.config.unlock()
                    return

                self.progress.complete_step("COMPLETED", {"diff": diff})

            except (ConfigLoadError, RpcError, ValueError) as e:
                error_msg = f"Failed to load/diff config: {str(e)}"
                self.logger.error(error_msg, exc_info=True)
                self.progress.complete_step("FAILED", {"error": error_msg})
                raise

            # Step 3: Commit
            self.progress.start_step("COMMIT_CONFIG", "Committing changes to device")
            try:
                commit_comment = f"Restore from backup {Path(backup_file_path).name} via script"
                if confirmed_timeout > 0:
                    self.logger.info(f"Performing confirmed commit with {confirmed_timeout} min timeout.")
                    self.progress.update_step(message=f"Performing confirmed commit with {confirmed_timeout} min timeout.")
                    self.config.commit(comment=commit_comment, confirmed=True, confirm_timeout=str(confirmed_timeout))
                else:
                    self.logger.info("Performing standard commit.")
                    self.progress.update_step(message="Performing standard commit.")
                    self.config.commit(comment=commit_comment)

                self.progress.complete_step("COMPLETED", {"message": "Commit successful"})
                self.progress.complete_operation("SUCCESS")

            except CommitError as e:
                error_msg = f"Commit failed: {str(e)}"
                self.logger.error(error_msg, exc_info=True)
                self.progress.complete_step("FAILED", {"error": error_msg})
                raise

            finally:
                if self.config.is_locked():
                    self.config.unlock()

        except Exception as e:
            error_msg = f"Restore failed for {self.dev.hostname}: {str(e)}"
            self.logger.error(error_msg, exc_info=True)
            self.progress.complete_operation("FAILED")
            if self.config.is_locked():
                self.config.unlock()
            raise
