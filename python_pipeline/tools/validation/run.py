#!/usr/bin/env python3
# =============================================================================
# FILENAME:           run.py
#
# ROLE:               Asynchronous JSNAPy-based Network Validation with a
#                     Universal Table Formatter (adapts columns to the test).
#
# DESCRIPTION:
#   Connects to network devices, executes pre-defined JSNAPy tests, and prints
#   structured results. The Universal Table Formatter auto-detects the kind of
#   test (e.g., BGP peers, Interface errors) and renders an appropriate single
#   consolidated table. Falls back to a generic table for other tests.
#
# DEPENDENCIES:
#   - jnpr.junos (PyEZ)
#   - jnpr.jsnapy
#   - PyYAML
#   - asyncio
#   - tabulate
#
# USAGE:
#   Discovery: python run.py --list_tests
#   Current:   python run.py --hostname <ip[,ip2,...]> --username <user> --password <pass> --tests <test_id>
#   Snapshot:  python run.py --hostname <ip> --username <user> --password <pass> --tests <test_id> --mode snapshot --snapshot-name <name>
#   Compare:   python run.py --hostname <ip> --username <user> --password <pass> --tests <test_id> --mode compare --snapshot-name <post> --compare-with <pre>
#
# NOTE:
#   --tests expects the test ID defined in tests.yml (not a filename).
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

DEBUG_ENABLED = False

def dprint(msg):
    """Debug print function that only prints when DEBUG_ENABLED is True."""
    if DEBUG_ENABLED:
        print(f"DEBUG: {msg}", file=sys.stderr)

# =============================================================================
# SECTION 2: PROGRESS REPORTING
# =============================================================================
def send_progress(event_type, data, message=""):
    """Send progress updates in JSON format."""
    progress = {
        "type": "progress",
        "event_type": event_type,
        "data": data,
        "message": message,
    }
    print(json.dumps(progress), flush=True)

# =============================================================================
# SECTION 3: SAFETY/FORMAT HELPERS
# =============================================================================
def sanitize_text(text):
    """Clean text for safe display in tables and output."""
    if not isinstance(text, str):
        text = str(text)
    text = text.replace('<', '[').replace('>', ']')
    text = text.replace('&', ' and ')
    text = text.replace('"', "'")
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def format_bgp_details(details):
    """Format BGP-specific details for better readability."""
    if not details or not isinstance(details, str):
        return details

    bgp_pattern = r'BGP peer\s+<?([\d\.]+)>?\s+AS<?(\d+)>?\s+is\s+(\w+)'
    match = re.search(bgp_pattern, details, re.IGNORECASE)
    if match:
        peer_ip = match.group(1)
        as_number = match.group(2)
        status = match.group(3)
        return f"BGP Peer: {peer_ip} | AS: {as_number} | Status: {status.upper()}"

    return sanitize_text(details)

def create_result_table(test_name, test_title, raw_results):
    """Create standardized result table structure."""
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

    for result in raw_results:
        check_name = sanitize_text(result.get("Check", "Unknown Check"))
        status = str(result.get("Result", "UNKNOWN")).upper()
        details = result.get("Details", "")

        if "bgp" in (test_name or "").lower() and details:
            details = format_bgp_details(details)
        else:
            details = sanitize_text(details)

        table_data["rows"].append({
            "Check": check_name,
            "Status": status,
            "Details": details,
            "Timestamp": ""
        })

    return table_data

def build_structured_fields_table(test_result):
    """Convert JSNAPy raw test_results into structured rows."""
    columns = ["Object", "Peer AS", "Node", "Expected", "Actual", "Status", "Message"]
    rows = []

    raw_list = test_result.get("raw", [])
    if not raw_list:
        return columns, rows

    def pick_object(pre: dict, post: dict):
        """Extract the most relevant object identifier."""
        keys = [
            "peer-address", "ldp-neighbor-address", "destination-address",
            "interface-name", "table-name", "name", "id", "neighbor-id",
            "filesystem-name", "command"
        ]
        for k in keys:
            if post and k in post:
                return post.get(k)
            if pre and k in pre:
                return pre.get(k)

        # Fallback to first available value
        if post:
            try:
                return next(iter(post.values()))
            except StopIteration:
                pass
        if pre:
            try:
                return next(iter(pre.values()))
            except StopIteration:
                pass
        return ""

    for r in raw_list:
        test_results = r.get("test_results", {})
        if not isinstance(test_results, dict):
            continue

        for command, command_results in test_results.items():
            if not isinstance(command_results, list):
                continue

            for trd in command_results:
                if not isinstance(trd, dict):
                    continue

                node_name = trd.get("node_name") or ""
                expected_default = trd.get("expected_node_value")

                def process_item(item, status):
                    pre = item.get("pre", {}) or {}
                    post = item.get("post", {}) or {}

                    obj = pick_object(pre, post)
                    peer_as = post.get("peer-as", "")

                    expected = expected_default
                    if expected is None:
                        expected = pre.get(node_name)
                        if expected is None and pre:
                            try:
                                expected = next(iter(pre.values()))
                            except StopIteration:
                                expected = ""

                    actual = item.get("actual_node_value")
                    if actual is None:
                        actual = post.get(node_name)
                        if actual is None and post:
                            try:
                                actual = next(iter(post.values()))
                            except StopIteration:
                                actual = ""

                    message = item.get("message") or item.get("err") or ""

                    rows.append([
                        str(obj or ""), str(peer_as or ""), str(node_name or ""),
                        "" if expected is None else str(expected),
                        "" if actual is None else str(actual),
                        status, message
                    ])

                for it in trd.get("passed", []):
                    process_item(it, "PASSED")
                for it in trd.get("failed", []):
                    process_item(it, "FAILED")

    return columns, rows

