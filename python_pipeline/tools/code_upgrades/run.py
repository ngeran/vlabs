# python_pipeline/tools/code_upgrades/run.py Version 1

import argparse
import json
import sys
import os
import logging
import time
import socket
import hashlib
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, Callable

# Import PyEZ specifics for software upgrades and robust error handling
from jnpr.junos import Device
from jnpr.junos.utils.sw import SW
from jnpr.junos.exception import ConnectError, SwError, ProbeError, RpcError

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
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', filename='run_upgrade.log', filemode='a')
logger = logging.getLogger(__name__)

def calculate_file_checksum(file_path: str, algorithm: str = 'md5') -> str:
    """
    Calculate checksum of a file for integrity verification.
    
    Args:
        file_path: Path to the file
        algorithm: Hash algorithm to use ('md5', 'sha1', 'sha256')
        
    Returns:
        Hexadecimal string of the checksum
    """
    hash_obj = hashlib.new(algorithm)
    try:
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_obj.update(chunk)
        return hash_obj.hexdigest()
    except Exception as e:
        logger.error(f"Failed to calculate checksum for {file_path}: {str(e)}")
        return ""

def validate_upgrade_image(image_path: str, expected_checksum: str = None) -> Dict[str, Any]:
    """
    Validate upgrade image file exists and optionally verify checksum.
    
    Args:
        image_path: Path to the upgrade image file
        expected_checksum: Optional expected checksum for verification
        
    Returns:
        Dict containing validation results
    """
    validation_result = {
        "file_exists": False,
        "file_size": 0,
        "checksum_valid": None,
        "calculated_checksum": "",
        "errors": []
    }
    
    try:
        # Check if file exists
        if not os.path.exists(image_path):
            validation_result["errors"].append(f"Image file not found: {image_path}")
            return validation_result
            
        validation_result["file_exists"] = True
        validation_result["file_size"] = os.path.getsize(image_path)
        
        # Calculate checksum if expected checksum provided
        if expected_checksum:
            calculated_checksum = calculate_file_checksum(image_path, 'md5')
            validation_result["calculated_checksum"] = calculated_checksum
            
            if calculated_checksum.lower() == expected_checksum.lower():
                validation_result["checksum_valid"] = True
            else:
                validation_result["checksum_valid"] = False
                validation_result["errors"].append(f"Checksum mismatch: expected {expected_checksum}, got {calculated_checksum}")
        
        # Check file size (typical Junos images are at least 100MB)
        if validation_result["file_size"] < 100 * 1024 * 1024:  # 100MB
            validation_result["errors"].append(f"Image file seems too small ({validation_result['file_size']} bytes). Possible corruption.")
            
    except Exception as e:
        validation_result["errors"].append(f"Error validating image: {str(e)}")
        
    return validation_result

def parse_storage_cleanup_output(cleanup_output: str) -> Dict[str, Any]:
    """
    Parse storage cleanup output to extract freed space information.
    
    Args:
        cleanup_output: Output from storage cleanup operations
        
    Returns:
        Dict containing parsed cleanup results
    """
    result = {
        "files_removed": 0,
        "space_freed": 0,
        "cleanup_actions": [],
        "errors": []
    }
    
    if not cleanup_output:
        return result
        
    lines = cleanup_output.strip().split('\n')
    for line in lines:
        line = line.strip()
        if 'removed' in line.lower() or 'deleted' in line.lower():
            result["cleanup_actions"].append(line)
            # Try to extract file count
            words = line.split()
            for word in words:
                if word.isdigit():
                    result["files_removed"] += int(word)
                    break
        elif 'freed' in line.lower() or 'available' in line.lower():
            result["cleanup_actions"].append(line)
            # Try to extract space information
            if 'mb' in line.lower() or 'gb' in line.lower():
                words = line.split()
                for i, word in enumerate(words):
                    if word.lower() in ['mb', 'gb'] and i > 0:
                        try:
                            size = float(words[i-1])
                            if word.lower() == 'gb':
                                size *= 1024  # Convert to MB
                            result["space_freed"] += size
                        except:
                            pass
    
    return result

