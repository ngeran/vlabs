#!/usr/bin/env python3
# =============================================================================
# FILENAME:           run.py
# FVersion:           v21
#
# ROLE:
#   Asynchronous JSNAPy-based Network Validation with a Universal Table
#   Formatter that adapts columns to the test. It produces a compact BGP view
#   similar to "show bgp summary" and a dynamic, data-driven fallback for any
#   other test (e.g., system alarms, interfaces, etc.).
#
# DESCRIPTION:
#   - Connects to network devices using Junos PyEZ
#   - Executes JSNAPy tests (snapcheck), auto-falling back to snap+check
#   - Renders human-friendly result tables
#   - Specialized compact BGP table:
#       Host | Device | Peer Address | Peer AS | State | Flaps | Prefixes | Result
#   - Generic dynamic table for other tests; columns are inferred from result data
#   - Manages JSNAPY_HOME and writes a compatible jsnapy.cfg each run
#
# USAGE:
#   Discovery: python run.py --list_tests
#   Current:   python run.py --hostname <ip[,ip2,...]> --username <user> --password <pass> --tests <test_id>
#   Snapshot:  python run.py --hostname <ip> --username <user> --password <pass> --tests <test_id> --mode snapshot --snapshot-name <name>
#   Compare:   python run.py --hostname <ip> --username <user> --password <pass> --tests <test_id> --mode compare --snapshot-name <post> --compare-with <pre>
#
# KEY POINTS AND FIXES:
#   - JSNAPy config: Always writes /tmp/jsnapy/jsnapy.cfg with keys required by various JSNAPy versions:
#       snapshot_path, test_path, test_file_path, device_list, log_file_path
#   - No os.chdir; uses JSNAPY_HOME absolute paths for concurrency safety
#   - SnapAdmin APIs receive YAML CONFIG PATHS (not dicts) to avoid parsing quirks
#   - Device file prefixes use device.host; device.facts['hostname'] is used for display only
#   - BGP compact view shows a single, aggregated row per peer
#   - Generic fallback builds columns dynamically from JSNAPy result data (no hardcoded "Peer AS")
#   - Helpful --debug prints, including jsnapy.cfg contents, active table view, headers
# =============================================================================

import argparse
import asyncio
import json
import os
import re
import sys
import traceback
from pathlib import Path

from jnpr.junos import Device
from jnpr.junos.exception import ConnectAuthError, ConnectError, ConnectTimeoutError
from tabulate import tabulate
import yaml

DEBUG_ENABLED = False


def dprint(msg: str):
    """Print debug messages when --debug is set."""
    if DEBUG_ENABLED:
        print(f"DEBUG: {msg}", file=sys.stderr, flush=True)


def send_progress(event_type, data, message=""):
    """Send structured progress events for UIs/log parsers."""
    print(json.dumps({"type": "progress", "event_type": event_type, "data": data, "message": message}), flush=True)


# ----------------------- Generic format helpers --------------------------------
def sanitize_text(text):
    """Sanitize text for safe display in tables."""
    if not isinstance(text, str):
        text = str(text)
    text = text.replace('<', '[').replace('>', ']')  # avoid HTML-ish tags
    text = text.replace('&', ' and ')
    text = text.replace('"', "'")
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def get_nested(dct, path):
    """Access nested dict values using slash-separated keys (e.g., 'a/b/c')."""
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


def expand_placeholders(msg: str, item: dict):
    """Resolve JSNAPy message placeholders like <peer-address>, <bgp-rib/received-prefix-count>."""
    if not msg or not isinstance(msg, str):
        return msg
    pre = item.get("pre") or {}
    post = item.get("post") or {}
    ids = item.get("id") or {}

    def get_any(key: str):
        val = get_nested(post, key)
        if val is None:
            val = post.get(key)
        if val is None:
            val = get_nested(pre, key)
        if val is None:
            val = pre.get(key)
        if val is None:
            val = ids.get(key)
        return "" if val is None else str(val)

    def repl(m):
        token = m.group(1)
        if token.startswith("pre[") and token.endswith("]"):
            return str(pre.get(token[4:-1], ""))
        if token.startswith("post[") and token.endswith("]"):
            return str(post.get(token[5:-1], ""))
        return get_any(token)

    out = re.sub(r"<([^>]+)>", repl, msg)
    return sanitize_text(out)