# =============================================================================
# SECTION 4: JSNAPY ENVIRONMENT SETUP
# =============================================================================
def prepare_jsnapy_env(source_test_file: Path, jsnapy_home: Path):
    """Set up JSNAPy environment and configuration."""
    import shutil

    os.environ["JSNAPY_HOME"] = str(jsnapy_home)
    os.chdir(str(jsnapy_home))

    # Create required directories
    (jsnapy_home / 'snapshots').mkdir(parents=True, exist_ok=True, mode=0o777)
    tests_dir = jsnapy_home / 'tests'
    tests_dir.mkdir(parents=True, exist_ok=True, mode=0o777)

    # Copy test file
    target_test_file = tests_dir / source_test_file.name
    shutil.copy2(source_test_file, target_test_file)

    # Create JSNAPy configuration
    cfg = jsnapy_home / 'jsnapy.cfg'
    if not cfg.exists():
        with open(cfg, 'w') as f:
            f.write(f"""[DEFAULT]
snapshot_path = {jsnapy_home}/snapshots
test_path = {jsnapy_home}/tests
""")

    # Create logging configuration
    logy = jsnapy_home / 'logging.yml'
    if not logy.exists():
        with open(logy, 'w') as f:
            f.write(f"""version: 1
disable_existing_loggers: False
formatters:
  simple:
    format: '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
handlers:
  console:
    class: logging.StreamHandler
    level: WARNING
    formatter: simple
    stream: ext://sys.stdout
  file:
    class: logging.FileHandler
    level: INFO
    formatter: simple
    filename: {jsnapy_home}/jsnapy.log
root:
  level: WARNING
  handlers: [console, file]
loggers:
  jsnapy:
    level: INFO
    handlers: [console, file]
    propagate: no
""")

    # Create log file
    (jsnapy_home / 'jsnapy.log').touch(exist_ok=True, mode=0o666)

    return tests_dir

def resolve_test_file(test_name, test_def):
    """Resolve the path to the JSNAPy test file."""
    jsnapy_file_name = test_def.get("jsnapy_test_file")
    if not jsnapy_file_name:
        return None, f"Missing 'jsnapy_test_file' in tests.yml for test '{test_name}'"

    source_test_file = Path(__file__).parent / "tests" / jsnapy_file_name
    if not source_test_file.exists():
        return None, f"JSNAPy test file not found: {source_test_file}"

    return source_test_file, None

# =============================================================================
# SECTION 5: JSNAPY OPERATIONS (snapshot/compare/current)
# =============================================================================
def take_jsnapy_snapshot(device, test_name, test_def, snapshot_name):
    """Take a JSNAPy snapshot."""
    source_test_file, err = resolve_test_file(test_name, test_def)
    if err:
        error_result = [{"Check": f"{test_name} - Configuration Error", "Result": "ERROR", "Details": err}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), error_result)}

    original_cwd = os.getcwd()
    original_jsnapy_home = os.environ.get("JSNAPY_HOME")

    try:
        jsnapy_home = Path('/tmp/jsnapy')
        jsnapy_home.mkdir(parents=True, exist_ok=True, mode=0o777)
        tests_dir = prepare_jsnapy_env(source_test_file, jsnapy_home)

        from jnpr.jsnapy import SnapAdmin
        jsnapy = SnapAdmin()

        device_hostname = device.hostname
        try:
            device.open()
            facts = device.facts
            device_hostname = facts.get('hostname', device_hostname) or device_hostname
        except Exception:
            device_hostname = device_hostname or "device_under_test"

        jsnapy_test_basename = source_test_file.name
        test_config = {
            "hosts": [{
                "device": device_hostname,
                "username": device.user,
                "passwd": device.password,
                "hostname": device_hostname
            }],
            "tests": [jsnapy_test_basename]
        }

        # Save test configuration
        (jsnapy_home / f'snapshot_config_{test_name}_{snapshot_name}.yml').write_text(yaml.safe_dump(test_config))

        dprint(f"Using JSNAPy test file '{jsnapy_test_basename}'. Available: {[p.name for p in tests_dir.glob('*')]}")

        snap_result = jsnapy.snap(test_config, snapshot_name, dev=device)
        snapshot_files = list((jsnapy_home / 'snapshots').glob(f"{device_hostname}_{snapshot_name}_*"))

        if snap_result and any(getattr(r, 'result', None) == 'Passed' for r in snap_result):
            ok = [{"Check": f"{test_name} - Snapshot Taken", "Result": "SUCCESS",
                   "Details": f"Snapshot '{snapshot_name}' created. Files: {len(snapshot_files)}"}]
            return {"table": create_result_table(test_name, test_def.get("title", test_name), ok),
                    "raw": [{"snapshot_name": snapshot_name, "files_created": len(snapshot_files), "device": device_hostname}]}

        err = [{"Check": f"{test_name} - Snapshot Error", "Result": "ERROR",
                "Details": f"Failed to create snapshot '{snapshot_name}'"}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), err)}

    except Exception as e:
        err = [{"Check": f"{test_name} - Snapshot Exception", "Result": "ERROR",
                "Details": f"Snapshot operation failed: {e}"}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), err),
                "raw": [{"error": str(e), "traceback": traceback.format_exc()}]}
    finally:
        try:
            device.close()
        except Exception:
            pass
        os.chdir(original_cwd)
        if original_jsnapy_home is not None:
            os.environ["JSNAPY_HOME"] = original_jsnapy_home
        elif "JSNAPY_HOME" in os.environ:
            del os.environ["JSNAPY_HOME"]

