# =============================================================================
# FILENAME:           validation_run.py
#
# ROLE:               An asynchronous JSNAPy-based Network Validation Engine.
#
# DESCRIPTION:
#   This script is the backend for the Network Validation tool. It connects
#   to network devices, executes a series of pre-defined JSNAPy tests, and
#   returns structured results. It uses an event-driven progress model
#   to communicate with a frontend UI.
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
# SECTION 4: JSNAPY TEST EXECUTION (WITH SAFE FORMATTING)
# =============================================================================

def run_jsnapy_test(device, test_name, test_def):
    """
    Executes a JSNAPy test against a device and returns safely formatted table results.
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
        # Create the JSNAPy home directory if it doesn't exist
        jsnapy_home = Path('/tmp/jsnapy')
        jsnapy_home.mkdir(parents=True, exist_ok=True)

        # Set JSNAPY_HOME environment variable to the directory containing jsnapy.cfg
        os.environ["JSNAPY_HOME"] = str(jsnapy_home)

        # Switch to the JSNAPy home directory - this is crucial!
        os.chdir(str(jsnapy_home))

        # Ensure the snapshots directory exists in the JSNAPy home directory
        snapshots_dir = jsnapy_home / 'snapshots'
        snapshots_dir.mkdir(parents=True, exist_ok=True)

        # Ensure the tests directory exists and copy our test file there
        tests_dir = jsnapy_home / 'tests'
        tests_dir.mkdir(parents=True, exist_ok=True)

        # Copy the test file to JSNAPy's expected location
        import shutil
        source_test_file = Path(__file__).parent / "tests" / jsnapy_file_name
        target_test_file = tests_dir / jsnapy_file_name
        shutil.copy2(source_test_file, target_test_file)

        # Create a basic jsnapy.cfg file if it doesn't exist
        jsnapy_cfg = jsnapy_home / 'jsnapy.cfg'
        if not jsnapy_cfg.exists():
            with open(jsnapy_cfg, 'w') as cfg_file:
                cfg_file.write("""[DEFAULT]
