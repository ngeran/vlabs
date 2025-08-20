# =============================================================================
# FILENAME:           validation_run.py
#
# ROLE:               An asynchronous JSNAPy-based Network Validation Engine with Snapshot Comparison.
#
# DESCRIPTION:
#   This script is the backend for the Network Validation tool. It connects
#   to network devices, executes a series of pre-defined JSNAPy tests, and
#   returns structured results. It supports snapshot and comparison modes
#   for pre/post change validation.
#
# DEPENDENCIES:
#   - jnpr.junos (PyEZ): Device connectivity.
#   - jnpr.jsnapy: Snapshot testing.
#   - PyYAML: Parsing tests.yml.
#   - asyncio: Concurrent execution.
#
# USAGE:
#   Discovery: python run.py --list_tests
#   Snapshot: python run.py --hostname <ip> --username <user> --password <pass> --tests <test> --mode snapshot --snapshot-name <name>
#   Compare: python run.py --hostname <ip> --username <user> --password <pass> --tests <test> --mode compare --snapshot-name <post> --compare-with <pre>
#   Current: python run.py --hostname <ip> --username <user> --password <pass> --tests <test1,test2>
# =============================================================================

# =============================================================================
# SECTION 1: IMPORTS & INITIALIZATION
# =============================================================================
import argparse
import asyncio
import json
import os
import sys
import re
import traceback
from pathlib import Path
from jnpr.junos import Device
from jnpr.junos.exception import ConnectError, ConnectTimeoutError, ConnectAuthError
import yaml
from tabulate import tabulate


# =============================================================================
# SECTION 2: PROGRESS REPORTING UTILITIES
# =============================================================================
def send_progress(event_type, data, message=""):
    """Emits structured JSON progress updates to stdout for UI consumption."""
    progress = {
        "type": "progress",
        "event_type": event_type,
        "data": data,
        "message": message,
    }
    print(json.dumps(progress), flush=True)


# =============================================================================
# SECTION 3: SAFE TEXT FORMATTING UTILITIES
# =============================================================================
def sanitize_text(text):
    """
    Safely sanitize text content to prevent HTML/XML interpretation issues.
    Converts angle brackets and other problematic characters to safe alternatives.
    """
    if not isinstance(text, str):
        text = str(text)

    # Replace angle brackets with safe alternatives
    text = text.replace('<', '[').replace('>', ']')

    # Replace other potentially problematic characters
    text = text.replace('&', ' and ')
    text = text.replace('"', "'")

    # Clean up excessive whitespace
    text = re.sub(r'\s+', ' ', text).strip()

    return text


def format_bgp_details(details):
    """
    Specially format BGP-related details into a more structured format.
    """
    if not details or not isinstance(details, str):
        return details

    # Extract BGP peer information using regex
    bgp_pattern = r'BGP peer\s+<?([\d\.]+)>?\s+AS<?(\d+)>?\s+is\s+(\w+)'
    match = re.search(bgp_pattern, details, re.IGNORECASE)

    if match:
        peer_ip = match.group(1)
        as_number = match.group(2)
        status = match.group(3)
        return f"BGP Peer: {peer_ip} | AS: {as_number} | Status: {status.upper()}"

    # If no BGP pattern found, just sanitize the text
    return sanitize_text(details)


def create_result_table(test_name, test_title, raw_results):
    """
    Convert JSNAPy results into a structured table format that's safe for React.
    Returns a consistent table structure regardless of the test type.
    """
    table_data = {
        "test_name": sanitize_text(test_name),
        "title": sanitize_text(test_title),
        "columns": ["Check", "Status", "Details", "Timestamp"],
        "rows": []
    }

    if not raw_results or not isinstance(raw_results, list):
        table_data["rows"].append({
            "Check": f"{test_name} - No Data",
            "Status": "UNKNOWN",
            "Details": "No test results available",
            "Timestamp": ""
        })
        return table_data

    # Process each result entry
    for result in raw_results:
        check_name = sanitize_text(result.get("Check", "Unknown Check"))
        status = str(result.get("Result", "UNKNOWN")).upper()
        details = result.get("Details", "")

        # Apply special formatting for BGP tests
        if "bgp" in test_name.lower() and details:
            details = format_bgp_details(details)
        else:
            details = sanitize_text(details)

        # Create standardized row
        row = {
            "Check": check_name,
            "Status": status,
            "Details": details,
            "Timestamp": ""  # Could add actual timestamp if needed
        }

        table_data["rows"].append(row)

    return table_data


# =============================================================================
# SECTION 4: JSNAPY SNAPSHOT OPERATIONS
# =============================================================================

