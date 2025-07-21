# =========================================================================================
# FILE: BackupConfig.py
#
# OVERVIEW:
#   This script defines the core logic for performing a backup operation on a Juniper
#   device. It is designed to be used by an orchestrator script (like run.py). The
#   primary component is the `BackupManager` class, which handles connecting to a
#   device, fetching its configuration and facts, saving them to files, and creating
#   a metadata record of the operation. It uses a ProgressTracker to emit real-time
#   status updates.
#
# DEPENDENCIES:
#   - Standard Python Libraries: json, pathlib, datetime
#   - Third-Party Libraries: jnpr.junos (from the 'junos-eznc' package)
# =========================================================================================


# =========================================================================================
# SECTION 1: IMPORTS & DEPENDENCIES
# =========================================================================================
import json
from pathlib import Path
from datetime import datetime
from jnpr.junos import Device
from jnpr.junos.exception import RpcError, ConnectError


# =========================================================================================
# SECTION 2: BACKUP MANAGER CLASS
# =========================================================================================
class BackupManager:
    """
    Handles all aspects of the backup process for a connected Juniper device.
    This class orchestrates the steps of a backup, reports progress, and handles
    errors that may occur during the process.
    """

    # -------------------------------------------------------------------------------------
    # Subsection 2.1: Initialization
    # -------------------------------------------------------------------------------------
    def __init__(self, device: Device, progress_tracker, logger):
        """
        Initializes the BackupManager with a device connection and logging utilities.

        Args:
            device (Device): An active 'jnpr.junos.Device' connection object.
            progress_tracker: An instance of a ProgressTracker class to report status.
            logger: A configured logger instance for detailed logging.

        Raises:
            ValueError: If the device hostname cannot be determined from the connection.
        """
        self.dev = device
        self.progress = progress_tracker
        self.logger = logger
        # Determine hostname from the connection facts. This is critical for naming.
        self.hostname = self.dev.facts.get('hostname')
        if not self.hostname:
            self.logger.critical("Could not determine device hostname. Cannot proceed with backup.")
            raise ValueError("Could not determine device hostname.")

    # -------------------------------------------------------------------------------------
    # Subsection 2.2: Main Backup Orchestration Method
    # -------------------------------------------------------------------------------------
    def run_backup(self, backup_path: str, config_only: bool = False):
        """
        Executes the full backup workflow, including all steps.

        This is the main entry point for the class. It controls the sequence of
        backup steps and has a top-level try/except block to catch any failures
        during the process and report them correctly.

        Args:
            backup_path (str): The base directory where backups should be stored.
            config_only (bool): If True, only the configuration is backed up, skipping facts.
        """
        self.progress.start_operation(f"Backup for '{self.hostname}'")
        try:
            # Step 1: Ensure the directory for this device's backups exists.
            self.progress.start_step("SETUP_DIRECTORY", "Ensuring backup directory exists")
            device_backup_path = self._ensure_backup_directory(backup_path)
            self.progress.complete_step("COMPLETED", {"path": str(device_backup_path)})

            # Step 2: Fetch the configuration and save it to a file.
            self.progress.start_step("CONFIG_BACKUP", "Backing up device configuration")
            config_file = self._backup_configuration(device_backup_path)
            self.progress.complete_step("COMPLETED", {"file_created": str(config_file)})
            files_created = {"configuration": str(config_file)}

            # Step 3: (Optional) Fetch device facts and save them.
            if not config_only:
                self.progress.start_step("FACTS_BACKUP", "Backing up device facts")
                facts_file = self._backup_facts(device_backup_path, config_file)
                self.progress.complete_step("COMPLETED", {"file_created": str(facts_file)})
                files_created["facts"] = str(facts_file)

            # Step 4: Create a metadata file summarizing the backup operation.
            self.progress.start_step("METADATA_CREATE", "Creating backup metadata file")
            metadata_file = self._create_metadata_file(device_backup_path, files_created, config_only)
            self.progress.complete_step("COMPLETED", {"file_created": str(metadata_file)})
            return True

            # If all steps succeed, mark the entire operation as a success.
            self.progress.complete_operation("SUCCESS")
            self.logger.info(f"Backup for {self.hostname} completed successfully.")

        except Exception as e:
            # This is the critical catch-all for any failure in the steps above.
            self.logger.error(f"Backup failed for {self.hostname}: {e}", exc_info=True)
            # Mark the current step and the entire operation as FAILED.
            self.progress.complete_step("FAILED", {"error": str(e)})
            self.progress.complete_operation("FAILED")
            # Re-raise the exception so the calling script (run.py) knows a hard failure occurred.
            return False

    # -------------------------------------------------------------------------------------
    # Subsection 2.3: Private Helper Methods
    # -------------------------------------------------------------------------------------
    def _ensure_backup_directory(self, base_path_str: str) -> Path:
        """Creates the necessary backup directory for the device if it doesn't exist."""
        base_path = Path(base_path_str).resolve()
        # Backups are stored in a subdirectory named after the device's hostname.
        device_path = base_path / self.hostname
        device_path.mkdir(parents=True, exist_ok=True)
        self.logger.info(f"Backup directory set to: {device_path}")
        return device_path

    def _backup_configuration(self, backup_path: Path) -> Path:
        """Retrieves the device configuration and saves it to a text file."""
        try:
            self.logger.info(f"Attempting to fetch configuration from {self.hostname}...")
            # Use RPC to get the configuration in 'text' format.
            config_data = self.dev.rpc.get_config(options={'format': 'text'})

            # Validate the retrieved data to ensure it's not empty or malformed.
            if config_data is None or not hasattr(config_data, 'text'):
                raise ValueError("Failed to retrieve valid configuration data from device.")
            config_text = config_data.text
            if not config_text or not config_text.strip():
                raise ValueError("Retrieved configuration from device is empty.")

            # Generate a timestamp for the filename.
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{timestamp}.conf"
            filepath = backup_path / filename

            # Write the configuration text to the file.
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(config_text)

            self.logger.info(f"Configuration successfully saved to {filepath}")
            return filepath
        except (RpcError, ValueError, AttributeError, IOError, ConnectError) as e:
            # Catch specific, expected errors related to network or file operations.
            self.logger.error(f"Critical error during configuration backup for {self.hostname}: {e}")
            # Re-raise to be caught by the main run_backup exception handler.
            raise

    def _backup_facts(self, backup_path: Path, config_filepath: Path) -> Path:
        """Saves the device's collected facts to a JSON file after sanitizing them."""
        self.logger.info(f"Saving device facts for {self.hostname}...")
        raw_facts = dict(self.dev.facts)
        # Sanitize facts to ensure they are JSON-serializable.
        sanitized_facts = self._sanitize_dict(raw_facts)

        # Use the timestamp from the config filename to ensure consistency across backup files.
        timestamp_from_config = config_filepath.stem
        filename = f"{timestamp_from_config}_facts.json"
        filepath = backup_path / filename

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(sanitized_facts, f, indent=4)

        self.logger.info(f"Facts saved to {filepath}")
        return filepath

    def _create_metadata_file(self, backup_path: Path, files: dict, config_only: bool) -> Path:
        """Creates a metadata JSON file that describes the backup operation."""
        self.logger.info("Creating backup metadata file...")
        metadata = {
            "hostname": self.hostname,
            "backup_timestamp_utc": datetime.utcnow().isoformat(),
            "backup_type": "config_only" if config_only else "full",
            "files": files,
            "device_facts_summary": {
                "model": self.dev.facts.get("model"),
                "version": self.dev.facts.get("version"),
                "serial_number": self.dev.facts.get("serialnumber"),
            }
        }

        # Again, use the config file's timestamp for consistent naming.
        config_file_path = Path(files["configuration"])
        timestamp_from_config = config_file_path.stem
        filename = f"{timestamp_from_config}_metadata.json"
        filepath = backup_path / filename

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=4)
        self.logger.info(f"Metadata file created at {filepath}")
        return filepath

    def _sanitize_dict(self, data: dict) -> dict:
        """
        Recursively walks a dictionary to convert non-JSON-serializable values
        (like custom objects or tuples) into strings.
        """
        clean_dict = {}
        for key, value in data.items():
            if isinstance(value, dict):
                clean_dict[key] = self._sanitize_dict(value)
            elif isinstance(value, list):
                clean_dict[key] = [self._sanitize_dict(v) if isinstance(v, dict) else str(v) for v in value]
            elif isinstance(value, (str, int, float, bool)) or value is None:
                clean_dict[key] = value
            else:
                # Convert any other type (e.g., tuples, custom objects) to a string representation.
                clean_dict[key] = str(value)
        return clean_dict
