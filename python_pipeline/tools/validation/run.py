#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# =============================================================================
# FILE: run.py
# DESCRIPTION:
#   Asynchronous JSNAPy Validation Runner for Juniper devices.
#   Executes predefined tests (from tests.yml) and streams real-time progress to UI.
#
# KEY FEATURES:
#   1. Dynamic Test Discovery: Lists available tests from tests.yml.
#   2. Real-Time JSON Progress: Streams updates for UI integration.
#   3. Multi-Device Async Execution: Runs tests concurrently across devices.
#   4. JSNAPy Integration: Uses SnapAdmin for snapshot-based validation.
#
# DEPENDENCIES:
#   - jnpr.junos (PyEZ): Device connectivity.
#   - jnpr.jsnapy: Snapshot testing.
#   - PyYAML: Parsing tests.yml.
#   - asyncio: Concurrent execution.
#
# USAGE:
#   Discovery: python run.py --list_tests
#   Execution: python run.py --hostname <ip> --username <user> --password <pass> --tests <test1,test2>
# =============================================================================

# =============================================================================
# SECTION 1: IMPORTS & INITIALIZATION
# =============================================================================
import argparse
import asyncio
import json
import sys
from pathlib import Path
from jnpr.junos import Device
from jnpr.junos.exception import ConnectError
from jnpr.jsnapy import SnapAdmin
import yaml

# =============================================================================
# SECTION 2: PROGRESS REPORTING UTILITIES
# =============================================================================
def send_progress(event_type, data=None, message=""):
    """Emits structured JSON progress updates to stdout for UI consumption."""
    progress = {
        "type": "progress",
        "event_type": event_type,
        "data": data or {},
        "message": message
    }
    print(json.dumps(progress), flush=True)

# =============================================================================
# SECTION 3: JSNAPY TEST EXECUTION (FINAL CORRECTED VERSION)
# =============================================================================

def run_jsnapy_test(device, test_name, test_def):
    """
    Executes a JSNAPy test against a device and returns formatted results.
    Uses the correct JSNAPy API based on official documentation.
    """
    jsnapy_file_name = test_def.get("jsnapy_test_file")
    if not jsnapy_file_name:
        return {
            "title": test_def.get("title", test_name),
            "headers": ["Error"],
            "data": [{"Error": f"Test '{test_name}' missing 'jsnapy_test_file' in tests.yml"}]
        }

    test_file = Path(__file__).parent / "tests" / jsnapy_file_name
    
    if not test_file.exists():
        return {
            "title": test_def.get("title", test_name),
            "headers": ["Error"],
            "data": [{"Error": f"JSNAPy test file not found: {test_file}"}]
        }

    try:
        # Create snapshots directory if it doesn't exist (JSNAPy requirement)
        snapshots_dir = Path(__file__).parent / "snapshots"
        snapshots_dir.mkdir(exist_ok=True)
        
        jsnapy = SnapAdmin()
        
        # Method 1: Use the existing connected device object (recommended approach)
        # Pass the test file as a dictionary structure as shown in the documentation
        test_config = {
            'tests': [str(test_file.absolute())]
        }
        
        print(f"DEBUG: Using existing device connection for {device.hostname}", file=sys.stderr)
        print(f"DEBUG: test_config: {test_config}", file=sys.stderr)
        
        # Use snapcheck with the existing device object
        # This avoids the connection issues we were having
        check_result = jsnapy.snapcheck(test_config, "current", dev=device)
        
        print(f"DEBUG: check_result type: {type(check_result)}", file=sys.stderr)
        print(f"DEBUG: check_result length: {len(check_result) if check_result else 0}", file=sys.stderr)
        
        # Parse JSNAPy results
        formatted_data = []
        
        if check_result and len(check_result) > 0:
            for result in check_result:
                print(f"DEBUG: result.device: {getattr(result, 'device', 'Unknown')}", file=sys.stderr)
                print(f"DEBUG: result.result: {getattr(result, 'result', 'Unknown')}", file=sys.stderr)
                print(f"DEBUG: result.no_passed: {getattr(result, 'no_passed', 0)}", file=sys.stderr)
                print(f"DEBUG: result.no_failed: {getattr(result, 'no_failed', 0)}", file=sys.stderr)
                
                if hasattr(result, 'test_results') and result.test_results:
                    print(f"DEBUG: test_results keys: {list(result.test_results.keys())}", file=sys.stderr)
                    
                    # Parse detailed test results
                    for command, command_results in result.test_results.items():
                        for test_result in command_results:
                            test_name_from_result = test_result.get('test_name', 'Unknown Test')
                            
                            # Process passed tests
                            for passed_item in test_result.get('passed', []):
                                formatted_data.append({
                                    "Check": f"{test_name_from_result} - {command}",
                                    "Result": "PASSED",
                                    "Details": passed_item.get('message', 'Test passed')
                                })
                            
                            # Process failed tests
                            for failed_item in test_result.get('failed', []):
                                formatted_data.append({
                                    "Check": f"{test_name_from_result} - {command}",
                                    "Result": "FAILED", 
                                    "Details": failed_item.get('message', 'Test failed')
                                })
                            
                            # If no individual results, show summary
                            if not test_result.get('passed') and not test_result.get('failed'):
                                formatted_data.append({
                                    "Check": f"{test_name_from_result} - {command}",
                                    "Result": "PASSED" if test_result.get('result', False) else "FAILED",
                                    "Details": f"Count - Pass: {test_result.get('count', {}).get('pass', 0)}, Fail: {test_result.get('count', {}).get('fail', 0)}"
                                })
                else:
                    # Fallback for basic results
                    formatted_data.append({
                        "Check": f"Device {getattr(result, 'device', device.hostname)}",
                        "Result": "PASSED" if getattr(result, 'result', '') == 'Passed' else "FAILED",
                        "Details": f"Passed: {getattr(result, 'no_passed', 0)}, Failed: {getattr(result, 'no_failed', 0)}"
                    })
        
        if not formatted_data:
            formatted_data = [{"Check": "No Results", "Result": "UNKNOWN", "Details": "JSNAPy returned no test data"}]
        
        return {
            "title": test_def.get("title", test_name),
            "headers": ["Check", "Result", "Details"],
            "data": formatted_data
        }
        
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"DEBUG: Full traceback:\n{error_details}", file=sys.stderr)
        
        return {
            "title": test_def.get("title", test_name),
            "headers": ["Error"],
            "data": [{"Error": f"JSNAPy test execution failed: {str(e)}"}]
        }

