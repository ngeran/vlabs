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
# SECTION 3: JSNAPY TEST EXECUTION
# =============================================================================
def run_jsnapy_test(device, test_name, test_def):
    """
    Executes a JSNAPy test against a device and returns formatted results.
    Args:
        device (Device): Connected PyEZ device.
        test_name (str): Test ID from tests.yml.
        test_def (dict): Test definition (title, jsnapy_test_file, etc.).
    Returns:
        dict: Test results in UI-friendly format.
    """
    jsnapy = SnapAdmin()
    test_file = Path(__file__).parent / test_def["jsnapy_test_file"]

    try:
        # Execute JSNAPy test and parse results
        check_result = jsnapy.check(
            device=device,
            file_name=str(test_file),
            test_name=test_name
        )

        # Format results for UI
        return {
            "title": test_def["title"],
            "headers": ["Check", "Result", "Details"],
            "data": [
                {
                    "Check": check["node_name"],
                    "Result": "PASSED" if check["passed"] else "FAILED",
                    "Details": check["error_message"] or "All conditions met."
                }
                for check in check_result[test_name]
            ]
        }
    except Exception as e:
        return {
            "title": test_def["title"],
            "headers": ["Error"],
            "data": [{"Error": f"JSNAPy execution failed: {str(e)}"}]
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
    # Load test definitions
    tests_yml = Path(__file__).parent / "tests.yml"
    with open(tests_yml) as f:
        test_defs = yaml.safe_load(f)

    # --- Test Discovery Mode ---
    if args.list_tests:
        return {
            "discovered_tests": {
                test: {"description": def_.get("description"), "category": def_.get("category")}
                for test, def_ in test_defs.items()
            }
        }

    # --- Test Execution Mode ---
    hosts = args.hostname.split(",")
    tests_to_run = args.tests.split(",")

    send_progress("RUN_START", {"total_hosts": len(hosts)})

    # Run tests concurrently across hosts
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
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
