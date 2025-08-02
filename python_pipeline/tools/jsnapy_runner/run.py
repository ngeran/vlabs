#!/usr/bin/env python3
# ====================================================================================
#
# FILE: jsnapy_runner/run.py (v3.18 - Real-Time Progress Enabled)
#
# ROLE: A comprehensive, asynchronous JSNAPy test runner with real-time feedback.
#
# DESCRIPTION: This script serves as the backend engine for the JSNAPy Auditing Tool.
#              It has been updated to emit structured JSON progress updates to stderr,
#              allowing the frontend to display a real-time view of the execution steps.
#              It connects to network devices, runs specified tests, and can save a
#              human-readable report upon completion.
#
# AUTHOR: nikos-geranios_vgi
#
# ====================================================================================


# ====================================================================================
# SECTION 1: IMPORTS & INITIAL SETUP
# ====================================================================================
#
# Standard library imports required for argument parsing, file handling,
# asynchronous operations, and data serialization.
#
import argparse
import sys
import json
import asyncio
from pathlib import Path
from datetime import datetime
import traceback

# Note: Third-party imports like PyEZ, YAML, and Tabulate are loaded within the
# functions where they are used. This improves startup time and keeps dependencies
# localized to the functions that need them.


# ====================================================================================
# SECTION 2: REAL-TIME PROGRESS REPORTING
# ====================================================================================
#
# This section contains the core function for communicating with the Node.js backend.
#

def send_progress(event_type, data, message=""):
    """
    @description Formats a progress update as a JSON string and prints it to stderr.
                 The Node.js backend listens on the child process's stderr stream for
                 lines prefixed with 'JSON_PROGRESS:' to parse and forward to the
                 frontend via WebSocket.

    @param {str} event_type - The type of event (e.g., 'OPERATION_START', 'STEP_START').
    @param {dict} data - A dictionary containing event-specific data (e.g., step number, status).
    @param {str} message - An optional human-readable message describing the event.
    """
    progress_update = {
        "event_type": event_type,
        "message": message,
        "data": data
    }
    # The 'JSON_PROGRESS:' prefix is the magic string our backend looks for.
    # 'flush=True' is critical to ensure the message is sent immediately and not
    # buffered, which is essential for real-time updates.
    print(f"{json.dumps(progress_update)}", file=sys.stdout, flush=True)


# ====================================================================================
# SECTION 3: CORE TEST EXECUTION LOGIC
# ====================================================================================
#
# These functions handle the actual interaction with the target network devices.
#

def run_single_test(device, test_definition):
    """
    @description Executes a single, defined test against an already-connected PyEZ device object.
                 It dynamically calls the specified RPC and extracts data using XPath.

    @param {jnpr.junos.Device} device - An active PyEZ Device object.
    @param {dict} test_definition - A dictionary containing the test's 'rpc', 'xpath', and 'fields'.
    @returns {dict} A dictionary containing the structured results for the single test.
    """
    # Dynamically find the RPC method on the PyEZ device object.
    # e.g., 'get-interface-information' becomes 'get_interface_information'.
    rpc_to_call_name = test_definition['rpc'].replace('-', '_')
    rpc_to_call = getattr(device.rpc, rpc_to_call_name)

    # Execute the RPC and get the XML response.
    rpc_args = test_definition.get('rpc_args', {})
    xml_data = rpc_to_call(**rpc_args)

    # Process the XML response to extract data.
    table_data = []
    headers = list(test_definition['fields'].keys())
    for item in xml_data.findall(test_definition['xpath']):
        row = {header: item.findtext(xml_tag, "N/A") for header, xml_tag in zip(headers, test_definition['fields'].values())}
        table_data.append(row)

    title = f"{test_definition.get('title', 'Untitled Test')} for {device.hostname}"
    return {"title": title, "headers": headers, "data": table_data, "error": None}


