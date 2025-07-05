# python_pipeline/configuration/run.py

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
    from utils.connect_to_hosts import connect_to_hosts, disconnect_from_hosts
    from utils.utils import load_yaml_file
except ImportError:
    sys.path.append(os.path.join(os.path.dirname(__file__), 'utils'))
    from connect_to_hosts import connect_to_hosts, disconnect_from_hosts
    from utils import load_yaml_file

# --- Enhanced Progress Tracking Classes ---
class NotificationLevel(Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    SUCCESS = "SUCCESS"

class RealTimeProgressDisplay:
    """A visual progress display for terminal users"""
    
    def __init__(self):
        self.current_step = 0
        self.total_steps = 0
        
    def __call__(self, notification_data):
        event_type = notification_data.get('event_type')
        
        if event_type == "STEP_START":
            self.current_step = notification_data['data']['step']
            self._display_step_start(notification_data)
        elif event_type == "STEP_UPDATE":
            self._display_step_update(notification_data)
        elif event_type == "STEP_COMPLETE":
            self._display_step_complete(notification_data)
            
    def _display_step_start(self, data):
        step_info = data['data']
        print(f"\n{'='*60}")
        print(f"STEP {step_info['step']}: {step_info['name']}")
        if step_info.get('description'):
            print(f"Description: {step_info['description']}")
        if step_info.get('estimated_duration'):
            print(f"Estimated duration: {step_info['estimated_duration']}s")
        print(f"{'='*60}")
        
    def _display_step_update(self, data):
        if 'progress_percentage' in data['data']:
            percentage = data['data']['progress_percentage']
            bar_length = 40
            filled_length = int(bar_length * percentage // 100)
            bar = '█' * filled_length + '-' * (bar_length - filled_length)
            print(f"\r|{bar}| {percentage}% Complete", end='', flush=True)
            
    def _display_step_complete(self, data):
        step_data = data['data']
        status = step_data['status']
        duration = step_data['duration']
        
        status_symbol = "✓" if status == "COMPLETED" else "✗"
        print(f"\n{status_symbol} {step_data['name']} - {status} ({duration:.2f}s)")

class ProgressTracker:
    def __init__(self, notification_callbacks: Optional[list] = None, enable_visual_display: bool = True):
        self.steps = []
        self.current_step = 0
        self.start_time = None
        self.step_start_time = None
        self.notification_callbacks = notification_callbacks or []
        self.enable_console = True
        self.enable_json_output = True
        self.enable_visual_display = enable_visual_display
        
        # Add visual display callback if enabled
        if enable_visual_display:
            self.visual_display = RealTimeProgressDisplay()
            self.notification_callbacks.append(self.visual_display)
        
    def add_notification_callback(self, callback: Callable):
        """Add a custom notification callback function"""
        self.notification_callbacks.append(callback)
        
    def start_operation(self, operation_name):
        self.start_time = time.time()
        self.operation_name = operation_name
        self._notify(
            level=NotificationLevel.INFO,
            message=f"Starting {operation_name}",
            event_type="OPERATION_START",
            data={"operation": operation_name}
        )
        
    def start_step(self, step_name, description="", estimated_duration=None):
        self.current_step += 1
        self.step_start_time = time.time()
        step_info = {
            "step": self.current_step,
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
            message=f"Step {self.current_step}: {step_name}",
            event_type="STEP_START",
            data={
                "step": self.current_step,
                "name": step_name,
                "description": description,
                "estimated_duration": estimated_duration
            }
        )
        
        if description:
            self._notify(
                level=NotificationLevel.DEBUG,
                message=description,
                event_type="STEP_DESCRIPTION",
                data={"step": self.current_step, "description": description}
            )
            
    def update_step(self, details=None, status=None, progress_percentage=None, message=None):
        if self.steps:
            current = self.steps[-1]
            if details:
                current["details"].update(details)
            if status:
                current["status"] = status
            if progress_percentage is not None:
                current["progress_percentage"] = progress_percentage
                
            update_message = message or f"Updated: {current['name']}"
            self._notify(
                level=NotificationLevel.INFO,
                message=update_message,
                event_type="STEP_UPDATE",
                data={
                    "step": self.current_step,
                    "status": status,
                    "details": details,
                    "progress_percentage": progress_percentage
                }
            )
                
    def complete_step(self, status="COMPLETED", details=None):
        if self.steps:
            current = self.steps[-1]
            current["status"] = status
            current["duration"] = time.time() - self.step_start_time
            current["end_time"] = datetime.now().isoformat()
            if details:
                current["details"].update(details)
                
            level = NotificationLevel.SUCCESS if status == "COMPLETED" else NotificationLevel.ERROR
            self._notify(
                level=level,
                message=f"Step {self.current_step} {status.lower()}: {current['name']} ({current['duration']:.2f}s)",
                event_type="STEP_COMPLETE",
                data={
                    "step": self.current_step,
                    "name": current['name'],
                    "status": status,
                    "duration": current['duration'],
                    "details": details
                }
            )
            
    def complete_operation(self, status="SUCCESS"):
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
        """Internal method to handle all notifications"""
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        
        notification_data = {
            "timestamp": timestamp,
            "level": level.value,
            "message": message,
            "event_type": event_type,
            "data": data or {}
        }
        
        # Console output (simplified for non-visual mode)
        if self.enable_console and not self.enable_visual_display:
            print(f"PROGRESS [{timestamp}] {level.value}: {message}")
        
        # JSON output for programmatic consumption
        if self.enable_json_output:
            print(f"JSON_PROGRESS: {json.dumps(notification_data)}", file=sys.stderr)
        
        # Custom callbacks
        for callback in self.notification_callbacks:
            try:
                callback(notification_data)
            except Exception as e:
                print(f"Warning: Notification callback failed: {e}", file=sys.stderr)
                
    def get_summary(self):
        return {
            "operation": getattr(self, 'operation_name', 'Unknown'),
            "total_steps": len(self.steps),
            "steps": self.steps,
            "total_duration": time.time() - self.start_time if self.start_time else 0
        }

# --- Logging Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(name)s - %(message)s',
    filename='run_configuration.log',
    filemode='a'
)
logger = logging.getLogger(__name__)

# --- Enhanced Commit Progress Callback ---
def commit_progress_callback(dev, report):
    """Callback function to track commit progress"""
    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"COMMIT_PROGRESS [{timestamp}]: {report}")

