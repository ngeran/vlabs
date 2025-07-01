#!/usr/bin/env python3
"""
@file Dynamic Network Reporter v3.3
@description This script reads test definitions from a YAML file, supports dynamic discovery
             for the UI by outputting a categorized JSON structure, and runs selected tests
             against multiple hosts in parallel using asyncio.
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
    @returns {tuple} A tuple containing (title, headers, table_data) for the test results.
    """
    from tabulate import tabulate

    # Dynamically get the RPC method from the device object
    rpc_to_call = getattr(device.rpc, test_definition['rpc'].replace('-', '_'))
    rpc_args = test_definition.get('rpc_args', {})
    xml_data = rpc_to_call(**rpc_args)

    table_data = []
    headers = list(test_definition['fields'].keys())

    # Iterate through the XML using the defined XPath to find each item
    for item in xml_data.findall(test_definition['xpath']):
        # Extract each field as defined in the test
        row = [item.findtext(xml_tag, "N/A") for xml_tag in test_definition['fields'].values()]
        table_data.append(row)

    title = f"{test_definition['title']} for {device.hostname}"
    return (title, headers, table_data)


async def run_tests_on_host(hostname, username, password, tests_to_run):
    """
    @description An asynchronous worker that connects to a single host and runs a list of tests against it.
                 Handles connection and test execution errors for the given host.
    @param {str} hostname - The hostname or IP address of the target device.
    @param {str} username - The username for authentication.
    @param {str} password - The password for authentication.
    @param {dict} tests_to_run - A dictionary of test definitions to be executed.
    """
    from jnpr.junos import Device
    from jnpr.junos.exception import ConnectError
    from tabulate import tabulate

    # This function's output is printed directly to stdout for real-time user feedback.
    # The final JSON output is for the frontend to confirm completion.
    print(f"\n--- Connecting to {hostname}... ---", file=sys.stderr)
    try:
        with Device(host=hostname, user=username, passwd=password, timeout=20) as dev:
            print(f"--- Connection successful to {hostname}. Running tests... ---", file=sys.stderr)
            for test_name, test_def in tests_to_run.items():
                try:
                    title, headers, data = run_single_test(dev, test_def)
                    if not data:
                        print(f"\n[INFO] No data found for test '{test_name}' on {hostname}.\n", file=sys.stderr)
                    else:
                        print(f"\n{title}:\n", file=sys.stderr)
                        print(tabulate(data, headers=headers, tablefmt="grid"), file=sys.stderr)
                        print("\n", file=sys.stderr)
                except Exception as e:
                    print(f"\n[ERROR] Failed to run test '{test_name}' on {hostname}: {e}\n", file=sys.stderr)

    except ConnectError as e:
        print(f"\n[ERROR] Could not connect to {hostname}: {e}\n", file=sys.stderr)
    except Exception as e:
        print(f"\n[ERROR] An unexpected error occurred for {hostname}: {e}\n", file=sys.stderr)


async def main_async(args):
    """
    @description The main asynchronous orchestrator. It loads test definitions and, based on
                 command-line arguments, either performs test discovery or runs tests in parallel.
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

    # --- UI Test Discovery Logic ---
    if args.list_tests:
        categorized_tests = {}
        for test_name, test_def in all_tests.items():
            category = test_def.get("category", "General")
            if category not in categorized_tests:
                categorized_tests[category] = []
            
            categorized_tests[category].append({
                "id": test_name,
                "description": test_def.get("title", "No description available.")
            })
        
        # This specific structure is what the useTestDiscovery hook expects.
        return {"discovered_tests": categorized_tests}

    # --- Test Execution Logic ---
    if args.tests:
        test_names_to_run = [t.strip() for t in args.tests.split(',')]
        tests_to_run = {name: all_tests[name] for name in test_names_to_run if name in all_tests}
        if not tests_to_run:
            raise ValueError(f"None of the requested tests found: {test_names_to_run}")
    else:
        tests_to_run = all_tests

    hostnames = [h.strip() for h in args.hostname.split(',')]
    tasks = [asyncio.create_task(run_tests_on_host(host, args.username, args.password, tests_to_run)) for host in hostnames]
    await asyncio.gather(*tasks)

    return {"status": "completed", "message": "All tasks finished. See console output for results."}


def main():
    """
    @description The main entry point for the script. It sets up and parses command-line
                 arguments, then calls the asynchronous main function to perform the work.
                 It handles top-level exceptions and prints the final JSON output.
    """
    try:
        parser = argparse.ArgumentParser(description="Parallel, Multi-Test Network Reporter")
        parser.add_argument("--hostname", help="Single or comma-separated list of target hostnames/IPs")
        parser.add_argument("--username", help="Username for device access.")
        parser.add_argument("--password", help="Password for device access.")
        parser.add_argument("--tests", help="Optional: Comma-separated list of tests to run")
        parser.add_argument("--list_tests", action="store_true", help="List available tests in JSON format for UI discovery")
        parser.add_argument(
            "--environment", 
            default="development", 
            help="The target environment (e.g., development, lab). Used for context by the backend."
        )
        
        args = parser.parse_args()

        if not args.list_tests and not args.hostname:
            raise ValueError("--hostname is required unless --list_tests is specified.")

        final_output = asyncio.run(main_async(args))
        # Print the final JSON object to stdout for the backend to capture.
        print(json.dumps(final_output, indent=2))

    except Exception as e:
        # On any critical failure, print a standardized JSON error message to stderr
        # and exit with a non-zero status code.
        error_output = {"status": "error", "message": str(e)}
        print(json.dumps(error_output, indent=2), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