def compare_jsnapy_snapshots(device, test_name, test_def, pre_snapshot, post_snapshot):
    """Compare two JSNAPy snapshots."""
    source_test_file, err = resolve_test_file(test_name, test_def)
    if err:
        error_result = [{"Check": f"{test_name} - Configuration Error", "Result": "ERROR", "Details": err}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), error_result)}

    original_cwd = os.getcwd()
    original_jsnapy_home = os.environ.get("JSNAPY_HOME")

    try:
        jsnapy_home = Path('/tmp/jsnapy')
        jsnapy_home.mkdir(parents=True, exist_ok=True, mode=0o777)
        tests_dir = prepare_jsnapy_env(source_test_file, jsnapy_home)

        from jnpr.jsnapy import SnapAdmin
        jsnapy = SnapAdmin()

        device_hostname = device.hostname
        try:
            device.open()
            facts = device.facts
            device_hostname = facts.get('hostname', device_hostname) or device_hostname
        except Exception:
            device_hostname = device_hostname or "device_under_test"

        jsnapy_test_basename = source_test_file.name
        test_config = {
            "hosts": [{
                "device": device_hostname,
                "username": device.user,
                "passwd": device.password,
                "hostname": device_hostname
            }],
            "tests": [jsnapy_test_basename]
        }

        # Verify snapshots exist
        pre_files = list((jsnapy_home / 'snapshots').glob(f"{device_hostname}_{pre_snapshot}_*"))
        post_files = list((jsnapy_home / 'snapshots').glob(f"{device_hostname}_{post_snapshot}_*"))

        if not pre_files:
            err = [{"Check": f"{test_name} - Pre-snapshot Missing", "Result": "ERROR",
                    "Details": f"Pre-snapshot '{pre_snapshot}' not found."}]
            return {"table": create_result_table(test_name, test_def.get("title", test_name), err)}

        if not post_files:
            err = [{"Check": f"{test_name} - Post-snapshot Missing", "Result": "ERROR",
                    "Details": f"Post-snapshot '{post_snapshot}' not found."}]
            return {"table": create_result_table(test_name, test_def.get("title", test_name), err)}

        check_result = jsnapy.check(test_config, pre_snapshot, post_snapshot, dev=device)

        formatted_data = []
        raw_data = []

        if check_result:
            for result in check_result:
                test_results = getattr(result, "test_results", {})
                raw_data.append({
                    "device": device_hostname,
                    "test_name": test_name,
                    "pre_snapshot": pre_snapshot,
                    "post_snapshot": post_snapshot,
                    "test_results": test_results,
                    "passed": getattr(result, "no_passed", 0),
                    "failed": getattr(result, "no_failed", 0),
                    "result": getattr(result, "result", "UNKNOWN")
                })

                if test_results:
                    for command, command_results in test_results.items():
                        if isinstance(command_results, list):
                            for trd in command_results:
                                if not isinstance(trd, dict):
                                    continue

                                for passed_item in trd.get("passed", []):
                                    msg = passed_item.get("message", "Comparison passed - no change detected")
                                    formatted_data.append({
                                        "Check": f"{test_name} - {trd.get('node_name', command)}",
                                        "Result": "NO CHANGE",
                                        "Details": msg
                                    })

                                for failed_item in trd.get("failed", []):
                                    msg = failed_item.get("message", failed_item.get("err", "Change detected"))
                                    formatted_data.append({
                                        "Check": f"{test_name} - {trd.get('node_name', command)}",
                                        "Result": "CHANGED",
                                        "Details": msg
                                    })
                else:
                    overall = "NO CHANGE" if getattr(result, "result", "") == "Passed" else "CHANGED"
                    formatted_data.append({
                        "Check": f"{test_name} - {getattr(result, 'device', device_hostname)}",
                        "Result": overall,
                        "Details": f"No Changes: {getattr(result,'no_passed',0)}, Changes Detected: {getattr(result,'no_failed',0)}"
                    })

        if not formatted_data:
            formatted_data = [{"Check": f"{test_name} - Comparison Complete", "Result": "NO DATA",
                               "Details": "Comparison completed but no interpretable results returned"}]

        return {"table": create_result_table(test_name, test_def.get("title", test_name), formatted_data),
                "raw": raw_data}

    except Exception as e:
        err = [{"Check": f"{test_name} - Comparison Exception", "Result": "ERROR", "Details": str(e)}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), err),
                "raw": [{"error": str(e), "traceback": traceback.format_exc()}]}
    finally:
        try:
            device.close()
        except Exception:
            pass
        os.chdir(original_cwd)
        if original_jsnapy_home is not None:
            os.environ["JSNAPY_HOME"] = original_jsnapy_home
        elif "JSNAPY_HOME" in os.environ:
            del os.environ["JSNAPY_HOME"]

