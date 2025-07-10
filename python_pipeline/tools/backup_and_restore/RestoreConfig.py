# python_pipeline/tools/backup_and_restore/RestoreConfig.py

from pathlib import Path
from jnpr.junos import Device
from jnpr.junos.utils.config import Config
from jnpr.junos.exception import CommitError

# from utils.shared_utils import ProgressTracker

class RestoreManager:
    def __init__(self, device: Device, progress_tracker, logger):
        self.dev = device
        self.progress = progress_tracker
        self.logger = logger # Store the logger instance
        self.config = Config(self.dev)

    def run_restore(self, backup_file_path: str, restore_type: str, confirmed_timeout: int):
        self.progress.start_operation(f"Restore on '{self.dev.hostname}'")
        
        # Step 1: Validate file
        self.progress.start_step("VALIDATE_FILE", f"Checking backup file: {backup_file_path}")
        backup_file = Path(backup_file_path)
        if not backup_file.is_file():
            self.progress.complete_step("FAILED", {"error": "Backup file not found."})
            raise FileNotFoundError(f"Backup file does not exist: {backup_file_path}")
        self.progress.complete_step("COMPLETED")

        # Step 2: Load and Diff
        self.progress.start_step("LOAD_AND_DIFF", "Loading config and checking differences")
        try:
            # Note: for 'set' format, use 'path' and 'format'
            load_args = {'path': str(backup_file), 'format': 'set'} if restore_type == 'set' else {'path': str(backup_file)}
            
            self.progress.update_step(message=f"Loading config with mode: {restore_type}")
            self.config.load(template_path=str(backup_file), merge=(restore_type=='merge'))

            self.progress.update_step(message="Calculating configuration diff...")
            diff = self.config.diff()
            if not diff:
                self.progress.complete_step("COMPLETED", {"status": "NO_CHANGES", "message": "No changes to commit."})
                self.progress.complete_operation("SUCCESS")
                return

            self.progress.complete_step("COMPLETED", {"diff": diff})

        except Exception as e:
            self.progress.complete_step("FAILED", {"error": str(e)})
            self.config.unlock()
            raise e

        # Step 3: Commit
        self.progress.start_step("COMMIT_CONFIG", "Committing changes to device")
        try:
            commit_comment = f"Restore from backup {backup_file.name}"
            if confirmed_timeout > 0:
                self.progress.update_step(message=f"Performing confirmed commit with {confirmed_timeout} min timeout.")
                self.config.commit(comment=commit_comment, confirmed=True, confirm_timeout=str(confirmed_timeout))
            else:
                self.progress.update_step(message="Performing standard commit.")
                self.config.commit(comment=commit_comment)
            
            self.progress.complete_step("COMPLETED")
            self.progress.complete_operation("SUCCESS")

        except CommitError as e:
            self.progress.complete_step("FAILED", {"error": str(e)})
            self.progress.complete_operation("FAILED")
            self.config.unlock() # Ensure unlock on failure
            raise e
