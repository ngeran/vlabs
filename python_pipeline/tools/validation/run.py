#!/usr/bin/env python3
# =============================================================================
# FILE:               python_pipeline/tools/validation/run.py
#
# DESCRIPTION:
#   An asynchronous backend script that serves as the engine for the JSNAPy
#   Validation Runner. It discovers and executes JSNAPy tests against Juniper
#   devices, streaming real-time progress back to the UI.
#
# KEY FEATURES:
#   - Real-Time Progress: Emits structured JSON to stdout for live UI updates.
#   - Dynamic Test Discovery: Lists available validation tests from a config file.
#   - Conforms to Runner Contract: Accepts `--list_tests` and `--tests` arguments
#     to integrate seamlessly with the generic backend execution service.
#   - Asynchronous Execution: Runs validations on multiple hosts concurrently.
#
# DEPENDENCIES:
#   - jnpr.junos: The PyEZ library for connecting to Juniper devices.
#   - jnpr.jsnapy: The core JSNAPy library for snapshot testing.
#   - PyYAML: For parsing the test definition file.
#
# HOW TO USE:
#   This script is not intended for direct manual execution. It is called by the
#   Node.js backend service, which supplies the necessary command-line arguments.
#   - For discovery: `python run.py --list_tests`
#   - For execution: `python run.py --hostname <ip> --username <user> --password <pass> --tests <test1,test2>`
# =============================================================================

# =============================================================================
# SECTION 1: IMPORTS & INITIAL SETUP
# =============================================================================
import argparse
import sys
import json
import asyncio
from pathlib import Path
# =============================================================================
# SECTION 2: REAL-TIME PROGRESS REPORTING UTILITY
# =============================================================================
def send_progress(event_type, data, message=""):
    """Formats and prints a JSON progress update to stdout for the backend to capture."""
    progress_update = { "type": "progress", "event_type": event_type, "message": message, "data": data }
    print(f"{json.dumps(progress_update)}", file=sys.stdout, flush=True)

# =============================================================================
# SECTION 3: CORE JSNAPY EXECUTION LOGIC
# =============================================================================
def run_single_jsnapy_test(device, test_name, test_definition):
    """
    Executes a single JSNAPy test against a connected device.
    NOTE: This is a placeholder for actual JSNAPy logic. You would typically
    use the jnpr.jsnapy.SnapAdmin class here.
    """
    # Placeholder for a successful result.
    # In a real implementation, you would process the JSNAPy output here.
    return {
        "title": f"JSNAPy: {test_definition.get('title', test_name)}",
        "headers": ["Device", "Test", "Result", "Details"],
        "data": [{
            "Device": device.hostname,
            "Test": test_name,
            "Result": "Passed",
            "Details": "All checks passed successfully."
        }]
    }

async def run_validations_on_host(hostname, username, password, tests_to_run, all_test_defs, host_index):
    """Connects to a single host and runs all specified JSNAPy validations."""
    from jnpr.junos import Device
    from jnpr.junos.exception import ConnectTimeoutError, ConnectAuthError

    send_progress("STEP_START", {"step": host_index}, f"Connecting to {hostname} for validation...")
    try:
        with Device(host=hostname, user=username, passwd=password, timeout=20) as dev:
            send_progress("STEP_PROGRESS", {"step": host_index}, f"Connection successful. Running {len(tests_to_run)} validation(s)...")

            host_results = []
            for test_name in tests_to_run:
                if test_name in all_test_defs:
                    result = run_single_jsnapy_test(dev, test_name, all_test_defs[test_name])
                    host_results.append(result)

            send_progress("STEP_COMPLETE", {"step": host_index}, f"Validation finished for {hostname}.")
            # The key 'test_results' is used generically by the frontend table viewer.
            return {"hostname": hostname, "status": "success", "test_results": host_results}

    except (ConnectTimeoutError, ConnectAuthError, Exception) as e:
        error_message = f"An error occurred with host {hostname}: {e}"
        send_progress("STEP_COMPLETE", {"step": host_index, "status": "FAILED"}, error_message)
        return {"hostname": hostname, "status": "error", "message": error_message}

# =============================================================================
# SECTION 4: MAIN ASYNCHRONOUS ORCHESTRATOR
# =============================================================================
async def main_async(args):
    """Loads definitions, discovers tests, or orchestrates test execution."""
    import yaml
    script_dir = Path(__file__).parent
    test_definitions_path = script_dir / "tests.yml"

    if not test_definitions_path.exists():
        raise FileNotFoundError(f"Test definition file 'tests.yml' not found in {script_dir}")
    with open(test_definitions_path, 'r') as f:
        all_test_defs = yaml.safe_load(f)

    # --- Discovery Mode ---
    if args.list_tests:
        categorized_tests = {}
        for test_name, test_def in all_test_defs.items():
            category = test_def.get("category", "General")
            if category not in categorized_tests: categorized_tests[category] = []
            categorized_tests[category].append({"id": test_name, "description": test_def.get("title", "No description.")})
        return {"success": True, "discovered_tests": categorized_tests}

    # --- Execution Mode ---
    hostnames = [h.strip() for h in args.hostname.split(',')]
    test_names_to_run = [t.strip() for t in args.tests.split(',')]
    if not hostnames or not test_names_to_run:
        raise ValueError("Hostname and at least one test are required for execution.")

    send_progress("OPERATION_START", {"total_steps": len(hostnames)}, "Starting JSNAPy validation run...")
    tasks = [asyncio.create_task(run_validations_on_host(h, args.username, args.password, test_names_to_run, all_test_defs, i + 1)) for i, h in enumerate(hostnames)]
    results_from_all_hosts = await asyncio.gather(*tasks)
    final_results = {"results_by_host": results_from_all_hosts}
    send_progress("OPERATION_COMPLETE", {"status": "SUCCESS"}, "All operations completed.")
    return {"type": "result", "data": final_results}

# =============================================================================
# SECTION 5: MAIN ENTRY POINT & ARGUMENT PARSING
# =============================================================================
def main():
    """Parses command-line arguments and invokes the main async orchestrator."""
    try:
        parser = argparse.ArgumentParser(description="JSNAPy Validation Runner")
        parser.add_argument("--hostname", help="Target hostnames/IPs, comma-separated.")
        parser.add_argument("--username", help="Username for device access.")
        parser.add_argument("--password", help="Password for device access.")
        parser.add_argument("--tests", help="JSNAPy tests to run, comma-separated.")
        parser.add_argument("--list_tests", action="store_true", help="List available tests in JSON format.")
        parser.add_argument("--environment", default="development", help="Execution environment context.")
        args = parser.parse_args()

        final_output = asyncio.run(main_async(args))
        print(json.dumps(final_output))
    except Exception as e:
        error_message = f"A critical script error occurred: {str(e)}"
        send_progress("OPERATION_COMPLETE", {"status": "FAILED"}, error_message)
        error_output = {"type": "error", "message": error_message}
        print(json.dumps(error_output))
        sys.exit(1)

if __name__ == "__main__":
    main()