async def run_tests_on_host(hostname, username, password, tests_to_run, host_index):
    """
    @description An asynchronous worker that connects to a single host, runs a list of tests,
                 and sends real-time progress updates throughout the process.

    @param {str} hostname - The IP address or hostname of the target device.
    @param {str} username - The username for authentication.
    @param {str} password - The password for authentication.
    @param {dict} tests_to_run - A dictionary of test definitions to execute.
    @param {int} host_index - The 1-based index of this host in the list of all hosts.
    @returns {dict} A structured dictionary containing results or a specific error message for this host.
    """
    # These imports are here because they are only needed for the connection task.
    from jnpr.junos import Device
    from jnpr.junos.exception import ConnectTimeoutError, ConnectAuthError

    # Define step numbers for progress reporting. Each host has two main steps:
    # 1. Connect to the device.
    # 2. Execute tests on the device.
    connection_step = (host_index * 2) - 1
    execution_step = host_index * 2

    # --- PROGRESS UPDATE: Start Connection Step ---
    send_progress(
        "STEP_START",
        {"step": connection_step, "name": f"Connect to {hostname}", "status": "IN_PROGRESS", "description": "Attempting to establish connection..."},
    )

    try:
        # The 'with' statement ensures the device connection is properly closed.
        with Device(host=hostname, user=username, passwd=password, timeout=20) as dev:
            # --- PROGRESS UPDATE: Connection Successful ---
            send_progress(
                "STEP_COMPLETE",
                {"step": connection_step, "duration": dev.timeout, "status": "COMPLETED"},
                f"Successfully connected to {hostname}."
            )

            # --- PROGRESS UPDATE: Start Test Execution Step ---
            send_progress(
                "STEP_START",
                {"step": execution_step, "name": f"Run Tests on {hostname}", "status": "IN_PROGRESS", "description": f"Executing {len(tests_to_run)} tests."},
            )

            host_results = []
            for test_name, test_def in tests_to_run.items():
                try:
                    test_result = run_single_test(dev, test_def)
                    host_results.append(test_result)
                except Exception as e:
                    # If a single test fails, record the error and continue.
                    print(f"\n[ERROR] Test '{test_name}' failed on {hostname}: {e}\n", file=sys.stderr, flush=True)
                    host_results.append({"title": test_def.get('title', test_name), "error": str(e), "headers": [], "data": []})

            # --- PROGRESS UPDATE: Test Execution Complete ---
            send_progress(
                "STEP_COMPLETE",
                {"step": execution_step, "status": "COMPLETED"},
                f"Finished all tests on {hostname}."
            )
            return {"hostname": hostname, "status": "success", "test_results": host_results}

    except (ConnectTimeoutError, ConnectAuthError, Exception) as e:
        # --- PROGRESS UPDATE: Handle any failure during connection or execution ---
        error_message = f"An error occurred with host {hostname}: {e}"
        if isinstance(e, ConnectTimeoutError):
            error_message = f"Connection Timed Out for {hostname}. The host is unreachable."
        elif isinstance(e, ConnectAuthError):
            error_message = f"Authentication Failed for {hostname}. Please check credentials."

        # Mark the current step as FAILED.
        send_progress(
            "STEP_COMPLETE",
            {"step": connection_step, "status": "FAILED"},
            error_message
        )
        print(f"[ERROR] {error_message}", file=sys.stderr, flush=True)
        return {"hostname": hostname, "status": "error", "message": error_message}


# ====================================================================================
# SECTION 4: REPORT FORMATTING
# ====================================================================================
#
# This function formats the final JSON results into a human-readable text report.
#

def format_results_to_text(final_results):
    """
    @description Converts the final JSON result object into a formatted, human-readable
                 string with tables for easy reading.

    @param {dict} final_results - The structured JSON result object.
    @returns {str} A single string containing the full, formatted report.
    """
    from tabulate import tabulate
    report_parts = []

    generation_time = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')

    report_parts.append("==================================================")
    report_parts.append("           JSNAPy Test Results Report")
    report_parts.append("==================================================")
    report_parts.append(f"Generated on: {generation_time}\n")

    for host_result in final_results.get("results_by_host", []):
        hostname = host_result.get('hostname', 'Unknown Host')
        report_parts.append("\n" + "=" * 60)
        report_parts.append(f"  DEVICE: {hostname}")
        report_parts.append("=" * 60 + "\n")

        if host_result.get("status") == "error":
            report_parts.append(f"  [ERROR] Could not run tests on this host.\n  Reason: {host_result.get('message')}\n")
            continue

        if not host_result.get("test_results"):
             report_parts.append("  [INFO] No test results returned for this host.\n")
             continue

        for test_result in host_result.get("test_results", []):
            report_parts.append(f"--- TEST: {test_result.get('title', 'Untitled Test')} ---\n")
            if test_result.get("error"):
                report_parts.append(f"  [FAILED] Test execution failed: {test_result['error']}\n")
            elif not test_result.get("data"):
                report_parts.append("  [INFO] No data returned for this check.\n")
            else:
                table = tabulate(
                    test_result["data"],
                    headers="keys",
                    tablefmt="grid",
                    showindex=False
                )
                report_parts.append(table)
                report_parts.append("\n")

    return "\n".join(report_parts)


# ====================================================================================
# SECTION 5: MAIN ASYNCHRONOUS ORCHESTRATOR
# ====================================================================================
#
# This is the main control-flow function that orchestrates the entire script logic.
#