def run_jsnapy_test(device, test_name, test_def):
    """Run a JSNAPy test in current mode."""
    source_test_file, err = resolve_test_file(test_name, test_def)
    if err:
        error_result = [{"Check": f"{test_name} - Configuration Error", "Result": "ERROR", "Details": err}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), error_result)}

    original_cwd = os.getcwd()
    original_jsnapy_home = os.environ.get("JSNAPY_HOME")

    try:
        jsnapy_home = Path('/tmp/jsnapy')
        jsnapy_home.mkdir(parents=True, exist_ok=True, mode=0o777)
        prepare_jsnapy_env(source_test_file, jsnapy_home)

        from jnpr.jsnapy import SnapAdmin
        jsnapy = SnapAdmin()

        device_hostname = device.hostname
        try:
            device.open()
            facts = device.facts
            device_hostname = facts.get('hostname', device_hostname) or device_hostname
        except Exception:
            device_hostname = device_hostname or "device_under_test"

        jsnapy_test_basename = source_test_file.name
        test_config = {
            "hosts": [{
                "device": device_hostname,
                "username": device.user,
                "passwd": device.password,
                "hostname": device_hostname
            }],
            "tests": [jsnapy_test_basename]
        }

        # Save test configuration for debugging
        (jsnapy_home / f'test_config_{test_name}.yml').write_text(yaml.safe_dump(test_config))

        # Try snapcheck; fallback to snap+check
        try:
            check_result = jsnapy.snapcheck(test_config, "current", dev=device)
        except Exception as snapcheck_error:
            dprint(f"snapcheck failed, trying snap+check: {snapcheck_error}")
            snap_result = jsnapy.snap(test_config, "current", dev=device)
            dprint(f"snap() fallback result: {snap_result}")
            check_result = jsnapy.check(test_config, "current", dev=device)

        # Process results to normalized table/raw
        formatted_data = []
        raw_data = []

        if check_result:
            for result in check_result:
                test_results = getattr(result, "test_results", {})
                raw_data.append({
                    "device": device_hostname,
                    "test_name": test_name,
                    "test_results": test_results,
                    "passed": getattr(result, "no_passed", 0),
                    "failed": getattr(result, "no_failed", 0),
                    "result": getattr(result, "result", "UNKNOWN")
                })

                if test_results:
                    for command, command_results in test_results.items():
                        if isinstance(command_results, list):
                            for trd in command_results:
                                if not isinstance(trd, dict):
                                    continue

                                for passed_item in trd.get("passed", []):
                                    message = passed_item.get("message", "Test passed")
                                    formatted_data.append({
                                        "Check": f"{test_name} - {trd.get('node_name', command)}",
                                        "Result": "PASSED",
                                        "Details": message
                                    })

                                for failed_item in trd.get("failed", []):
                                    message = failed_item.get("err", "Test failed")
                                    formatted_data.append({
                                        "Check": f"{test_name} - {trd.get('node_name', command)}",
                                        "Result": "FAILED",
                                        "Details": message
                                    })
                else:
                    overall = "PASSED" if getattr(result, "result", "") == "Passed" else "FAILED"
                    formatted_data.append({
                        "Check": f"{test_name} - {getattr(result, 'device', device_hostname)}",
                        "Result": overall,
                        "Details": f"Passed: {getattr(result,'no_passed',0)}, Failed: {getattr(result,'no_failed',0)}"
                    })

        if not formatted_data:
            formatted_data = [{"Check": f"{test_name} - No Results", "Result": "UNKNOWN",
                               "Details": "JSNAPy returned no interpretable test data"}]

        return {"table": create_result_table(test_name, test_def.get("title", test_name), formatted_data),
                "raw": raw_data}

    except Exception as e:
        err = [{"Check": f"{test_name} - Exception", "Result": "ERROR",
                "Details": f"JSNAPy test execution failed: {str(e)}"}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), err),
                "raw": [{"error": str(e), "traceback": traceback.format_exc()}]}
    finally:
        try:
            device.close()
        except Exception:
            pass
        os.chdir(original_cwd)
        if original_jsnapy_home is not None:
            os.environ["JSNAPY_HOME"] = original_jsnapy_home
        elif "JSNAPY_HOME" in os.environ:
            del os.environ["JSNAPY_HOME"]

# =============================================================================
# SECTION 6: SUMMARY TABLES
# =============================================================================
def format_summary_table(results):
    """Generate summary statistics table."""
    summary_data = []
    mode = results.get("summary", {}).get("mode", "current")

    for host_result in results.get("results_by_host", []):
        hostname = host_result["hostname"]
        status = host_result["status"]

        if status == "success":
            for test_result in host_result.get("test_results", []):
                rows = test_result["table"]["rows"]
                success_status = {"PASSED", "NO CHANGE", "SUCCESS"}
                issue_status = {"FAILED", "WARNING"}
                error_status = {"ERROR"}

                passed = sum(1 for r in rows if r["Status"] in success_status)
                failed = sum(1 for r in rows if r["Status"] in issue_status)
                errors = sum(1 for r in rows if r["Status"] in error_status)
                changed = sum(1 for r in rows if r["Status"] == "CHANGED")

                failed_col = failed + (changed if mode == "compare" else 0)
                overall_status = "PASS" if failed_col == 0 and errors == 0 else "FAIL"

                summary_data.append([
                    hostname,
                    test_result["table"]["title"] or test_result["table"]["test_name"],
                    passed, failed_col, errors, overall_status
                ])
        else:
            summary_data.append([hostname, "CONNECTION", 0, 1, 1, "FAIL"])

    headers = ["Host", "Test", "Passed", "Failed", "Errors", "Status"]
    return summary_data, headers

