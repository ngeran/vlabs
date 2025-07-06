# python_pipeline/tools/configuration/run.py

import argparse
import json
import sys
import os
import logging
import time
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, Callable

# Import PyEZ specifics for configuration and robust error handling
from jnpr.junos.utils.config import Config
from jnpr.junos.exception import ConnectError, ConfigLoadError, CommitError, LockError

# Import custom utility functions
try:
    # Assuming standard project structure
    from utils.connect_to_hosts import connect_to_hosts, disconnect_from_hosts
    from utils.utils import load_yaml_file
except ImportError:
    # Fallback for direct execution
    sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'utils'))
    from connect_to_hosts import connect_to_hosts, disconnect_from_hosts
    from utils import load_yaml_file

# --- Enhanced Progress Tracking Classes ---
class NotificationLevel(Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    SUCCESS = "SUCCESS"

class ProgressTracker:
    """A class to manage and broadcast the progress of a multi-step operation."""
    
    def __init__(self, enable_visual_display: bool = True):
        self.steps = []
        self.current_step_index = -1
        self.start_time = None
        self.step_start_time = None
        self.enable_visual_display = enable_visual_display
        
    def start_operation(self, operation_name: str):
        self.start_time = time.time()
        self.operation_name = operation_name
        self._notify(
            level=NotificationLevel.INFO,
            message=f"Starting: {operation_name}",
            event_type="OPERATION_START",
            data={"operation": operation_name}
        )
        
    def start_step(self, step_name: str, description: str = "", estimated_duration: Optional[int] = None):
        self.current_step_index += 1
        self.step_start_time = time.time()
        step_info = {
            "step": self.current_step_index + 1,
            "name": step_name,
            "description": description,
            "status": "IN_PROGRESS",
            "start_time": datetime.now().isoformat(),
            "estimated_duration": estimated_duration,
            "duration": None,
            "details": {}
        }
        self.steps.append(step_info)
        
        self._notify(
            level=NotificationLevel.INFO,
            message=f"Step {step_info['step']}: {step_name}",
            event_type="STEP_START",
            data=step_info
        )
            
    def update_step(self, details: Optional[Dict] = None, status: Optional[str] = None, progress_percentage: Optional[int] = None, message: Optional[str] = None):
        if self.current_step_index < 0: return
        
        current = self.steps[self.current_step_index]
        if details:
            current["details"].update(details)
        if status:
            current["status"] = status
        if progress_percentage is not None:
            current["progress_percentage"] = progress_percentage
                
        self._notify(
            level=NotificationLevel.INFO,
            message=message or f"Updating: {current['name']}",
            event_type="STEP_UPDATE",
            data={
                "step": current['step'],
                "name": current['name'],
                "status": status,
                "details": details,
                "progress_percentage": progress_percentage
            }
        )
                
    def complete_step(self, status: str = "COMPLETED", details: Optional[Dict] = None):
        if self.current_step_index < 0: return

        current = self.steps[self.current_step_index]
        current["status"] = status
        current["duration"] = time.time() - self.step_start_time
        current["end_time"] = datetime.now().isoformat()
        if details:
            current["details"].update(details)
                
        level = NotificationLevel.SUCCESS if status == "COMPLETED" else NotificationLevel.ERROR
        self._notify(
            level=level,
            message=f"Step {current['step']} {status.lower()}: {current['name']} ({current['duration']:.2f}s)",
            event_type="STEP_COMPLETE",
            data=current
        )
            
    def complete_operation(self, status: str = "SUCCESS"):
        total_duration = time.time() - self.start_time if self.start_time else 0
        level = NotificationLevel.SUCCESS if status == "SUCCESS" else NotificationLevel.ERROR
        
        self._notify(
            level=level,
            message=f"Operation completed in {total_duration:.2f}s with status: {status}",
            event_type="OPERATION_COMPLETE",
            data={
                "operation": getattr(self, 'operation_name', 'Unknown'),
                "status": status,
                "total_duration": total_duration,
                "total_steps": len(self.steps)
            }
        )

    def _notify(self, level: NotificationLevel, message: str, event_type: str, data: Dict[Any, Any] = None):
        """Unified notification method. Always sends structured JSON to stderr for WebSocket consumption."""
        notification_data = {
            "timestamp": datetime.now().isoformat(),
            "level": level.value,
            "message": message,
            "event_type": event_type,
            "data": data or {}
        }
        
        # This is the primary output for the Node.js server to capture.
        print(f"JSON_PROGRESS: {json.dumps(notification_data)}", file=sys.stderr, flush=True)

    def get_summary(self):
        return {
            "operation": getattr(self, 'operation_name', 'Unknown'),
            "total_steps": len(self.steps),
            "steps": self.steps,
            "total_duration": time.time() - self.start_time if self.start_time else 0
        }

# --- Logging Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', filename='run_configuration.log', filemode='a')
logger = logging.getLogger(__name__)

# ✨ NEW: Redesigned commit progress callback for clean integration.
def commit_progress_callback(dev, report, progress_tracker: ProgressTracker):
    """Callback function that integrates with the ProgressTracker."""
    progress_tracker.update_step(
        message=f"Commit in progress: {report}",
        details={"commit_report": report}
    )
    # Log to file for debugging.
    logger.info(f"COMMIT_PROGRESS: {report}")

def main():
    parser = argparse.ArgumentParser(description="Generate and apply Juniper configurations.")
    parser.add_argument('--template_id', type=str, required=True)
    parser.add_argument('--rendered_config', type=str, required=True)
    parser.add_argument('--target_host', type=str, required=True)
    parser.add_argument('--username', type=str, required=True)
    parser.add_argument('--password', type=str, required=True)
    parser.add_argument('--inventory_file', type=str)
    parser.add_argument('--commit_check', action='store_true')
    parser.add_argument('--simple_output', action='store_true', help="Disables legacy visual display (now default).")
    args = parser.parse_args()

    # ✨ SIMPLIFIED: ProgressTracker is now self-contained.
    progress = ProgressTracker()
    
    results = {"success": False, "message": "", "details": {}, "progress": {}}
    connections = []

    progress.start_operation(f"Configuration deployment for template '{args.template_id}'")
    logger.info(f"Starting config run for template '{args.template_id}' on target '{args.target_host}'")

    try:
        # --- Step 1: IP Resolution ---
        progress.start_step("IP_RESOLUTION", "Determining target device IP address")
        device_ip = None
        if args.inventory_file:
            # ... (inventory logic is fine)
            pass
        else:
            device_ip = args.target_host
        progress.complete_step("COMPLETED", {"resolved_ip": device_ip})
        
        # --- Step 2: Device Connection ---
        progress.start_step("DEVICE_CONNECTION", f"Establishing SSH connection to {device_ip}")
        connections = connect_to_hosts(host=device_ip, username=args.username, password=args.password)
        dev = connections[0]
        device_facts = {"hostname": dev.hostname, "model": dev.facts.get('model'), "version": dev.facts.get('version')}
        progress.complete_step("COMPLETED", device_facts)

        # --- Step 3: Configuration Lock & Load ---
        dev.timeout = 180  # Increased timeout for complex operations
        with Config(dev, mode='private') as cu:
            progress.start_step("CONFIG_LOCK", "Acquiring exclusive configuration lock")
            progress.complete_step("COMPLETED")

            progress.start_step("CONFIG_LOAD", "Loading configuration into candidate database")
            cu.load(args.rendered_config, format='text', merge=True)
            progress.complete_step("COMPLETED")

            # --- Step 4: Diff Calculation ---
            progress.start_step("CONFIG_DIFF", "Calculating configuration differences")
            diff = cu.diff() or "No changes detected or diff unavailable."
            progress.complete_step("COMPLETED", {"diff_size": len(diff)})
            results['details']['diff'] = diff
            logger.info(f"Changes to be applied:\n{diff}")

            # --- Step 5: Commit or Check ---
            if args.commit_check:
                progress.start_step("COMMIT_CHECK", "Performing commit validation (dry-run)")
                cu.commit_check(timeout=120)
                progress.complete_step("COMPLETED")
                results["success"] = True
                results["message"] = f"'commit check' passed for {dev.hostname}."
            else:
                progress.start_step("COMMIT", "Committing configuration to device")
                
                # ✨ NEW: Use a lambda to pass the progress tracker instance to the callback.
                commit_callback_with_tracker = lambda dev, report: commit_progress_callback(dev, report, progress_tracker=progress)
                
                cu.commit(
                    comment=f"Config applied via template {args.template_id}",
                    timeout=120,
                    progress=commit_callback_with_tracker # Use the new lambda
                )
                
                progress.complete_step("COMPLETED")
                results["success"] = True
                results["message"] = f"Configuration applied successfully to {dev.hostname}."

        progress.complete_operation("SUCCESS")

    except (ConnectError, ConfigLoadError, CommitError, LockError, ValueError) as e:
        error_msg = f"{e.__class__.__name__}: {str(e)}"
        logger.error(error_msg, exc_info=True)
        # Ensure the current step is marked as failed if an error occurs mid-step
        if progress.steps and progress.steps[-1]["status"] == "IN_PROGRESS":
            progress.complete_step("FAILED", {"error": error_msg})
        progress.complete_operation("FAILED")
        results["success"] = False
        results["message"] = error_msg
    except Exception as e:
        # Catch-all for unexpected errors
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.error(error_msg, exc_info=True)
        if progress.steps and progress.steps[-1]["status"] == "IN_PROGRESS":
            progress.complete_step("FAILED", {"error": error_msg})
        progress.complete_operation("FAILED")
        results["success"] = False
        results["message"] = error_msg
        
    finally:
        # Finalization
        if connections:
            disconnect_from_hosts(connections)
            logger.info("Disconnected from all devices.")
        
        results["progress"] = progress.get_summary()
        # The final, complete JSON result is printed to stdout for the backend to parse once.
        print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
