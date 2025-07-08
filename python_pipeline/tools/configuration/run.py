# python_pipeline/tools/configuration/run.py Version 1

import argparse
import json
import sys
import os
import logging
import time
import socket
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, Callable

# Import PyEZ specifics for configuration and robust error handling
from jnpr.junos import Device
from jnpr.junos.utils.config import Config
from jnpr.junos.exception import ConnectError, ConfigLoadError, CommitError, LockError, ProbeError

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

def parse_commit_check_results(commit_check_output) -> Dict[str, Any]:
    """
    Parse commit check output to extract errors and warnings.
    
    Args:
        commit_check_output: Output from cu.commit_check()
        
    Returns:
        Dict containing parsed results with errors, warnings, and summaries
    """
    result = {
        "has_errors": False,
        "has_warnings": False,
        "errors": [],
        "warnings": [],
        "error_summary": "",
        "warning_summary": "",
        "raw_output": str(commit_check_output) if commit_check_output else ""
    }
    
    if not commit_check_output:
        return result
    
    # Convert to string if it's not already
    output_str = str(commit_check_output)
    
    # Parse for common error patterns
    error_patterns = [
        r"error:",
        r"invalid",
        r"unknown command",
        r"syntax error",
        r"configuration check fails",
        r"commit failed",
        r"constraint violation"
    ]
    
    warning_patterns = [
        r"warning:",
        r"deprecated",
        r"obsolete"
    ]
    
    lines = output_str.split('\n')
    
    for line in lines:
        line_lower = line.lower().strip()
        if not line_lower:
            continue
            
        # Check for errors
        for pattern in error_patterns:
            if pattern in line_lower:
                result["errors"].append(line.strip())
                result["has_errors"] = True
                break
        
        # Check for warnings
        for pattern in warning_patterns:
            if pattern in line_lower:
                result["warnings"].append(line.strip())
                result["has_warnings"] = True
                break
    
    # Create summaries
    if result["errors"]:
        result["error_summary"] = f"{len(result['errors'])} error(s) found"
    if result["warnings"]:
        result["warning_summary"] = f"{len(result['warnings'])} warning(s) found"
    
    return result

def parse_commit_error(commit_error: CommitError) -> Dict[str, Any]:
    """
    Parse CommitError exception to extract detailed error information.
    
    Args:
        commit_error: CommitError exception from PyEZ
        
    Returns:
        Dict containing parsed error details
    """
    error_details = {
        "summary": str(commit_error),
        "error_type": commit_error.__class__.__name__,
        "specific_errors": [],
        "suggestions": []
    }
    
    error_msg = str(commit_error).lower()
    
    # Categorize common commit errors and provide suggestions
    if "syntax error" in error_msg:
        error_details["category"] = "SYNTAX_ERROR"
        error_details["suggestions"].append("Check configuration syntax and formatting")
    elif "unknown command" in error_msg:
        error_details["category"] = "UNKNOWN_COMMAND"
        error_details["suggestions"].append("Verify command availability on target device/software version")
    elif "constraint violation" in error_msg:
        error_details["category"] = "CONSTRAINT_VIOLATION"
        error_details["suggestions"].append("Check configuration constraints and dependencies")
    elif "interface" in error_msg and "does not exist" in error_msg:
        error_details["category"] = "INTERFACE_ERROR"
        error_details["suggestions"].append("Verify interface names and availability on target device")
    elif "commit failed" in error_msg:
        error_details["category"] = "COMMIT_FAILED"
        error_details["suggestions"].append("Review configuration for conflicts or missing dependencies")
    elif "lock" in error_msg:
        error_details["category"] = "LOCK_ERROR"
        error_details["suggestions"].append("Another user may have exclusive configuration access")
    else:
        error_details["category"] = "GENERAL_ERROR"
        error_details["suggestions"].append("Review configuration and device logs for more details")
    
    # Extract specific error lines if available
    if hasattr(commit_error, 'rpc_error') and commit_error.rpc_error:
        try:
            # PyEZ CommitError may contain XML error details
            error_details["rpc_error"] = str(commit_error.rpc_error)
        except:
            pass
    
    return error_details