# =============================================================================
# SECTION 7: UNIVERSAL TABLE FORMATTER
# =============================================================================
def get_nested(dct, path):
    """Get nested dictionary value using dot notation path."""
    if not isinstance(dct, dict) or not path:
        return None

    cur = dct
    for key in str(path).split("/"):
        if key == "":
            continue
        if not isinstance(cur, dict) or key not in cur:
            return None
        cur = cur[key]
    return cur

def compute_host_counts(results):
    """Compute passed/failed counts per host."""
    per_host_counts = {}

    for host_result in results.get("results_by_host", []):
        hostname = host_result.get("hostname", "")
        passed = failed = 0

        for t in host_result.get("test_results", []) or []:
            for raw_item in t.get("raw", []) or []:
                tr = raw_item.get("test_results", {})
                for command, command_results in tr.items():
                    if not isinstance(command_results, list):
                        continue
                    for trd in command_results:
                        passed += len(trd.get("passed", []) or [])
                        failed += len(trd.get("failed", []) or [])

        per_host_counts[hostname] = {
            "passed": passed,
            "failed": failed,
            "overall": "PASS" if failed == 0 else "FAIL",
        }

    return per_host_counts

def build_unified_bgp_table(results, include_passed=True):
    """Build specialized table for BGP test results."""
    headers = ["Host", "Device", "Peer Address", "Peer AS", "State", "Result", "Message", "Host Overall", "Passed", "Failed"]
    rows = []
    per_host_counts = compute_host_counts(results)

    for host_result in results.get("results_by_host", []):
        hostname = host_result.get("hostname", "")
        counts = per_host_counts.get(hostname, {"passed": 0, "failed": 0, "overall": "PASS"})

        for t in host_result.get("test_results", []) or []:
            for raw_item in t.get("raw", []) or []:
                device_name = raw_item.get("device", hostname)
                tr = raw_item.get("test_results", {})

                for cmd, command_results in tr.items():
                    if "bgp" not in str(cmd).lower():
                        continue

                    if not isinstance(command_results, list):
                        continue

                    for trd in command_results:
                        # Process failed items
                        for item in trd.get("failed", []) or []:
                            if item.get("xpath_error"):
                                rows.append([hostname, device_name, "", "", "", "FAILED",
                                             "XPath returned no bgp-peer nodes",
                                             counts["overall"], counts["passed"], counts["failed"]])
                                continue

                            post = item.get("post") or {}
                            pre = item.get("pre") or {}
                            rows.append([hostname, device_name,
                                         str(post.get("peer-address") or pre.get("peer-address") or ""),
                                         str(post.get("peer-as") or pre.get("peer-as") or ""),
                                         str(post.get("peer-state") or pre.get("peer-state") or ""),
                                         "FAILED",
                                         item.get("message") or item.get("err") or "",
                                         counts["overall"], counts["passed"], counts["failed"]])

                        # Process passed items if requested
                        if include_passed:
                            for item in trd.get("passed", []) or []:
                                post = item.get("post") or {}
                                pre = item.get("pre") or {}
                                rows.append([hostname, device_name,
                                             str(post.get("peer-address") or pre.get("peer-address") or ""),
                                             str(post.get("peer-as") or pre.get("peer-as") or ""),
                                             str(post.get("peer-state") or pre.get("peer-state") or ""),
                                             "PASSED",
                                             item.get("message") or "",
                                             counts["overall"], counts["passed"], counts["failed"]])

    # If no BGP data found, add placeholder
    if not rows:
        for host_result in results.get("results_by_host", []):
            hostname = host_result.get("hostname", "")
            counts = per_host_counts.get(hostname, {"passed": 0, "failed": 0, "overall": "PASS"})
            rows.append([hostname, "", "", "", "", "PASS", "No BGP peer rows returned",
                         counts["overall"], counts["passed"], counts["failed"]])

    # Sort rows: hostname, then failures first, then by peer address
    rows.sort(key=lambda r: (r[0], 0 if r[5] == "FAILED" else 1, r[2]))

    return headers, rows

