# =========================================================================================
#
# FILE:               BackupConfig.py (Worker)
#
# OVERVIEW:
#   This file contains the `BackupManager` class, a dedicated "worker" responsible for
#   handling the backup logic for a single Juniper device. It is designed to be
#   instantiated and controlled by an asynchronous orchestrator (like `run.py`). Its primary
#   role is to connect to a device, fetch its configuration in multiple formats (XML, SET,
#   JSON, and Text), save them to a structured directory, and report detailed progress
#   back to the calling process.
#
# KEY FEATURES:
#   - Asynchronous Execution: Designed to be run within an asyncio event loop. It uses
#     `asyncio.to_thread` to execute synchronous, blocking I/O operations (like PyEZ's
#     `.open()` and `.rpc()` calls) in a separate thread, preventing them from blocking
#     the entire application.
#   - Multi-format Backup: Retrieves the device configuration in four standard formats,
#     providing comprehensive backup coverage.
#   - Structured File Organization: Saves backups into a clean, hierarchical directory
#     structure: `base_path/hostname/timestamp_hostname_config.format`.
#   - Decoupled Progress Reporting: Uses a callback function passed during initialization
#     to send detailed, step-by-step progress updates, making it highly reusable and
#     independent of the specific output mechanism.
#   - Graceful Error Handling: Wraps the entire operation in a try/except block to catch
#     connection errors, RPC failures, or other exceptions, and reports them cleanly.
#
# DEPENDENCIES:
#   - jnpr-pyez: The official Juniper library for automating Junos devices.
#   - lxml: Used by jnpr-pyez for XML parsing and manipulation.
#
# HOW-TO GUIDE (INTEGRATION):
#   This class is not intended to be run as a standalone script. It should be imported
#   by an orchestrator script.
#
#   1. Instantiate the class:
#      `manager = BackupManager(host, user, password, path, offset, callback_func)`
#   2. Await its main execution method in an async context:
#      `status, data = await manager.run_backup()`
#   3. The `status` will be "SUCCESS" or "FAILED", and `data` will contain the results
#      or error details.
#
# =========================================================================================


# ====================================================================================
# SECTION 1: IMPORTS & DEPENDENCIES
# All necessary standard library and third-party modules are imported here.
# ====================================================================================
import json
import asyncio
from datetime import datetime
from pathlib import Path
from lxml import etree
from jnpr.junos import Device