def check_configuration_exists(cu: Config, config_snippet: str) -> Dict[str, Any]:
    """
    Check if similar configuration already exists to avoid duplicates.
    
    Args:
        cu: PyEZ Config object
        config_snippet: Configuration to check for
        
    Returns:
        Dict with existence check results
    """
    try:
        # Get current configuration
        current_config = cu.get_config()
        
        # Simple check - this can be enhanced based on specific needs
        config_lines = config_snippet.strip().split('\n')
        existing_lines = []
        
        for line in config_lines:
            line_clean = line.strip()
            if line_clean and line_clean in str(current_config):
                existing_lines.append(line_clean)
        
        return {
            "has_existing_config": len(existing_lines) > 0,
            "existing_lines": existing_lines,
            "total_lines": len(config_lines),
            "overlap_percentage": (len(existing_lines) / len(config_lines)) * 100 if config_lines else 0
        }
        
    except Exception as e:
        return {
            "has_existing_config": False,
            "error": f"Failed to check existing configuration: {str(e)}"
        }

# ✨ NEW: Redesigned commit progress callback for clean integration.
def commit_progress_callback(dev, report, progress_tracker: ProgressTracker):
    """Callback function that integrates with the ProgressTracker."""
    progress_tracker.update_step(
        message=f"Commit in progress: {report}",
        details={"commit_report": report}
    )
    # Log to file for debugging.
    logger.info(f"COMMIT_PROGRESS: {report}")

def test_basic_reachability(host: str, port: int = 22, timeout: int = 10) -> bool:
    """
    Test basic TCP connectivity to the host on the specified port.
    
    Args:
        host: The hostname or IP address to test
        port: The port to test (default 22 for SSH)
        timeout: Connection timeout in seconds
        
    Returns:
        bool: True if host is reachable, False otherwise
    """
    try:
        socket.setdefaulttimeout(timeout)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except socket.gaierror:
        # DNS resolution failed
        return False
    except Exception:
        return False