def build_unified_interface_errors_table(results, per_host_counts=None):
    """Build specialized table for interface error test results."""
    if per_host_counts is None:
        per_host_counts = compute_host_counts(results)

    headers = [
        "Host", "Interface", "Admin Status", "Oper Status",
        "Input Errors", "Input Drops", "Input Discards",
        "Output Errors", "Output Drops", "Carrier Transitions",
        "Result", "Message", "Host Overall", "Passed", "Failed"
    ]
    rows = []
    agg = {}

    for host_result in results.get("results_by_host", []):
        hostname = host_result.get("hostname", "")

        for t in host_result.get("test_results", []) or []:
            for raw_item in t.get("raw", []) or []:
                tr = raw_item.get("test_results", {})

                for cmd, command_results in tr.items():
                    if "interfaces extensive" not in str(cmd).lower():
                        continue

                    if not isinstance(command_results, list):
                        continue

                    for trd in command_results:
                        for bucket, status in (("failed", "FAILED"), ("passed", "PASSED")):
                            for item in trd.get(bucket, []) or []:
                                post = item.get("post") or {}
                                pre = item.get("pre") or {}
                                ifname = post.get("name") or pre.get("name") or ""

                                if not ifname:
                                    continue

                                host_map = agg.setdefault(hostname, {})
                                entry = host_map.setdefault(ifname, {"values": {}, "result": "PASSED", "messages": []})

                                def pick(path):
                                    """Pick value from post or pre snapshot."""
                                    valp = get_nested(post, path)
                                    if valp is not None:
                                        return valp
                                    return get_nested(pre, path)

                                # Extract interface statistics
                                entry["values"]["admin-status"] = post.get("admin-status") or pre.get("admin-status") or ""
                                entry["values"]["oper-status"] = post.get("oper-status") or pre.get("oper-status") or ""
                                entry["values"]["input-errors"] = pick("input-error-list/input-errors") or ""
                                entry["values"]["input-drops"] = pick("input-error-list/input-drops") or ""
                                entry["values"]["input-discards"] = pick("input-error-list/input-discards") or ""
                                entry["values"]["output-errors"] = pick("output-error-list/output-errors") or ""
                                entry["values"]["output-drops"] = pick("output-error-list/output-drops") or ""
                                entry["values"]["carrier-transitions"] = pick("output-error-list/carrier-transitions") or ""

                                msg = item.get("message") or item.get("err") or ""
                                if msg:
                                    entry["messages"].append(msg)

                                if status == "FAILED":
                                    entry["result"] = "FAILED"

    # Convert aggregated data to table rows
    for hostname, ifs in agg.items():
        counts = per_host_counts.get(hostname, {"passed": 0, "failed": 0, "overall": "PASS"})

        for ifname, entry in ifs.items():
            v = entry["values"]
            rows.append([
                hostname, ifname, str(v.get("admin-status", "")), str(v.get("oper-status", "")),
                str(v.get("input-errors", "")), str(v.get("input-drops", "")), str(v.get("input-discards", "")),
                str(v.get("output-errors", "")), str(v.get("output-drops", "")), str(v.get("carrier-transitions", "")),
                entry["result"], " | ".join(entry["messages"]) if entry["messages"] else "",
                counts.get("overall", "PASS"), counts.get("passed", 0), counts.get("failed", 0)
            ])

    # If no interface data found, add placeholder
    if not rows:
        for host_result in results.get("results_by_host", []):
            hostname = host_result.get("hostname", "")
            counts = per_host_counts.get(hostname, {"passed": 0, "failed": 0, "overall": "PASS"})
            rows.append([
                hostname, "", "", "", "", "", "", "", "", "",
                "PASS" if counts["failed"] == 0 else "ERROR",
                "No interface error rows returned",
                counts.get("overall", "PASS"), counts.get("passed", 0), counts.get("failed", 0)
            ])

    # Sort rows: hostname, then failures first, then by interface name
    rows.sort(key=lambda r: (r[0], 0 if r[10] == "FAILED" else 1, r[1]))

    return headers, rows

def build_universal_table(results):
    """Build universal table that adapts to the type of tests being run."""
    per_host_counts = compute_host_counts(results)

    # Determine what types of commands/tests are present
    cmds = set()
    tests_seen = set()

    for host_result in results.get("results_by_host", []):
        for t in host_result.get("test_results", []) or []:
            table = t.get("table", {}) or {}
            if table.get("test_name"):
                tests_seen.add(str(table["test_name"]).lower())

            for raw_item in t.get("raw", []) or []:
                tr = raw_item.get("test_results", {})
                for cmd in tr.keys():
                    cmds.add(str(cmd).lower().strip())

    # Choose specialized table format based on commands/tests
    if "show interfaces extensive" in cmds or any("interface_error" in ts or "interface_errors" in ts for ts in tests_seen):
        return build_unified_interface_errors_table(results, per_host_counts)

    if any("show bgp" in cmd for cmd in cmds) or any("bgp" in ts for ts in tests_seen):
        return build_unified_bgp_table(results, include_passed=True)

    # Generic fallback: flatten structured fields across all tests
    headers = ["Host", "Device", "Object", "Node", "Expected", "Actual", "Status", "Message", "Host Overall", "Passed", "Failed"]
    rows = []

    for host_result in results.get("results_by_host", []):
        hostname = host_result.get("hostname", "")
        counts = per_host_counts.get(hostname, {"passed": 0, "failed": 0, "overall": "PASS"})

        for t in host_result.get("test_results", []) or []:
            cols, frs = build_structured_fields_table(t)

            device = ""
            for raw_item in t.get("raw", []) or []:
                device = raw_item.get("device", "")
                break

            for fr in frs:
                obj = fr[0]; node = fr[2]; expected = fr[3]; actual = fr[4]; status = fr[5]; msg = fr[6]
                rows.append([
                    hostname, device, obj, node, expected, actual, status, msg,
                    counts.get("overall", "PASS"), counts.get("passed", 0), counts.get("failed", 0)
                ])

    # If no data found, add placeholder
    if not rows:
        for host_result in results.get("results_by_host", []):
            hostname = host_result.get("hostname", "")
            counts = per_host_counts.get(hostname, {"passed": 0, "failed": 0, "overall": "PASS"})
            rows.append([hostname, "", "", "", "", "", "PASS", "No data",
                        counts["overall"], counts["passed"], counts["failed"]])

    # Sort rows: hostname, then failures first, then by object
    rows.sort(key=lambda r: (r[0], 0 if r[6] == "FAILED" else 1, r[2]))

    return headers, rows

