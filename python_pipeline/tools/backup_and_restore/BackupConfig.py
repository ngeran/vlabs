# =========================================================================================
# FILE: python_pipeline/tools/backup_and_restore/BackupConfig.py
#
# PURPOSE: Manages the backup process for Juniper devices. This includes saving
#          device configuration, collecting device facts, and creating metadata
#          for each backup operation.
# =========================================================================================

# =========================================================================================
# SECTION 1: IMPORTS & DEPENDENCIES
# =========================================================================================
import json
from pathlib import Path
from datetime import datetime
from jnpr.junos import Device
from jnpr.junos.exception import RpcError

# =========================================================================================
# SECTION 2: BACKUP MANAGER CLASS
# =========================================================================================
class BackupManager:
    """
    Handles all aspects of the backup process for a connected Juniper device.
    """

    # -------------------------------------------------------------------------------------
    # Subsection 2.1: Initialization
    # -------------------------------------------------------------------------------------
    def __init__(self, device: Device, progress_tracker, logger):
        self.dev = device
        self.progress = progress_tracker
        self.logger = logger
        self.hostname = self.dev.hostname or self.dev.facts.get('hostname')
        if not self.hostname:
            self.logger.critical("Could not determine device hostname. Cannot proceed with backup.")
            raise ValueError("Could not determine device hostname.")

    # -------------------------------------------------------------------------------------
    # Subsection 2.2: Main Backup Orchestration Method
    # -------------------------------------------------------------------------------------
    def run_backup(self, backup_path: str, config_only: bool = False):
        self.progress.start_operation(f"Backup for '{self.hostname}'")
        try:
            self.progress.start_step("SETUP_DIRECTORY", "Ensuring backup directory exists")
            device_backup_path = self._ensure_backup_directory(backup_path)
            self.progress.complete_step("COMPLETED", {"path": str(device_backup_path)})

            self.progress.start_step("CONFIG_BACKUP", "Backing up device configuration")
            config_file = self._backup_configuration(device_backup_path)
            self.progress.complete_step("COMPLETED", {"file_created": str(config_file)})
            files_created = {"configuration": str(config_file)}

            if not config_only:
                self.progress.start_step("FACTS_BACKUP", "Backing up device facts")
                facts_file = self._backup_facts(device_backup_path)
                self.progress.complete_step("COMPLETED", {"file_created": str(facts_file)})
                files_created["facts"] = str(facts_file)

            self.progress.start_step("METADATA_CREATE", "Creating backup metadata file")
            metadata_file = self._create_metadata_file(device_backup_path, files_created, config_only)
            self.progress.complete_step("COMPLETED", {"file_created": str(metadata_file)})

            self.progress.complete_operation("SUCCESS")
            self.logger.info(f"Backup for {self.hostname} completed successfully.")
        except Exception as e:
            self.logger.error(f"Backup failed for {self.hostname}: {e}", exc_info=True)
            self.progress.complete_step("FAILED", {"error": str(e)})
            self.progress.complete_operation("FAILED")
            raise

    # -------------------------------------------------------------------------------------
    # Subsection 2.3: Private Helper Methods
    # -------------------------------------------------------------------------------------
    def _ensure_backup_directory(self, base_path_str: str) -> Path:
        base_path = Path(base_path_str).resolve()
        device_path = base_path / self.hostname
        device_path.mkdir(parents=True, exist_ok=True)
        self.logger.info(f"Backup directory set to: {device_path}")
        return device_path

    def _backup_configuration(self, backup_path: Path) -> Path:
        try:
            self.logger.info(f"Attempting to fetch configuration from {self.hostname}...")
            config_data = self.dev.rpc.get_config(options={'format': 'text'})
            if config_data is None or not hasattr(config_data, 'text'):
                raise ValueError("Failed to retrieve valid configuration data from device.")
            config_text = config_data.text
            if not config_text or not config_text.strip():
                raise ValueError("Retrieved configuration from device is empty.")
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{self.hostname}_config_{timestamp}.conf"
            filepath = backup_path / filename
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(config_text)
            self.logger.info(f"Configuration successfully saved to {filepath}")
            return filepath
        except (RpcError, ValueError, AttributeError, IOError) as e:
            self.logger.error(f"Critical error during configuration backup for {self.hostname}: {e}")
            raise

    def _backup_facts(self, backup_path: Path) -> Path:
        """
        Saves the device's collected facts to a JSON file after sanitizing them.
        """
        self.logger.info(f"Saving device facts for {self.hostname}...")
        
        # Convert the top-level _FactCache object to a dictionary.
        raw_facts = dict(self.dev.facts)
        
        # --- FIX: Sanitize the dictionary to handle nested special objects ---
        # This new step ensures all values are JSON-serializable.
        sanitized_facts = self._sanitize_dict(raw_facts)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{self.hostname}_facts_{timestamp}.json"
        filepath = backup_path / filename

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(sanitized_facts, f, indent=4)
            
        self.logger.info(f"Facts saved to {filepath}")
        return filepath

    def _create_metadata_file(self, backup_path: Path, files: dict, config_only: bool) -> Path:
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
        filename = f"{self.hostname}_metadata_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        filepath = backup_path / filename
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=4)
        self.logger.info(f"Metadata file created at {filepath}")
        return filepath
        
    # --- NEW HELPER METHOD FOR JSON SANITIZATION ---
    def _sanitize_dict(self, data: dict) -> dict:
        """
        Recursively walks through a dictionary and converts any non-JSON-serializable
        values (like custom objects or tuples) into plain strings.
        
        Args:
            data (dict): The dictionary to clean.
            
        Returns:
            dict: A new dictionary that is safe to serialize to JSON.
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
                # This is the catch-all for any other type (e.g., version_info, tuples)
                clean_dict[key] = str(value)
        return clean_dict