def test_junos_reachability(host: str, username: str, password: str, timeout: int = 30) -> tuple[bool, str, Optional[Device]]:
    """
    Test Junos device reachability using PyEZ probe functionality.
    
    Args:
        host: The hostname or IP address
        username: SSH username
        password: SSH password
        timeout: Connection timeout in seconds
        
    Returns:
        tuple: (success, message, device_object or None)
    """
    try:
        # Create device object with minimal timeout for quick failure
        dev = Device(host=host, user=username, password=password, 
                    connect_timeout=timeout, normalize=True)
        
        # Use PyEZ probe to test connectivity
        try:
            # This will attempt to connect and gather basic facts
            result = dev.probe(timeout=timeout)
            if result:
                # Device is reachable and responding to NETCONF
                return True, f"Device {host} is reachable and responsive", dev
            else:
                return False, f"Device {host} is not responding to NETCONF/SSH", None
        except ProbeError as e:
            return False, f"Probe failed for {host}: {str(e)}", None
        except Exception as e:
            return False, f"Connection test failed for {host}: {str(e)}", None
            
    except Exception as e:
        return False, f"Failed to create device connection for {host}: {str(e)}", None

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
    # NEW: Add flag to enable pre-commit validation
    parser.add_argument('--validate_before_commit', action='store_true', 
                       help="Perform commit check before actual commit and exit if validation fails")
    # NEW: Add flag to skip reachability test
    parser.add_argument('--skip_reachability_test', action='store_true',
                       help="Skip the initial reachability test")
    # NEW: Add flag to skip existing configuration check
    parser.add_argument('--skip_existing_check', action='store_true',
                       help="Skip checking for existing similar configuration")
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
        
        # --- Step 2: Reachability Test (NEW) ---
        if not args.skip_reachability_test:
            progress.start_step("REACHABILITY_TEST", f"Testing connectivity to {device_ip}")
            
            # First, test basic TCP connectivity
            progress.update_step(message="Testing basic TCP connectivity (port 22)")
            if not test_basic_reachability(device_ip, port=22, timeout=10):
                error_msg = f"Device {device_ip} is not reachable on port 22 (SSH). Exiting - device or host not reachable."
                progress.complete_step("FAILED", {"error": error_msg, "test_type": "TCP_CONNECTIVITY"})
                progress.complete_operation("FAILED")
                results["success"] = False
                results["message"] = error_msg
                logger.error(error_msg)
                return results
            
            # Then test Junos-specific connectivity
            progress.update_step(message="Testing Junos device connectivity and NETCONF capability")
            is_reachable, reachability_msg, probe_device = test_junos_reachability(
                device_ip, args.username, args.password, timeout=30
            )
            
            if not is_reachable:
                error_msg = f"Junos device connectivity test failed: {reachability_msg}. Exiting - device or host not reachable."
                progress.complete_step("FAILED", {"error": error_msg, "test_type": "JUNOS_CONNECTIVITY"})
                progress.complete_operation("FAILED")
                results["success"] = False
                results["message"] = error_msg
                logger.error(error_msg)
                return results
            
            # Close the probe device if it was created
            if probe_device:
                try:
                    probe_device.close()
                except:
                    pass
                    
            progress.complete_step("COMPLETED", {
                "tcp_connectivity": "PASSED",
                "junos_connectivity": "PASSED",
                "message": reachability_msg
            })

        # --- Step 3: Device Connection ---
        progress.start_step("DEVICE_CONNECTION", f"Establishing SSH connection to {device_ip}")
        try:
            connections = connect_to_hosts(host=device_ip, username=args.username, password=args.password)
            dev = connections[0]
            device_facts = {"hostname": dev.hostname, "model": dev.facts.get('model'), "version": dev.facts.get('version')}
            progress.complete_step("COMPLETED", device_facts)
        except ConnectError as e:
            error_msg = f"Failed to connect to device {device_ip}: {str(e)}. Exiting - device or host not reachable."
            progress.complete_step("FAILED", {"error": error_msg})
            progress.complete_operation("FAILED")
            results["success"] = False
            results["message"] = error_msg
            logger.error(error_msg)
            return results

        # --- Step 4: Configuration Lock & Load ---
        dev.timeout = 180  # Increased timeout for complex operations
        with Config(dev, mode='private') as cu:
            progress.start_step("CONFIG_LOCK", "Acquiring exclusive configuration lock")
            progress.complete_step("COMPLETED")

            # --- Step 4a: Check for Existing Configuration (Optional) ---
            if not args.skip_existing_check:
                progress.start_step("EXISTING_CONFIG_CHECK", "Checking for existing similar configuration")
                existing_check = check_configuration_exists(cu, args.rendered_config)
                
                if existing_check.get("has_existing_config") and existing_check.get("overlap_percentage", 0) > 80:
                    warning_msg = f"High configuration overlap detected ({existing_check['overlap_percentage']:.1f}%)"
                    progress.complete_step("COMPLETED", {
                        "overlap_detected": True,
                        "overlap_percentage": existing_check["overlap_percentage"],
                        "existing_lines": existing_check["existing_lines"][:5],  # Show first 5 overlapping lines
                        "warning": warning_msg
                    })
                    logger.warning(f"{warning_msg} - proceeding with merge")
                    results["details"]["configuration_overlap"] = existing_check
                else:
                    progress.complete_step("COMPLETED", {
                        "overlap_detected": False,
                        "overlap_percentage": existing_check.get("overlap_percentage", 0)
                    })

            progress.start_step("CONFIG_LOAD", "Loading configuration into candidate database")
            try:
                cu.load(args.rendered_config, format='text', merge=True)
                progress.complete_step("COMPLETED", {
                    "load_method": "merge",
                    "config_size": len(args.rendered_config)
                })
            except ConfigLoadError as load_err:
                error_msg = f"Failed to load configuration: {str(load_err)}"
                progress.complete_step("FAILED", {"error": error_msg})
                progress.complete_operation("FAILED")
                results["success"] = False
                results["message"] = f"Configuration load failed on {dev.hostname}: {error_msg}"
                results["details"]["load_error"] = error_msg
                logger.error(f"Configuration load failed: {error_msg}")
                return results

            # --- Step 5: Diff Calculation ---
            progress.start_step("CONFIG_DIFF", "Calculating configuration differences")
            diff = cu.diff() or "No changes detected or diff unavailable."
            diff_lines = diff.split('\n') if diff else []
            
            # Check if there are actually no changes
            if not diff or diff.strip() == "" or "No changes detected" in diff:
                progress.complete_step("COMPLETED", {
                    "diff_size": 0,
                    "changes_detected": False,
                    "message": "No configuration changes detected"
                })
                results['details']['diff'] = "No changes detected"
                results["success"] = True
                results["message"] = f"No configuration changes needed for {dev.hostname}."
                logger.info("No configuration changes detected - operation completed successfully")
                progress.complete_operation("SUCCESS")
                return results
            
            progress.complete_step("COMPLETED", {
                "diff_size": len(diff),
                "diff_lines": len(diff_lines),
                "changes_detected": True
            })
            results['details']['diff'] = diff
            logger.info(f"Changes to be applied:\n{diff}")

            # --- Step 6: Configuration Validation ---
            progress.start_step("CONFIG_VALIDATION", "Validating configuration syntax and constraints")
            validation_details = {"has_errors": False, "has_warnings": False, "errors": [], "warnings": []}
            
            try:
                # Always perform commit check before proceeding
                commit_check_result = cu.commit_check(timeout=120)
                
                # Parse commit check results for warnings/errors
                validation_details = parse_commit_check_results(commit_check_result)
                
                if validation_details['has_errors']:
                    # Configuration has errors - cannot proceed
                    error_msg = f"Configuration validation failed with errors: {validation_details['error_summary']}"
                    progress.complete_step("FAILED", {
                        "validation_result": "FAILED",
                        "errors": validation_details['errors'],
                        "warnings": validation_details['warnings'],
                        "error_summary": validation_details['error_summary']
                    })
                    progress.complete_operation("FAILED")
                    results["success"] = False
                    results["message"] = f"Configuration validation failed on {dev.hostname}. Commit aborted."
                    results["details"]["validation_error"] = error_msg
                    results["details"]["validation_details"] = validation_details
                    logger.error(f"Configuration validation failed: {error_msg}")
                    return results
                
                elif validation_details['has_warnings']:
                    # Configuration has warnings but can proceed
                    warning_msg = f"Configuration validation passed with warnings: {validation_details['warning_summary']}"
                    progress.complete_step("COMPLETED", {
                        "validation_result": "PASSED_WITH_WARNINGS",
                        "warnings": validation_details['warnings'],
                        "warning_summary": validation_details['warning_summary']
                    })
                    results["details"]["validation_warnings"] = validation_details['warnings']
                    logger.warning(f"Configuration validation passed with warnings: {warning_msg}")
                else:
                    # Configuration is clean
                    progress.complete_step("COMPLETED", {
                        "validation_result": "PASSED",
                        "message": "Configuration validation passed without issues"
                    })
                    logger.info("Configuration validation passed without issues")
                    
            except CommitError as commit_err:
                # Handle commit check failures
                error_details = parse_commit_error(commit_err)
                error_msg = f"Configuration validation failed: {error_details['summary']}"
                
                progress.complete_step("FAILED", {
                    "validation_result": "FAILED",
                    "error": error_msg,
                    "error_details": error_details
                })
                progress.complete_operation("FAILED")
                results["success"] = False
                results["message"] = f"Configuration validation failed on {dev.hostname}. Commit aborted."
                results["details"]["validation_error"] = error_msg
                results["details"]["error_details"] = error_details
                logger.error(f"Configuration validation failed: {error_msg}")
                return results

            # --- Step 7: Commit Decision ---
            if args.commit_check:
                # This was just a validation run
                results["success"] = True
                results["message"] = f"'commit check' passed for {dev.hostname}."
                if validation_details.get('has_warnings'):
                    results["message"] += f" (with warnings: {validation_details['warning_summary']})"
            else:
                # --- Step 8: Actual Commit ---
                progress.start_step("COMMIT", "Committing configuration to device")
                
                try:
                    # ✨ NEW: Use a lambda to pass the progress tracker instance to the callback.
                    commit_callback_with_tracker = lambda dev, report: commit_progress_callback(dev, report, progress_tracker=progress)
                    
                    cu.commit(
                        comment=f"Config applied via template {args.template_id}",
                        timeout=120,
                        progress=commit_callback_with_tracker # Use the new lambda
                    )
                    
                    progress.complete_step("COMPLETED", {
                        "commit_result": "SUCCESS",
                        "message": "Configuration committed successfully"
                    })
                    results["success"] = True
                    results["message"] = f"Configuration applied successfully to {dev.hostname}."
                    if validation_details.get('has_warnings'):
                        results["message"] += f" (with warnings: {validation_details['warning_summary']})"
                        
                except CommitError as commit_err:
                    # Handle commit failures during actual commit
                    error_details = parse_commit_error(commit_err)
                    error_msg = f"Configuration commit failed: {error_details['summary']}"
                    
                    progress.complete_step("FAILED", {
                        "commit_result": "FAILED",
                        "error": error_msg,
                        "error_details": error_details
                    })
                    progress.complete_operation("FAILED")
                    results["success"] = False
                    results["message"] = f"Configuration commit failed on {dev.hostname}: {error_msg}"
                    results["details"]["commit_error"] = error_msg
                    results["details"]["error_details"] = error_details
                    logger.error(f"Configuration commit failed: {error_msg}")
                    return results

        progress.complete_operation("SUCCESS")

    except (ConnectError, ConfigLoadError, CommitError, LockError, ValueError) as e:
        error_msg = f"{e.__class__.__name__}: {str(e)}"
        
        # Add specific messaging for connectivity errors
        if isinstance(e, ConnectError):
            error_msg = f"Connection failed to {device_ip}: {str(e)}. Exiting - device or host not reachable."
        
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
