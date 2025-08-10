#!/usr/bin/env python3
# ====================================================================================
#
# FILE:               reporting/run.py
#
# ROLE:               A comprehensive, asynchronous Network Report Generator.
#
# DESCRIPTION:
#   This script serves as the backend engine for the Network Reporting Tool. It can
#   target a single device or multiple devices from an inventory file.
#
#   It emits structured JSON progress updates to stdout for real-time frontend display.
#
# KEY FEATURES:
#   - Real-Time Progress: Emits JSON objects to stdout for live progress tracking.
#   - Dynamic Report Discovery: Can list all available report definitions.
#   - Parallel Execution: Uses asyncio to run reports on multiple hosts concurrently.
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
import traceback


# ====================================================================================
# SECTION 2: REAL-TIME PROGRESS REPORTING
# ====================================================================================
def send_progress(event_type, data, message=""):
    """
    @description Formats a progress update as a JSON object and prints it to stdout.
    """
    progress_update = {
        "type": "progress",
        "event_type": event_type,
        "message": message,
        "data": data
    }
    print(f"{json.dumps(progress_update)}", file=sys.stdout, flush=True)


# ====================================================================================
# SECTION 3: CORE REPORT EXECUTION LOGIC
# ====================================================================================

# MODIFICATION: Renamed function for clarity
def run_single_report_item(device, report_definition):
    """
    Executes a single, defined report item against a connected PyEZ device object.
    """
    rpc_to_call_name = report_definition['rpc'].replace('-', '_')
    rpc_to_call = getattr(device.rpc, rpc_to_call_name)
    rpc_args = report_definition.get('rpc_args', {})
    xml_data = rpc_to_call(**rpc_args)

    table_data = []
    headers = list(report_definition['fields'].keys())
    for item in xml_data.findall(report_definition['xpath']):
        row = {header: item.findtext(xml_tag, "N/A") for header, xml_tag in zip(headers, report_definition['fields'].values())}
        table_data.append(row)

    title = f"{report_definition.get('title', 'Untitled Report')} for {device.hostname}"
    # MODIFICATION: This structure MUST match what UniversalTableViewer expects
    return {"title": title, "headers": headers, "data": table_data, "error": None}


# MODIFICATION: Renamed function and variables for clarity
async def run_reports_on_host(hostname, username, password, reports_to_run, host_index):
    """
    Asynchronous worker to connect to a host and run a list of reports.
    """
    from jnpr.junos import Device
    from jnpr.junos.exception import ConnectTimeoutError, ConnectAuthError

    connection_step = (host_index * 2) - 1
    execution_step = host_index * 2

    send_progress("STEP_START", {"step": connection_step, "name": f"Connect to {hostname}"}, f"Connecting to {hostname}...")
    try:
        with Device(host=hostname, user=username, passwd=password, timeout=20) as dev:
            send_progress("STEP_COMPLETE", {"step": connection_step}, f"Successfully connected to {hostname}.")
            send_progress("STEP_START", {"step": execution_step, "name": f"Run Reports on {hostname}"}, f"Executing {len(reports_to_run)} reports on {hostname}...")

            host_results = []
            for report_name, report_def in reports_to_run.items():
                try:
                    report_result = run_single_report_item(dev, report_def)
                    host_results.append(report_result)
                except Exception as e:
                    host_results.append({"title": report_def.get('title', report_name), "error": str(e), "headers": [], "data": []})

            send_progress("STEP_COMPLETE", {"step": execution_step}, f"Finished all reports on {hostname}.")
            # MODIFICATION: Renamed 'test_results' to match what JSNAPy runner used, for frontend consistency
            return {"hostname": hostname, "status": "success", "test_results": host_results}

    except (ConnectTimeoutError, ConnectAuthError, Exception) as e:
        error_message = f"An error occurred with host {hostname}: {e}"
        send_progress("STEP_COMPLETE", {"step": connection_step, "status": "FAILED"}, error_message)
        return {"hostname": hostname, "status": "error", "message": error_message}


# ====================================================================================
# SECTION 4: MAIN ASYNCHRONOUS ORCHESTRATOR
# ====================================================================================

