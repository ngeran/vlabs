# =========================================================================================
# FILE: RestoreConfig.py (Worker)
#
# OVERVIEW:
#   This version fixes a UI bug by explicitly sending a "STEP_COMPLETE" message
#   for the commit step when it is skipped, allowing the progress bar to reach 100%.
# =========================================================================================

# ====================================================================================
# SECTION 1: IMPORTS & DEPENDENCIES
# ====================================================================================
import asyncio
from jnpr.junos import Device
from jnpr.junos.utils.config import Config

# ====================================================================================
# SECTION 2: RESTORE MANAGER CLASS
# ====================================================================================
class RestoreManager:
    """Manages the restore process for a single Juniper device."""

    def __init__(self, host, username, password, backup_path, backup_file, restore_type, confirmed_timeout, commit_timeout, step_offset, progress_callback):
        self.host = host
        self.username = username
        self.password = password
        self.backup_path = backup_path
        self.backup_file = backup_file
        self.restore_type = restore_type
        self.confirmed_timeout = confirmed_timeout
        self.commit_timeout = commit_timeout
        self.step_offset = step_offset
        self.progress_callback = progress_callback
        self.dev = None

    async def run_restore(self) -> tuple:
        """
        Orchestrates the restore, handling the "no changes" scenario gracefully for the UI.
        """
        connect_step, validate_step, load_step, commit_step = self.step_offset + 1, self.step_offset + 2, self.step_offset + 3, self.step_offset + 4

        try:
            # Step 1: Connect to Device
            self.progress_callback("info", "STEP_START", {"step": connect_step}, f"Connecting to {self.host} for restore...")
            self.dev = Device(host=self.host, user=self.username, password=self.password, gather_facts=True, normalize=True)
            await asyncio.to_thread(self.dev.open)
            hostname = self.dev.facts.get("hostname", self.host)
            self.progress_callback("success", "STEP_COMPLETE", {"step": connect_step, "status": "COMPLETED"}, f"Successfully connected to {hostname}")

            # Step 2: Validate Backup File
            self.progress_callback("info", "STEP_START", {"step": validate_step}, "Locating backup file set...")
            device_backup_dir = self.backup_path / hostname
            base_backup_name = self.backup_file.split('_config.')[0]
            xml_backup_filename = f"{base_backup_name}_config.xml"
            xml_backup_path = device_backup_dir / xml_backup_filename
            if not await asyncio.to_thread(xml_backup_path.is_file):
                raise FileNotFoundError(f"The required XML backup file '{xml_backup_filename}' was not found at {device_backup_dir}.")
            self.progress_callback("success", "STEP_COMPLETE", {"step": validate_step, "status": "COMPLETED"}, f"Found reliable XML backup: {xml_backup_filename}")

            with Config(self.dev, mode='private') as cu:
                # Step 3: Load Configuration
                self.progress_callback("info", "STEP_START", {"step": load_step}, f"Loading configuration from XML with mode: {self.restore_type}")
                load_args = {'path': str(xml_backup_path), 'format': 'xml'}
                if self.restore_type == 'override': load_args['overwrite'] = True
                elif self.restore_type == 'merge': load_args['merge'] = True
                await asyncio.to_thread(cu.load, **load_args)
                diff = await asyncio.to_thread(cu.diff)

                # --- THIS IS THE KEY FIX ---
                if not diff:
                    # Mark the load step as complete
                    self.progress_callback("success", "STEP_COMPLETE", {"step": load_step, "status": "COMPLETED"}, "No configuration changes detected.")
                    # Explicitly mark the commit step as complete/skipped so the UI can reach 100%
                    self.progress_callback("success", "STEP_COMPLETE", {"step": commit_step, "status": "COMPLETED"}, "Skipped: No changes to commit.")
                    return ("SUCCESS", {"host": self.host, "hostname": hostname, "message": "No configuration changes needed."})

                self.progress_callback("success", "STEP_COMPLETE", {"step": load_step, "status": "COMPLETED"}, "Configuration loaded successfully.")

                # Step 4: Commit Configuration (only runs if there is a diff)
                self.progress_callback("info", "STEP_START", {"step": commit_step}, "Committing changes to the device...")
                commit_args = {'comment': f"Restore from {xml_backup_filename}", 'timeout': self.commit_timeout}
                if self.confirmed_timeout > 0:
                    commit_args['confirmed'] = True
                    commit_args['confirm_timeout'] = str(self.confirmed_timeout)
                await asyncio.to_thread(cu.commit, **commit_args)
                self.progress_callback("success", "STEP_COMPLETE", {"step": commit_step, "status": "COMPLETED"}, "Commit successful.")

            return ("SUCCESS", {"host": self.host, "hostname": hostname, "message": "Restore operation completed successfully."})

        except Exception as e:
            error_message = f"Failed to restore on {self.host}: {e.__class__.__name__}: {str(e)}"
            self.progress_callback("error", "STEP_COMPLETE", {"step": connect_step, "status": "FAILED"}, error_message)
            return ("FAILED", {"host": self.host, "error": error_message})

        finally:
            if self.dev and self.dev.connected:
                self.dev.close()
