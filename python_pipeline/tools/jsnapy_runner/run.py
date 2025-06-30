#!/usr/bin/env python3
"""
Dynamic Network Reporter v3.2 - Final, Feature-Complete Version
This script reads test definitions from a YAML file, supports dynamic discovery
for the UI, and runs tests against multiple hosts in parallel.
"""
import argparse
import sys
import json
import asyncio
from pathlib import Path

def run_single_test(device, test_definition):
    """
    A generic function that runs ONE defined test against ONE connected device.
    Returns a tuple: (title, headers, table_data).
    """
    from tabulate import tabulate

    rpc_to_call = getattr(device.rpc, test_definition['rpc'].replace('-', '_'))
    rpc_args = test_definition.get('rpc_args', {})
    xml_data = rpc_to_call(**rpc_args)

    table_data = []
    headers = list(test_definition['fields'].keys())
    
    for item in xml_data.findall(test_definition['xpath']):
        row = [item.findtext(xml_tag, "N/A") for xml_tag in test_definition['fields'].values()]
        table_data.append(row)

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
    
    script_dir = Path(__file__).parent
    test_definitions_path = script_dir / "tests.yaml"
    if not test_definitions_path.exists():
        raise FileNotFoundError("tests.yaml definition file not found.")
    
    with open(test_definitions_path, 'r') as f:
        all_tests = yaml.safe_load(f)

    # --- THIS IS THE NEW DISCOVERY LOGIC ---
    if args.list_tests:
        # For discovery, we just format the test definitions for the UI hook
        discovered_tests = []
        for test_name, test_def in all_tests.items():
            discovered_tests.append({
                "name": test_name,
                "description": test_def.get("title", "No description"),
                "category": test_def.get("category", "General") 
            })
        return {"available_tests": discovered_tests}
    # --- END OF DISCOVERY LOGIC ---

    if args.tests:
        test_names_to_run = [t.strip() for t in args.tests.split(',')]
        tests_to_run = {name: all_tests[name] for name in test_names_to_run if name in all_tests}
        if not tests_to_run:
            raise ValueError(f"None of the requested tests found in tests.yaml: {test_names_to_run}")
    else:
        tests_to_run = all_tests

    hostnames = [h.strip() for h in args.hostname.split(',')]
    tasks = [asyncio.create_task(run_tests_on_host(host, args.username, args.password, tests_to_run)) for host in hostnames]
    await asyncio.gather(*tasks)
    
    # Since we print tables directly, we return a simple success message for the UI
    return {"status": "completed", "message": "All tasks finished. See raw output for results."}


def main():
    """
    Main entry point: parses args and kicks off the async orchestrator.
    """
    try:
        parser = argparse.ArgumentParser(description="Parallel, Multi-Test Network Reporter")
        parser.add_argument("--hostname", help="Single or comma-separated list of target hostnames/IPs")
        parser.add_argument("--username")
        parser.add_argument("--password")
        parser.add_argument("--tests", help="Optional: Comma-separated list of tests to run")
        # Add the list_tests argument for discovery
        parser.add_argument("--list_tests", action="store_true", help="List available tests in JSON format")
        args = parser.parse_args()
        
        # The script now requires a hostname unless it's in list_tests mode
        if not args.list_tests and not args.hostname:
            raise ValueError("--hostname is required unless --list_tests is specified.")

        final_output = asyncio.run(main_async(args))
        print(json.dumps(final_output, indent=2))

    except Exception as e:
        error_output = {"status": "error", "message": f"A critical script error occurred: {e}"}
        print(json.dumps(error_output, indent=2))
        sys.exit(0)

if __name__ == "__main__":
    main()