def value_from_item(item: dict, key: str):
    """
    Return a value for 'key' from a JSNAPy test item, looking in order:
    post[key] (supports nested), pre[key] (nested), id[key] (flat).
    """
    pre = item.get("pre") or {}
    post = item.get("post") or {}
    ids = item.get("id") or {}

    val = get_nested(post, key)
    if val is None and key in post:
        val = post.get(key)

    if val is None:
        val = get_nested(pre, key)
    if val is None and key in pre:
        val = pre.get(key)

    if val is None:
        val = ids.get(key)

    return val


def create_result_table(test_name, test_title, raw_results):
    """Create a minimal per-test summary table (top box)."""
    table_data = {
        "test_name": sanitize_text(test_name),
        "title": sanitize_text(test_title),
        "columns": ["Check", "Status", "Details", "Timestamp"],
        "rows": []
    }
    if not raw_results or not isinstance(raw_results, list):
        table_data["rows"].append({"Check": f"{test_name} - No Data", "Status": "UNKNOWN", "Details": "No test results available", "Timestamp": ""})
        return table_data

    for result in raw_results:
        table_data["rows"].append({
            "Check": sanitize_text(result.get("Check", "Unknown Check")),
            "Status": str(result.get("Result", "UNKNOWN")).upper(),
            "Details": sanitize_text(result.get("Details", "")),
            "Timestamp": ""
        })
    return table_data


# ----------------------- JSNAPy environment setup ------------------------------
def prepare_jsnapy_env(source_test_file: Path, jsnapy_home: Path):
    """
    Configure JSNAPy to use /tmp/jsnapy with absolute paths and all required keys.
    Creates:
      - snapshots/, tests/, logs/, devices/
      - jsnapy.cfg: snapshot_path, test_path, test_file_path, device_list, log_file_path
      - logging.yml pointing to logs/jsnapy.log
    Overwrites jsnapy.cfg/logging.yml each run to avoid stale content.
    """
    import shutil

    os.environ["JSNAPY_HOME"] = str(jsnapy_home)

    # Ensure dirs
    (jsnapy_home / 'snapshots').mkdir(parents=True, exist_ok=True, mode=0o777)
    tests_dir = jsnapy_home / 'tests'
    tests_dir.mkdir(parents=True, exist_ok=True, mode=0o777)
    logs_dir = jsnapy_home / 'logs'
    logs_dir.mkdir(parents=True, exist_ok=True, mode=0o777)
    devices_dir = jsnapy_home / 'devices'
    devices_dir.mkdir(parents=True, exist_ok=True, mode=0o777)

    # Copy test file so JSNAPy can resolve it by basename
    shutil.copy2(source_test_file, tests_dir / source_test_file.name)

    # Overwrite jsnapy.cfg with all required options
    cfg = jsnapy_home / 'jsnapy.cfg'
    cfg.write_text(
        f"[DEFAULT]\n"
        f"snapshot_path = {jsnapy_home}/snapshots\n"
        f"test_path = {jsnapy_home}/tests\n"
        f"test_file_path = {jsnapy_home}/tests\n"
        f"device_list = {devices_dir}\n"
        f"log_file_path = {logs_dir}\n"
    )

    # Overwrite logging.yml to a known-good state
    logy = jsnapy_home / 'logging.yml'
    logy.write_text(
        f"""version: 1
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
    filename: {logs_dir}/jsnapy.log
root:
  level: WARNING
  handlers: [console, file]
loggers:
  jsnapy:
    level: INFO
    handlers: [console, file]
    propagate: no
"""
    )

    (logs_dir / 'jsnapy.log').touch(exist_ok=True, mode=0o666)

    dprint(f"JSNAPY_HOME set to {os.environ.get('JSNAPY_HOME')}")
    dprint(f"jsnapy.cfg contents:\n{cfg.read_text()}")

    return tests_dir


def resolve_test_file(test_name, test_def):
    """Resolve the repo-relative JSNAPy test filename from tests.yml entry."""
    jsnapy_file_name = test_def.get("jsnapy_test_file")
    if not jsnapy_file_name:
        return None, f"Missing 'jsnapy_test_file' in tests.yml for test '{test_name}'"
    source_test_file = Path(__file__).parent / "tests" / jsnapy_file_name
    if not source_test_file.exists():
        return None, f"JSNAPy test file not found: {source_test_file}"
    return source_test_file, None


def _resolve_hosts(device: Device, default_host: str = None):
    """
    Robustly resolve:
      - connection_host: used for snapshot filenames, cfg names, and JSNAPy prefix
      - display_name: friendly name for tables (facts.hostname if available)
    """
    candidates = [
        getattr(device, "host", None),
        getattr(device, "hostname", None),
        getattr(device, "_hostname", None),
        default_host,
    ]
    connection_host = next((c for c in candidates if isinstance(c, str) and c.strip()), None) or "device_under_test"

    display_name = connection_host
    try:
        facts = getattr(device, "facts", {}) or {}
        display_name = facts.get('hostname') or facts.get('fqdn') or connection_host
    except Exception:
        pass

    return str(connection_host), str(display_name)