# =============================================================================
# SECTION 8: DISPLAY RESULTS (uses Universal Table)
# =============================================================================
def display_results(results, args=None):
    """Display formatted results using the universal table formatter."""
    tablefmt = getattr(args, "format", "grid") if args else "grid"
    show_raw = getattr(args, "show_raw", False) if args else False
    max_rows = getattr(args, "max_rows", 0) if args else 0
    truncate_len = getattr(args, "truncate_details", 120) if args else 120

    def trunc(s, n):
        """Truncate string to specified length."""
        if s is None:
            return ""
        s = str(s)
        return s if n <= 0 or len(s) <= n else s[: max(0, n - 1)] + "…"

    # Print header
    print("\n" + "=" * 80)
    print("TEST EXECUTION SUMMARY".center(80))
    print("=" * 80)
    print(f"Total Hosts: {results['summary']['total_hosts']}")
    print(f"Passed Hosts: {results['summary']['passed_hosts']}")
    print(f"Total Tests Executed: {results['summary']['total_tests']}")
    print(f"Mode: {results['summary'].get('mode', 'current')}")
    print("=" * 80 + "\n")

    # Build and display universal table
    headers, rows = build_universal_table(results)

    # Truncate Message column if present
    if "Message" in headers:
        msg_idx = headers.index("Message")
        rows = [r[:msg_idx] + [trunc(r[msg_idx], truncate_len)] + r[msg_idx + 1:] for r in rows]

    # Apply row limit if specified
    display_rows = rows if max_rows <= 0 else rows[:max_rows]

    print(tabulate(display_rows, headers=headers, tablefmt=tablefmt, showindex=False))

    # Show raw data if requested
    if show_raw:
        print("\nRaw Data:")
        print(json.dumps(results["results_by_host"], indent=2))

    # Print footer
    print("\n" + "=" * 80)
    print("EXECUTION COMPLETE".center(80))
    print("=" * 80)

