#!/usr/bin/env python3
"""
@file Dynamic Network Reporter v3.5 - Corrected and Production Ready
@description A professional, parallel execution script for network tests. This version gracefully
             handles all connection errors (unreachable hosts, auth failures) by returning
             structured JSON results for each host, ensuring the main process never crashes.
@author nikos-geranios_vgi
"""
import argparse
import sys
import json
import asyncio
from pathlib import Path

def run_single_test(device, test_definition):
    """
    @description Executes a single, defined test against an already connected device object.
                 It dynamically calls the specified RPC and extracts data using XPath.
    @param {jnpr.junos.Device} device - An active PyEZ Device object.
    @param {dict} test_definition - A dictionary containing the test's 'rpc', 'xpath', and 'fields'.
    @returns {dict} A dictionary containing the structured results for a single test.
    """
    from tabulate import tabulate
    rpc_to_call = getattr(device.rpc, test_definition['rpc'].replace('-', '_'))
    rpc_args = test_definition.get('rpc_args', {})
    xml_data = rpc_to_call(**rpc_args)
    table_data = []
    headers = list(test_definition['fields'].keys())
    for item in xml_data.findall(test_definition['xpath']):
        row = {header: item.findtext(xml_tag, "N/A") for header, xml_tag in zip(headers, test_definition['fields'].values())}
        table_data.append(row)
    title = f"{test_definition['title']} for {device.hostname}"
    return {"title": title, "headers": headers, "data": table_data, "error": None}


async def run_tests_on_host(hostname, username, password, tests_to_run):
    """
    @description An asynchronous worker that connects to a single host and runs a list of tests.
                 It now gracefully handles ALL connection errors and always returns a
                 structured result object for this specific host, which the UI can render.
    @param {str} hostname - The hostname or IP address of the target device.
    @param {str} username - The username for authentication.
    @param {str} password - The password for authentication.
    @param {dict} tests_to_run - A dictionary of test definitions to be executed.
    @returns {dict} A structured dictionary containing results or a specific error message.
    """
    from jnpr.junos import Device
    from jnpr.junos.exception import ConnectError

    print(f"--- Connecting to {hostname}... ---", file=sys.stderr)
    try:
        with Device(host=hostname, user=username, passwd=password, timeout=10) as dev:
            print(f"--- Connection successful to {hostname}. Running tests... ---", file=sys.stderr)
            
            host_results = []
            for test_name, test_def in tests_to_run.items():
                try:
                    test_result = run_single_test(dev, test_def)
                    host_results.append(test_result)
                except Exception as e:
                    print(f"\n[ERROR] Test '{test_name}' failed on {hostname}: {e}\n", file=sys.stderr)
                    host_results.append({"title": test_def.get('title', test_name), "error": str(e), "headers": [], "data": []})

            return {"hostname": hostname, "status": "success", "test_results": host_results}

    # --- ✨ THE ELEGANT AND CORRECT FIX IS HERE ✨ ---
    # Instead of just printing, we now RETURN a structured error dictionary.
    # This prevents the function from returning None and breaking the UI.
    except ConnectError as e:
        error_message = f"Connection Failed. Please check host reachability and credentials. (Error: {e})"
        print(f"[ERROR] {error_message}", file=sys.stderr)
        return {"hostname": hostname, "status": "error", "message": error_message}
    except Exception as e:
        error_message = f"An unexpected error occurred: {e}"
        print(f"[ERROR] {error_message}", file=sys.stderr)
        return {"hostname": hostname, "status": "error", "message": error_message}


async def main_async(args):
    """
    @description The main asynchronous orchestrator. It now gathers a list of structured
                 result objects (a mix of successes and failures) from all host workers.
    @param {argparse.Namespace} args - The parsed command-line arguments.
    @returns {dict} A dictionary containing the final structured output for the frontend.
    """
    import yaml
    script_dir = Path(__file__).parent
    test_definitions_path = script_dir / "tests.yaml"
    if not test_definitions_path.exists():
        raise FileNotFoundError(f"tests.yaml definition file not found in {script_dir}")
    with open(test_definitions_path, 'r') as f:
        all_tests = yaml.safe_load(f)

    if args.list_tests:
        categorized_tests = {}
        for test_name, test_def in all_tests.items():
            category = test_def.get("category", "General")
            if category not in categorized_tests:
                categorized_tests[category] = []
            categorized_tests[category].append({"id": test_name, "description": test_def.get("title", "No description.")})
        return {"discovered_tests": categorized_tests}

    if args.tests:
        test_names_to_run = [t.strip() for t in args.tests.split(',')]
        tests_to_run = {name: all_tests[name] for name in test_names_to_run if name in all_tests}
        if not tests_to_run:
            raise ValueError(f"None of the requested tests found: {test_names_to_run}")
    else:
        tests_to_run = all_tests

    hostnames = [h.strip() for h in args.hostname.split(',')]
    tasks = [asyncio.create_task(run_tests_on_host(host, args.username, args.password, tests_to_run)) for host in hostnames]
    
    # This now safely gathers all result objects because every task is guaranteed to return a dictionary.
    results_from_all_hosts = await asyncio.gather(*tasks)

    return {"status": "completed", "results_by_host": results_from_all_hosts}


def main():
    """
    @description The main entry point. It handles argument parsing and top-level setup
                 exceptions, ensuring the script always exits cleanly with structured
                 JSON output that the UI can understand.
    """
    # This try/except block is for catastrophic errors, not operational ones.
    try:
        parser = argparse.ArgumentParser(description="Parallel, Multi-Test Network Reporter")
        parser.add_argument("--hostname", help="Single or comma-separated list of target hostnames/IPs")
        parser.add_argument("--username", help="Username for device access.")
        parser.add_argument("--password", help="Password for device access.")
        parser.add_argument("--tests", help="Optional: Comma-separated list of tests to run")
        parser.add_argument("--list_tests", action="store_true", help="List available tests in JSON format")
        parser.add_argument("--environment", default="development", help="Execution environment context.")
        
        args = parser.parse_args()
        if not args.list_tests and not args.hostname:
            raise ValueError("--hostname is required unless --list_tests is specified.")
            
        final_output = asyncio.run(main_async(args))
        print(json.dumps(final_output, indent=2))

    except Exception as e:
        error_output = {"status": "error", "message": f"A critical script setup error occurred: {str(e)}"}
        print(json.dumps(error_output, indent=2))
        print(f"CRITICAL ERROR: {str(e)}", file=sys.stderr)
        sys.exit(0)

if __name__ == "__main__":
    main()