# ----------------------- JSNAPy actions ----------------------------------------
def take_jsnapy_snapshot(device, test_name, test_def, snapshot_name, origin_host: str = None):
    """Create a JSNAPy snapshot named 'snapshot_name' for a given test."""
    source_test_file, err = resolve_test_file(test_name, test_def)
    if err:
        error_result = [{"Check": f"{test_name} - Configuration Error", "Result": "ERROR", "Details": err}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), error_result)}

    original_jsnapy_home = os.environ.get("JSNAPY_HOME")
    try:
        jsnapy_home = Path('/tmp/jsnapy')
        jsnapy_home.mkdir(parents=True, exist_ok=True, mode=0o777)
        prepare_jsnapy_env(source_test_file, jsnapy_home)

        from jnpr.jsnapy import SnapAdmin
        jsnapy = SnapAdmin()

        connection_host, _ = _resolve_hosts(device, origin_host)

        cfg_path = jsnapy_home / f'snapshot_config_{connection_host}_{test_name}_{snapshot_name}.yml'
        cfg_payload = {"hosts": [{"device": connection_host, "username": device.user, "passwd": device.password}],
                       "tests": [source_test_file.name]}
        cfg_path.write_text(yaml.safe_dump(cfg_payload))

        snap_result = jsnapy.snap(str(cfg_path), snapshot_name, dev=device)
        snapshot_files = list((jsnapy_home / 'snapshots').glob(f"{connection_host}_{snapshot_name}_*"))

        if snap_result and any(getattr(r, 'result', None) == 'Passed' for r in snap_result):
            ok = [{"Check": f"{test_name} - Snapshot Taken", "Result": "SUCCESS",
                   "Details": f"Snapshot '{snapshot_name}' created. Files: {len(snapshot_files)}"}]
            return {"table": create_result_table(test_name, test_def.get("title", test_name), ok),
                    "raw": [{"snapshot_name": snapshot_name, "files_created": len(snapshot_files), "device": connection_host}]}

        err = [{"Check": f"{test_name} - Snapshot Error", "Result": "ERROR",
                "Details": f"Failed to create snapshot '{snapshot_name}'"}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), err)}

    except Exception as e:
        err = [{"Check": f"{test_name} - Snapshot Exception", "Result": "ERROR", "Details": str(e)}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), err),
                "raw": [{"error": str(e), "traceback": traceback.format_exc()}]}
    finally:
        if original_jsnapy_home is not None:
            os.environ["JSNAPY_HOME"] = original_jsnapy_home
        elif "JSNAPY_HOME" in os.environ:
            del os.environ["JSNAPY_HOME"]