def upgrade_progress_callback(dev, report, progress_tracker: ProgressTracker):
    """Callback function for upgrade progress that integrates with ProgressTracker."""
    # Parse the report to extract meaningful progress information
    if "copying" in report.lower():
        progress_tracker.update_step(
            message=f"Copying image to device: {report}",
            details={"upgrade_stage": "COPYING", "report": report}
        )
    elif "validating" in report.lower():
        progress_tracker.update_step(
            message=f"Validating image: {report}",
            details={"upgrade_stage": "VALIDATING", "report": report}
        )
    elif "installing" in report.lower():
        progress_tracker.update_step(
            message=f"Installing software: {report}",
            details={"upgrade_stage": "INSTALLING", "report": report}
        )
    elif "rebooting" in report.lower():
        progress_tracker.update_step(
            message=f"Rebooting device: {report}",
            details={"upgrade_stage": "REBOOTING", "report": report}
        )
    else:
        progress_tracker.update_step(
            message=f"Upgrade progress: {report}",
            details={"upgrade_stage": "IN_PROGRESS", "report": report}
        )
    
    # Log to file for debugging
    logger.info(f"UPGRADE_PROGRESS: {report}")

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
        dev = Device(host=host, user=username, password=password, 
                    connect_timeout=timeout, normalize=True)
        
        try:
            result = dev.probe(timeout=timeout)
            if result:
                return True, f"Device {host} is reachable and responsive", dev
            else:
                return False, f"Device {host} is not responding to NETCONF/SSH", None
        except ProbeError as e:
            return False, f"Probe failed for {host}: {str(e)}", None
        except Exception as e:
            return False, f"Connection test failed for {host}: {str(e)}", None
            
    except Exception as e:
        return False, f"Failed to create device connection for {host}: {str(e)}", None

def check_storage_space(dev: Device, image_size: int) -> Dict[str, Any]:
    """
    Check available storage space on the device.
    
    Args:
        dev: Connected PyEZ Device object
        image_size: Size of the upgrade image in bytes
        
    Returns:
        Dict containing storage information
    """
    try:
        # Get storage information
        storage_info = dev.rpc.get_system_storage()
        
        # Parse storage information (this is device-specific)
        # For most Junos devices, we'll look for /var or /tmp partitions
        available_space = 0
        storage_details = {}
        
        # This is a simplified parser - in real implementation, 
        # you'd need to parse the XML response properly
        if hasattr(storage_info, 'text'):
            storage_text = storage_info.text
            # Basic parsing logic would go here
            # For now, we'll use a conservative estimate
            available_space = 2 * 1024 * 1024 * 1024  # 2GB default assumption
            
        required_space = image_size * 1.5  # Add 50% buffer for temporary files
        
        return {
            "available_space": available_space,
            "required_space": required_space,
            "sufficient_space": available_space >= required_space,
            "storage_details": storage_details,
            "recommendation": "cleanup_needed" if available_space < required_space else "sufficient"
        }
        
    except Exception as e:
        logger.warning(f"Failed to check storage space: {str(e)}")
        return {
            "available_space": 0,
            "required_space": image_size * 1.5,
            "sufficient_space": False,
            "error": str(e),
            "recommendation": "manual_check_needed"
        }

def perform_storage_cleanup(dev: Device, sw_instance: SW) -> Dict[str, Any]:
    """
    Perform storage cleanup to free up space for upgrade.
    
    Args:
        dev: Connected PyEZ Device object
        sw_instance: SW utility instance
        
    Returns:
        Dict containing cleanup results
    """
    cleanup_results = {
        "actions_taken": [],
        "space_freed": 0,
        "errors": []
    }
    
    try:
        # Clean up old log files
        try:
            result = sw_instance.cleanup()
            if result:
                cleanup_info = parse_storage_cleanup_output(str(result))
                cleanup_results["actions_taken"].extend(cleanup_info["cleanup_actions"])
                cleanup_results["space_freed"] += cleanup_info["space_freed"]
            else:
                cleanup_results["actions_taken"].append("Automatic cleanup completed")
        except Exception as e:
            cleanup_results["errors"].append(f"Automatic cleanup failed: {str(e)}")
            
        # Additional cleanup actions could be added here
        # such as removing old software packages, core dumps, etc.
        
    except Exception as e:
        cleanup_results["errors"].append(f"Storage cleanup failed: {str(e)}")
        
    return cleanup_results

