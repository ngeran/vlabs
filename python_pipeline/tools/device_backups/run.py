# python_pipeline/tools/device_backups/run.py Version 1

import argparse
import json
import sys
import os
import logging
import time
import socket
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List
from pathlib import Path

# Import PyEZ specifics for configuration backup
from jnpr.junos import Device
from jnpr.junos.utils.config import Config
from jnpr.junos.exception import ConnectError, RpcError, ProbeError

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
    """A class to manage and broadcast the progress of a multi-step backup operation."""
    
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
            
    def update_step(self, details: Optional[Dict] = None, status: Optional[str] = None, 
                   progress_percentage: Optional[int] = None, message: Optional[str] = None):
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
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(levelname)s - %(message)s', 
    filename='device_backup.log', 
    filemode='a'
)
logger = logging.getLogger(__name__)

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

def ensure_backup_directory(backup_base_path: str, hostname: str) -> tuple[Path, Path]:
    """
    Ensure backup directory structure exists and return paths.
    
    Args:
        backup_base_path: Base backup directory path
        hostname: Device hostname for subdirectory
        
    Returns:
        tuple: (base_backup_path, device_backup_path)
    """
    base_path = Path(backup_base_path)
    device_path = base_path / hostname
    
    # Create directories if they don't exist
    device_path.mkdir(parents=True, exist_ok=True)
    
    return base_path, device_path