def compare_jsnapy_snapshots(device, test_name, test_def, pre_snapshot, post_snapshot, origin_host: str = None):
    """Compare two named snapshots for a given test."""
    source_test_file, err = resolve_test_file(test_name, test_def)
    if err:
        error_result = [{"Check": f"{test_name} - Configuration Error", "Result": "ERROR", "Details": err}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), error_result)}

    original_jsnapy_home = os.environ.get("JSNAPY_HOME")
    try:
        jsnapy_home = Path('/tmp/jsnapy')
        jsnapy_home.mkdir(parents=True, exist_ok=True, mode=0o777)
        prepare_jsnapy_env(source_test_file, jsnapy_home)

        from jnpr.jsnapy import SnapAdmin
        jsnapy = SnapAdmin()

        connection_host, _ = _resolve_hosts(device, origin_host)

        cfg_path = jsnapy_home / f'compare_config_{connection_host}_{test_name}_{pre_snapshot}_{post_snapshot}.yml'
        cfg_payload = {"hosts": [{"device": connection_host, "username": device.user, "passwd": device.password}],
                       "tests": [source_test_file.name]}
        cfg_path.write_text(yaml.safe_dump(cfg_payload))

        # Validate snapshots exist (by connection_host prefix)
        pre_files = list((jsnapy_home / 'snapshots').glob(f"{connection_host}_{pre_snapshot}_*"))
        post_files = list((jsnapy_home / 'snapshots').glob(f"{connection_host}_{post_snapshot}_*"))
        if not pre_files:
            err = [{"Check": f"{test_name} - Pre-snapshot Missing", "Result": "ERROR", "Details": f"Pre-snapshot '{pre_snapshot}' not found."}]
            return {"table": create_result_table(test_name, test_def.get("title", test_name), err)}
        if not post_files:
            err = [{"Check": f"{test_name} - Post-snapshot Missing", "Result": "ERROR", "Details": f"Post-snapshot '{post_snapshot}' not found."}]
            return {"table": create_result_table(test_name, test_def.get("title", test_name), err)}

        check_result = jsnapy.check(str(cfg_path), pre_snapshot, post_snapshot, dev=device)

        # Format a minimal per-test message table
        formatted_data = []
        raw_data = []

        if check_result:
            for result in check_result:
                tr = getattr(result, "test_results", {})
                raw_data.append({
                    "device": connection_host,
                    "test_name": test_name,
                    "pre_snapshot": pre_snapshot,
                    "post_snapshot": post_snapshot,
                    "test_results": tr,
                    "passed": getattr(result, "no_passed", 0),
                    "failed": getattr(result, "no_failed", 0),
                    "result": getattr(result, "result", "UNKNOWN"),
                })
                if tr:
                    for command, command_results in tr.items():
                        if isinstance(command_results, list):
                            for trd in command_results:
                                if not isinstance(trd, dict):
                                    continue
                                for item in trd.get("passed", []) or []:
                                    msg = expand_placeholders(item.get("message", "Comparison passed - no change detected"), item)
                                    formatted_data.append({"Check": f"{test_name} - {trd.get('node_name', command)}", "Result": "NO CHANGE", "Details": msg})
                                for item in trd.get("failed", []) or []:
                                    msg = expand_placeholders(item.get("message", item.get("err", "Change detected")), item)
                                    formatted_data.append({"Check": f"{test_name} - {trd.get('node_name', command)}", "Result": "CHANGED", "Details": msg})
                else:
                    overall = "NO CHANGE" if getattr(result, "result", "") == "Passed" else "CHANGED"
                    formatted_data.append({"Check": f"{test_name} - {connection_host}", "Result": overall,
                                           "Details": f"No Changes: {getattr(result,'no_passed',0)}, Changes: {getattr(result,'no_failed',0)}"})

        if not formatted_data:
            formatted_data = [{"Check": f"{test_name} - Comparison Complete", "Result": "NO DATA", "Details": "No interpretable results"}]

        return {"table": create_result_table(test_name, test_def.get("title", test_name), formatted_data),
                "raw": raw_data}

    except Exception as e:
        err = [{"Check": f"{test_name} - Comparison Exception", "Result": "ERROR", "Details": str(e)}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), err),
                "raw": [{"error": str(e), "traceback": traceback.format_exc()}]}
    finally:
        if original_jsnapy_home is not None:
            os.environ["JSNAPY_HOME"] = original_jsnapy_home
        elif "JSNAPY_HOME" in os.environ:
            del os.environ["JSNAPY_HOME"]