snapshot_path = /tmp/jsnapy/snapshots
test_path = /tmp/jsnapy/tests
""")

        # Create logging.yml file if it doesn't exist
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
        level: ERROR
        formatter: simple
        stream: ext://sys.stdout
    file:
        class: logging.FileHandler
        level: INFO
        formatter: simple
        filename: /tmp/jsnapy/jsnapy.log
root:
    level: ERROR
    handlers: [console, file]
loggers:
    jsnapy:
        level: ERROR
        handlers: [console, file]
        propagate: no
""")

        # Ensure log file can be created
        log_file_path = jsnapy_home / 'jsnapy.log'
        log_file_path.touch(exist_ok=True)

        # Import JSNAPy after setting the environment variables
        from jnpr.jsnapy import SnapAdmin

        # Initialize SnapAdmin with comprehensive error handling
        jsnapy = None
        initialization_attempts = [
            # Attempt 1: Normal initialization
            lambda: SnapAdmin(),
            # Attempt 2: With suppressed stderr
            lambda: _init_with_suppressed_stderr(),
            # Attempt 3: With minimal temporary environment
            lambda: _init_with_temp_env()
        ]

        def _init_with_suppressed_stderr():
            import sys
            original_stderr = sys.stderr
            try:
                sys.stderr = open(os.devnull, 'w')
                return SnapAdmin()
            finally:
                sys.stderr.close()
                sys.stderr = original_stderr

        def _init_with_temp_env():
            # Create absolute minimal environment
            import tempfile
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_home = Path(temp_dir)
                original_jsnapy_home = os.environ.get("JSNAPY_HOME")
                try:
                    os.environ["JSNAPY_HOME"] = str(temp_home)

                    # Create ultra-minimal logging.yml
                    temp_logging = temp_home / 'logging.yml'
                    with open(temp_logging, 'w') as f:
                        f.write("version: 1\nroot:\n  level: ERROR\n")

                    return SnapAdmin()
                finally:
                    if original_jsnapy_home:
                        os.environ["JSNAPY_HOME"] = original_jsnapy_home
                    else:
                        os.environ.pop("JSNAPY_HOME", None)

        # Try each initialization method
        last_error = None
        for i, init_method in enumerate(initialization_attempts):
            try:
                jsnapy = init_method()
                if jsnapy:
                    print(f"DEBUG: SnapAdmin initialized successfully on attempt {i+1}", file=sys.stderr)
                    break
            except Exception as e:
                last_error = e
                print(f"DEBUG: SnapAdmin initialization attempt {i+1} failed: {e}", file=sys.stderr)
                continue

        if not jsnapy:
            raise Exception(f"Failed to initialize JSNAPy SnapAdmin after all attempts. Last error: {last_error}")

        # Configure test - use relative path from JSNAPy home
        test_config = {
            "tests": [f"tests/{jsnapy_file_name}"]
        }

        check_result = None
        try:
            # Use snapcheck instead of separate snap and check
            # This takes a snapshot and runs checks in one operation
            check_result = jsnapy.snapcheck(test_config, "current", dev=device)

        except Exception as jsnapy_error:
            # If snapcheck fails, try the traditional snap then check approach
            try:
                print(f"DEBUG: snapcheck failed, trying snap then check: {jsnapy_error}", file=sys.stderr)

                # Take snapshot first
                snap_result = jsnapy.snap(test_config, "current", dev=device)
                print(f"DEBUG: Snap result: {snap_result}", file=sys.stderr)

                # Then run check
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

        # Process results
        formatted_data = []
        raw_data = []
        if check_result:
            for result in check_result:
                test_results = getattr(result, "test_results", {})
                raw_data.append({
                    "device": device.hostname,
                    "test_name": test_name,
                    "test_results": test_results,
                    "passed": getattr(result, "no_passed", 0),
                    "failed": getattr(result, "no_failed", 0),
                    "result": getattr(result, "result", "UNKNOWN")
                })

                if test_results:
                    for command, command_results in test_results.items():
                        # Debug: Print what we're getting from JSNAPy
                        print(f"DEBUG: Command: {command}, Results: {command_results}", file=sys.stderr)

                        if isinstance(command_results, list):
                            for test_result in command_results:
                                if isinstance(test_result, dict):
                                    # Handle passed results
                                    for passed_item in test_result.get("passed", []):
                                        if isinstance(passed_item, dict):
                                            message = passed_item.get("message", "Test passed")
                                        else:
                                            message = str(passed_item)
                                        formatted_data.append({
                                            "Check": f"{test_name} - {command}",
                                            "Result": "PASSED",
                                            "Details": message
                                        })

                                    # Handle failed results
                                    for failed_item in test_result.get("failed", []):
                                        if isinstance(failed_item, dict):
                                            message = failed_item.get("message", "Test failed")
                                        else:
                                            message = str(failed_item)
                                        formatted_data.append({
                                            "Check": f"{test_name} - {command}",
                                            "Result": "FAILED",
                                            "Details": message
                                        })

                                    # If no passed/failed but result exists, check result field
                                    if (not test_result.get("passed") and
                                        not test_result.get("failed") and
                                        test_result.get("result") is not None):
                                        result_value = test_result.get("result")
                                        if result_value:
                                            formatted_data.append({
                                                "Check": f"{test_name} - {command}",
                                                "Result": "PASSED",
                                                "Details": f"Command executed successfully: {result_value}"
                                            })
                                        else:
                                            formatted_data.append({
                                                "Check": f"{test_name} - {command}",
                                                "Result": "FAILED",
                                                "Details": "Command returned no data"
                                            })
                else:
                    # Fallback: use overall result if no detailed test_results
                    overall_result = "PASSED" if getattr(result, "result", "") == "Passed" else "FAILED"
                    passed_count = getattr(result, 'no_passed', 0)
                    failed_count = getattr(result, 'no_failed', 0)

                    if passed_count > 0 or failed_count > 0:
                        details = f"Passed: {passed_count}, Failed: {failed_count}"
                    else:
                        details = "Test completed but no specific results available"

                    formatted_data.append({
                        "Check": f"{test_name} - {getattr(result, 'device', device.hostname)}",
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
        # Restore original working directory and environment
        os.chdir(original_cwd)
        if original_jsnapy_home is not None:
            os.environ["JSNAPY_HOME"] = original_jsnapy_home
        elif "JSNAPY_HOME" in os.environ:
            del os.environ["JSNAPY_HOME"]

# =============================================================================
# SECTION 5: RESULT FORMATTING AND DISPLAY
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

                summary_data.append([
                    hostname,
                    test_result["table"]["test_name"],
                    passed,
                    failed,
                    error,
                    "PASS" if failed == 0 and error == 0 else "FAIL"
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
# SECTION 6: ASYNC DEVICE VALIDATION
# =============================================================================
async def validate_host(hostname, username, password, tests, test_defs, host_index):
    """
    Validates a single device by running all specified JSNAPy tests.
    """
    connection_step, execution_step = (host_index * 2) - 1, host_index * 2
    send_progress("STEP_START", {"step": connection_step, "name": f"Connect to {hostname}"}, f"Connecting to {hostname}...")
    try:
        with Device(host=hostname, user=username, passwd=password, timeout=30) as dev:
            send_progress("STEP_COMPLETE", {"step": connection_step}, f"Successfully connected to {hostname}.")
            send_progress("STEP_START", {"step": execution_step, "name": f"Run Validations on {hostname}"}, f"Executing {len(tests)} tests on {hostname}...")

            host_results = []
            for test_name in tests:
                if test_name in test_defs:
                    test_result = run_jsnapy_test(dev, test_name, test_defs[test_name])
                    host_results.append(test_result)
                    # Send progress for each test completion
                    send_progress("TEST_COMPLETE", {
                        "host": hostname,
                        "test": test_name,
                        "status": "SUCCESS" if not any(row["Status"] == "FAILED" for row in test_result["table"]["rows"]) else "WARNING"
                    }, f"Completed test {test_name} on {hostname}")

            send_progress("STEP_COMPLETE", {"step": execution_step}, f"Finished all validations on {hostname}.")
            return {
                "hostname": sanitize_text(hostname),
                "status": "success",
                "test_results": host_results,
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
# SECTION 7: MAIN ASYNC ORCHESTRATOR
# =============================================================================
async def main_async(args):
    """Core orchestrator for test discovery/execution."""
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
    total_steps = len(hosts) * 2
    send_progress("OPERATION_START", {"total_steps": total_steps}, f"Starting validation for {len(hosts)} host(s).")

    tasks = [validate_host(host, args.username, args.password, tests_to_run, test_defs, idx + 1) for idx, host in enumerate(hosts)]
    results = await asyncio.gather(*tasks)

    final_results = {
        "results_by_host": results,
        "summary": {
            "passed_hosts": sum(1 for r in results if r["status"] == "success"),
            "total_tests": len(tests_to_run) * len(hosts),
            "total_hosts": len(hosts),
            "tests_per_host": len(tests_to_run)
        },
    }

    # Display results in console
    if not args.list_tests:
        display_results(final_results)

    return {"type": "result", "data": final_results}


# =============================================================================
# SECTION 8: COMMAND-LINE ENTRY POINT
# =============================================================================
def main():
    """Parses arguments and orchestrates the validation run."""
    parser = argparse.ArgumentParser(description="Asynchronous Network Validation Tool")
    parser.add_argument("--hostname", help="Comma-separated device IPs")
    parser.add_argument("--username", help="Device login username")
    parser.add_argument("--password", help="Device login password")
    parser.add_argument("--tests", help="Comma-separated test names")
    parser.add_argument("--list_tests", action="store_true", help="List available tests")
    args = parser.parse_args()

    try:
        if not args.list_tests and (not args.hostname or not args.username or not args.password or not args.tests):
            raise ValueError("Hostname, username, password, and tests are required for a validation run.")

        final_output = asyncio.run(main_async(args))

        if not args.list_tests:
            send_progress("OPERATION_COMPLETE", {"status": "SUCCESS"}, "All operations completed.")

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