# ====================================================================================
# SECTION 2: BACKUP MANAGER CLASS
# Encapsulates all logic for the backup of a single device.
# ====================================================================================
class BackupManager:
    """Manages the backup process for a single Juniper device."""

    def __init__(self, host, username, password, backup_path: Path, step_offset: int, progress_callback: callable):
        """
        Initializes the manager for a specific device.

        Args:
            host (str): The IP address or hostname of the device.
            username (str): The SSH username for authentication.
            password (str): The SSH password for authentication.
            backup_path (Path): The base Path object for the backup directory.
            step_offset (int): The starting number for progress steps for this host,
                               used for calculating UI progress in multi-device runs.
            progress_callback (callable): The function to call to send progress updates back
                                          to the orchestrator.
        """
        self.host = host
        self.username = username
        self.password = password
        self.backup_path = backup_path
        self.step_offset = step_offset
        self.progress_callback = progress_callback
        self.dev = None # The PyEZ Device object, initialized later.

    def _save_config_files(self) -> dict:
        """
        (Private Helper) Retrieves configuration in multiple formats and saves them to files.

        This is a synchronous method intended to be run in a separate thread via `asyncio.to_thread`
        to avoid blocking the main event loop.

        Returns:
            A dictionary mapping the config format (e.g., "xml") to the full path
            of the created file.
        """
        # Use the device's actual hostname for the directory name, falling back to the IP.
        hostname = self.dev.facts.get("hostname", self.host)
        device_backup_path = self.backup_path / hostname
        device_backup_path.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        files_created = {}

        # --- XML Format ---
        # The default and most reliable format for programmatic use.
        config_xml = self.dev.rpc.get_config()
        # FIX: Check for `is not None` to avoid FutureWarning and handle empty responses gracefully.
        xml_content = etree.tostring(config_xml, pretty_print=True) if config_xml is not None else b""
        xml_filepath = device_backup_path / f"{timestamp}_{hostname}_config.xml"
        xml_filepath.write_bytes(xml_content)
        files_created["xml"] = str(xml_filepath)

        # --- Set Format ---
        # Useful for human review and manual application.
        config_set = self.dev.rpc.get_config(options={"format": "set"})
        set_content = config_set.text if config_set is not None and hasattr(config_set, 'text') else ""
        set_filepath = device_backup_path / f"{timestamp}_{hostname}_config.set"
        set_filepath.write_text(set_content)
        files_created["set"] = str(set_filepath)

        # --- JSON Format ---
        # Ideal for modern automation and API integration.
        config_json = self.dev.rpc.get_config(options={"format": "json"})
        json_filepath = device_backup_path / f"{timestamp}_{hostname}_config.json"
        # Use `or {}` as a fallback for empty JSON responses.
        json_filepath.write_text(json.dumps(config_json or {}, indent=4))
        files_created["json"] = str(json_filepath)

        # --- Text/Conf Format ---
        # The standard, human-readable curly-brace format.
        config_text = self.dev.rpc.get_config(options={'format': 'text'})
        text_content = config_text.text if config_text is not None and hasattr(config_text, 'text') else ""
        text_filepath = device_backup_path / f"{timestamp}_{hostname}_config.conf"
        text_filepath.write_text(text_content)
        files_created["text"] = str(text_filepath)

        return files_created

    async def run_backup(self) -> tuple:
        """
        The main asynchronous method that orchestrates the entire backup process for this device.

        Returns:
            A tuple of ("STATUS", data_dictionary).
            - On success: ("SUCCESS", {"host": ..., "hostname": ..., "files": ...})
            - On failure: ("FAILED", {"host": ..., "error": ...})
        """
        # Calculate the specific step numbers for this device's run.
        connect_step = self.step_offset + 1
        backup_step = self.step_offset + 2
        try:
            # --- Step 1: Connect to Device ---
            self.progress_callback("info", "STEP_START", {"step": connect_step}, f"Connecting to {self.host}...")

            # Create the PyEZ Device object. `gather_facts=True` is important to get the hostname.
            self.dev = Device(host=self.host, user=self.username, password=self.password, gather_facts=True, normalize=True)
            # Run the blocking `open()` call in a separate thread.
            await asyncio.to_thread(self.dev.open)
            hostname = self.dev.facts.get("hostname", self.host)
            self.progress_callback("success", "STEP_COMPLETE", {"step": connect_step, "status": "COMPLETED"}, f"Successfully connected to {hostname}")

            # --- Step 2: Perform Backup ---
            self.progress_callback("info", "STEP_START", {"step": backup_step}, f"Starting backup for {hostname}...")

            # Run the synchronous file-saving logic in a thread to avoid blocking the event loop.
            files = await asyncio.to_thread(self._save_config_files)
            self.progress_callback("success", "STEP_COMPLETE", {"step": backup_step, "status": "COMPLETED"}, f"Backup for {hostname} successful")

            # Return a success status and detailed results.
            return ("SUCCESS", {"host": self.host, "hostname": hostname, "files": files})

        except Exception as e:
            # Catch any exception during the process, from connection to file saving.
            error_message = f"Failed to process {self.host}: {str(e)}"
            # Report the step as failed.
            self.progress_callback("error", "STEP_COMPLETE", {"step": connect_step, "status": "FAILED"}, error_message)
            # Return a failed status and the error message.
            return ("FAILED", {"host": self.host, "error": error_message})

        finally:
            # --- Cleanup ---
            # Always ensure the device connection is closed to prevent orphaned sessions.
            if self.dev and self.dev.connected:
                self.dev.close()
