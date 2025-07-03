#!/usr/bin/env python3
"""
@file Dynamic Network Reporter v3.11 - Definitive Pathing
@description This final version uses a robust, __file__-based pathing method to reliably
             locate the inventory file, ensuring it works correctly within the Docker
             execution environment. It handles all targeting modes and error conditions.
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
                 It gracefully handles specific connection errors (Timeout, Auth) and
                 always returns a structured result object for this specific host.
    @param {str} hostname - The hostname or IP address of the target device.
    @param {str} username - The username for authentication.
    @param {str} password - The password for authentication.
    @param {dict} tests_to_run - A dictionary of test definitions to be executed.
    @returns {dict} A structured dictionary containing results or a specific error message.
    """
    from jnpr.junos import Device
    from jnpr.junos.exception import ConnectTimeoutError, ConnectAuthError

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
    except ConnectTimeoutError as e:
        error_message = f"Connection Timed Out. The host is unreachable. (Error: {e})"
        print(f"[ERROR] {error_message}", file=sys.stderr)
        return {"hostname": hostname, "status": "error", "message": error_message}
    except ConnectAuthError as e:
        error_message = f"Authentication Failed. Please check the username and password. (Error: {e})"
        print(f"[ERROR] {error_message}", file=sys.stderr)
        return {"hostname": hostname, "status": "error", "message": error_message}
    except Exception as e:
        error_message = f"An unexpected error occurred for this host: {e}"
        print(f"[ERROR] {error_message}", file=sys.stderr)
        return {"hostname": hostname, "status": "error", "message": error_message}


async def main_async(args):
    """
    @description The main asynchronous orchestrator. It now uses a reliable, __file__-based
                 method to locate and read the inventory file within the container.
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

    hostnames = []
    if args.inventory_file:
        print(f"--- Reading inventory from {args.inventory_file}... ---", file=sys.stderr)
        
        # This robustly finds the python_pipeline root from the script's location.
        # script_dir is /app/python-scripts/tools/jsnapy_runner
        # .parent.parent takes it up to /app/python-scripts
        # which is the mount point for the entire python_pipeline.
        pipeline_root_in_container = script_dir.parent.parent
        inventory_path = pipeline_root_in_container / "data" / args.inventory_file

        if not inventory_path.exists():
            raise FileNotFoundError(f"Inventory file not found at the expected path: {inventory_path}")
            
        with open(inventory_path, 'r') as f:
            inventory_data = yaml.safe_load(f)
        for location in inventory_data:
            for router in location.get("routers", []):
                if "ip_address" in router:
                    hostnames.append(router["ip_address"])
        if not hostnames:
            raise ValueError(f"No hosts with 'ip_address' found in {args.inventory_file}")
    elif args.hostname:
        hostnames = [h.strip() for h in args.hostname.split(',')]
    
    print(f"--- Targeting {len(hostnames)} host(s): {', '.join(hostnames)} ---", file=sys.stderr)
    
    if args.tests:
        test_names_to_run = [t.strip() for t in args.tests.split(',')]
        tests_to_run = {name: all_tests[name] for name in test_names_to_run if name in all_tests}
        if not tests_to_run:
            raise ValueError(f"None of the requested tests found: {test_names_to_run}")
    else:
        tests_to_run = all_tests

    tasks = [asyncio.create_task(run_tests_on_host(host, args.username, args.password, tests_to_run)) for host in hostnames]
    results_from_all_hosts = await asyncio.gather(*tasks)
    return {"status": "completed", "results_by_host": results_from_all_hosts}


def main():
    """
    @description The main entry point. It uses a flexible argument parsing strategy that
                 works for both discovery and execution (manual or inventory).
    """
    try:
        parser = argparse.ArgumentParser(description="Parallel, Multi-Test Network Reporter")
        
        parser.add_argument("--hostname", help="Comma-separated list of target hostnames/IPs.")
        parser.add_argument("--inventory_file", help="Filename of a YAML inventory file in the 'data' directory.")
        parser.add_argument("--username", help="Username for device access.")
        parser.add_argument("--password", help="Password for device access.")
        parser.add_argument("--tests", help="Optional: Comma-separated list of tests to run.")
        parser.add_argument("--list_tests", action="store_true", help="List available tests in JSON format.")
        parser.add_argument("--environment", default="development", help="Execution environment context.")

        args = parser.parse_args()

        if not args.list_tests and not args.hostname and not args.inventory_file:
            raise ValueError("A target is required. Provide either --hostname or --inventory_file.")
        if not args.list_tests and (not args.username or not args.password):
            raise ValueError("Username and password are required for execution.")

        final_output = asyncio.run(main_async(args))
        print(json.dumps(final_output, indent=2))

    except Exception as e:
        error_output = {"status": "error", "message": f"A critical script error occurred: {str(e)}"}
        print(json.dumps(error_output, indent=2))
        print(f"CRITICAL ERROR: {str(e)}", file=sys.stderr)
        sys.exit(0)

if __name__ == "__main__":
    main()
