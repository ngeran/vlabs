# =========================================================================================
# FILE: BackupConfig.py (Worker)
#
# OVERVIEW:
#   Contains the BackupManager class responsible for the logic of backing up a single
#   Juniper device. It handles connection, configuration fetching, file saving, and
#   sends detailed, step-by-step progress updates.
# =========================================================================================

# ====================================================================================
# SECTION 1: IMPORTS & DEPENDENCIES
# ====================================================================================
import json
import asyncio
from datetime import datetime
from lxml import etree
from jnpr.junos import Device

# ====================================================================================
# SECTION 2: BACKUP MANAGER CLASS
# ====================================================================================
class BackupManager:
    """Manages the backup process for a single Juniper device."""

    def __init__(self, host, username, password, backup_path, step_offset, progress_callback):
        """
        Initializes the manager for a specific device.

        Args:
            host (str): The IP address or hostname of the device.
            username (str): The SSH username.
            password (str): The SSH password.
            backup_path (Path): The base directory for backups.
            step_offset (int): The starting number for progress steps for this host.
            progress_callback (function): The function to call to send progress updates.
        """
        self.host = host
        self.username = username
        self.password = password
        self.backup_path = backup_path
        self.step_offset = step_offset
        self.progress_callback = progress_callback
        self.dev = None

    def _save_config_files(self) -> dict:
        """
        Retrieves configuration in multiple formats and saves them to files.
        This is a synchronous method intended to be run in a separate thread.
        """
        hostname = self.dev.facts.get("hostname", self.host)
        device_backup_path = self.backup_path / hostname
        device_backup_path.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        files_created = {}

        # XML Format
        config_xml = self.dev.rpc.get_config()
        (device_backup_path / f"{timestamp}_{hostname}_config.xml").write_bytes(etree.tostring(config_xml, pretty_print=True) if config_xml else b"")
        files_created["xml"] = str(device_backup_path / f"{timestamp}_{hostname}_config.xml")

        # Set Format
        config_set = self.dev.rpc.get_config(options={"format": "set"})
        set_content = config_set.text if config_set and hasattr(config_set, 'text') else ""
        (device_backup_path / f"{timestamp}_{hostname}_config.set").write_text(set_content)
        files_created["set"] = str(device_backup_path / f"{timestamp}_{hostname}_config.set")

        # JSON Format
        config_json = self.dev.rpc.get_config(options={"format": "json"})
        (device_backup_path / f"{timestamp}_{hostname}_config.json").write_text(json.dumps(config_json or {}, indent=4))
        files_created["json"] = str(device_backup_path / f"{timestamp}_{hostname}_config.json")

        # Text/Conf Format
        config_text = self.dev.rpc.get_config(options={'format': 'text'})
        text_content = config_text.text if config_text and hasattr(config_text, 'text') else ""
        (device_backup_path / f"{timestamp}_{hostname}_config.conf").write_text(text_content)
        files_created["text"] = str(device_backup_path / f"{timestamp}_{hostname}_config.conf")

        return files_created

    async def run_backup(self) -> tuple:
        """
        The main asynchronous method that orchestrates the backup for this single device.
        Returns a tuple of ("STATUS", data).
        """
        connect_step = self.step_offset + 1
        backup_step = self.step_offset + 2
        try:
            self.progress_callback("info", "STEP_START", {"step": connect_step}, f"Connecting to {self.host}...")

            # Create and open the device connection
            self.dev = Device(host=self.host, user=self.username, password=self.password, gather_facts=True, normalize=True)
            await asyncio.to_thread(self.dev.open)

            hostname = self.dev.facts.get("hostname", self.host)
            self.progress_callback("success", "STEP_COMPLETE", {"step": connect_step, "status": "COMPLETED"}, f"Successfully connected to {hostname}")

            self.progress_callback("info", "STEP_START", {"step": backup_step}, f"Starting backup for {hostname}...")

            # Run the synchronous file-saving logic in a thread to avoid blocking
            files = await asyncio.to_thread(self._save_config_files)

            self.progress_callback("success", "STEP_COMPLETE", {"step": backup_step, "status": "COMPLETED"}, f"Backup for {hostname} successful")

            return ("SUCCESS", {"host": self.host, "hostname": hostname, "files": files})

        except Exception as e:
            error_message = f"Failed to process {self.host}: {str(e)}"
            self.progress_callback("error", "STEP_COMPLETE", {"step": connect_step, "status": "FAILED"}, error_message)
            return ("FAILED", {"host": self.host, "error": error_message})

        finally:
            if self.dev and self.dev.connected:
                self.dev.close()