def run_jsnapy_test(device, test_name, test_def, origin_host: str = None):
    """Run a JSNAPy test in 'current' mode via snapcheck (fallback to snap+check)."""
    source_test_file, err = resolve_test_file(test_name, test_def)
    if err:
        error_result = [{"Check": f"{test_name} - Configuration Error", "Result": "ERROR", "Details": err}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), error_result)}

    original_jsnapy_home = os.environ.get("JSNAPY_HOME")
    try:
        jsnapy_home = Path('/tmp/jsnapy')
        jsnapy_home.mkdir(parents=True, exist_ok=True, mode=0o777)
        prepare_jsnapy_env(source_test_file, jsnapy_home)

        from jnpr.jsnapy import SnapAdmin
        jsnapy = SnapAdmin()

        connection_host, display_name = _resolve_hosts(device, origin_host)

        cfg_path = jsnapy_home / f'test_config_{connection_host}_{test_name}.yml'
        cfg_payload = {"hosts": [{"device": connection_host, "username": device.user, "passwd": device.password}],
                       "tests": [source_test_file.name]}
        cfg_path.write_text(yaml.safe_dump(cfg_payload))

        dprint(f"Running test: cfg={cfg_path}, test={source_test_file.name}")

        # Try snapcheck, then snap+check
        try:
            check_result = jsnapy.snapcheck(str(cfg_path), "current", dev=device)
        except Exception as snapcheck_error:
            dprint(f"snapcheck failed; falling back to snap+check: {snapcheck_error}")
            jsnapy.snap(str(cfg_path), "current", dev=device)
            check_result = jsnapy.check(str(cfg_path), "current", dev=device)

        formatted_data = []
        raw_data = []

        if check_result:
            for result in check_result:
                tr = getattr(result, "test_results", {})
                raw_data.append({
                    "device": display_name,
                    "test_name": test_name,
                    "test_results": tr,
                    "passed": getattr(result, "no_passed", 0),
                    "failed": getattr(result, "no_failed", 0),
                    "result": getattr(result, "result", "UNKNOWN"),
                })
                if tr:
                    for command, command_results in tr.items():
                        if isinstance(command_results, list):
                            for trd in command_results:
                                if not isinstance(trd, dict):
                                    continue
                                # Passed
                                for item in trd.get("passed", []) or []:
                                    msg = expand_placeholders(item.get("message", "Test passed"), item)
                                    formatted_data.append({"Check": f"{test_name} - {trd.get('node_name', command)}",
                                                           "Result": "PASSED", "Details": msg})
                                # Failed
                                for item in trd.get("failed", []) or []:
                                    msg = expand_placeholders(item.get("err", "Test failed"), item)
                                    formatted_data.append({"Check": f"{test_name} - {trd.get('node_name', command)}",
                                                           "Result": "FAILED", "Details": msg})
                else:
                    overall = "PASSED" if getattr(result, "result", "") == "Passed" else "FAILED"
                    formatted_data.append({"Check": f"{test_name} - {display_name}", "Result": overall,
                                           "Details": f"Passed: {getattr(result,'no_passed',0)}, Failed: {getattr(result,'no_failed',0)}"})

        if not formatted_data:
            formatted_data = [{"Check": f"{test_name} - No Results", "Result": "UNKNOWN", "Details": "No interpretable test data"}]

        return {"table": create_result_table(test_name, test_def.get("title", test_name), formatted_data),
                "raw": raw_data}

    except Exception as e:
        err = [{"Check": f"{test_name} - Exception", "Result": "ERROR", "Details": f"JSNAPy test execution failed: {str(e)}"}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), err),
                "raw": [{"error": str(e), "traceback": traceback.format_exc()}]}
    finally:
        if original_jsnapy_home is not None:
            os.environ["JSNAPY_HOME"] = original_jsnapy_home
        elif "JSNAPY_HOME" in os.environ:
            del os.environ["JSNAPY_HOME"]


# ----------------------- Table builders ----------------------------------------
def compute_host_counts(results):
    """Compute simple pass/fail counters per host from raw JSNAPy buckets."""
    per_host_counts = {}
    for host_result in results.get("results_by_host", []):
        hostname = host_result.get("hostname", "")
        passed = failed = 0
        for t in host_result.get("test_results", []) or []:
            for raw_item in t.get("raw", []) or []:
                tr = raw_item.get("test_results", {})
                for _, command_results in tr.items():
                    if not isinstance(command_results, list):
                        continue
                    for trd in command_results:
                        passed += len(trd.get("passed", []) or [])
                        failed += len(trd.get("failed", []) or [])
        per_host_counts[hostname] = {"passed": passed, "failed": failed, "overall": "PASS" if failed == 0 else "FAIL"}
    return per_host_counts


def build_compact_bgp_table(results):
    """
    Specialized compact BGP table:
      Host | Device | Peer Address | Peer AS | State | Flaps | Prefixes | Result
    Prefixes string is Active/Received/Accepted/Suppressed when present.
    """
    headers = ["Host", "Device", "Peer Address", "Peer AS", "State", "Flaps", "Prefixes", "Result"]
    rows = []
    agg = {}

    for host_result in results.get("results_by_host", []):
        hostname = host_result.get("hostname", "")
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
                        for bucket, status in (("passed", "PASSED"), ("failed", "FAILED")):
                            for item in trd.get(bucket, []) or []:
                                peer_addr = value_from_item(item, "peer-address") or ""
                                if not peer_addr:
                                    continue
                                key = (hostname, device_name, str(peer_addr))
                                entry = agg.get(key)
                                if not entry:
                                    entry = {"Peer AS": "", "State": "", "Flaps": "", "Active": "", "Received": "", "Accepted": "", "Suppressed": "", "Result": "PASSED"}
                                    agg[key] = entry

                                pa = value_from_item(item, "peer-as")
                                if pa is not None:
                                    entry["Peer AS"] = str(pa)

                                st = value_from_item(item, "peer-state")
                                if st is not None:
                                    entry["State"] = str(st)

                                fl = value_from_item(item, "flap-count")
                                if fl is not None:
                                    entry["Flaps"] = str(fl)

                                for fld_key, tgt in [
                                    ("bgp-rib/active-prefix-count", "Active"),
                                    ("active-prefix-count", "Active"),
                                    ("bgp-rib/received-prefix-count", "Received"),
                                    ("received-prefix-count", "Received"),
                                    ("bgp-rib/accepted-prefix-count", "Accepted"),
                                    ("accepted-prefix-count", "Accepted"),
                                    ("bgp-rib/suppressed-prefix-count", "Suppressed"),
                                    ("suppressed-prefix-count", "Suppressed"),
                                ]:
                                    val = value_from_item(item, fld_key)
                                    if val is not None:
                                        entry[tgt] = str(val)

                                if status == "FAILED":
                                    entry["Result"] = "FAILED"

    # Emit one row per peer
    for (host, device, peer), e in sorted(agg.items(), key=lambda kv: (kv[0][0], 0 if kv[1]["Result"] == "FAILED" else 1, kv[0][2])):
        parts = [p for p in [e["Active"], e["Received"], e["Accepted"], e["Suppressed"]] if p != ""]
        prefixes = "/".join(parts) if parts else ""
        rows.append([host, device, peer, e["Peer AS"], e["State"], e["Flaps"], prefixes, e["Result"]])

    dprint(f"VIEW=BGP_COMPACT rows={len(rows)}")
    if not rows:
        rows.append(["", "", "", "", "", "", "", "PASS"])
    return headers, rows