async def main_async(args):
    """
    Main orchestrator for report discovery, target selection, and execution.
    """
    import yaml

    script_dir = Path(__file__).parent
    # MODIFICATION: Load 'reports.yml' instead of 'tests.yaml'
    report_definitions_path = script_dir / "reports.yml"

    if not report_definitions_path.exists():
        raise FileNotFoundError(f"Report definition file 'reports.yml' not found in {script_dir}")
    with open(report_definitions_path, 'r') as f:
        all_reports = yaml.safe_load(f)

    # MODIFICATION: Handle '--list_reports' argument
    if args.list_reports:
        categorized_reports = {}
        for report_name, report_def in all_reports.items():
            category = report_def.get("category", "General")
            if category not in categorized_reports: categorized_reports[category] = []
            categorized_reports[category].append({"id": report_name, "description": report_def.get("title", "No description.")})
        # MODIFICATION: This key MUST be 'discovered_tests' to match the generic API handler
        return {"success": True, "discovered_tests": categorized_reports}

    hostnames = []
    if args.inventory_file:
        # Inventory parsing logic remains the same
        inventory_path = Path(args.inventory_file)
        if not inventory_path.is_file(): raise FileNotFoundError(f"Inventory file not found: {args.inventory_file}")
        with open(inventory_path, 'r') as f:
            inventory_data = yaml.safe_load(f)
            if isinstance(inventory_data, list):
                for location_item in inventory_data:
                    if 'routers' in location_item and isinstance(location_item['routers'], list):
                        for router in location_item['routers']:
                            if 'ip_address' in router: hostnames.append(router['ip_address'])
            else:
                raise ValueError("Inventory file format is not a list of locations as expected.")
    elif args.hostname:
        hostnames = [h.strip() for h in args.hostname.split(',')]

    if not hostnames:
        raise ValueError("No target hosts were provided.")

    reports_to_run = all_reports
    # MODIFICATION: Use the '--reports' argument to filter which reports to run
    if args.reports:
        report_names_to_run = [r.strip() for r in args.reports.split(',')]
        reports_to_run = {name: all_reports[name] for name in report_names_to_run if name in all_reports}
        if not reports_to_run: raise ValueError(f"None of the requested reports found: {report_names_to_run}")

    send_progress("OPERATION_START", {"total_steps": len(hostnames) * 2}, f"Starting report generation for {len(hostnames)} host(s).")
    tasks = [asyncio.create_task(run_reports_on_host(host, args.username, args.password, reports_to_run, i + 1)) for i, host in enumerate(hostnames)]
    results_from_all_hosts = await asyncio.gather(*tasks)
    final_results = {"results_by_host": results_from_all_hosts}
    send_progress("OPERATION_COMPLETE", {"status": "SUCCESS"}, "All operations completed.")

    return {"type": "result", "data": final_results}


# ====================================================================================
# SECTION 5: MAIN ENTRY POINT & ARGUMENT PARSING
# ====================================================================================
def main():
    """
    Main entry point. Parses arguments and runs the async orchestrator.
    """
    try:
        parser = argparse.ArgumentParser(description="Parallel Network Report Generator")
        parser.add_argument("--hostname", help="Comma-separated list of target hostnames/IPs.")
        parser.add_argument("--inventory_file", help="Path to a YAML inventory file.")
        parser.add_argument("--username", help="Username for device access.")
        parser.add_argument("--password", help="Password for device access.")
        # MODIFICATION: Changed '--tests' to '--reports'
        parser.add_argument("--reports", help="Optional: Comma-separated list of reports to run.")
        # MODIFICATION: Changed '--list_tests' to '--list_reports'
        parser.add_argument("--list_reports", action="store_true", help="List available reports in JSON format and exit.")
        parser.add_argument("--environment", default="development", help="Execution environment context.")
        args = parser.parse_args()

        if not args.list_reports and not args.hostname and not args.inventory_file:
            raise ValueError("A target hostname or an inventory file is required.")
        if not args.list_reports and (not args.username or not args.password):
            raise ValueError("Username and password are required.")

        final_output = asyncio.run(main_async(args))
        print(json.dumps(final_output))

    except Exception as e:
        error_message = f"A critical script error occurred: {str(e)}"
        send_progress("OPERATION_COMPLETE", {"status": "FAILED"}, error_message)
        error_output = {"type": "error", "message": error_message}
        print(json.dumps(error_output))
        print(f"CRITICAL ERROR: {traceback.format_exc()}", file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