def take_jsnapy_snapshot(device, test_name, test_def, snapshot_name):
    """
    Takes a JSNAPy snapshot for later comparison.
    """
    jsnapy_file_name = test_def.get("jsnapy_test_file")
    if not jsnapy_file_name:
        error_result = [{
            "Check": f"{test_name} - Configuration Error",
            "Result": "ERROR",
            "Details": f"Missing 'jsnapy_test_file' in tests.yml for test '{test_name}'"
        }]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), error_result)}

    test_file = Path(__file__).parent / "tests" / jsnapy_file_name

    if not test_file.exists():
        error_result = [{
            "Check": f"{test_name} - File Error",
            "Result": "ERROR",
            "Details": f"JSNAPy test file not found: {test_file}"
        }]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), error_result)}

    # Store original working directory and environment
    original_cwd = os.getcwd()
    original_jsnapy_home = os.environ.get("JSNAPY_HOME")

    try:
        # Create the JSNAPy home directory
        jsnapy_home = Path('/tmp/jsnapy')
        jsnapy_home.mkdir(parents=True, exist_ok=True, mode=0o777)

        # Set JSNAPY_HOME environment variable
        os.environ["JSNAPY_HOME"] = str(jsnapy_home)

        # Switch to JSNAPy home directory
        os.chdir(str(jsnapy_home))

        # Ensure snapshots and tests directories exist
        snapshots_dir = jsnapy_home / 'snapshots'
        snapshots_dir.mkdir(parents=True, exist_ok=True, mode=0o777)
        tests_dir = jsnapy_home / 'tests'
        tests_dir.mkdir(parents=True, exist_ok=True, mode=0o777)

        # Copy test file to JSNAPy tests directory
        import shutil
        source_test_file = Path(__file__).parent / "tests" / jsnapy_file_name
        target_test_file = tests_dir / jsnapy_file_name
        shutil.copy2(source_test_file, target_test_file)

        # Create jsnapy.cfg
        jsnapy_cfg = jsnapy_home / 'jsnapy.cfg'
        if not jsnapy_cfg.exists():
            with open(jsnapy_cfg, 'w') as cfg_file:
                cfg_file.write("""[DEFAULT]
snapshot_path = /tmp/jsnapy/snapshots
test_path = /tmp/jsnapy/tests
""")

        # Create logging.yml
        logging_yml = jsnapy_home / 'logging.yml'
        if not logging_yml.exists():
            with open(logging_yml, 'w') as log_file:
                log_file.write("""version: 1
disable_existing_loggers: False
formatters:
    simple:
        format: '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
handlers:
    console:
        class: logging.StreamHandler
        level: DEBUG
        formatter: simple
        stream: ext://sys.stdout
    file:
        class: logging.FileHandler
        level: DEBUG
        formatter: simple
        filename: /tmp/jsnapy/jsnapy.log
root:
    level: DEBUG
    handlers: [console, file]
loggers:
    jsnapy:
        level: DEBUG
        handlers: [console, file]
        propagate: no
""")

        # Ensure log file is writable
        log_file_path = jsnapy_home / 'jsnapy.log'
        log_file_path.touch(exist_ok=True, mode=0o666)

        # Import JSNAPy after setting environment
        from jnpr.jsnapy import SnapAdmin

        # Initialize SnapAdmin
        jsnapy = SnapAdmin()

        # Get device hostname from facts
        device_hostname = device.hostname
        try:
            device.open()
            facts = device.facts
            device_hostname = facts.get('hostname', 'device_under_test')
            print(f"DEBUG: Device hostname retrieved from facts: {device_hostname}", file=sys.stderr)
        except Exception as e:
            device_hostname = "device_under_test"
            print(f"DEBUG: Failed to retrieve hostname from device, using fallback: {device_hostname}, error: {e}", file=sys.stderr)

        # Configure test
        test_config = {
            "hosts": [{
                "device": device_hostname,
                "username": device.user,
                "passwd": device.password,
                "hostname": device_hostname
            }],
            "tests": [f"tests/{jsnapy_file_name}"]
        }

        # Save test config for debugging
        config_file = jsnapy_home / f'snapshot_config_{test_name}_{snapshot_name}.yml'
        with open(config_file, 'w') as f:
            yaml.safe_dump(test_config, f)

        print(f"DEBUG: Snapshot config saved to {config_file}", file=sys.stderr)

        # Take snapshot
        try:
            snap_result = jsnapy.snap(test_config, snapshot_name, dev=device)
            print(f"DEBUG: Snapshot '{snapshot_name}' result: {snap_result}", file=sys.stderr)

            # List snapshot files created
            snapshot_files = list(snapshots_dir.glob(f"*{snapshot_name}*"))
            print(f"DEBUG: Snapshot files created: {[f.name for f in snapshot_files]}", file=sys.stderr)

            if snap_result and any(getattr(result, 'result', None) == 'Passed' for result in snap_result):
                success_result = [{
                    "Check": f"{test_name} - Snapshot Taken",
                    "Result": "SUCCESS",
                    "Details": f"Snapshot '{snapshot_name}' created successfully. Files: {len(snapshot_files)} created"
                }]
                return {
                    "table": create_result_table(test_name, test_def.get("title", test_name), success_result),
                    "raw": [{"snapshot_name": snapshot_name, "files_created": len(snapshot_files), "device": device_hostname}]
                }
            else:
                error_result = [{
                    "Check": f"{test_name} - Snapshot Error",
                    "Result": "ERROR",
                    "Details": f"Failed to create snapshot '{snapshot_name}'"
                }]
                return {"table": create_result_table(test_name, test_def.get("title", test_name), error_result)}

        except Exception as snap_error:
            error_result = [{
                "Check": f"{test_name} - Snapshot Exception",
                "Result": "ERROR",
                "Details": f"Snapshot operation failed: {snap_error}"
            }]
            return {
                "table": create_result_table(test_name, test_def.get("title", test_name), error_result),
                "raw": [{"error": str(snap_error), "traceback": traceback.format_exc()}]
            }

    except Exception as e:
        error_result = [{
            "Check": f"{test_name} - Exception",
            "Result": "ERROR",
            "Details": f"Snapshot setup failed: {str(e)}"
        }]
        return {
            "table": create_result_table(test_name, test_def.get("title", test_name), error_result),
            "raw": [{"error": str(e), "traceback": traceback.format_exc()}]
        }

    finally:
        try:
            device.close()
        except Exception as e:
            print(f"DEBUG: Failed to close device connection: {e}", file=sys.stderr)
        os.chdir(original_cwd)
        if original_jsnapy_home is not None:
            os.environ["JSNAPY_HOME"] = original_jsnapy_home
        elif "JSNAPY_HOME" in os.environ:
            del os.environ["JSNAPY_HOME"]