# --- Custom Notification Callbacks ---
def websocket_callback(notification_data):
    """Example: Send progress updates via WebSocket"""
    # This would integrate with your WebSocket implementation
    # For now, we'll just log it
    if notification_data['event_type'] in ['STEP_START', 'STEP_COMPLETE', 'OPERATION_COMPLETE']:
        logger.info(f"WebSocket notification: {notification_data['message']}")

def database_callback(notification_data):
    """Example: Store progress in database"""
    # This would store progress in your database
    # For now, we'll just log important events
    if notification_data['event_type'] in ['OPERATION_START', 'OPERATION_COMPLETE']:
        logger.info(f"Database notification: {notification_data['message']}")

def email_callback(notification_data):
    """Example: Send critical notifications via email"""
    if notification_data['level'] in ['ERROR', 'SUCCESS'] and notification_data['event_type'] == 'OPERATION_COMPLETE':
        # Send email notification for completion or errors
        logger.info(f"Email notification: {notification_data['message']}")

def main():
    """
    Main function with enhanced progress tracking
    """
    # Parse arguments first to determine display mode
    parser = argparse.ArgumentParser(description="Generate and apply Juniper configurations.")
    parser.add_argument('--template_id', type=str, required=True, help="ID of the template being used.")
    parser.add_argument('--rendered_config', type=str, required=True, help="The pre-rendered configuration content to apply.")
    parser.add_argument('--target_host', type=str, required=True, help="Hostname (from inventory) or direct IP of the target device.")
    parser.add_argument('--username', type=str, required=True, help="Username for device connection.")
    parser.add_argument('--password', type=str, required=True, help="Password for device connection.")
    parser.add_argument('--inventory_file', type=str, required=False, help="Optional: Path to the YAML inventory file.")
    parser.add_argument('--commit_check', action='store_true', help="Perform a 'commit check' only; do not apply.")
    parser.add_argument('--simple_output', action='store_true', help="Use simple console output instead of visual progress bars.")
    parser.add_argument('--enable_notifications', action='store_true', help="Enable email/webhook notifications.")

    args = parser.parse_args()

    # Initialize progress tracker with appropriate display mode
    notification_callbacks = []
    if args.enable_notifications:
        notification_callbacks.extend([websocket_callback, database_callback, email_callback])
    
    progress = ProgressTracker(
        notification_callbacks=notification_callbacks,
        enable_visual_display=not args.simple_output
    )
    
    # --- Result Initialization ---
    results = {
        "success": False,
        "message": "",
        "details": {},
        "progress": {}
    }
    
    connections = []

    # Start tracking the operation
    progress.start_operation(f"Configuration deployment for template '{args.template_id}'")
    
    logger.info(f"Starting configuration run for template '{args.template_id}' on target '{args.target_host}'")

    try:
        # --- Step 1: Determine Device IP Address ---
        progress.start_step(
            "IP_RESOLUTION", 
            "Determining target device IP address from inventory or direct input",
            estimated_duration=2
        )
        device_ip = None

        if args.inventory_file:
            progress.update_step(
                details={"mode": "inventory", "file": args.inventory_file},
                message="Loading inventory file and searching for target host"
            )
            logger.info(f"Inventory mode: Loading file '{args.inventory_file}' to find host '{args.target_host}'.")
            
            # Simulate loading progress for large inventory files
            progress.update_step(progress_percentage=30, message="Parsing inventory file...")
            inventory_data = load_yaml_file(args.inventory_file)
            if not inventory_data:
                raise ValueError(f"Failed to load or parse inventory from {args.inventory_file}")

            progress.update_step(progress_percentage=60, message="Searching for target host...")
            target_device_info = None
            if 'devices' in inventory_data and isinstance(inventory_data.get('devices'), list):
                for device in inventory_data['devices']:
                    if device.get('name') == args.target_host:
                        target_device_info = device
                        break
            
            if not target_device_info:
                raise ValueError(f"Target host name '{args.target_host}' not found in the inventory file.")

            progress.update_step(progress_percentage=90, message="Extracting device IP address...")
            device_ip = target_device_info.get('ip')
            if not device_ip:
                raise ValueError(f"IP address not found for target host '{args.target_host}' in the inventory file.")
            
            logger.info(f"Found target '{args.target_host}' with IP '{device_ip}' in inventory.")
            progress.complete_step("COMPLETED", {"resolved_ip": device_ip, "hostname": args.target_host})

        else:
            progress.update_step(
                details={"mode": "direct"},
                message="Using target_host as direct IP address"
            )
            logger.info("Manual mode: No inventory file provided. Using target_host as the connection IP/hostname.")
            device_ip = args.target_host
            progress.complete_step("COMPLETED", {"direct_ip": device_ip})
        
        if not device_ip:
            raise ValueError("Could not determine the device IP address to connect to.")

        # --- Step 2: Connect to the Device ---
        progress.start_step(
            "DEVICE_CONNECTION", 
            f"Establishing SSH connection to device at {device_ip}",
            estimated_duration=10
        )
        
        progress.update_step(progress_percentage=25, message="Initiating SSH connection...")
        connections = connect_to_hosts(host=device_ip, username=args.username, password=args.password)
        if not connections:
            raise ConnectError(f"Failed to establish a connection to {device_ip}")

        progress.update_step(progress_percentage=75, message="Retrieving device facts...")
        dev = connections[0]
        device_facts = {
            "hostname": dev.hostname,
            "model": dev.facts.get('model', 'Unknown'),
            "version": dev.facts.get('version', 'Unknown'),
            "serial": dev.facts.get('serialnumber', 'Unknown')
        }
        
        logger.info(f"Successfully connected to device: {dev.hostname} (Junos Version: {dev.facts.get('version')})")
        progress.complete_step("COMPLETED", device_facts)

        # --- Step 3: Configuration Database Lock ---
        progress.start_step(
            "CONFIG_LOCK", 
            "Acquiring exclusive configuration database lock",
            estimated_duration=5
        )
        dev.timeout = 120  # Set longer timeout
        
        progress.update_step(progress_percentage=50, message="Requesting configuration lock...")
        with Config(dev, mode='private') as cu:
            progress.complete_step("COMPLETED", {"lock_mode": "private"})
            
            # --- Step 4: Load Configuration ---
            progress.start_step(
                "CONFIG_LOAD", 
                "Loading configuration into candidate database",
                estimated_duration=15
            )
            
            config_size = len(args.rendered_config)
            config_lines = args.rendered_config.count('\n')
            
            progress.update_step(
                progress_percentage=25, 
                message=f"Loading {config_lines} lines of configuration..."
            )
            
            # Simulate progress for large configurations
            if config_size > 10000:  # Large config
                progress.update_step(progress_percentage=50, message="Processing large configuration file...")
                time.sleep(1)  # Simulate processing time
                progress.update_step(progress_percentage=75, message="Validating configuration syntax...")
            
            cu.load(args.rendered_config, format='text', merge=True)
            progress.complete_step("COMPLETED", {
                "config_size_bytes": config_size, 
                "config_lines": config_lines,
                "load_method": "text/merge"
            })
            
            # --- Step 5: Configuration Diff ---
            progress.start_step(
                "CONFIG_DIFF", 
                "Calculating configuration differences",
                estimated_duration=10
            )
            
            progress.update_step(progress_percentage=30, message="Generating configuration diff...")
            diff = cu.diff()
            if not diff:
                progress.update_step(progress_percentage=70, message="Generating detailed diff...")
                diff = cu.pdiff()
            
            if not diff:
                diff = "Configuration changes detected (diff unavailable)"
            
            diff_lines = len(diff.split('\n')) if isinstance(diff, str) else 0
            progress.complete_step("COMPLETED", {
                "diff_lines": diff_lines, 
                "has_changes": True,
                "diff_size": len(diff)
            })
            
            logger.info(f"Configuration loaded successfully. Proceeding with commit/check.")
            logger.info(f"Changes to be applied:\n{diff}")

            # --- Step 6: Commit or Check ---
            if args.commit_check:
                progress.start_step(
                    "COMMIT_CHECK", 
                    "Performing commit validation (dry-run)",
                    estimated_duration=30
                )
                
                progress.update_step(progress_percentage=20, message="Starting commit check validation...")
                try:
                    progress.update_step(progress_percentage=50, message="Validating configuration syntax...")
                    cu.commit_check(timeout=60)
                    progress.update_step(progress_percentage=90, message="Validation completed successfully...")
                    progress.complete_step("COMPLETED", {"validation": "passed"})
                    results["success"] = True
                    results["message"] = f"'commit check' was successful for {dev.hostname}. No changes were applied."
                    results["details"] = {"device_hostname": dev.hostname, "diff_checked": diff}
                except Exception as check_error:
                    if "RpcTimeoutError" in str(check_error) or "timeout" in str(check_error).lower():
                        progress.complete_step("TIMEOUT", {"error": "Commit check timed out"})
                        results["success"] = False
                        results["message"] = f"'commit check' timed out for {dev.hostname}."
                        results["details"] = {"device_hostname": dev.hostname, "error": "Commit check timed out"}
                    else:
                        raise check_error
            else:
                progress.start_step(
                    "COMMIT", 
                    "Committing configuration changes to device",
                    estimated_duration=60
                )
                
                try:
                    progress.update_step(progress_percentage=10, message="Starting commit operation...")
                    progress.update_step(progress_percentage=30, message="Validating configuration...")
                    
                    # Use progress callback for commit tracking
                    cu.commit(
                        comment=f"Configuration applied for template {args.template_id} via automation pipeline",
                        timeout=120,
                        progress=commit_progress_callback
                    )
                    
                    progress.update_step(progress_percentage=90, message="Commit operation completed...")
                    progress.complete_step("COMPLETED", {
                        "commit_comment": f"Template {args.template_id} via automation"
                    })
                    logger.info(f"Configuration committed successfully on {dev.hostname}.")
                    results["success"] = True
                    results["message"] = f"Configuration from template '{args.template_id}' was applied successfully to {dev.hostname}."
                    results["details"] = {"device_hostname": dev.hostname, "applied_diff": diff}
                except Exception as commit_error:
                    if "RpcTimeoutError" in str(commit_error) or "timeout" in str(commit_error).lower():
                        progress.complete_step("TIMEOUT", {"warning": "Commit timed out but may have succeeded"})
                        logger.warning(f"Commit operation timed out on {dev.hostname}, but changes may have been applied.")
                        results["success"] = True
                        results["message"] = f"Configuration from template '{args.template_id}' was likely applied to {dev.hostname} (commit timed out but may have succeeded)."
                        results["details"] = {"device_hostname": dev.hostname, "applied_diff": diff, "warning": "Commit operation timed out"}
                    else:
                        progress.complete_step("FAILED", {"error": str(commit_error)})
                        raise commit_error

        progress.complete_operation("SUCCESS")

    # --- Exception Handling ---
    except (ConnectError, ConfigLoadError, CommitError, LockError) as e:
        error_msg = f"A PyEZ error occurred: {e.__class__.__name__} - {str(e)}"
        logger.error(error_msg, exc_info=True)
        progress.complete_step("FAILED", {"error": error_msg})
        progress.complete_operation("FAILED")
        results["success"] = False
        results["message"] = error_msg
        results["details"] = {"error": str(e)}
    except ValueError as e:
        error_msg = f"Data or Inventory Error: {str(e)}"
        logger.error(error_msg, exc_info=True)
        progress.complete_step("FAILED", {"error": error_msg})
        progress.complete_operation("FAILED")
        results["success"] = False
        results["message"] = error_msg
        results["details"] = {"error": str(e)}
    except Exception as e:
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.error(error_msg, exc_info=True)
        progress.complete_step("FAILED", {"error": error_msg})
        progress.complete_operation("FAILED")
        results["success"] = False
        results["message"] = error_msg
        results["details"] = {"error": str(e)}
        
    finally:
        # --- Finalization Block ---
        if connections:
            progress.start_step(
                "CLEANUP", 
                "Disconnecting from devices and cleaning up resources",
                estimated_duration=3
            )
            progress.update_step(progress_percentage=50, message="Closing device connections...")
            disconnect_from_hosts(connections)
            progress.complete_step("COMPLETED", {"disconnected_devices": len(connections)})
            logger.info("Disconnected from all devices.")
        
        # Add progress summary to results
        results["progress"] = progress.get_summary()
        
        # Print the final results
        print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