def build_generic_dynamic_table(results):
    """
    Dynamic, data-driven fallback for any non-BGP tests.

    Columns are inferred from the result data, not hardcoded.
    Strategy:
      - Always include: Host, Device
      - Include all keys found under item['id'] across results (sorted)
      - Then: Node, Expected, Actual, Status, Message

    This makes it suitable for system alarms, interfaces, storage, etc.,
    without assuming "Peer AS" or any BGP-specific fields exist.
    """
    id_keys = set()
    rows = []

    # First pass: collect union of id keys
    for host_result in results.get("results_by_host", []):
        for t in host_result.get("test_results", []) or []:
            for raw_item in t.get("raw", []) or []:
                tr = raw_item.get("test_results", {})
                for _, command_results in tr.items():
                    if not isinstance(command_results, list):
                        continue
                    for trd in command_results:
                        for bucket in ("passed", "failed"):
                            for item in trd.get(bucket, []) or []:
                                ids = item.get("id") or {}
                                id_keys.update(k for k in ids.keys() if isinstance(k, str) and k.strip())

    id_cols = sorted(id_keys)
    headers = ["Host", "Device"] + id_cols + ["Node", "Expected", "Actual", "Status", "Message"]

    # Second pass: populate rows
    for host_result in results.get("results_by_host", []):
        hostname = host_result.get("hostname", "")

        for t in host_result.get("test_results", []) or []:
            device = ""
            # best-effort device name from first raw item
            for raw_item in t.get("raw", []) or []:
                device = raw_item.get("device", hostname)
                break

            for raw_item in t.get("raw", []) or []:
                tr = raw_item.get("test_results", {})
                for _, command_results in tr.items():
                    if not isinstance(command_results, list):
                        continue
                    for trd in command_results:
                        node_name = trd.get("node_name") or ""
                        expected_default = trd.get("expected_node_value")

                        def build_row(item, status):
                            pre = item.get("pre") or {}
                            post = item.get("post") or {}
                            ids = item.get("id") or {}

                            # Fill identifier columns from id map
                            id_values = [str(ids.get(k, "")) for k in id_cols]

                            # Determine expected/actual
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

                            message = expand_placeholders(item.get("message") or item.get("err") or "", item)

                            rows.append(
                                [hostname, device]
                                + id_values
                                + [
                                    str(node_name or ""),
                                    "" if expected is None else str(expected),
                                    "" if actual is None else str(actual),
                                    status,
                                    message,
                                ]
                            )

                        for it in trd.get("failed", []) or []:
                            build_row(it, "FAILED")
                        for it in trd.get("passed", []) or []:
                            build_row(it, "PASSED")

    dprint(f"VIEW=GENERIC_DYNAMIC headers={headers}")
    if not rows:
        rows.append(["", ""] + [""] * len(id_cols) + ["", "", "", "PASS", "No data"])
    return headers, rows


def build_universal_table(results):
    """
    Decide which specialized table to use, falling back to a dynamic generic table:
      - BGP present -> compact BGP table (fixed, user-requested columns)
      - Otherwise -> generic dynamic table driven by data (no hardcoded BGP fields)
    """
    # Identify commands present
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

    # BGP specialized view
    if any("show bgp" in cmd for cmd in cmds) or any("bgp" in ts for ts in tests_seen):
        return build_compact_bgp_table(results)

    # Generic dynamic table for other tests
    return build_generic_dynamic_table(results)