def compare_jsnapy_snapshots(device, test_name, test_def, pre_snapshot, post_snapshot):
    """
    Compares two JSNAPy snapshots and returns the differences.
    """
    jsnapy_file_name = test_def.get("jsnapy_test_file")
    if not jsnapy_file_name:
        error_result = [{
            "Check": f"{test_name} - Configuration Error",
            "Result": "ERROR",
            "Details": f"Missing 'jsnapy_test_file' in tests.yml for test '{test_name}'"
        }]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), error_result)}

    test_file = Path(__file__).parent / "tests" / jsnapy_file_name

    if not test_file.exists():
        error_result = [{
            "Check": f"{test_name} - File Error",
            "Result": "ERROR",
            "Details": f"JSNAPy test file not found: {test_file}"
        }]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), error_result)}

    # Store original working directory and environment
    original_cwd = os.getcwd()
    original_jsnapy_home = os.environ.get("JSNAPY_HOME")

    try:
        # Setup JSNAPy environment (same as snapshot function)
        jsnapy_home = Path('/tmp/jsnapy')
        jsnapy_home.mkdir(parents=True, exist_ok=True, mode=0o777)
        os.environ["JSNAPY_HOME"] = str(jsnapy_home)
        os.chdir(str(jsnapy_home))

        snapshots_dir = jsnapy_home / 'snapshots'
        tests_dir = jsnapy_home / 'tests'

        # Ensure directories exist
        snapshots_dir.mkdir(parents=True, exist_ok=True, mode=0o777)
        tests_dir.mkdir(parents=True, exist_ok=True, mode=0o777)

        # Copy test file
        import shutil
        source_test_file = Path(__file__).parent / "tests" / jsnapy_file_name
        target_test_file = tests_dir / jsnapy_file_name
        shutil.copy2(source_test_file, target_test_file)

        # Create config files if they don't exist
        jsnapy_cfg = jsnapy_home / 'jsnapy.cfg'
        if not jsnapy_cfg.exists():
            with open(jsnapy_cfg, 'w') as cfg_file:
                cfg_file.write("""[DEFAULT]
snapshot_path = /tmp/jsnapy/snapshots
test_path = /tmp/jsnapy/tests
""")

        from jnpr.jsnapy import SnapAdmin
        jsnapy = SnapAdmin()

        # Get device hostname
        device_hostname = device.hostname
        try:
            device.open()
            facts = device.facts
            device_hostname = facts.get('hostname', 'device_under_test')
            print(f"DEBUG: Device hostname for comparison: {device_hostname}", file=sys.stderr)
        except Exception as e:
            device_hostname = "device_under_test"
            print(f"DEBUG: Failed to retrieve hostname, using fallback: {device_hostname}, error: {e}", file=sys.stderr)

        # Configure test
        test_config = {
            "hosts": [{
                "device": device_hostname,
                "username": device.user,
                "passwd": device.password,
                "hostname": device_hostname
            }],
            "tests": [f"tests/{jsnapy_file_name}"]
        }

        # Check if snapshot files exist
        pre_files = list(snapshots_dir.glob(f"*{pre_snapshot}*"))
        post_files = list(snapshots_dir.glob(f"*{post_snapshot}*"))

        print(f"DEBUG: Pre-snapshot files found: {[f.name for f in pre_files]}", file=sys.stderr)
        print(f"DEBUG: Post-snapshot files found: {[f.name for f in post_files]}", file=sys.stderr)

        if not pre_files:
            error_result = [{
                "Check": f"{test_name} - Pre-snapshot Missing",
                "Result": "ERROR",
                "Details": f"Pre-snapshot '{pre_snapshot}' not found. Available files: {[f.name for f in snapshots_dir.iterdir()]}"
            }]
            return {"table": create_result_table(test_name, test_def.get("title", test_name), error_result)}

        if not post_files:
            error_result = [{
                "Check": f"{test_name} - Post-snapshot Missing",
                "Result": "ERROR",
                "Details": f"Post-snapshot '{post_snapshot}' not found. Available files: {[f.name for f in snapshots_dir.iterdir()]}"
            }]
            return {"table": create_result_table(test_name, test_def.get("title", test_name), error_result)}

        # Perform comparison
        try:
            check_result = jsnapy.check(test_config, pre_snapshot, post_snapshot, dev=device)
            print(f"DEBUG: Comparison result: {check_result}", file=sys.stderr)

            # Process comparison results
            formatted_data = []
            raw_data = []

            if check_result:
                for result in check_result:
                    test_results = getattr(result, "test_results", {})
                    raw_data.append({
                        "device": device_hostname,
                        "test_name": test_name,
                        "pre_snapshot": pre_snapshot,
                        "post_snapshot": post_snapshot,
                        "test_results": test_results,
                        "passed": getattr(result, "no_passed", 0),
                        "failed": getattr(result, "no_failed", 0),
                        "result": getattr(result, "result", "UNKNOWN")
                    })

                    if test_results:
                        for command, command_results in test_results.items():
                            print(f"DEBUG: Comparison - Command: {command}, Results: {command_results}", file=sys.stderr)
                            if isinstance(command_results, list):
                                for test_result in command_results:
                                    if isinstance(test_result, dict):
                                        # Process passed comparisons
                                        for passed_item in test_result.get("passed", []):
                                            message = passed_item.get("message", "Comparison passed - no change detected")
                                            formatted_data.append({
                                                "Check": f"{test_name} - {test_result.get('node_name', command)}",
                                                "Result": "NO CHANGE",
                                                "Details": message
                                            })
                                        # Process failed comparisons (changes detected)
                                        for failed_item in test_result.get("failed", []):
                                            message = failed_item.get("message", failed_item.get("err", "Change detected"))
                                            formatted_data.append({
                                                "Check": f"{test_name} - {test_result.get('node_name', command)}",
                                                "Result": "CHANGED",
                                                "Details": message
                                            })
                    else:
                        overall_result = "NO CHANGE" if getattr(result, "result", "") == "Passed" else "CHANGED"
                        passed_count = getattr(result, 'no_passed', 0)
                        failed_count = getattr(result, 'no_failed', 0)
                        details = f"No Changes: {passed_count}, Changes Detected: {failed_count}"
                        formatted_data.append({
                            "Check": f"{test_name} - {getattr(result, 'device', device_hostname)}",
                            "Result": overall_result,
                            "Details": details
                        })

            if not formatted_data:
                formatted_data = [{
                    "Check": f"{test_name} - Comparison Complete",
                    "Result": "NO DATA",
                    "Details": "Comparison completed but no interpretable results returned"
                }]

            table_result = create_result_table(test_name, test_def.get("title", test_name), formatted_data)
            return {"table": table_result, "raw": raw_data}

        except Exception as check_error:
            error_result = [{
                "Check": f"{test_name} - Comparison Error",
                "Result": "ERROR",
                "Details": f"Comparison failed: {check_error}"
            }]
            return {
                "table": create_result_table(test_name, test_def.get("title", test_name), error_result),
                "raw": [{"error": str(check_error), "traceback": traceback.format_exc()}]
            }

    except Exception as e:
        error_result = [{
            "Check": f"{test_name} - Exception",
            "Result": "ERROR",
            "Details": f"Comparison setup failed: {str(e)}"
        }]
        return {
            "table": create_result_table(test_name, test_def.get("title", test_name), error_result),
            "raw": [{"error": str(e), "traceback": traceback.format_exc()}]
        }

    finally:
        try:
            device.close()
        except Exception as e:
            print(f"DEBUG: Failed to close device connection: {e}", file=sys.stderr)
        os.chdir(original_cwd)
        if original_jsnapy_home is not None:
            os.environ["JSNAPY_HOME"] = original_jsnapy_home
        elif "JSNAPY_HOME" in os.environ:
            del os.environ["JSNAPY_HOME"]