# =============================================================================
# SECTION 9: ASYNC VALIDATION PER HOST
# =============================================================================
async def validate_host(hostname, username, password, tests, test_defs, host_index, mode="current", snapshot_name=None, compare_with=None):
    """Validate a single host with the specified tests."""
    connection_step, execution_step = (host_index * 2) - 1, host_index * 2

    send_progress("STEP_START", {"step": connection_step, "name": f"Connect to {hostname}"}, f"Connecting to {hostname}...")

    try:
        with Device(host=hostname, user=username, passwd=password, timeout=30) as dev:
            send_progress("STEP_COMPLETE", {"step": connection_step}, f"Successfully connected to {hostname}.")

            if mode == "snapshot":
                send_progress("STEP_START", {"step": execution_step, "name": f"Take Snapshots on {hostname}"},
                             f"Taking {len(tests)} snapshots on {hostname}...")
            elif mode == "compare":
                send_progress("STEP_START", {"step": execution_step, "name": f"Compare Snapshots on {hostname}"},
                             f"Comparing {len(tests)} snapshots on {hostname}...")
            else:
                send_progress("STEP_START", {"step": execution_step, "name": f"Run Validations on {hostname}"},
                             f"Executing {len(tests)} tests on {hostname}...")

            host_results = []
            for test_name in tests:
                if test_name in test_defs:
                    if mode == "snapshot":
                        test_result = take_jsnapy_snapshot(dev, test_name, test_defs[test_name], snapshot_name)
                        status = "SUCCESS" if not any(row["Status"] == "ERROR" for row in test_result["table"]["rows"]) else "ERROR"
                        send_progress("TEST_COMPLETE", {
                            "host": hostname, "test": test_name, "status": status, "mode": "snapshot", "snapshot_name": snapshot_name
                        }, f"Snapshot {test_name} completed on {hostname}")

                    elif mode == "compare":
                        test_result = compare_jsnapy_snapshots(dev, test_name, test_defs[test_name], compare_with, snapshot_name)
                        status = "SUCCESS" if not any(row["Status"] == "ERROR" for row in test_result["table"]["rows"]) else "ERROR"
                        send_progress("TEST_COMPLETE", {
                            "host": hostname, "test": test_name, "status": status, "mode": "compare",
                            "pre_snapshot": compare_with, "post_snapshot": snapshot_name
                        }, f"Comparison {test_name} completed on {hostname}")

                    else:
                        test_result = run_jsnapy_test(dev, test_name, test_defs[test_name])
                        status = "SUCCESS" if not any(row["Status"] == "FAILED" for row in test_result["table"]["rows"]) else "WARNING"
                        send_progress("TEST_COMPLETE", {
                            "host": hostname, "test": test_name, "status": status, "mode": "current"
                        }, f"Test {test_name} completed on {hostname}")

                    host_results.append(test_result)

            send_progress("STEP_COMPLETE", {"step": execution_step}, f"Finished all operations on {hostname}.")

            return {
                "hostname": sanitize_text(hostname),
                "status": "success",
                "test_results": host_results,
                "mode": mode,
                "snapshot_name": snapshot_name,
                "compare_with": compare_with
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
# SECTION 10: MAIN ASYNC ORCHESTRATOR
# =============================================================================
async def main_async(args):
    """Main async orchestrator for running tests across multiple hosts."""
    tests_yml = Path(__file__).parent / "tests.yml"
    with open(tests_yml) as f:
        test_defs = yaml.safe_load(f)

    if args.list_tests:
        categorized = {}
        for test_id, details in test_defs.items():
            category = sanitize_text(details.get("category", "Uncategorized"))
            categorized.setdefault(category, []).append({
                "id": sanitize_text(test_id),
                "title": sanitize_text(details.get("title", test_id)),
                "description": sanitize_text(details.get("description", "No description provided.")),
                "category": category,
            })
        return {"success": True, "discovered_tests": categorized}

    hosts = [h.strip() for h in args.hostname.split(",")]
    tests_to_run = [t.strip() for t in args.tests.split(",")]
    mode = getattr(args, 'mode', 'current')
    snapshot_name = getattr(args, 'snapshot_name', None)
    compare_with = getattr(args, 'compare_with', None)

    # Validate mode parameters
    if mode == "snapshot" and not snapshot_name:
        raise ValueError("Snapshot mode requires --snapshot-name parameter")
    if mode == "compare" and (not snapshot_name or not compare_with):
        raise ValueError("Compare mode requires both --snapshot-name and --compare-with parameters")

    total_steps = len(hosts) * 2
    send_progress("OPERATION_START", {
        "total_steps": total_steps, "mode": mode, "snapshot_name": snapshot_name, "compare_with": compare_with
    }, f"Starting {'validation' if mode=='current' else 'snapshot comparison' if mode=='compare' else 'snapshot collection'} for {len(hosts)} host(s).")

    # Create and execute async tasks
    tasks = [
        validate_host(host, args.username, args.password, tests_to_run, test_defs, idx + 1, mode, snapshot_name, compare_with)
        for idx, host in enumerate(hosts)
    ]

    results = await asyncio.gather(*tasks)

    final_results = {
        "results_by_host": results,
        "summary": {
            "passed_hosts": sum(1 for r in results if r["status"] == "success"),
            "total_tests": len(tests_to_run) * len(hosts),
            "total_hosts": len(hosts),
            "tests_per_host": len(tests_to_run),
            "mode": mode,
            "snapshot_name": snapshot_name,
            "compare_with": compare_with
        },
    }

    return {"type": "result", "data": final_results}

# =============================================================================
# SECTION 11: CLI ENTRYPOINT
# =============================================================================
def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(description="Asynchronous Network Validation Tool with Universal Table Formatter")

    # Core parameters
    parser.add_argument("--hostname", help="Comma-separated device IPs")
    parser.add_argument("--username", help="Device login username")
    parser.add_argument("--password", help="Device login password")
    parser.add_argument("--tests", help="Comma-separated test IDs (from tests.yml)")
    parser.add_argument("--list_tests", action="store_true", help="List available tests")

    # Operation modes
    parser.add_argument("--mode", choices=["current", "snapshot", "compare"], default="current",
                        help="Operation mode")
    parser.add_argument("--snapshot-name", help="Name for snapshot (for snapshot/compare modes)")
    parser.add_argument("--compare-with", help="Pre-snapshot name (for compare mode)")

    # Output formatting options
    parser.add_argument("--format", choices=["grid", "github", "simple", "plain", "fancy_grid"], default="grid",
                        help="Table format for output")
    parser.add_argument("--show-raw", action="store_true", help="Include raw JSON payloads at the end")
    parser.add_argument("--max-rows", type=int, default=0, help="Max rows to print (0 = no limit)")
    parser.add_argument("--truncate-details", type=int, default=120, help="Truncate Message/Details columns (0 = no truncation)")

    # Debug options
    parser.add_argument("--debug", action="store_true", help="Enable debug prints")

    args = parser.parse_args()

    try:
        global DEBUG_ENABLED
        DEBUG_ENABLED = bool(args.debug)

        # Validate required parameters
        if not args.list_tests and (not args.hostname or not args.username or not args.password or not args.tests):
            raise ValueError("Hostname, username, password, and tests are required for a validation run.")

        if args.mode == "snapshot" and not args.snapshot_name:
            raise ValueError("Snapshot mode requires --snapshot-name parameter")

        if args.mode == "compare" and (not args.snapshot_name or not args.compare_with):
            raise ValueError("Compare mode requires both --snapshot-name and --compare-with parameters")

        # Run the async main function
        final_output = asyncio.run(main_async(args))

        # Display results if not just listing tests
        if not args.list_tests:
            send_progress("OPERATION_COMPLETE", {"status": "SUCCESS", "mode": args.mode}, "All operations completed.")
            display_results(final_output["data"], args)

        print(json.dumps(final_output))

    except Exception as e:
        error_message = f"A critical script error occurred: {sanitize_text(str(e))}"
        send_progress("OPERATION_COMPLETE", {"status": "FAILED"}, error_message)
        print(json.dumps({"type": "error", "message": error_message}))
        print(f"CRITICAL ERROR: {traceback.format_exc()}", file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