# ----------------------- Display ------------------------------------------------
def display_results(results, args=None):
    """Render the final, universal table and the execution summary."""
    tablefmt = getattr(args, "format", "grid") if args else "grid"
    show_raw = getattr(args, "show_raw", False) if args else False
    max_rows = getattr(args, "max_rows", 0) if args else 0
    truncate_len = getattr(args, "truncate_details", 120) if args else 120

    def trunc(s, n):
        if s is None:
            return ""
        s = str(s)
        return s if n <= 0 or len(s) <= n else s[: max(0, n - 1)] + "…"

    # Header
    print("\n" + "=" * 80)
    print("TEST EXECUTION SUMMARY".center(80))
    print("=" * 80)
    print(f"Total Hosts: {results['summary']['total_hosts']}")
    print(f"Passed Hosts: {results['summary']['passed_hosts']}")
    print(f"Total Tests Executed: {results['summary']['total_tests']}")
    print(f"Mode: {results['summary'].get('mode', 'current')}")
    print("=" * 80 + "\n")

    # Build the table
    headers, rows = build_universal_table(results)

    # Truncate Message column if present
    if "Message" in headers and truncate_len > 0:
        msg_idx = headers.index("Message")
        rows = [r[:msg_idx] + [trunc(r[msg_idx], truncate_len)] + r[msg_idx + 1:] for r in rows]

    # Apply row cap
    display_rows = rows if max_rows <= 0 else rows[:max_rows]

    dprint(f"ACTIVE_HEADERS={headers}")
    print(tabulate(display_rows, headers=headers, tablefmt=tablefmt, showindex=False))

    if show_raw:
        print("\nRaw Data:")
        print(json.dumps(results["results_by_host"], indent=2))

    print("\n" + "=" * 80)
    print("EXECUTION COMPLETE".center(80))
    print("=" * 80)


# ----------------------- Async host orchestration ------------------------------
async def validate_host(hostname, username, password, tests, test_defs, host_index, mode="current", snapshot_name=None, compare_with=None):
    """Connect to one host and run the requested tests in the chosen mode."""
    connection_step, execution_step = (host_index * 2) - 1, host_index * 2
    send_progress("STEP_START", {"step": connection_step, "name": f"Connect to {hostname}"}, f"Connecting to {hostname}...")

    try:
        with Device(host=hostname, user=username, passwd=password, timeout=30) as dev:
            send_progress("STEP_COMPLETE", {"step": connection_step}, f"Successfully connected to {hostname}.")

            # Step start
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
                if test_name not in test_defs:
                    continue

                if mode == "snapshot":
                    test_result = take_jsnapy_snapshot(dev, test_name, test_defs[test_name], snapshot_name, origin_host=hostname)
                    status = "SUCCESS" if not any(row["Status"] == "ERROR" for row in test_result["table"]["rows"]) else "ERROR"
                    send_progress("TEST_COMPLETE", {"host": hostname, "test": test_name, "status": status, "mode": "snapshot", "snapshot_name": snapshot_name},
                                  f"Snapshot {test_name} completed on {hostname}")

                elif mode == "compare":
                    test_result = compare_jsnapy_snapshots(dev, test_name, test_defs[test_name], compare_with, snapshot_name, origin_host=hostname)
                    status = "SUCCESS" if not any(row["Status"] == "ERROR" for row in test_result["table"]["rows"]) else "ERROR"
                    send_progress("TEST_COMPLETE", {"host": hostname, "test": test_name, "status": status, "mode": "compare", "pre_snapshot": compare_with, "post_snapshot": snapshot_name},
                                  f"Comparison {test_name} completed on {hostname}")

                else:
                    test_result = run_jsnapy_test(dev, test_name, test_defs[test_name], origin_host=hostname)
                    status = "SUCCESS" if not any(row["Status"] == "FAILED" for row in test_result["table"]["rows"]) else "WARNING"
                    send_progress("TEST_COMPLETE", {"host": hostname, "test": test_name, "status": status, "mode": "current"},
                                  f"Test {test_name} completed on {hostname}")

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
        return {"hostname": sanitize_text(hostname), "status": "error", "message": error_message}