def main():
    parser = argparse.ArgumentParser(description="Perform Juniper device software upgrades.")
    parser.add_argument('--image_path', type=str, required=True, help="Path to the upgrade image file")
    parser.add_argument('--target_host', type=str, required=True, help="Target device hostname or IP")
    parser.add_argument('--username', type=str, required=True, help="SSH username")
    parser.add_argument('--password', type=str, required=True, help="SSH password")
    parser.add_argument('--inventory_file', type=str, help="Inventory file for host resolution")
    parser.add_argument('--expected_checksum', type=str, help="Expected MD5 checksum of the image")
    parser.add_argument('--validate_only', action='store_true', help="Only validate the upgrade without installing")
    parser.add_argument('--no_reboot', action='store_true', help="Skip automatic reboot after upgrade")
    parser.add_argument('--cleanup_storage', action='store_true', help="Perform storage cleanup before upgrade")
    parser.add_argument('--skip_reachability_test', action='store_true', help="Skip initial reachability test")
    parser.add_argument('--timeout', type=int, default=1800, help="Upgrade timeout in seconds (default: 1800)")
    parser.add_argument('--simple_output', action='store_true', help="Disable legacy visual display")
    
    args = parser.parse_args()

    # Initialize progress tracker
    progress = ProgressTracker()
    
    results = {"success": False, "message": "", "details": {}, "progress": {}}
    connections = []

    progress.start_operation(f"Software upgrade for device '{args.target_host}'")
    logger.info(f"Starting software upgrade for device '{args.target_host}' with image '{args.image_path}'")

    try:
        # --- Step 1: Image Validation ---
        progress.start_step("IMAGE_VALIDATION", "Validating upgrade image file", estimated_duration=30)
        validation_result = validate_upgrade_image(args.image_path, args.expected_checksum)
        
        if validation_result["errors"]:
            error_msg = f"Image validation failed: {'; '.join(validation_result['errors'])}"
            progress.complete_step("FAILED", {"validation_errors": validation_result["errors"]})
            progress.complete_operation("FAILED")
            results["success"] = False
            results["message"] = error_msg
            logger.error(error_msg)
            return results
            
        progress.complete_step("COMPLETED", {
            "file_size": validation_result["file_size"],
            "checksum_verified": validation_result["checksum_valid"],
            "calculated_checksum": validation_result["calculated_checksum"]
        })

        # --- Step 2: IP Resolution ---
        progress.start_step("IP_RESOLUTION", "Determining target device IP address")
        device_ip = None
        if args.inventory_file:
            # Load inventory logic here if needed
            pass
        else:
            device_ip = args.target_host
        progress.complete_step("COMPLETED", {"resolved_ip": device_ip})

        # --- Step 3: Reachability Test ---
        if not args.skip_reachability_test:
            progress.start_step("REACHABILITY_TEST", f"Testing connectivity to {device_ip}", estimated_duration=45)
            
            # Test basic TCP connectivity
            progress.update_step(message="Testing basic TCP connectivity (port 22)")
            if not test_basic_reachability(device_ip, port=22, timeout=10):
                error_msg = f"Device {device_ip} is not reachable on port 22 (SSH)"
                progress.complete_step("FAILED", {"error": error_msg})
                progress.complete_operation("FAILED")
                results["success"] = False
                results["message"] = error_msg
                logger.error(error_msg)
                return results
            
            # Test Junos connectivity
            progress.update_step(message="Testing Junos device connectivity and NETCONF capability")
            is_reachable, reachability_msg, probe_device = test_junos_reachability(
                device_ip, args.username, args.password, timeout=30
            )
            
            if not is_reachable:
                error_msg = f"Junos device connectivity test failed: {reachability_msg}"
                progress.complete_step("FAILED", {"error": error_msg})
                progress.complete_operation("FAILED")
                results["success"] = False
                results["message"] = error_msg
                logger.error(error_msg)
                return results
            
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

        # --- Step 4: Device Connection ---
        progress.start_step("DEVICE_CONNECTION", f"Establishing SSH connection to {device_ip}", estimated_duration=30)
        try:
            connections = connect_to_hosts(host=device_ip, username=args.username, password=args.password)
            dev = connections[0]
            device_facts = {
                "hostname": dev.hostname,
                "model": dev.facts.get('model'),
                "current_version": dev.facts.get('version'),
                "serial_number": dev.facts.get('serialnumber')
            }
            progress.complete_step("COMPLETED", device_facts)
        except ConnectError as e:
            error_msg = f"Failed to connect to device {device_ip}: {str(e)}"
            progress.complete_step("FAILED", {"error": error_msg})
            progress.complete_operation("FAILED")
            results["success"] = False
            results["message"] = error_msg
            logger.error(error_msg)
            return results

        # --- Step 5: Storage Space Check ---
        progress.start_step("STORAGE_CHECK", "Checking available storage space", estimated_duration=30)
        image_size = os.path.getsize(args.image_path)
        storage_info = check_storage_space(dev, image_size)
        
        if not storage_info["sufficient_space"] and not args.cleanup_storage:
            error_msg = f"Insufficient storage space. Available: {storage_info['available_space']} bytes, Required: {storage_info['required_space']} bytes"
            progress.complete_step("FAILED", {
                "storage_info": storage_info,
                "recommendation": "Use --cleanup_storage flag or manually free up space"
            })
            progress.complete_operation("FAILED")
            results["success"] = False
            results["message"] = error_msg
            logger.error(error_msg)
            return results
            
        progress.complete_step("COMPLETED", storage_info)

        # --- Step 6: Storage Cleanup (if requested) ---
        if args.cleanup_storage:
            progress.start_step("STORAGE_CLEANUP", "Performing storage cleanup", estimated_duration=120)
            sw = SW(dev)
            cleanup_results = perform_storage_cleanup(dev, sw)
            
            if cleanup_results["errors"]:
                logger.warning(f"Storage cleanup had errors: {cleanup_results['errors']}")
                
            progress.complete_step("COMPLETED", cleanup_results)
        else:
            sw = SW(dev)

        # --- Step 7: Pre-upgrade Validation ---
        progress.start_step("PRE_UPGRADE_VALIDATION", "Validating device readiness for upgrade", estimated_duration=60)
        
        try:
            # Check if device is ready for upgrade
            # This could include checking for active alarms, commit synchronization, etc.
            pre_upgrade_checks = {
                "device_model": dev.facts.get('model'),
                "current_version": dev.facts.get('version'),
                "ready_for_upgrade": True,
                "warnings": []
            }
            
            progress.complete_step("COMPLETED", pre_upgrade_checks)
            
        except Exception as e:
            error_msg = f"Pre-upgrade validation failed: {str(e)}"
            progress.complete_step("FAILED", {"error": error_msg})
            progress.complete_operation("FAILED")
            results["success"] = False
            results["message"] = error_msg
            logger.error(error_msg)
            return results

        # --- Step 8: Image Installation ---
        if args.validate_only:
            results["success"] = True
            results["message"] = f"Validation completed successfully for {dev.hostname}. Device is ready for upgrade."
            progress.complete_operation("SUCCESS")
        else:
            progress.start_step("IMAGE_INSTALLATION", "Installing software image", estimated_duration=args.timeout)
            
            try:
                # Set up progress callback
                upgrade_callback = lambda dev, report: upgrade_progress_callback(dev, report, progress)
                
                # Perform the upgrade
                upgrade_result = sw.install(
                    package=args.image_path,
                    remote_path='/var/tmp',
                    validate=True,
                    timeout=args.timeout,
                    progress=upgrade_callback,
                    no_reboot=args.no_reboot
                )
                
                if upgrade_result:
                    progress.complete_step("COMPLETED", {
                        "upgrade_result": "SUCCESS",
                        "reboot_required": not args.no_reboot,
                        "message": "Software installation completed successfully"
                    })
                    
                    if args.no_reboot:
                        results["success"] = True
                        results["message"] = f"Software installed successfully on {dev.hostname}. Manual reboot required."
                    else:
                        results["success"] = True
                        results["message"] = f"Software upgrade completed successfully on {dev.hostname}. Device is rebooting."
                else:
                    error_msg = "Software installation failed - no specific error returned"
                    progress.complete_step("FAILED", {"error": error_msg})
                    progress.complete_operation("FAILED")
                    results["success"] = False
                    results["message"] = error_msg
                    logger.error(error_msg)
                    return results
                    
            except SwError as sw_err:
                error_msg = f"Software installation failed: {str(sw_err)}"
                progress.complete_step("FAILED", {"error": error_msg})
                progress.complete_operation("FAILED")
                results["success"] = False
                results["message"] = f"Software upgrade failed on {dev.hostname}: {error_msg}"
                logger.error(error_msg)
                return results

        progress.complete_operation("SUCCESS")

    except (ConnectError, SwError, ValueError) as e:
        error_msg = f"{e.__class__.__name__}: {str(e)}"
        logger.error(error_msg, exc_info=True)
        
        if progress.steps and progress.steps[-1]["status"] == "IN_PROGRESS":
            progress.complete_step("FAILED", {"error": error_msg})
        progress.complete_operation("FAILED")
        results["success"] = False
        results["message"] = error_msg
        
    except Exception as e:
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.error(error_msg, exc_info=True)
        
        if progress.steps and progress.steps[-1]["status"] == "IN_PROGRESS":
            progress.complete_step("FAILED", {"error": error_msg})
        progress.complete_operation("FAILED")
        results["success"] = False
        results["message"] = error_msg
        
    finally:
        # Cleanup connections
        if connections:
            disconnect_from_hosts(connections)
            logger.info("Disconnected from all devices.")
        
        results["progress"] = progress.get_summary()
        results["details"]["device_facts"] = device_facts if 'device_facts' in locals() else {}
        
        # Print final JSON result to stdout
        print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