# =============================================================================
# SECTION 5: ORIGINAL JSNAPY TEST EXECUTION (Current Mode)
# =============================================================================

def run_jsnapy_test(device, test_name, test_def):
    """
    Executes a JSNAPy test against a device and returns safely formatted table results.
    This is the original current-state testing functionality.
    """
    jsnapy_file_name = test_def.get("jsnapy_test_file")
    if not jsnapy_file_name:
        error_result = [{
            "Check": f"{test_name} - Configuration Error",
            "Result": "ERROR",
            "Details": f"Missing 'jsnapy_test_file' in tests.yml for test '{test_name}'"
        }]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), error_result)}

    test_file = Path(__file__).parent / "tests" / jsnapy_file_name

    if not test_file.exists():
        error_result = [{
            "Check": f"{test_name} - File Error",
            "Result": "ERROR",
            "Details": f"JSNAPy test file not found: {test_file}"
        }]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), error_result)}

    # Store original working directory and environment
    original_cwd = os.getcwd()
    original_jsnapy_home = os.environ.get("JSNAPY_HOME")

    try:
        # Create the JSNAPy home directory
        jsnapy_home = Path('/tmp/jsnapy')
        jsnapy_home.mkdir(parents=True, exist_ok=True, mode=0o777)

        # Set JSNAPY_HOME environment variable
        os.environ["JSNAPY_HOME"] = str(jsnapy_home)

        # Switch to JSNAPy home directory
        os.chdir(str(jsnapy_home))

        # Ensure snapshots and tests directories exist
        snapshots_dir = jsnapy_home / 'snapshots'
        snapshots_dir.mkdir(parents=True, exist_ok=True, mode=0o777)
        tests_dir = jsnapy_home / 'tests'
        tests_dir.mkdir(parents=True, exist_ok=True, mode=0o777)

        # Copy test file to JSNAPy tests directory
        import shutil
        source_test_file = Path(__file__).parent / "tests" / jsnapy_file_name
        target_test_file = tests_dir / jsnapy_file_name
        shutil.copy2(source_test_file, target_test_file)

        # Create jsnapy.cfg
        jsnapy_cfg = jsnapy_home / 'jsnapy.cfg'
        if not jsnapy_cfg.exists():
            with open(jsnapy_cfg, 'w') as cfg_file:
                cfg_file.write("""[DEFAULT]
snapshot_path = /tmp/jsnapy/snapshots
test_path = /tmp/jsnapy/tests
""")

        # Create logging.yml
        logging_yml = jsnapy_home / 'logging.yml'
        if not logging_yml.exists():
            with open(logging_yml, 'w') as log_file:
                log_file.write("""version: 1
disable_existing_loggers: False
formatters:
    simple:
        format: '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
handlers:
    console:
        class: logging.StreamHandler
        level: DEBUG
        formatter: simple
        stream: ext://sys.stdout
    file:
        class: logging.FileHandler
        level: DEBUG
        formatter: simple
        filename: /tmp/jsnapy/jsnapy.log
root:
    level: DEBUG
    handlers: [console, file]
loggers:
    jsnapy:
        level: DEBUG
        handlers: [console, file]
        propagate: no
""")

        # Ensure log file is writable
        log_file_path = jsnapy_home / 'jsnapy.log'
        log_file_path.touch(exist_ok=True, mode=0o666)

        # Import JSNAPy after setting environment
        from jnpr.jsnapy import SnapAdmin

        # Initialize SnapAdmin
        jsnapy = SnapAdmin()

        # Get device hostname from facts
        device_hostname = device.hostname  # Default to provided hostname (172.27.200.200)
        try:
            device.open()  # Ensure device is connected
            facts = device.facts
            device_hostname = facts.get('hostname', 'device_under_test')
            print(f"DEBUG: Device hostname retrieved from facts: {device_hostname}", file=sys.stderr)
        except Exception as e:
            device_hostname = "device_under_test"  # Fallback hostname
            print(f"DEBUG: Failed to retrieve hostname from device, using fallback: {device_hostname}, error: {e}", file=sys.stderr)

        # Configure test
        test_config = {
            "hosts": [{
                "device": device_hostname,  # Use retrieved hostname
                "username": device.user,
                "passwd": device.password,
                "hostname": device_hostname  # Use retrieved hostname
            }],
            "tests": [f"tests/{jsnapy_file_name}"]
        }

        # Save test config for debugging
        config_file = jsnapy_home / f'test_config_{test_name}.yml'
        with open(config_file, 'w') as f:
            yaml.safe_dump(test_config, f)

        print(f"DEBUG: Test config saved to {config_file}", file=sys.stderr)

        # Take snapshot and check in one operation
        check_result = None
        try:
            check_result = jsnapy.snapcheck(test_config, "current", dev=device)
            print(f"DEBUG: snapcheck result: {check_result}", file=sys.stderr)

            # Check for snapshot file with expected and fallback names
            snapshot_file_expected = snapshots_dir / f"{device_hostname}_current_show_system_information.xml"
            snapshot_file_fallback = snapshots_dir / f"{device.hostname}_current_show_system_information.xml"
            snapshot_file = None
            if snapshot_file_expected.exists():
                snapshot_file = snapshot_file_expected
                print(f"DEBUG: Found expected snapshot file: {snapshot_file}", file=sys.stderr)
            elif snapshot_file_fallback.exists():
                snapshot_file = snapshot_file_fallback
                print(f"DEBUG: Found fallback snapshot file: {snapshot_file}", file=sys.stderr)
                # Rename fallback to expected
                try:
                    shutil.move(snapshot_file_fallback, snapshot_file_expected)
                    print(f"DEBUG: Renamed snapshot file from {snapshot_file_fallback} to {snapshot_file_expected}", file=sys.stderr)
                    snapshot_file = snapshot_file_expected
                except Exception as e:
                    print(f"DEBUG: Failed to rename snapshot file: {e}", file=sys.stderr)
            else:
                print(f"DEBUG: Snapshot file not found: expected {snapshot_file_expected}, fallback {snapshot_file_fallback}", file=sys.stderr)
                # List all files in snapshots directory for debugging
                snapshot_files = [f.name for f in snapshots_dir.iterdir()]
                print(f"DEBUG: Files in {snapshots_dir}: {snapshot_files}", file=sys.stderr)

            if snapshot_file:
                with open(snapshot_file, 'r') as f:
                    raw_xml = f.read()
                    print(f"DEBUG: Raw XML output from {snapshot_file}:\n{raw_xml}", file=sys.stderr)

        except Exception as jsnapy_error:
            print(f"DEBUG: snapcheck failed: {jsnapy_error}", file=sys.stderr)
            # Try snap then check as fallback
            try:
                snap_result = jsnapy.snap(test_config, "current", dev=device)
                print(f"DEBUG: Snap result: {snap_result}", file=sys.stderr)

                # Check for snapshot file with expected and fallback names
                snapshot_file_expected = snapshots_dir / f"{device_hostname}_current_show_system_information.xml"
                snapshot_file_fallback = snapshots_dir / f"{device.hostname}_current_show_system_information.xml"
                snapshot_file = None
                if snapshot_file_expected.exists():
                    snapshot_file = snapshot_file_expected
                    print(f"DEBUG: Found expected snapshot file: {snapshot_file}", file=sys.stderr)
                elif snapshot_file_fallback.exists():
                    snapshot_file = snapshot_file_fallback
                    print(f"DEBUG: Found fallback snapshot file: {snapshot_file}", file=sys.stderr)
                    # Rename fallback to expected
                    try:
                        shutil.move(snapshot_file_fallback, snapshot_file_expected)
                        print(f"DEBUG: Renamed snapshot file from {snapshot_file_fallback} to {snapshot_file_expected}", file=sys.stderr)
                        snapshot_file = snapshot_file_expected
                    except Exception as e:
                        print(f"DEBUG: Failed to rename snapshot file: {e}", file=sys.stderr)
                else:
                    print(f"DEBUG: Snapshot file not found: expected {snapshot_file_expected}, fallback {snapshot_file_fallback}", file=sys.stderr)
                    # List all files in snapshots directory for debugging
                    snapshot_files = [f.name for f in snapshots_dir.iterdir()]
                    print(f"DEBUG: Files in {snapshots_dir}: {snapshot_files}", file=sys.stderr)

                if snapshot_file:
                    with open(snapshot_file, 'r') as f:
                        raw_xml = f.read()
                        print(f"DEBUG: Raw XML output from {snapshot_file}:\n{raw_xml}", file=sys.stderr)

                check_result = jsnapy.check(test_config, "current", dev=device)
                print(f"DEBUG: Check result: {check_result}", file=sys.stderr)
            except Exception as alt_error:
                error_result = [{
                    "Check": f"{test_name} - Execution Error",
                    "Result": "ERROR",
                    "Details": f"JSNAPy execution failed: {alt_error}"
                }]
                return {
                    "table": create_result_table(test_name, test_def.get("title", test_name), error_result),
                    "raw": [{"error": str(alt_error), "traceback": traceback.format_exc()}]
                }
        finally:
            # Ensure device connection is closed
            try:
                device.close()
            except Exception as e:
                print(f"DEBUG: Failed to close device connection: {e}", file=sys.stderr)

        # Process results
        formatted_data = []
        raw_data = []
        if check_result:
            for result in check_result:
                test_results = getattr(result, "test_results", {})
                raw_data.append({
                    "device": device_hostname,  # Use retrieved hostname
                    "test_name": test_name,
                    "test_results": test_results,
                    "passed": getattr(result, "no_passed", 0),
                    "failed": getattr(result, "no_failed", 0),
                    "result": getattr(result, "result", "UNKNOWN")
                })

                if test_results:
                    for command, command_results in test_results.items():
                        print(f"DEBUG: Command: {command}, Results: {command_results}", file=sys.stderr)
                        if isinstance(command_results, list):
                            for test_result in command_results:
                                if isinstance(test_result, dict):
                                    for passed_item in test_result.get("passed", []):
                                        message = passed_item.get("message", "Test passed")  # Use 'message' for passed tests
                                        formatted_data.append({
                                            "Check": f"{test_name} - {test_result.get('node_name', command)}",
                                            "Result": "PASSED",
                                            "Details": message
                                        })
                                    for failed_item in test_result.get("failed", []):
                                        message = failed_item.get("err", "Test failed")  # Use 'err' for failed tests
                                        formatted_data.append({
                                            "Check": f"{test_name} - {test_result.get('node_name', command)}",
                                            "Result": "FAILED",
                                            "Details": message
                                        })
                else:
                    overall_result = "PASSED" if getattr(result, "result", "") == "Passed" else "FAILED"
                    passed_count = getattr(result, 'no_passed', 0)
                    failed_count = getattr(result, 'no_failed', 0)
                    details = f"Passed: {passed_count}, Failed: {failed_count}"
                    formatted_data.append({
                        "Check": f"{test_name} - {getattr(result, 'device', device_hostname)}",
                        "Result": overall_result,
                        "Details": details
                    })

        if not formatted_data:
            formatted_data = [{
                "Check": f"{test_name} - No Results",
                "Result": "UNKNOWN",
                "Details": "JSNAPy returned no interpretable test data"
            }]

        table_result = create_result_table(test_name, test_def.get("title", test_name), formatted_data)
        return {"table": table_result, "raw": raw_data}

    except Exception as e:
        error_result = [{
            "Check": f"{test_name} - Exception",
            "Result": "ERROR",
            "Details": f"JSNAPy test execution failed: {str(e)}"
        }]
        return {
            "table": create_result_table(test_name, test_def.get("title", test_name), error_result),
            "raw": [{"error": str(e), "traceback": traceback.format_exc()}]
        }

    finally:
        os.chdir(original_cwd)
        if original_jsnapy_home is not None:
            os.environ["JSNAPY_HOME"] = original_jsnapy_home
        elif "JSNAPY_HOME" in os.environ:
            del os.environ["JSNAPY_HOME"]

