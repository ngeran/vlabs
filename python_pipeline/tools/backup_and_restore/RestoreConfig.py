# python_pipeline/tools/backup_and_restore/RestoreConfig.py

from pathlib import Path
from jnpr.junos import Device
from jnpr.junos.utils.config import Config
from jnpr.junos.exception import CommitError, ConfigLoadError, RpcError

# Assumes ProgressTracker is in a shared utility as provided in shared_utils.py
# from .utils.shared_utils import ProgressTracker

class RestoreManager:
    def __init__(self, device: Device, progress_tracker, logger):
        self.dev = device
        self.progress = progress_tracker
        self.logger = logger
        self.config = Config(self.dev)

    def run_restore(self, backup_file_path: str, restore_type: str, confirmed_timeout: int):
        """Orchestrates the entire restore process for a device."""
        self.progress.start_operation(f"Restore on '{self.dev.hostname}' using type '{restore_type}'")

        try:
            # Step 1: Validate file
            self.progress.start_step("VALIDATE_FILE", f"Checking backup file: {backup_file_path}")
            backup_file = Path(backup_file_path)
            if not backup_file.is_file():
                error_msg = f"Backup file does not exist: {backup_file_path}"
                self.progress.complete_step("FAILED", {"error": error_msg})
                raise FileNotFoundError(error_msg)
            self.progress.complete_step("COMPLETED", {"file": str(backup_file)})

            # Step 2: Load and Diff
            self.progress.start_step("LOAD_AND_DIFF", "Loading config and checking differences")
            
            # --- FIX: Prepare correct arguments for each load type ---
            load_args = {'path': str(backup_file)}
            if restore_type == 'override':
                # PyEZ's default is 'merge=False', which is equivalent to override.
                # No extra args needed.
                pass
            elif restore_type == 'merge':
                load_args['merge'] = True
            elif restore_type == 'set':
                load_args['format'] = 'set'
            
            self.logger.info(f"Loading config from '{backup_file_path}' with args: {load_args}")
            self.progress.update_step(message=f"Loading configuration with mode: {restore_type}")
            
            # Using try...finally to ensure unlock
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
                self.logger.error(f"Error loading configuration: {e}", exc_info=True)
                self.progress.complete_step("FAILED", {"error": f"Failed to load/diff config: {str(e)}"})
                raise
            finally:
                # We check if a diff exists; if not, unlock was already called.
                if 'diff' in locals() and diff is not None:
                     pass # Don't unlock yet, we need to commit
                else:
                    self.config.unlock()

            # Step 3: Commit
            self.progress.start_step("COMMIT_CONFIG", "Committing changes to device")
            try:
                commit_comment = f"Restore from backup {backup_file.name} via script"
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
                self.logger.error(f"Commit failed: {e}", exc_info=True)
                self.progress.complete_step("FAILED", {"error": str(e)})
                raise  # Re-raise to be handled by the main script
            finally:
                 # Always unlock after a commit attempt (success or fail)
                self.config.unlock()

        except Exception as e:
            self.logger.error(f"Restore failed for {self.dev.hostname}: {e}", exc_info=True)
            self.progress.complete_operation("FAILED")
            # Ensure the config is unlocked on any unexpected failure
            if self.config.is_locked():
                self.config.unlock()
            raise