def generate_backup_filename(hostname: str, backup_type: str, extension: str) -> str:
    """
    Generate a timestamped backup filename.
    
    Args:
        hostname: Device hostname
        backup_type: Type of backup (config, set, xml, etc.)
        extension: File extension
        
    Returns:
        str: Generated filename
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{hostname}_{backup_type}_{timestamp}.{extension}"

def backup_configuration(dev: Device, backup_path: Path, hostname: str, 
                        progress_tracker: ProgressTracker) -> Dict[str, Any]:
    """
    Backup device configuration in multiple formats.
    
    Args:
        dev: Connected PyEZ Device object
        backup_path: Path to save backups
        hostname: Device hostname
        progress_tracker: Progress tracking object
        
    Returns:
        Dict containing backup results and file paths
    """
    backup_results = {
        "success": True,
        "files_created": {},
        "errors": [],
        "total_size": 0
    }
    
    # Configuration formats to backup
    backup_formats = [
        {"format": "text", "extension": "txt", "description": "Text format configuration"},
        {"format": "set", "extension": "set", "description": "Set commands format"},
        {"format": "xml", "extension": "xml", "description": "XML format configuration"},
        {"format": "json", "extension": "json", "description": "JSON format configuration"}
    ]
    
    try:
        with Config(dev, mode='private') as cu:
            progress_tracker.update_step(message="Acquired configuration lock")
            
            for i, fmt in enumerate(backup_formats):
                try:
                    progress_tracker.update_step(
                        message=f"Backing up configuration in {fmt['format']} format",
                        progress_percentage=int((i / len(backup_formats)) * 100)
                    )
                    
                    # Get configuration in specified format
                    if fmt['format'] == 'text':
                        config_data = cu.get_config(format='text')
                    elif fmt['format'] == 'set':
                        config_data = cu.get_config(format='set')
                    elif fmt['format'] == 'xml':
                        config_data = cu.get_config(format='xml')
                    elif fmt['format'] == 'json':
                        config_data = cu.get_config(format='json')
                    
                    # Generate filename and save
                    filename = generate_backup_filename(hostname, fmt['format'], fmt['extension'])
                    file_path = backup_path / filename
                    
                    # Write configuration to file
                    if fmt['format'] == 'json':
                        # For JSON, we need to handle it specially
                        with open(file_path, 'w', encoding='utf-8') as f:
                            if isinstance(config_data, dict):
                                json.dump(config_data, f, indent=2, ensure_ascii=False)
                            else:
                                f.write(str(config_data))
                    else:
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(str(config_data))
                    
                    # Record file info
                    file_size = file_path.stat().st_size
                    backup_results["files_created"][fmt['format']] = {
                        "filename": filename,
                        "path": str(file_path),
                        "size": file_size,
                        "description": fmt['description']
                    }
                    backup_results["total_size"] += file_size
                    
                    logger.info(f"Saved {fmt['format']} configuration to {filename} ({file_size} bytes)")
                    
                except Exception as e:
                    error_msg = f"Failed to backup configuration in {fmt['format']} format: {str(e)}"
                    backup_results["errors"].append(error_msg)
                    logger.error(error_msg)
                    
            progress_tracker.update_step(
                message="Configuration backup completed",
                progress_percentage=100
            )
                    
    except Exception as e:
        backup_results["success"] = False
        error_msg = f"Configuration backup failed: {str(e)}"
        backup_results["errors"].append(error_msg)
        logger.error(error_msg)
        
    return backup_results

def backup_device_facts(dev: Device, backup_path: Path, hostname: str) -> Dict[str, Any]:
    """
    Backup device facts and hardware information.
    
    Args:
        dev: Connected PyEZ Device object
        backup_path: Path to save backups
        hostname: Device hostname
        
    Returns:
        Dict containing facts backup results
    """
    facts_results = {
        "success": True,
        "facts_file": None,
        "hardware_file": None,
        "errors": []
    }
    
    try:
        # Backup device facts
        facts_filename = generate_backup_filename(hostname, "facts", "json")
        facts_path = backup_path / facts_filename
        
        with open(facts_path, 'w', encoding='utf-8') as f:
            json.dump(dev.facts, f, indent=2, ensure_ascii=False, default=str)
        
        facts_results["facts_file"] = {
            "filename": facts_filename,
            "path": str(facts_path),
            "size": facts_path.stat().st_size
        }
        
        # Backup hardware inventory (if available)
        try:
            hardware_info = dev.rpc.get_chassis_inventory()
            hardware_filename = generate_backup_filename(hostname, "hardware", "xml")
            hardware_path = backup_path / hardware_filename
            
            with open(hardware_path, 'w', encoding='utf-8') as f:
                f.write(str(hardware_info))
            
            facts_results["hardware_file"] = {
                "filename": hardware_filename,
                "path": str(hardware_path),
                "size": hardware_path.stat().st_size
            }
            
        except Exception as e:
            facts_results["errors"].append(f"Failed to backup hardware inventory: {str(e)}")
            
    except Exception as e:
        facts_results["success"] = False
        error_msg = f"Facts backup failed: {str(e)}"
        facts_results["errors"].append(error_msg)
        logger.error(error_msg)
        
    return facts_results

def create_backup_metadata(backup_path: Path, hostname: str, backup_results: Dict, 
                          facts_results: Dict, device_facts: Dict) -> Dict[str, Any]:
    """
    Create metadata file for the backup session.
    
    Args:
        backup_path: Path to save metadata
        hostname: Device hostname
        backup_results: Configuration backup results
        facts_results: Facts backup results
        device_facts: Device facts dictionary
        
    Returns:
        Dict containing metadata results
    """
    metadata_results = {
        "success": True,
        "metadata_file": None,
        "errors": []
    }
    
    try:
        metadata = {
            "backup_info": {
                "hostname": hostname,
                "backup_timestamp": datetime.now().isoformat(),
                "backup_type": "full_device_backup",
                "total_files": len(backup_results.get("files_created", {})) + 
                              (1 if facts_results.get("facts_file") else 0) + 
                              (1 if facts_results.get("hardware_file") else 0),
                "total_size": backup_results.get("total_size", 0) + 
                             (facts_results.get("facts_file", {}).get("size", 0)) + 
                             (facts_results.get("hardware_file", {}).get("size", 0))
            },
            "device_info": {
                "hostname": device_facts.get("hostname"),
                "model": device_facts.get("model"),
                "version": device_facts.get("version"),
                "serial_number": device_facts.get("serialnumber"),
                "uptime": device_facts.get("RE0", {}).get("up_time") if device_facts.get("RE0") else None
            },
            "backup_files": {
                "configurations": backup_results.get("files_created", {}),
                "facts": facts_results.get("facts_file"),
                "hardware": facts_results.get("hardware_file")
            },
            "backup_errors": backup_results.get("errors", []) + facts_results.get("errors", [])
        }
        
        metadata_filename = generate_backup_filename(hostname, "metadata", "json")
        metadata_path = backup_path / metadata_filename
        
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False, default=str)
        
        metadata_results["metadata_file"] = {
            "filename": metadata_filename,
            "path": str(metadata_path),
            "size": metadata_path.stat().st_size
        }
        
    except Exception as e:
        metadata_results["success"] = False
        error_msg = f"Metadata creation failed: {str(e)}"
        metadata_results["errors"].append(error_msg)
        logger.error(error_msg)
        
    return metadata_results

def main():
    parser = argparse.ArgumentParser(description="Backup Juniper device configurations and facts.")
    parser.add_argument('--target_host', type=str, required=True, 
                       help="Target device hostname or IP address")
    parser.add_argument('--username', type=str, required=True,
                       help="SSH username for device connection")
    parser.add_argument('--password', type=str, required=True,
                       help="SSH password for device connection")
    parser.add_argument('--backup_path', type=str, 
                       default="./backups",
                       help="Base path for backup storage (default: ./backups)")
    parser.add_argument('--inventory_file', type=str,
                       help="YAML inventory file with device information")
    parser.add_argument('--skip_reachability_test', action='store_true',
                       help="Skip the initial reachability test")
    parser.add_argument('--config_only', action='store_true',
                       help="Backup only configuration files, skip facts and hardware info")
    parser.add_argument('--formats', type=str, nargs='+',
                       choices=['text', 'set', 'xml', 'json'],
                       default=['text', 'set', 'xml', 'json'],
                       help="Configuration formats to backup")
    
    args = parser.parse_args()

    # Initialize progress tracker
    progress = ProgressTracker()
    
    results = {
        "success": False, 
        "message": "", 
        "details": {}, 
        "progress": {},
        "backup_files": {}
    }
    connections = []

    progress.start_operation(f"Device backup for '{args.target_host}'")
    logger.info(f"Starting device backup for '{args.target_host}'")

    try:
        # --- Step 1: IP Resolution ---
        progress.start_step("IP_RESOLUTION", "Determining target device IP address")
        device_ip = None
        if args.inventory_file and os.path.exists(args.inventory_file):
            try:
                inventory_data = load_yaml_file(args.inventory_file)
                # Look for the target host in inventory
                if args.target_host in inventory_data:
                    device_ip = inventory_data[args.target_host].get('ip', args.target_host)
                else:
                    device_ip = args.target_host
            except Exception as e:
                logger.warning(f"Failed to load inventory file: {str(e)}")
                device_ip = args.target_host
        else:
            device_ip = args.target_host
        
        progress.complete_step("COMPLETED", {"resolved_ip": device_ip})
        
        # --- Step 2: Reachability Test ---
        if not args.skip_reachability_test:
            progress.start_step("REACHABILITY_TEST", f"Testing connectivity to {device_ip}")
            
            # First, test basic TCP connectivity
            progress.update_step(message="Testing basic TCP connectivity (port 22)")
            if not test_basic_reachability(device_ip, port=22, timeout=10):
                error_msg = f"Device {device_ip} is not reachable on port 22 (SSH)"
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
                error_msg = f"Junos device connectivity test failed: {reachability_msg}"
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
            device_facts = {
                "hostname": dev.hostname or device_ip,
                "model": dev.facts.get('model'),
                "version": dev.facts.get('version'),
                "serial_number": dev.facts.get('serialnumber')
            }
            progress.complete_step("COMPLETED", device_facts)
            
            # Use device hostname for backup directory if available
            backup_hostname = dev.hostname or device_ip.replace('.', '_')
            
        except ConnectError as e:
            error_msg = f"Failed to connect to device {device_ip}: {str(e)}"
            progress.complete_step("FAILED", {"error": error_msg})
            progress.complete_operation("FAILED")
            results["success"] = False
            results["message"] = error_msg
            logger.error(error_msg)
            return results

        # --- Step 4: Backup Directory Setup ---
        progress.start_step("BACKUP_DIRECTORY", "Setting up backup directory structure")
        try:
            base_backup_path, device_backup_path = ensure_backup_directory(args.backup_path, backup_hostname)
            progress.complete_step("COMPLETED", {
                "base_path": str(base_backup_path),
                "device_path": str(device_backup_path),
                "hostname": backup_hostname
            })
        except Exception as e:
            error_msg = f"Failed to create backup directory: {str(e)}"
            progress.complete_step("FAILED", {"error": error_msg})
            progress.complete_operation("FAILED")
            results["success"] = False
            results["message"] = error_msg
            logger.error(error_msg)
            return results

        # --- Step 5: Configuration Backup ---
        progress.start_step("CONFIG_BACKUP", "Backing up device configuration")
        dev.timeout = 180  # Extended timeout for backup operations
        
        backup_results = backup_configuration(dev, device_backup_path, backup_hostname, progress)
        
        if backup_results["success"]:
            progress.complete_step("COMPLETED", {
                "files_created": len(backup_results["files_created"]),
                "total_size": backup_results["total_size"],
                "formats": list(backup_results["files_created"].keys())
            })
            results["backup_files"]["configurations"] = backup_results["files_created"]
        else:
            progress.complete_step("FAILED", {
                "errors": backup_results["errors"],
                "files_created": len(backup_results["files_created"])
            })
            results["details"]["backup_errors"] = backup_results["errors"]

        # --- Step 6: Facts and Hardware Backup ---
        if not args.config_only:
            progress.start_step("FACTS_BACKUP", "Backing up device facts and hardware information")
            
            facts_results = backup_device_facts(dev, device_backup_path, backup_hostname)
            
            if facts_results["success"]:
                progress.complete_step("COMPLETED", {
                    "facts_file": facts_results.get("facts_file") is not None,
                    "hardware_file": facts_results.get("hardware_file") is not None
                })
                results["backup_files"]["facts"] = facts_results.get("facts_file")
                results["backup_files"]["hardware"] = facts_results.get("hardware_file")
            else:
                progress.complete_step("FAILED", {"errors": facts_results["errors"]})
                if "backup_errors" not in results["details"]:
                    results["details"]["backup_errors"] = []
                results["details"]["backup_errors"].extend(facts_results["errors"])

        # --- Step 7: Metadata Creation ---
        progress.start_step("METADATA_CREATION", "Creating backup metadata")
        
        metadata_results = create_backup_metadata(
            device_backup_path, backup_hostname, backup_results, 
            facts_results if not args.config_only else {}, dev.facts
        )
        
        if metadata_results["success"]:
            progress.complete_step("COMPLETED", {
                "metadata_file": metadata_results["metadata_file"]["filename"]
            })
            results["backup_files"]["metadata"] = metadata_results["metadata_file"]
        else:
            progress.complete_step("FAILED", {"errors": metadata_results["errors"]})
            if "backup_errors" not in results["details"]:
                results["details"]["backup_errors"] = []
            results["details"]["backup_errors"].extend(metadata_results["errors"])

        # --- Final Results ---
        total_errors = len(backup_results.get("errors", []))
        if not args.config_only:
            total_errors += len(facts_results.get("errors", []))
        total_errors += len(metadata_results.get("errors", []))
        
        if total_errors == 0:
            results["success"] = True
            results["message"] = f"Device backup completed successfully for {backup_hostname}"
            progress.complete_operation("SUCCESS")
        else:
            results["success"] = False
            results["message"] = f"Device backup completed with {total_errors} errors for {backup_hostname}"
            progress.complete_operation("PARTIAL_SUCCESS")
            
        results["details"]["backup_path"] = str(device_backup_path)
        results["details"]["device_hostname"] = backup_hostname
        
    except Exception as e:
        error_msg = f"An unexpected error occurred during backup: {str(e)}"
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
        
        # Print final JSON result to stdout
        print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