# =============================================================================
# SECTION 6: RESULT FORMATTING AND DISPLAY
# =============================================================================
def format_summary_table(results):
    """Create a summary table of all test results."""
    summary_data = []

    for host_result in results.get("results_by_host", []):
        hostname = host_result["hostname"]
        status = host_result["status"]

        if status == "success":
            for test_result in host_result["test_results"]:
                passed = sum(1 for row in test_result["table"]["rows"] if row["Status"] == "PASSED")
                failed = sum(1 for row in test_result["table"]["rows"] if row["Status"] == "FAILED")
                error = sum(1 for row in test_result["table"]["rows"] if row["Status"] == "ERROR")
                no_change = sum(1 for row in test_result["table"]["rows"] if row["Status"] == "NO CHANGE")
                changed = sum(1 for row in test_result["table"]["rows"] if row["Status"] == "CHANGED")

                summary_data.append([
                    hostname,
                    test_result["table"]["test_name"],
                    passed + no_change,  # Combine PASSED and NO CHANGE as success
                    failed + changed,    # Combine FAILED and CHANGED as issues
                    error,
                    "PASS" if failed == 0 and error == 0 and changed == 0 else "FAIL"
                ])
        else:
            summary_data.append([
                hostname,
                "CONNECTION",
                0,
                1,
                1,
                "FAIL"
            ])

    headers = ["Host", "Test", "Passed", "Failed", "Errors", "Status"]
    return summary_data, headers


