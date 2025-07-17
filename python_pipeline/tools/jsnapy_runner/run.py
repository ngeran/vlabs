#!/usr/bin/env python3
# ====================================================================================
#
# FILE: jsnapy_runner/run.py (v3.17 - Logic Restored)
#
# ROLE: A comprehensive, asynchronous JSNAPy test runner.
#
# DESCRIPTION: This script serves as the backend engine for the JSNAPy Auditing Tool.
#              This definitive version RESTORES the correct test execution logic that
#              was accidentally removed in the previous version, ensuring that tests
#              are properly run against target devices. It retains the robust,
#              fail-safe mechanism for saving human-readable reports.
#
# AUTHOR: nikos-geranios_vgi
#
# ====================================================================================


# ====================================================================================
# SECTION 1: IMPORTS & INITIAL SETUP
# ====================================================================================
import argparse
import sys
import json
import asyncio
from pathlib import Path
from datetime import datetime
import traceback

# Note: The following PyEZ/Tabulate imports are within functions to avoid loading them
# when not needed (e.g., PyEZ is not needed for `--list_tests`).


# ====================================================================================
# SECTION 2: CORE TEST EXECUTION LOGIC
# ====================================================================================

def run_single_test(device, test_definition):
    """
    @description Executes a single, defined test against an already connected device object.
                 It dynamically calls the specified RPC and extracts data using XPath.
    @param {jnpr.junos.Device} device - An active PyEZ Device object.
    @param {dict} test_definition - A dictionary containing the test's 'rpc', 'xpath', and 'fields'.
    @returns {dict} A dictionary containing the structured results for a single test.
    """
    # This import is here because it's only needed during test execution.

    rpc_to_call_name = test_definition['rpc'].replace('-', '_')
    rpc_to_call = getattr(device.rpc, rpc_to_call_name)
    rpc_args = test_definition.get('rpc_args', {})
    xml_data = rpc_to_call(**rpc_args)

    table_data = []
    headers = list(test_definition['fields'].keys())
    for item in xml_data.findall(test_definition['xpath']):
        row = {header: item.findtext(xml_tag, "N/A") for header, xml_tag in zip(headers, test_definition['fields'].values())}
        table_data.append(row)

    title = f"{test_definition.get('title', 'Untitled Test')} for {device.hostname}"
    return {"title": title, "headers": headers, "data": table_data, "error": None}


async def run_tests_on_host(hostname, username, password, tests_to_run):
    """
    @description An asynchronous worker that connects to a single host and runs a list of tests.
                 It gracefully handles specific connection errors and always returns a
                 structured result object for this specific host.
    @returns {dict} A structured dictionary containing results or a specific error message.
    """
    # These imports are here because they are only needed for the connection task.
    from jnpr.junos import Device
    from jnpr.junos.exception import ConnectTimeoutError, ConnectAuthError

    print(f"--- Connecting to {hostname}... ---", file=sys.stderr)
    try:
        # The 'with' statement ensures the connection is properly closed.
        with Device(host=hostname, user=username, passwd=password, timeout=20) as dev:
            print(f"--- Connection successful to {hostname}. Running tests... ---", file=sys.stderr)
            host_results = []
            for test_name, test_def in tests_to_run.items():
                try:
                    test_result = run_single_test(dev, test_def)
                    host_results.append(test_result)
                except Exception as e:
                    # If a single test fails, record the error and continue with the next test.
                    print(f"\n[ERROR] Test '{test_name}' failed on {hostname}: {e}\n", file=sys.stderr)
                    host_results.append({"title": test_def.get('title', test_name), "error": str(e), "headers": [], "data": []})
            return {"hostname": hostname, "status": "success", "test_results": host_results}
    except ConnectTimeoutError as e:
        error_message = f"Connection Timed Out. The host is unreachable. (Error: {e})"
        print(f"[ERROR] {error_message}", file=sys.stderr)
        return {"hostname": hostname, "status": "error", "message": error_message}
    except ConnectAuthError as e:
        error_message = f"Authentication Failed. Please check the username and password. (Error: {e})"
        print(f"[ERROR] {error_message}", file=sys.stderr)
        return {"hostname": hostname, "status": "error", "message": error_message}
    except Exception as e:
        error_message = f"An unexpected error occurred for host {hostname}: {e}"
        print(f"[ERROR] {error_message}", file=sys.stderr)
        return {"hostname": hostname, "status": "error", "message": error_message}


