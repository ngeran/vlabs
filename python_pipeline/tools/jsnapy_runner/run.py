#!/usr/bin/env python3
"""
Dynamic Network Reporter v3.0 - Parallel and Multi-Target
This script reads test definitions from a YAML file and runs them against
multiple hosts in parallel, printing a table for each result.
"""
import argparse
import sys
import json
import asyncio
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

def run_single_test(device, test_definition):
    """
    A generic function that runs ONE defined test against ONE connected device.
    Returns a tuple: (title, headers, table_data).
    """
    from tabulate import tabulate

    # 1. Get the RPC function from the device object
    rpc_to_call = getattr(device.rpc, test_definition['rpc'].replace('-', '_'))
    
    # 2. Execute the RPC, with or without arguments
    rpc_args = test_definition.get('rpc_args', {})
    xml_data = rpc_to_call(**rpc_args)

    # 3. Dynamically extract the data based on the definition
    table_data = []
    headers = list(test_definition['fields'].keys())
    
    for item in xml_data.findall(test_definition['xpath']):
        row = [item.findtext(xml_tag, "N/A") for xml_tag in test_definition['fields'].values()]
        table_data.append(row)

    # 4. Return the structured data for printing later
    title = f"{test_definition['title']} for {device.hostname}"
    return (title, headers, table_data)


async def run_tests_on_host(hostname, username, password, tests_to_run):
    """
    Async worker: Connects to ONE host and runs a LIST of tests against it.
    """
    from jnpr.junos import Device
    from jnpr.junos.exception import ConnectError
    from tabulate import tabulate

    print(f"\n--- Connecting to {hostname}... ---")
    try:
        with Device(host=hostname, user=username, passwd=password, timeout=20) as dev:
            print(f"--- Connection successful to {hostname}. Running tests... ---")
            for test_name, test_def in tests_to_run.items():
                try:
                    title, headers, data = run_single_test(dev, test_def)
                    if not data:
                        print(f"\nNo data found for test '{test_name}' on {hostname}.\n")
                    else:
                        print(f"\n{title}:\n")
                        print(tabulate(data, headers=headers, tablefmt="grid"))
                        print("\n")
                except Exception as e:
                    print(f"\n[ERROR] Failed to run test '{test_name}' on {hostname}: {e}\n")

    except ConnectError as e:
        print(f"\n[ERROR] Could not connect to {hostname}: {e}. Check IP and credentials.\n")
    except Exception as e:
        print(f"\n[ERROR] An unexpected error occurred for {hostname}: {e}\n")


async def main_async(args):
    """
    Main asynchronous orchestrator.
    """
    import yaml
    
    # --- Load Test Definitions ---
    script_dir = Path(__file__).parent
    test_definitions_path = script_dir / "tests.yaml"
    if not test_definitions_path.exists():
        raise FileNotFoundError("tests.yaml definition file not found.")
    
    with open(test_definitions_path, 'r') as f:
        all_tests = yaml.safe_load(f)

    # --- Filter which tests to run ---
    if args.tests:
        test_names_to_run = [t.strip() for t in args.tests.split(',')]
        tests_to_run = {name: all_tests[name] for name in test_names_to_run if name in all_tests}
        if not tests_to_run:
            raise ValueError(f"None of the requested tests found in tests.yaml: {test_names_to_run}")
    else:
        # If --tests is not provided, run all defined tests
        tests_to_run = all_tests

    # --- Create and run tasks for each host in parallel ---
    hostnames = [h.strip() for h in args.hostname.split(',')]
    tasks = []
    for host in hostnames:
        task = asyncio.create_task(
            run_tests_on_host(host, args.username, args.password, tests_to_run)
        )
        tasks.append(task)
        
    await asyncio.gather(*tasks)


def main():
    """
    Main entry point: parses args and kicks off the async orchestrator.
    """
    # Using a global try/except to catch initial setup errors (e.g., bad args)
    # and produce a clean JSON error for the UI.
    try:
        # --- Argument Parsing ---
        # Note: We use a single 'hostname' argument that accepts comma-separated values.
        parser = argparse.ArgumentParser(description="Parallel, Multi-Test Network Reporter")
        parser.add_argument("--hostname", required=True, help="Single or comma-separated list of target hostnames/IPs")
        parser.add_argument("--username", required=True, help="SSH username")
        parser.add_argument("--password", required=True, help="SSH password")
        parser.add_argument("--tests", help="Optional: Comma-separated list of tests to run (e.g., test_bgp_summary,test_interfaces)")
        args = parser.parse_args()
        
        # --- Run the async main function ---
        asyncio.run(main_async(args))

    except Exception as e:
        # This safety net ensures that if anything goes wrong during setup,
        # the UI gets a clean error message instead of a crash.
        error_output = {"status": "error", "message": f"A critical script error occurred: {e}"}
        print(json.dumps(error_output, indent=2))
        sys.exit(0) # Exit cleanly

if __name__ == "__main__":
    main()