def display_results(results):
    """Display formatted results in console."""
    # Print summary information
    print("\n" + "="*80)
    print("TEST EXECUTION SUMMARY".center(80))
    print("="*80)
    print(f"Total Hosts: {results['summary']['total_hosts']}")
    print(f"Passed Hosts: {results['summary']['passed_hosts']}")
    print(f"Total Tests Executed: {results['summary']['total_tests']}")
    print("="*80 + "\n")

    # Print summary table
    summary_data, headers = format_summary_table(results)
    print(tabulate(summary_data, headers=headers, tablefmt="grid", showindex=True))
    print("\n" + "="*80)
    print("DETAILED RESULTS".center(80))
    print("="*80)

    # Print detailed results for each host
    for host_result in results["results_by_host"]:
        print(f"\nHost: {host_result['hostname']}")
        print(f"Status: {host_result['status'].upper()}")

        if host_result["status"] == "success":
            for test_result in host_result["test_results"]:
                print(f"\nTest: {test_result['table']['test_name']}")
                print(f"Title: {test_result['table']['title']}")
                print("\nTest Results:")

                # Convert table rows to list of lists for tabulate
                table_rows = []
                for row in test_result["table"]["rows"]:
                    table_rows.append([
                        row["Check"],
                        row["Status"],
                        row["Details"],
                        row["Timestamp"]
                    ])

                print(tabulate(
                    table_rows,
                    headers=test_result["table"]["columns"],
                    tablefmt="grid"
                ))

                # Print raw data if available
                if test_result.get("raw"):
                    print("\nRaw Data:")
                    print(json.dumps(test_result["raw"], indent=2))
        else:
            print(f"\nError: {host_result.get('message', 'Unknown error')}")

    print("\n" + "="*80)
    print("EXECUTION COMPLETE".center(80))
    print("="*80)