async def main_async(args):
    """
    @description The main asynchronous orchestrator. It handles test discovery, target
                 selection, parallel test execution, and saving results to a file.
    """
    import yaml

    script_dir = Path(__file__).parent
    test_definitions_path = script_dir / "tests.yaml"

    if not test_definitions_path.exists():
        raise FileNotFoundError(f"tests.yaml definition file not found in {script_dir}")
    with open(test_definitions_path, 'r') as f:
        all_tests = yaml.safe_load(f)

    # --- Mode 1: Test Discovery (No execution) ---
    if args.list_tests:
        categorized_tests = {}
        for test_name, test_def in all_tests.items():
            category = test_def.get("category", "General")
            if category not in categorized_tests:
                categorized_tests[category] = []
            categorized_tests[category].append({"id": test_name, "description": test_def.get("title", "No description.")})
        return {"success": True, "discovered_tests": categorized_tests}

    # --- Mode 2: Test Execution ---
    hostnames = [h.strip() for h in args.hostname.split(',')]

    # Filter tests if the --tests argument is provided.
    tests_to_run = all_tests
    if args.tests:
        test_names_to_run = [t.strip() for t in args.tests.split(',')]
        tests_to_run = {name: all_tests[name] for name in test_names_to_run if name in all_tests}
        if not tests_to_run:
            raise ValueError(f"None of the requested tests found: {test_names_to_run}")

    # --- PROGRESS UPDATE: Announce the start of the entire operation ---
    # Total steps = 2 for each host (connect + execute)
    send_progress(
        "OPERATION_START",
        {"total_steps": len(hostnames) * 2},
        f"Starting JSNAPy run for {len(hostnames)} host(s)."
    )

    # Create an asynchronous task for each host.
    tasks = [
        asyncio.create_task(run_tests_on_host(host, args.username, args.password, tests_to_run, i + 1))
        for i, host in enumerate(hostnames)
    ]
    # Wait for all host tasks to complete.
    results_from_all_hosts = await asyncio.gather(*tasks)

    final_results = {"results_by_host": results_from_all_hosts, "success": True}

    # --- PROGRESS UPDATE: Announce completion of the entire operation ---
    send_progress(
        "OPERATION_COMPLETE",
        {"status": "SUCCESS"},
        "All operations completed."
    )

    # --- Optional: Save final report to a file ---
    if args.save_path:
        print("--- Save path provided. Attempting to generate and save report... ---", file=sys.stderr, flush=True)
        try:
            report_content = format_results_to_text(final_results)

            # Define output directory relative to the script's location
            pipeline_root_in_container = script_dir.parent.parent
            output_dir = pipeline_root_in_container / args.save_path
            output_dir.mkdir(parents=True, exist_ok=True)

            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            hostname_part = hostnames[0] if len(hostnames) == 1 else 'multiple-hosts'
            filename = f"jsnapy_report_{hostname_part}_{timestamp}.txt"
            filepath = output_dir / filename

            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(report_content)

            print(f"--- Report successfully saved to {filepath} ---", file=sys.stderr, flush=True)
        except Exception as e:
            # If saving fails, log the error but do not crash the script.
            print(f"[ERROR] Could not save report file: {e}", file=sys.stderr, flush=True)

    return final_results


# ====================================================================================
# SECTION 6: MAIN ENTRY POINT & ARGUMENT PARSING
# ====================================================================================
#
# This is the synchronous entry point that sets up and runs the async orchestrator.
#

def main():
    """
    The main synchronous entry point. It parses command-line arguments,
    validates them, and runs the main_async orchestrator.
    It handles all top-level exceptions and ensures a JSON output is always
    printed, whether it's a success or an error.
    """
    try:
        # --- Argument Parsing Setup ---
        parser = argparse.ArgumentParser(description="Parallel, Multi-Test Network Reporter")
        parser.add_argument("--hostname", help="Comma-separated list of target hostnames/IPs.")
        parser.add_argument("--username", help="Username for device access.")
        parser.add_argument("--password", help="Password for device access.")
        parser.add_argument("--tests", help="Optional: Comma-separated list of tests to run.")
        parser.add_argument("--list_tests", action="store_true", help="List available tests in JSON format and exit.")
        parser.add_argument("--save_path", help="Optional: Path to save the final results as a formatted text file.")
        parser.add_argument("--environment", default="development", help="Execution environment context (unused in this script but good practice).")

        args = parser.parse_args()

        # --- Argument Validation ---
        if not args.list_tests and not args.hostname:
            raise ValueError("A target hostname is required for test execution.")
        if not args.list_tests and (not args.username or not args.password):
            raise ValueError("Username and password are required for test execution.")

        # --- Run the Asynchronous Main Logic ---
        final_output = asyncio.run(main_async(args))

        # Print final JSON result to stdout for the backend to capture.
        print(json.dumps(final_output))

    except Exception as e:
        # ... (error handling can also be updated to print compact JSON) ...
        send_progress("OPERATION_COMPLETE", {"status": "FAILED"}, f"A critical script error occurred: {e}")
        error_output = {"success": False, "message": f"A critical script error occurred: {str(e)}"}

        # --- FIX FOR ERROR CASE ---
        print(json.dumps(error_output))

        print(f"CRITICAL ERROR: {traceback.format_exc()}", file=sys.stderr, flush=True)
        sys.exit(0)

if __name__ == "__main__":
    main()