# ====================================================================================
# SECTION 3: REPORT FORMATTING
# ====================================================================================

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
# SECTION 4: MAIN ASYNCHRONOUS ORCHESTRATOR
# ====================================================================================

async def main_async(args):
    """
    @description The main asynchronous orchestrator. It handles test discovery, target
                 selection, parallel test execution, and robustly saves results to a file.
    """
    import yaml

    script_dir = Path(__file__).parent
    test_definitions_path = script_dir / "tests.yaml"

    if not test_definitions_path.exists():
        raise FileNotFoundError(f"tests.yaml definition file not found in {script_dir}")
    with open(test_definitions_path, 'r') as f:
        all_tests = yaml.safe_load(f)

    # --- Mode 1: Test Discovery ---
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

    tests_to_run = all_tests
    if args.tests:
        test_names_to_run = [t.strip() for t in args.tests.split(',')]
        tests_to_run = {name: all_tests[name] for name in test_names_to_run if name in all_tests}
        if not tests_to_run:
            raise ValueError(f"None of the requested tests found: {test_names_to_run}")

    tasks = [asyncio.create_task(run_tests_on_host(host, args.username, args.password, tests_to_run)) for host in hostnames]
    results_from_all_hosts = await asyncio.gather(*tasks)

    final_results = {"results_by_host": results_from_all_hosts, "success": True}

    # --- Fail-Safe Save-to-File Logic ---
    if args.save_path:
        print("--- Save path provided. Attempting to generate and save report... ---", file=sys.stderr)
        try:
            report_content = format_results_to_text(final_results)

            pipeline_root_in_container = script_dir.parent.parent
            output_dir = pipeline_root_in_container / args.save_path
            output_dir.mkdir(parents=True, exist_ok=True)

            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            hostname_part = hostnames[0] if len(hostnames) == 1 else 'multiple-hosts'
            filename = f"jsnapy_report_{hostname_part}_{timestamp}.txt"
            filepath = output_dir / filename

            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(report_content)

            print(f"--- Report successfully saved to {filepath} ---", file=sys.stderr)
        except Exception:
            # If saving fails, log the detailed error but DO NOT crash the script.
            print("[ERROR] Could not save report file. The test results below are still valid.", file=sys.stderr)

    return final_results


# ====================================================================================
# SECTION 5: MAIN ENTRY POINT & ARGUMENT PARSING
# ====================================================================================

def main():
    """
    The main synchronous entry point. Parses arguments and runs the async orchestrator.
    """
    try:
        parser = argparse.ArgumentParser(description="Parallel, Multi-Test Network Reporter")
        parser.add_argument("--hostname", help="Comma-separated list of target hostnames/IPs.")
        parser.add_argument("--username", help="Username for device access.")
        parser.add_argument("--password", help="Password for device access.")
        parser.add_argument("--tests", help="Optional: Comma-separated list of tests to run.")
        parser.add_argument("--list_tests", action="store_true", help="List available tests in JSON format and exit.")
        parser.add_argument("--save_path", help="Optional: Path to save the final results as a formatted text file.")
        parser.add_argument("--environment", default="development", help="Execution environment context.")

        args = parser.parse_args()

        if not args.list_tests and not args.hostname:
            raise ValueError("A target hostname is required.")
        if not args.list_tests and (not args.username or not args.password):
            raise ValueError("Username and password are required for test execution.")

        final_output = asyncio.run(main_async(args))
        print(json.dumps(final_output, indent=2))

    except Exception as e:
        error_output = {"success": False, "message": f"A critical script error occurred: {str(e)}"}
        print(json.dumps(error_output, indent=2))
        print(f"CRITICAL ERROR: {traceback.format_exc()}", file=sys.stderr)
        sys.exit(0)

if __name__ == "__main__":
    main()