# =============================================================================
# SECTION 4: ASYNC DEVICE VALIDATION
# =============================================================================
async def validate_host(hostname, username, password, tests, test_defs, host_index):
    """
    Validates a single device by running all specified JSNAPy tests.
    Args:
        hostname (str): Device IP/hostname.
        tests (list): Test names to run.
        test_defs (dict): All test definitions from tests.yml.
    Returns:
        dict: Host results with status and test outputs.
    """
    send_progress("HOST_START", {"host": hostname, "step": host_index})

    try:
        with Device(host=hostname, user=username, passwd=password, timeout=30) as dev:
            dev.open()
            host_results = []

            for test_name in tests:
                if test_name in test_defs:
                    result = run_jsnapy_test(dev, test_name, test_defs[test_name])
                    host_results.append(result)
                    send_progress("TEST_COMPLETE", {"test": test_name, "host": hostname})

            return {
                "hostname": hostname,
                "status": "success",
                "test_results": host_results
            }
    except ConnectError as e:
        return {
            "hostname": hostname,
            "status": "error",
            "message": f"Connection failed: {str(e)}"
        }

# =============================================================================
# SECTION 5: MAIN ASYNC ORCHESTRATOR
# =============================================================================
async def main_async(args):
    """Core orchestrator for test discovery/execution."""
    tests_yml = Path(__file__).parent / "tests.yml"
    with open(tests_yml) as f:
        test_defs = yaml.safe_load(f)

    # --- Test Discovery Mode (MODIFIED) ---
    if args.list_tests:
        # The frontend expects data grouped by category.
        categorized_tests = {}
        for test_id, details in test_defs.items():
            category = details.get("category", "Uncategorized")
            if category not in categorized_tests:
                categorized_tests[category] = []
            
            # Append a complete test object.
            categorized_tests[category].append({
                "id": test_id,
                "title": details.get("title", test_id),
                "description": details.get("description", "No description provided."),
                "category": category
            })
        
        # Return the data in the structure expected by the frontend.
        return {"discovered_tests": categorized_tests}

    # --- Test Execution Mode ---
    hosts = args.hostname.split(",")
    tests_to_run = args.tests.split(",")

    send_progress("RUN_START", {"total_hosts": len(hosts)})

    tasks = [
        validate_host(
            host, args.username, args.password,
            tests_to_run, test_defs, idx + 1
        )
        for idx, host in enumerate(hosts)
    ]
    results = await asyncio.gather(*tasks)

    return {
        "results": results,
        "summary": {
            "passed_hosts": sum(1 for r in results if r["status"] == "success"),
            "total_tests": len(tests_to_run) * len(hosts)
        }
    }

# =============================================================================
# SECTION 6: COMMAND-LINE ENTRY POINT
# =============================================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--hostname", help="Comma-separated device IPs")
    parser.add_argument("--username", help="Device login username")
    parser.add_argument("--password", help="Device login password")
    parser.add_argument("--tests", help="Comma-separated test names")
    parser.add_argument("--list_tests", action="store_true", help="List available tests")
    args = parser.parse_args()

    try:
        result = asyncio.run(main_async(args))
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"type": "error", "message": str(e)}), file=sys.stderr)
        sys.exit(1)