# =============================================================================
# SECTION 7: ASYNC DEVICE VALIDATION WITH MODE SUPPORT
# =============================================================================
async def validate_host(hostname, username, password, tests, test_defs, host_index, mode="current", snapshot_name=None, compare_with=None):
    """
    Validates a single device by running tests in different modes.

    Args:
        hostname: Device IP/hostname
        username: Login username
        password: Login password
        tests: List of test names to run
        test_defs: Test definitions from tests.yml
        host_index: Index for progress reporting
        mode: Operation mode ('current', 'snapshot', 'compare')
        snapshot_name: Name for snapshot (required for snapshot and compare modes)
        compare_with: Pre-snapshot name (required for compare mode)
    """
    connection_step, execution_step = (host_index * 2) - 1, host_index * 2
    send_progress("STEP_START", {"step": connection_step, "name": f"Connect to {hostname}"}, f"Connecting to {hostname}...")

    try:
        with Device(host=hostname, user=username, passwd=password, timeout=30) as dev:
            send_progress("STEP_COMPLETE", {"step": connection_step}, f"Successfully connected to {hostname}.")

            if mode == "snapshot":
                send_progress("STEP_START", {"step": execution_step, "name": f"Take Snapshots on {hostname}"}, f"Taking {len(tests)} snapshots on {hostname}...")
            elif mode == "compare":
                send_progress("STEP_START", {"step": execution_step, "name": f"Compare Snapshots on {hostname}"}, f"Comparing {len(tests)} snapshots on {hostname}...")
            else:
                send_progress("STEP_START", {"step": execution_step, "name": f"Run Validations on {hostname}"}, f"Executing {len(tests)} tests on {hostname}...")

            host_results = []
            for test_name in tests:
                if test_name in test_defs:
                    if mode == "snapshot":
                        test_result = take_jsnapy_snapshot(dev, test_name, test_defs[test_name], snapshot_name)
                        status = "SUCCESS" if not any(row["Status"] == "ERROR" for row in test_result["table"]["rows"]) else "ERROR"
                        send_progress("TEST_COMPLETE", {
                            "host": hostname,
                            "test": test_name,
                            "status": status,
                            "mode": "snapshot",
                            "snapshot_name": snapshot_name
                        }, f"Snapshot {test_name} completed on {hostname}")
                    elif mode == "compare":
                        test_result = compare_jsnapy_snapshots(dev, test_name, test_defs[test_name], compare_with, snapshot_name)
                        status = "SUCCESS" if not any(row["Status"] == "ERROR" for row in test_result["table"]["rows"]) else "ERROR"
                        send_progress("TEST_COMPLETE", {
                            "host": hostname,
                            "test": test_name,
                            "status": status,
                            "mode": "compare",
                            "pre_snapshot": compare_with,
                            "post_snapshot": snapshot_name
                        }, f"Comparison {test_name} completed on {hostname}")
                    else:  # current mode
                        test_result = run_jsnapy_test(dev, test_name, test_defs[test_name])
                        status = "SUCCESS" if not any(row["Status"] == "FAILED" for row in test_result["table"]["rows"]) else "WARNING"
                        send_progress("TEST_COMPLETE", {
                            "host": hostname,
                            "test": test_name,
                            "status": status,
                            "mode": "current"
                        }, f"Test {test_name} completed on {hostname}")

                    host_results.append(test_result)

            send_progress("STEP_COMPLETE", {"step": execution_step}, f"Finished all operations on {hostname}.")
            return {
                "hostname": sanitize_text(hostname),
                "status": "success",
                "test_results": host_results,
                "mode": mode,
                "snapshot_name": snapshot_name,
                "compare_with": compare_with
            }
    except (ConnectError, ConnectTimeoutError, ConnectAuthError, Exception) as e:
        error_message = f"An error occurred with host {hostname}: {sanitize_text(str(e))}"
        send_progress("STEP_COMPLETE", {"step": connection_step, "status": "FAILED"}, error_message)
        return {
            "hostname": sanitize_text(hostname),
            "status": "error",
            "message": error_message,
        }