# ----------------------- Main async orchestrator -------------------------------
async def main_async(args):
    """
    Load tests.yml, then concurrently validate hosts with the selected tests.
    Results are returned in a structure suitable for display_results().
    """
    # Detect tests definition file
    candidates = [Path(__file__).parent / "tests.yml", Path(__file__).parent / "test.yml"]
    tests_yml = next((p for p in candidates if p.exists()), candidates[0])

    with open(tests_yml) as f:
        test_defs = yaml.safe_load(f)

    # Listing mode
    if args.list_tests:
        categorized = {}
        for test_id, details in (test_defs or {}).items():
            if test_id in ("test_suites", "global_config", "thresholds"):
                continue
            category = sanitize_text((details or {}).get("category", "Uncategorized"))
            categorized.setdefault(category, []).append({
                "id": sanitize_text(test_id),
                "title": sanitize_text((details or {}).get("title", test_id)),
                "description": sanitize_text((details or {}).get("description", "No description provided.")),
                "category": category,
            })
        return {"success": True, "discovered_tests": categorized}

    # Parse inputs
    hosts = [h.strip() for h in args.hostname.split(",")]
    tests_to_run = [t.strip() for t in args.tests.split(",")]
    mode = getattr(args, 'mode', 'current')
    snapshot_name = getattr(args, 'snapshot_name', None)
    compare_with = getattr(args, 'compare_with', None)

    # Validate mode params
    if mode == "snapshot" and not snapshot_name:
        raise ValueError("Snapshot mode requires --snapshot-name parameter")
    if mode == "compare" and (not snapshot_name or not compare_with):
        raise ValueError("Compare mode requires both --snapshot-name and --compare-with parameters")

    # Progress init
    total_steps = len(hosts) * 2
    send_progress(
        "OPERATION_START",
        {"total_steps": total_steps, "mode": mode, "snapshot_name": snapshot_name, "compare_with": compare_with},
        f"Starting {'validation' if mode=='current' else 'snapshot comparison' if mode=='compare' else 'snapshot collection'} for {len(hosts)} host(s)."
    )

    # Launch tasks
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
            "compare_with": compare_with,
        },
    }
    return {"type": "result", "data": final_results}


# ----------------------- CLI entrypoint ----------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Asynchronous Network Validation Tool with Universal, Data-Driven Tables")

    # Core
    parser.add_argument("--hostname", help="Comma-separated device IPs")
    parser.add_argument("--username", help="Device login username")
    parser.add_argument("--password", help="Device login password")
    parser.add_argument("--tests", help="Comma-separated test IDs (from tests.yml)")
    parser.add_argument("--list_tests", action="store_true", help="List available tests")

    # Modes
    parser.add_argument("--mode", choices=["current", "snapshot", "compare"], default="current", help="Operation mode")
    parser.add_argument("--snapshot-name", help="Name for snapshot (snapshot/compare modes)")
    parser.add_argument("--compare-with", help="Pre-snapshot name (compare mode)")

    # Output
    parser.add_argument("--format", choices=["grid", "github", "simple", "plain", "fancy_grid"], default="grid", help="Table format for output")
    parser.add_argument("--show_raw", dest="show_raw", action="store_true", help="Include raw JSON payloads at the end")
    parser.add_argument("--max_rows", dest="max_rows", type=int, default=0, help="Max rows to print (0 = no limit)")
    parser.add_argument("--truncate_details", dest="truncate_details", type=int, default=120, help="Truncate Message column (0 = no truncation)")

    # Debug
    parser.add_argument("--debug", action="store_true", help="Enable debug prints (jsnapy.cfg contents, view selection, headers)")

    args = parser.parse_args()

    try:
        global DEBUG_ENABLED
        DEBUG_ENABLED = bool(args.debug)

        # Input validation for run modes
        if not args.list_tests and (not args.hostname or not args.username or not args.password or not args.tests):
            raise ValueError("Hostname, username, password, and tests are required for a validation run.")

        if args.mode == "snapshot" and not args.snapshot_name:
            raise ValueError("Snapshot mode requires --snapshot-name parameter")

        if args.mode == "compare" and (not args.snapshot_name or not args.compare_with):
            raise ValueError("Compare mode requires both --snapshot-name and --compare-with parameters")

        final_output = asyncio.run(main_async(args))

        if not args.list_tests:
            send_progress("OPERATION_COMPLETE", {"status": "SUCCESS", "mode": args.mode}, "All operations completed.")
            display_results(final_output["data"], args)

        # Also emit machine-parsable JSON for programmatic consumption
        print(json.dumps(final_output))

    except Exception as e:
        error_message = f"A critical script error occurred: {sanitize_text(str(e))}"
        send_progress("OPERATION_COMPLETE", {"status": "FAILED"}, error_message)
        print(json.dumps({"type": "error", "message": error_message}))
        print(f"CRITICAL ERROR: {traceback.format_exc()}", file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()