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
import os
import sys
from pathlib import Path
from jnpr.junos import Device
from jnpr.junos.exception import ConnectError
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
        "message": message,
    }
    print(json.dumps(progress), flush=True)


# =============================================================================
# SECTION 3: JSNAPY TEST EXECUTION (CORRECTED VERSION)
# =============================================================================
def run_jsnapy_test(device, test_name, test_def):
    """
    Executes a JSNAPy test against a device and returns formatted results.
    Uses the correct JSNAPy API based on working configuration.
    """
    jsnapy_file_name = test_def.get("jsnapy_test_file")
    if not jsnapy_file_name:
        return {
            "title": test_def.get("title", test_name),
            "headers": ["Error"],
            "data": [
                {"Error": f"Test '{test_name}' missing 'jsnapy_test_file' in tests.yml"}
            ],
        }

    test_file = Path(__file__).parent / "tests" / jsnapy_file_name

    if not test_file.exists():
        return {
            "title": test_def.get("title", test_name),
            "headers": ["Error"],
            "data": [{"Error": f"JSNAPy test file not found: {test_file}"}],
        }

    # Store original working directory
    original_cwd = os.getcwd()
    original_jsnapy_home = os.environ.get("JSNAPY_HOME")

    try:
        # Set working directory to script location
        script_dir = Path(__file__).parent
        os.chdir(script_dir)

        # Set JSNAPY_HOME environment variable - this is crucial for finding config files
        os.environ["JSNAPY_HOME"] = str(script_dir.absolute())

        print(f"DEBUG: Changed to directory: {script_dir}", file=sys.stderr)
        print(
            f"DEBUG: Set JSNAPY_HOME to: {os.environ['JSNAPY_HOME']}", file=sys.stderr
        )
        print(
            f"DEBUG: jsnapy.cfg exists: {(script_dir / 'jsnapy.cfg').exists()}",
            file=sys.stderr,
        )
        print(
            f"DEBUG: logging.yml exists: {(script_dir / 'logging.yml').exists()}",
            file=sys.stderr,
        )

        # Create snapshots directory if it doesn't exist (JSNAPy requirement)
        snapshots_dir = script_dir / "snapshots"
        snapshots_dir.mkdir(exist_ok=True)

        # Import JSNAPy after setting environment
        from jnpr.jsnapy import SnapAdmin

        try:
            print(f"DEBUG: Initializing JSNAPy...", file=sys.stderr)
            jsnapy = SnapAdmin()
            print(f"DEBUG: JSNAPy initialized successfully", file=sys.stderr)
        except Exception as init_error:
            print(f"DEBUG: JSNAPy initialization error: {init_error}", file=sys.stderr)
            raise Exception(f"Failed to initialize JSNAPy: {init_error}")

        # Configure test - use relative path as per jsnapy.cfg
        test_config = {
            "tests": [f"tests/{jsnapy_file_name}"]  # Relative path as per config
        }

        print(f"DEBUG: Running test for {device.hostname}", file=sys.stderr)
        print(f"DEBUG: test_config: {test_config}", file=sys.stderr)

        # Execute JSNAPy test - use snapcheck with existing device connection
        check_result = None

        try:
            print(
                f"DEBUG: Executing snapcheck with existing device connection...",
                file=sys.stderr,
            )
            check_result = jsnapy.snapcheck(test_config, "current", dev=device)
            print(f"DEBUG: snapcheck completed successfully", file=sys.stderr)
        except Exception as exec_error:
            print(f"DEBUG: snapcheck failed: {exec_error}", file=sys.stderr)

            # Try alternative method - separate snap and check
            try:
                print(f"DEBUG: Trying separate snap and check...", file=sys.stderr)
                jsnapy.snap(test_config, "current", dev=device)
                check_result = jsnapy.check(test_config, "current", dev=device)
                print(
                    f"DEBUG: separate snap/check completed successfully",
                    file=sys.stderr,
                )
            except Exception as alt_error:
                print(
                    f"DEBUG: separate snap/check failed: {alt_error}", file=sys.stderr
                )
                raise Exception(
                    f"JSNAPy execution failed: {exec_error}, Alternative method: {alt_error}"
                )

        print(f"DEBUG: check_result type: {type(check_result)}", file=sys.stderr)
        print(f"DEBUG: check_result content: {check_result}", file=sys.stderr)

        # Process results using the working approach
        formatted_data = []

        if check_result and len(check_result) > 0:
            for result in check_result:
                print(
                    f"DEBUG: Processing result for device: {getattr(result, 'device', 'Unknown')}",
                    file=sys.stderr,
                )
                print(
                    f"DEBUG: Result status: {getattr(result, 'result', 'Unknown')}",
                    file=sys.stderr,
                )
                print(
                    f"DEBUG: Passed count: {getattr(result, 'no_passed', 0)}",
                    file=sys.stderr,
                )
                print(
                    f"DEBUG: Failed count: {getattr(result, 'no_failed', 0)}",
                    file=sys.stderr,
                )

                # Check for detailed test results using getattr to avoid type checking issues
                test_results = getattr(result, "test_results", None)
                if test_results:
                    print(f"DEBUG: Found detailed test_results", file=sys.stderr)

                    # Parse detailed test results
                    for command, command_results in test_results.items():
                        print(f"DEBUG: Processing command: {command}", file=sys.stderr)

                        for test_result in command_results:
                            test_name_from_result = test_result.get(
                                "test_name", test_name
                            )

                            # Process passed tests
                            passed_tests = test_result.get("passed", [])
                            for passed_item in passed_tests:
                                formatted_data.append(
                                    {
                                        "Check": f"{test_name_from_result} - {command}",
                                        "Result": "PASSED",
                                        "Details": passed_item.get(
                                            "message", "Test passed"
                                        ),
                                    }
                                )

                            # Process failed tests
                            failed_tests = test_result.get("failed", [])
                            for failed_item in failed_tests:
                                formatted_data.append(
                                    {
                                        "Check": f"{test_name_from_result} - {command}",
                                        "Result": "FAILED",
                                        "Details": failed_item.get(
                                            "message", "Test failed"
                                        ),
                                    }
                                )

                            # If no individual results, show summary
                            if not passed_tests and not failed_tests:
                                count_info = test_result.get("count", {})
                                pass_count = count_info.get("pass", 0)
                                fail_count = count_info.get("fail", 0)

                                formatted_data.append(
                                    {
                                        "Check": f"{test_name_from_result} - {command}",
                                        "Result": "PASSED"
                                        if test_result.get("result", False)
                                        else "FAILED",
                                        "Details": f"Pass: {pass_count}, Fail: {fail_count}",
                                    }
                                )

                else:
                    # Fallback for basic results without detailed breakdown
                    device_name = getattr(result, "device", device.hostname)
                    result_status = getattr(result, "result", "")
                    no_passed = getattr(result, "no_passed", 0)
                    no_failed = getattr(result, "no_failed", 0)

                    overall_result = "PASSED" if result_status == "Passed" else "FAILED"

                    formatted_data.append(
                        {
                            "Check": f"{test_name} - {device_name}",
                            "Result": overall_result,
                            "Details": f"Passed: {no_passed}, Failed: {no_failed}",
                        }
                    )

        if not formatted_data:
            formatted_data = [
                {
                    "Check": f"{test_name} - No Results",
                    "Result": "UNKNOWN",
                    "Details": "JSNAPy returned no interpretable test data",
                }
            ]

        print(
            f"DEBUG: Total formatted_data entries: {len(formatted_data)}",
            file=sys.stderr,
        )

        return {
            "title": test_def.get("title", test_name),
            "headers": ["Check", "Result", "Details"],
            "data": formatted_data,
        }

    except Exception as e:
        import traceback

        error_details = traceback.format_exc()
        print(f"DEBUG: Full traceback:\n{error_details}", file=sys.stderr)

        return {
            "title": test_def.get("title", test_name),
            "headers": ["Error"],
            "data": [{"Error": f"JSNAPy test execution failed: {str(e)}"}],
        }

    finally:
        # Restore original working directory and environment
        try:
            os.chdir(original_cwd)
            if original_jsnapy_home is not None:
                os.environ["JSNAPY_HOME"] = original_jsnapy_home
            elif "JSNAPY_HOME" in os.environ:
                del os.environ["JSNAPY_HOME"]
        except:
            pass


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
                    send_progress(
                        "TEST_COMPLETE", {"test": test_name, "host": hostname}
                    )
            return {
                "hostname": hostname,
                "status": "success",
                "test_results": host_results,
            }
    except ConnectError as e:
        return {
            "hostname": hostname,
            "status": "error",
            "message": f"Connection failed: {str(e)}",
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
            categorized_tests[category].append(
                {
                    "id": test_id,
                    "title": details.get("title", test_id),
                    "description": details.get(
                        "description", "No description provided."
                    ),
                    "category": category,
                }
            )

        # Return the data in the structure expected by the frontend.
        return {"discovered_tests": categorized_tests}

    # --- Test Execution Mode ---
    hosts = args.hostname.split(",")
    tests_to_run = args.tests.split(",")
    send_progress("RUN_START", {"total_hosts": len(hosts)})

    tasks = [
        validate_host(
            host, args.username, args.password, tests_to_run, test_defs, idx + 1
        )
        for idx, host in enumerate(hosts)
    ]

    results = await asyncio.gather(*tasks)

    return {
        "results": results,
        "summary": {
            "passed_hosts": sum(1 for r in results if r["status"] == "success"),
            "total_tests": len(tests_to_run) * len(hosts),
        },
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
    parser.add_argument(
        "--list_tests", action="store_true", help="List available tests"
    )
    args = parser.parse_args()

    try:
        result = asyncio.run(main_async(args))
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"type": "error", "message": str(e)}), file=sys.stderr)
        sys.exit(1)