# =============================================================================
# SECTION 8: MAIN ASYNC ORCHESTRATOR WITH MODE SUPPORT
# =============================================================================
async def main_async(args):
    """Core orchestrator for test discovery/execution with snapshot support."""
    tests_yml = Path(__file__).parent / "tests.yml"
    with open(tests_yml) as f:
        test_defs = yaml.safe_load(f)

    # --- Test Discovery Mode ---
    if args.list_tests:
        categorized_tests = {}
        for test_id, details in test_defs.items():
            category = sanitize_text(details.get("category", "Uncategorized"))
            if category not in categorized_tests:
                categorized_tests[category] = []
            categorized_tests[category].append({
                "id": sanitize_text(test_id),
                "title": sanitize_text(details.get("title", test_id)),
                "description": sanitize_text(details.get("description", "No description provided.")),
                "category": category,
            })
        return {"success": True, "discovered_tests": categorized_tests}

    # --- Test Execution Mode ---
    hosts = [h.strip() for h in args.hostname.split(",")]
    tests_to_run = [t.strip() for t in args.tests.split(",")]
    mode = getattr(args, 'mode', 'current')
    snapshot_name = getattr(args, 'snapshot_name', None)
    compare_with = getattr(args, 'compare_with', None)

    # Validate arguments based on mode
    if mode == "snapshot" and not snapshot_name:
        raise ValueError("Snapshot mode requires --snapshot-name parameter")
    if mode == "compare" and (not snapshot_name or not compare_with):
        raise ValueError("Compare mode requires both --snapshot-name and --compare-with parameters")

    total_steps = len(hosts) * 2
    operation_desc = {
        "current": "validation",
        "snapshot": "snapshot collection",
        "compare": "snapshot comparison"
    }

    send_progress("OPERATION_START", {
        "total_steps": total_steps,
        "mode": mode,
        "snapshot_name": snapshot_name,
        "compare_with": compare_with
    }, f"Starting {operation_desc.get(mode, 'operation')} for {len(hosts)} host(s).")

    tasks = [
        validate_host(host, args.username, args.password, tests_to_run, test_defs, idx + 1, mode, snapshot_name, compare_with)
        for idx, host in enumerate(hosts)
    ]
    results = await asyncio.gather(*tasks)

    final_results = {
        "results_by_host": results,
        "summary": {
            "passed_hosts": sum(1 for r in results if r["status"] == "success"),
            "total_tests": len(tests_to_run) * len(hosts),
            "total_hosts": len(hosts),
            "tests_per_host": len(tests_to_run),
            "mode": mode,
            "snapshot_name": snapshot_name,
            "compare_with": compare_with
        },
    }

    # Display results in console
    if not args.list_tests:
        display_results(final_results)

    return {"type": "result", "data": final_results}


# =============================================================================
# SECTION 9: COMMAND-LINE ENTRY POINT WITH ENHANCED ARGUMENTS
# =============================================================================
def main():
    """Parses arguments and orchestrates the validation run."""
    parser = argparse.ArgumentParser(description="Asynchronous Network Validation Tool with Snapshot Comparison")
    parser.add_argument("--hostname", help="Comma-separated device IPs")
    parser.add_argument("--username", help="Device login username")
    parser.add_argument("--password", help="Device login password")
    parser.add_argument("--tests", help="Comma-separated test names")
    parser.add_argument("--list_tests", action="store_true", help="List available tests")
    parser.add_argument("--mode", choices=["current", "snapshot", "compare"], default="current",
                       help="Operation mode: current (default), snapshot, or compare")
    parser.add_argument("--snapshot-name", help="Name for snapshot (required for snapshot and compare modes)")
    parser.add_argument("--compare-with", help="Pre-snapshot name to compare against (required for compare mode)")

    args = parser.parse_args()

    try:
        if not args.list_tests and (not args.hostname or not args.username or not args.password or not args.tests):
            raise ValueError("Hostname, username, password, and tests are required for a validation run.")

        # Validate mode-specific arguments
        if args.mode == "snapshot" and not args.snapshot_name:
            raise ValueError("Snapshot mode requires --snapshot-name parameter")
        if args.mode == "compare" and (not args.snapshot_name or not args.compare_with):
            raise ValueError("Compare mode requires both --snapshot-name and --compare-with parameters")

        final_output = asyncio.run(main_async(args))

        if not args.list_tests:
            send_progress("OPERATION_COMPLETE", {"status": "SUCCESS", "mode": args.mode}, "All operations completed.")

        print(json.dumps(final_output))

    except Exception as e:
        error_message = f"A critical script error occurred: {sanitize_text(str(e))}"
        send_progress("OPERATION_COMPLETE", {"status": "FAILED"}, error_message)
        error_output = {"type": "error", "message": error_message}
        print(json.dumps(error_output))
        print(f"CRITICAL ERROR: {traceback.format_exc()}", file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
