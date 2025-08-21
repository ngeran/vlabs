#!/usr/bin/env python3
# =============================================================================
# FILENAME:           run.py
# FVersion:           v30
#
# PURPOSE
#   Asynchronous JSNAPy-based Network Validation with a universal, schema-driven
#   table renderer that deduplicates and merges per-entity data across assertion
#   buckets. Per-test formatting rules live in schemas/table_schemas.yml.
#
# KEY IDEAS
#   - UniversalTableFormat: Single engine to build human-friendly tables
#     for all tests using a small declarative schema per test.
#   - Schema per test defines:
#       * match rules (by test_id or command substring)
#       * entity key fields (row uniqueness)
#       * columns (sources, aggregates, existence/prefix checks)
#       * result rules (fail on bucket-failed, counters, equality, etc.)
#       * filters (include rows only if conditions are met)
#       * sorting preferences
#   - Generic dynamic fallback remains for tests without schemas.
#
# USAGE
#   Discovery:
#     python3 run.py --list_tests
#   Current:
#     python3 run.py --hostname <ip[,ip2,...]> --username <user> --password <pass> --tests <test_id>
#   Snapshot:
#     python3 run.py --hostname <ip> --username <user> --password <pass> --tests <test_id> --mode snapshot --snapshot-name <name>
#   Compare:
#     python3 run.py --hostname <ip> --username <user> --password <pass> --tests <test_id> --mode compare --snapshot-name <post> --compare-with <pre>
#
# OUTPUT
#   - Structured "progress" JSON events for UIs/loggers
#   - A single summary table selected via schema match (or generic fallback)
#   - Optional raw JSON dump with --show_raw
#
# JSNAPy INTEGRATION
#   - Safe runtime under /tmp/jsnapy with snapshots/, tests/, logs/, devices/
#   - jsnapy.cfg and logging.yml generated each run
#   - Test files copied into /tmp/jsnapy/tests for resolution by JSNAPy
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
    if DEBUG_ENABLED:
        print(f"DEBUG: {msg}", file=sys.stderr, flush=True)


def send_progress(event_type, data, message=""):
    print(json.dumps({"type": "progress", "event_type": event_type, "data": data, "message": message}), flush=True)


# ----------------------- Helpers -----------------------------------------------
def sanitize_text(text):
    if not isinstance(text, str):
        text = str(text)
    text = text.replace('<', '[').replace('>', ']')
    text = text.replace('&', ' and ')
    text = text.replace('"', "'")
    return re.sub(r'\s+', ' ', text).strip()


def get_nested(dct, path):
    if not isinstance(dct, dict) or not path:
        return None
    cur = dct
    for key in str(path).split("/"):
        if not key:
            continue
        if not isinstance(cur, dict) or key not in cur:
            return None
        cur = cur[key]
    return cur


def expand_placeholders(msg, item):
    if not msg or not isinstance(msg, str):
        return msg
    pre = item.get("pre") or {}
    post = item.get("post") or {}
    ids = item.get("id") or {}

    def get_any(k):
        for src in (post, pre):
            v = get_nested(src, k)
            if v is None and isinstance(src, dict):
                v = src.get(k)
            if v is not None:
                return str(v)
        v = ids.get(k)
        return "" if v is None else str(v)

    def repl(m):
        t = m.group(1)
        if t.startswith("pre[") and t.endswith("]"):
            return str(pre.get(t[4:-1], ""))
        if t.startswith("post[") and t.endswith("]"):
            return str(post.get(t[5:-1], ""))
        return get_any(t)

    return sanitize_text(re.sub(r"<([^>]+)>", repl, msg))


def value_from_item(item, key):
    """Lookup order: post -> pre -> id; supports nested paths with '/'."""
    pre = item.get("pre") or {}
    post = item.get("post") or {}
    ids = item.get("id") or {}
    for src in (post, pre):
        v = get_nested(src, key)
        if v is None and isinstance(src, dict):
            v = src.get(key)
        if v is not None:
            return v
    return ids.get(key)


def _to_int(v, default=0):
    try:
        if v in (None, ""):
            return default
        return int(str(v))
    except Exception:
        return default


# ----------------------- JSNAPy env --------------------------------------------
def prepare_jsnapy_env(source_test_file: Path, jsnapy_home: Path):
    os.environ["JSNAPY_HOME"] = str(jsnapy_home)

    (jsnapy_home / 'snapshots').mkdir(parents=True, exist_ok=True, mode=0o777)
    tests_dir = jsnapy_home / 'tests'
    tests_dir.mkdir(parents=True, exist_ok=True, mode=0o777)
    logs_dir = jsnapy_home / 'logs'
    logs_dir.mkdir(parents=True, exist_ok=True, mode=0o777)
    devices_dir = jsnapy_home / 'devices'
    devices_dir.mkdir(parents=True, exist_ok=True, mode=0o777)

    (tests_dir / source_test_file.name).write_bytes(source_test_file.read_bytes())

    cfg = jsnapy_home / 'jsnapy.cfg'
    cfg.write_text(
        f"[DEFAULT]\n"
        f"snapshot_path = {jsnapy_home}/snapshots\n"
        f"test_path = {jsnapy_home}/tests\n"
        f"test_file_path = {jsnapy_home}/tests\n"
        f"device_list = {devices_dir}\n"
        f"log_file_path = {logs_dir}\n"
    )

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
    fn = test_def.get("jsnapy_test_file")
    if not fn:
        return None, f"Missing 'jsnapy_test_file' in tests.yml for test '{test_name}'"
    p = Path(__file__).parent / 'tests' / fn
    if not p.exists():
        return None, f"JSNAPy test file not found: {p}"
    return p, None


def _resolve_hosts(device: Device, default_host: str = None):
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
def take_jsnapy_snapshot(device, test_name, test_def, snapshot_name, origin_host=None):
    source_test_file, err = resolve_test_file(test_name, test_def)
    if err:
        r = [{"Check": f"{test_name} - Configuration Error", "Result": "ERROR", "Details": err}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), r)}
    orig = os.environ.get("JSNAPY_HOME")
    try:
        js_home = Path('/tmp/jsnapy')
        js_home.mkdir(parents=True, exist_ok=True, mode=0o777)
        prepare_jsnapy_env(source_test_file, js_home)
        from jnpr.jsnapy import SnapAdmin
        js = SnapAdmin()
        host, _ = _resolve_hosts(device, origin_host)
        cfg = js_home / f'snapshot_config_{host}_{test_name}_{snapshot_name}.yml'
        cfg.write_text(yaml.safe_dump({"hosts": [{"device": host, "username": device.user, "passwd": device.password}], "tests": [source_test_file.name]}))
        snap = js.snap(str(cfg), snapshot_name, dev=device)
        files = list((js_home / 'snapshots').glob(f"{host}_{snapshot_name}_*"))
        if snap and any(getattr(x, 'result', None) == 'Passed' for x in snap):
            ok = [{"Check": f"{test_name} - Snapshot Taken", "Result": "SUCCESS", "Details": f"Snapshot '{snapshot_name}' created. Files: {len(files)}"}]
            return {"table": create_result_table(test_name, test_def.get("title", test_name), ok),
                    "raw": [{"snapshot_name": snapshot_name, "files_created": len(files), "device": host}]}
        err = [{"Check": f"{test_name} - Snapshot Error", "Result": "ERROR", "Details": f"Failed to create snapshot '{snapshot_name}'"}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), err)}
    except Exception as e:
        err = [{"Check": f"{test_name} - Snapshot Exception", "Result": "ERROR", "Details": str(e)}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), err),
                "raw": [{"error": str(e), "traceback": traceback.format_exc()}]}
    finally:
        if orig is not None:
            os.environ["JSNAPY_HOME"] = orig
        elif "JSNAPY_HOME" in os.environ:
            del os.environ["JSNAPY_HOME"]


def compare_jsnapy_snapshots(device, test_name, test_def, pre_snapshot, post_snapshot, origin_host=None):
    source_test_file, err = resolve_test_file(test_name, test_def)
    if err:
        r = [{"Check": f"{test_name} - Configuration Error", "Result": "ERROR", "Details": err}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), r)}
    orig = os.environ.get("JSNAPY_HOME")
    try:
        js_home = Path('/tmp/jsnapy')
        js_home.mkdir(parents=True, exist_ok=True, mode=0o777)
        prepare_jsnapy_env(source_test_file, js_home)
        from jnpr.jsnapy import SnapAdmin
        js = SnapAdmin()
        host, _ = _resolve_hosts(device, origin_host)
        cfg = js_home / f'compare_config_{host}_{test_name}_{pre_snapshot}_{post_snapshot}.yml'
        cfg.write_text(yaml.safe_dump({"hosts": [{"device": host, "username": device.user, "passwd": device.password}], "tests": [source_test_file.name]}))

        pre_files = list((js_home / 'snapshots').glob(f"{host}_{pre_snapshot}_*"))
        post_files = list((js_home / 'snapshots').glob(f"{host}_{post_snapshot}_*"))
        if not pre_files:
            r = [{"Check": f"{test_name} - Pre-snapshot Missing", "Result": "ERROR", "Details": f"Pre-snapshot '{pre_snapshot}' not found."}]
            return {"table": create_result_table(test_name, test_def.get("title", test_name), r)}
        if not post_files:
            r = [{"Check": f"{test_name} - Post-snapshot Missing", "Result": "ERROR", "Details": f"Post-snapshot '{post_snapshot}' not found."}]
            return {"table": create_result_table(test_name, test_def.get("title", test_name), r)}

        check = js.check(str(cfg), pre_snapshot, post_snapshot, dev=device)
        fmt, raw = [], []
        if check:
            for res in check:
                tr = getattr(res, "test_results", {})
                raw.append({"device": host, "test_name": test_name, "pre_snapshot": pre_snapshot, "post_snapshot": post_snapshot, "test_results": tr,
                            "passed": getattr(res, "no_passed", 0), "failed": getattr(res, "no_failed", 0), "result": getattr(res, "result", "UNKNOWN")})
                if tr:
                    for cmd, cmd_res in tr.items():
                        if isinstance(cmd_res, list):
                            for trd in cmd_res:
                                for item in trd.get("passed", []) or []:
                                    msg = expand_placeholders(item.get("message", "Comparison passed - no change detected"), item)
                                    fmt.append({"Check": f"{test_name} - {trd.get('node_name', cmd)}", "Result": "NO CHANGE", "Details": msg})
                                for item in trd.get("failed", []) or []:
                                    msg = expand_placeholders(item.get("message", item.get("err", "Change detected")), item)
                                    fmt.append({"Check": f"{test_name} - {trd.get('node_name', cmd)}", "Result": "CHANGED", "Details": msg})
                else:
                    overall = "NO CHANGE" if getattr(res, "result", "") == "Passed" else "CHANGED"
                    fmt.append({"Check": f"{test_name} - {host}", "Result": overall, "Details": f"No Changes: {getattr(res,'no_passed',0)}, Changes: {getattr(res,'no_failed',0)}"})
        if not fmt:
            fmt = [{"Check": f"{test_name} - Comparison Complete", "Result": "NO DATA", "Details": "No interpretable results"}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), fmt), "raw": raw}
    except Exception as e:
        err = [{"Check": f"{test_name} - Comparison Exception", "Result": "ERROR", "Details": str(e)}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), err),
                "raw": [{"error": str(e), "traceback": traceback.format_exc()}]}
    finally:
        if orig is not None:
            os.environ["JSNAPY_HOME"] = orig
        elif "JSNAPY_HOME" in os.environ:
            del os.environ["JSNAPY_HOME"]


def run_jsnapy_test(device, test_name, test_def, origin_host=None):
    source_test_file, err = resolve_test_file(test_name, test_def)
    if err:
        r = [{"Check": f"{test_name} - Configuration Error", "Result": "ERROR", "Details": err}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), r)}
    orig = os.environ.get("JSNAPY_HOME")
    try:
        js_home = Path('/tmp/jsnapy')
        js_home.mkdir(parents=True, exist_ok=True, mode=0o777)
        prepare_jsnapy_env(source_test_file, js_home)
        from jnpr.jsnapy import SnapAdmin
        js = SnapAdmin()
        host, disp = _resolve_hosts(device, origin_host)
        cfg = js_home / f'test_config_{host}_{test_name}.yml'
        cfg.write_text(yaml.safe_dump({"hosts": [{"device": host, "username": device.user, "passwd": device.password}], "tests": [source_test_file.name]}))
        dprint(f"Running test: cfg={cfg}, test={source_test_file.name}")
        try:
            check = js.snapcheck(str(cfg), "current", dev=device)
        except Exception as e:
            dprint(f"snapcheck failed; falling back to snap+check: {e}")
            js.snap(str(cfg), "current", dev=device)
            check = js.check(str(cfg), "current", dev=device)
        fmt, raw = [], []
        if check:
            for res in check:
                tr = getattr(res, "test_results", {})
                raw.append({"device": disp, "test_name": test_name, "test_results": tr, "passed": getattr(res, "no_passed", 0), "failed": getattr(res, "no_failed", 0),
                            "result": getattr(res, "result", "UNKNOWN")})
                if tr:
                    for cmd, cmd_res in tr.items():
                        if isinstance(cmd_res, list):
                            for trd in cmd_res:
                                for item in trd.get("passed", []) or []:
                                    msg = expand_placeholders(item.get("message", "Test passed"), item)
                                    fmt.append({"Check": f"{test_name} - {trd.get('node_name', cmd)}", "Result": "PASSED", "Details": msg})
                                for item in trd.get("failed", []) or []:
                                    msg = expand_placeholders(item.get("err", "Test failed"), item)
                                    fmt.append({"Check": f"{test_name} - {trd.get('node_name', cmd)}", "Result": "FAILED", "Details": msg})
                else:
                    overall = "PASSED" if getattr(res, "result", "") == "Passed" else "FAILED"
                    fmt.append({"Check": f"{test_name} - {disp}", "Result": overall, "Details": f"Passed: {getattr(res,'no_passed',0)}, Failed: {getattr(res,'no_failed',0)}"})
        if not fmt:
            fmt = [{"Check": f"{test_name} - No Results", "Result": "UNKNOWN", "Details": "No interpretable test data"}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), fmt), "raw": raw}
    except Exception as e:
        err = [{"Check": f"{test_name} - Exception", "Result": "ERROR", "Details": f"JSNAPy test execution failed: {str(e)}"}]
        return {"table": create_result_table(test_name, test_def.get("title", test_name), err),
                "raw": [{"error": str(e), "traceback": traceback.format_exc()}]}
    finally:
        if orig is not None:
            os.environ["JSNAPY_HOME"] = orig
        elif "JSNAPY_HOME" in os.environ:
            del os.environ["JSNAPY_HOME"]


# ----------------------- Universal schema-driven formatter ----------------------
def load_schemas():
    """Load table schemas from schemas/table_schemas.yml if present."""
    schema_path = Path(__file__).parent / "schemas" / "table_schemas.yml"
    if schema_path.exists():
        try:
            with open(schema_path, "r") as f:
                data = yaml.safe_load(f) or {}
                return data.get("schemas", [])
        except Exception as e:
            dprint(f"Failed to load schemas: {e}")
    return []


def match_schema_to_results(schemas, results):
    """Pick the first schema whose match rules fit the current result set."""
    cmds = set()
    tests_seen = set()
    for host_result in results.get("results_by_host", []):
        for t in host_result.get("test_results", []) or []:
            table = t.get("table", {}) or {}
            if table.get("test_name"):
                tests_seen.add(str(table["test_name"]).lower())
            for raw in t.get("raw", []) or []:
                tr = raw.get("test_results", {})
                for cmd in tr.keys():
                    cmds.add(str(cmd).lower())

    for schema in schemas:
        m = schema.get("match") or {}
        ok = False
        if m.get("test_ids"):
            if any(tid.lower() in tests_seen for tid in m["test_ids"]):
                ok = True
        if m.get("commands"):
            if any(any(c.lower() in cmd for cmd in cmds) for c in m["commands"]):
                ok = True
        if ok:
            return schema
    return None


def universal_table_format(results, schema=None):
    """
    Build a table using a schema that defines:
      - entity_key: list of key paths to define row uniqueness
      - columns: list of column specs:
          * name: header
          * sources: [paths...]                         -> aggregate: first|last|set_join|min|max|sum
          * exists_any: [paths...]                      -> boolean
          * startswith: {path: "...", prefix: "..."}    -> boolean
          * from_command_contains: {contains: "...", value: "...", else_value: ""} -> string
      - result_rules:
          * fail_on_bucket_failed: true|false
          * fail_if_any_gt: [{column, threshold}, ...]
          * fail_if_any_lte: [{column, threshold}, ...]
          * fail_if_equals: [{column, value}, ...]
          * fail_if_ne: [{column, value}, ...]
      - filters:
          * include_if_any_true: [col, ...]
          * include_if_all_true: [col, ...]
      - sort:
          * keys: [col, ...]
          * failed_first: true|false
    """
    if not schema:
        return build_generic_dynamic_table(results)

    # Prepare output columns and helpers
    col_specs = schema.get("columns") or []
    entity_key_paths = schema.get("entity_key") or []
    result_rules = schema.get("result_rules") or {}
    filters = schema.get("filters") or {}
    sort_cfg = schema.get("sort") or {}

    # Always prepend Host, Device
    headers = ["Host", "Device"] + [c["name"] for c in col_specs]

    rows = []
    agg = {}  # key: (host, device, entity_key_values...)

    def ensure_entry(key_tuple):
        if key_tuple not in agg:
            agg[key_tuple] = {
                "_failed": False,
                "_sets": {},  # for set_join
                "_vals": {c["name"]: "" for c in col_specs}
            }
            # Initialize booleans to False if they come from exists/startswith
            for c in col_specs:
                if "exists_any" in c or "startswith" in c:
                    agg[key_tuple]["_vals"][c["name"]] = False
        return agg[key_tuple]

    # Iterate and merge
    for host_result in results.get("results_by_host", []):
        hostname = host_result.get("hostname", "")
        for t in host_result.get("test_results", []) or []:
            for raw in t.get("raw", []) or []:
                device = raw.get("device", hostname)
                tr = raw.get("test_results", {})
                for cmd, cmd_res in tr.items():
                    cmd_lower = str(cmd).lower()
                    if not isinstance(cmd_res, list):
                        continue
                    for trd in cmd_res:
                        for bucket, status in (("passed", "PASSED"), ("failed", "FAILED")):
                            for item in trd.get(bucket, []) or []:
                                # Build entity key
                                ek_vals = []
                                for path in entity_key_paths:
                                    val = value_from_item(item, path)
                                    ek_vals.append("" if val is None else str(val))
                                key = (hostname, device, *ek_vals)
                                entry = ensure_entry(key)

                                # Apply column sources/aggregates
                                for c in col_specs:
                                    cname = c["name"]
                                    # sources (string/number) with aggregate
                                    if "sources" in c:
                                        val = None
                                        for p in c["sources"]:
                                            v = value_from_item(item, p)
                                            if v is not None:
                                                val = v
                                                break
                                        if val is not None:
                                            agg_type = c.get("aggregate", "first")
                                            if agg_type == "first":
                                                if entry["_vals"][cname] in ("", False, None):
                                                    entry["_vals"][cname] = str(val)
                                            elif agg_type == "last":
                                                entry["_vals"][cname] = str(val)
                                            elif agg_type == "set_join":
                                                s = entry["_sets"].setdefault(cname, set())
                                                s.add(str(val))
                                                entry["_vals"][cname] = s  # store temporarily as set
                                            elif agg_type in ("min", "max", "sum"):
                                                cur = entry["_vals"][cname]
                                                try:
                                                    num = float(str(val))
                                                except Exception:
                                                    continue
                                                if cur in ("", None, False):
                                                    entry["_vals"][cname] = num
                                                else:
                                                    if agg_type == "min":
                                                        entry["_vals"][cname] = min(float(cur), num)
                                                    elif agg_type == "max":
                                                        entry["_vals"][cname] = max(float(cur), num)
                                                    elif agg_type == "sum":
                                                        entry["_vals"][cname] = float(cur) + num
                                    # exists_any -> boolean OR
                                    if "exists_any" in c:
                                        present = any(value_from_item(item, p) is not None for p in c["exists_any"])
                                        entry["_vals"][cname] = bool(entry["_vals"][cname]) or bool(present)
                                    # startswith check
                                    if "startswith" in c:
                                        spec = c["startswith"] or {}
                                        p = spec.get("path")
                                        pref = str(spec.get("prefix", "")).lower()
                                        vv = value_from_item(item, p)
                                        match = bool(vv) and str(vv).lower().startswith(pref)
                                        entry["_vals"][cname] = bool(entry["_vals"][cname]) or match
                                    # command-based literal
                                    if "from_command_contains" in c:
                                        spec = c["from_command_contains"] or {}
                                        contains = str(spec.get("contains", "")).lower()
                                        if contains and contains in cmd_lower:
                                            entry["_vals"][cname] = str(spec.get("value", ""))
                                        elif "else_value" in spec and entry["_vals"][cname] in ("", None, False):
                                            entry["_vals"][cname] = str(spec.get("else_value", ""))

                                # If any assertion failed for this entity
                                if status == "FAILED" and result_rules.get("fail_on_bucket_failed", True):
                                    entry["_failed"] = True

    # Finalize aggregations and build rows
    for key, entry in agg.items():
        # Convert set_join sets to joined strings and numeric aggregates to int if integral
        for c in col_specs:
            cname = c["name"]
            val = entry["_vals"][cname]
            if isinstance(val, set):
                entry["_vals"][cname] = ",".join(sorted(val))
            # normalize numeric (min/max/sum) to int if no decimals
            if isinstance(val, float) and float(val).is_integer():
                entry["_vals"][cname] = str(int(val))
            elif isinstance(val, (int, float)):
                entry["_vals"][cname] = str(val)

        # Compute Result
        result = "PASSED"
        if entry["_failed"] and result_rules.get("fail_on_bucket_failed", True):
            result = "FAILED"

        for cond in result_rules.get("fail_if_any_gt", []) or []:
            col, thr = cond.get("column"), cond.get("threshold", 0)
            if _to_int(entry["_vals"].get(col)) > int(thr):
                result = "FAILED"

        for cond in result_rules.get("fail_if_any_lte", []) or []:
            col, thr = cond.get("column"), cond.get("threshold", 0)
            if _to_int(entry["_vals"].get(col)) <= int(thr):
                result = "FAILED"

        for cond in result_rules.get("fail_if_equals", []) or []:
            col, val = cond.get("column"), str(cond.get("value", ""))
            if str(entry["_vals"].get(col, "")) == val:
                result = "FAILED"

        for cond in result_rules.get("fail_if_ne", []) or []:
            col, val = cond.get("column"), str(cond.get("value", ""))
            if str(entry["_vals"].get(col, "")) != val:
                result = "FAILED"

        entry["_vals"]["Result"] = result

    # Filters
    def include_entry(vals):
        if filters.get("include_if_any_true"):
            if not any(bool(vals.get(col)) for col in filters["include_if_any_true"]):
                return False
        if filters.get("include_if_all_true"):
            if not all(bool(vals.get(col)) for col in filters["include_if_all_true"]):
                return False
        return True

    # Sorting
    def row_sort_key(host, device, vals):
        failed_first = bool(sort_cfg.get("failed_first", False))
        score = 0 if (failed_first and vals.get("Result") == "FAILED") else 1
        keys = sort_cfg.get("keys") or []
        key_vals = [str(vals.get(k, "")) for k in keys]
        return (host, score, *key_vals)

    # Emit rows
    for key, entry in sorted(agg.items(), key=lambda kv: row_sort_key(kv[0][0], kv[0][1], kv[1]["_vals"])):
        host, device = key[0], key[1]
        vals = entry["_vals"]
        if not include_entry(vals):
            continue
        rows.append([host, device] + [str(vals.get(c["name"], "")) for c in col_specs])

    if not rows:
        rows.append(["", "", *[""] * len(col_specs)])
        # If there's a Result column, put PASS
        if any(c["name"] == "Result" for c in col_specs):
            rows[-1][-1] = "PASS"

    return headers, rows


# ----------------------- Generic dynamic table ---------------------------------
def build_generic_dynamic_table(results):
    """Baseline dynamic table for tests without a schema."""
    id_keys, rows = set(), []

    for host_result in results.get("results_by_host", []):
        for t in host_result.get("test_results", []) or []:
            for raw in t.get("raw", []) or []:
                tr = raw.get("test_results", {})
                for _, cmd_res in tr.items():
                    if not isinstance(cmd_res, list):
                        continue
                    for trd in cmd_res:
                        for bucket in ("passed", "failed"):
                            for item in trd.get(bucket, []) or []:
                                ids = item.get("id") or {}
                                id_keys.update(k for k in ids.keys() if isinstance(k, str) and k.strip())

    id_cols = sorted(id_keys)
    headers = ["Host", "Device"] + id_cols + ["Node", "Expected", "Actual", "Status", "Message"]

    for host_result in results.get("results_by_host", []):
        hostname = host_result.get("hostname", "")
        for t in host_result.get("test_results", []) or []:
            device = ""
            for raw in t.get("raw", []) or []:
                device = raw.get("device", hostname)
                break
            for raw in t.get("raw", []) or []:
                tr = raw.get("test_results", {})
                for _, cmd_res in tr.items():
                    if not isinstance(cmd_res, list):
                        continue
                    for trd in cmd_res:
                        node = trd.get("node_name") or ""
                        expected_default = trd.get("expected_node_value")

                        def row(item, status):
                            pre = item.get("pre") or {}
                            post = item.get("post") or {}
                            ids = item.get("id") or {}
                            id_values = [str(ids.get(k, "")) for k in id_cols]
                            expected = expected_default if expected_default is not None else pre.get(node)
                            if expected is None and pre:
                                try:
                                    expected = next(iter(pre.values()))
                                except StopIteration:
                                    expected = ""
                            actual = item.get("actual_node_value")
                            if actual is None:
                                actual = post.get(node)
                            if actual is None and post:
                                try:
                                    actual = next(iter(post.values()))
                                except StopIteration:
                                    actual = ""
                            msg = expand_placeholders(item.get("message") or item.get("err") or "", item)
                            rows.append([hostname, device] + id_values + [str(node or ""), "" if expected is None else str(expected),
                                                                         "" if actual is None else str(actual), status, msg])

                        for it in trd.get("failed", []) or []:
                            row(it, "FAILED")
                        for it in trd.get("passed", []) or []:
                            row(it, "PASSED")

    dprint(f"VIEW=GENERIC_DYNAMIC headers={headers}")
    if not rows:
        rows.append(["", ""] + [""] * len(id_cols) + ["", "", "", "PASS", "No data"])
    return headers, rows


# ----------------------- Universal selector ------------------------------------
def build_universal_table(results):
    """Select a schema and render; fallback to generic if none matches."""
    schemas = load_schemas()
    schema = match_schema_to_results(schemas, results)
    if schema:
        return universal_table_format(results, schema)
    return build_generic_dynamic_table(results)


# ----------------------- Display ------------------------------------------------
def create_result_table(test_name, test_title, raw_results):
    table = {
        "test_name": sanitize_text(test_name),
        "title": sanitize_text(test_title),
        "columns": ["Check", "Status", "Details", "Timestamp"],
        "rows": []
    }
    if not raw_results or not isinstance(raw_results, list):
        table["rows"].append({"Check": f"{test_name} - No Data", "Status": "UNKNOWN", "Details": "No test results available", "Timestamp": ""})
        return table

    for r in raw_results:
        table["rows"].append({
            "Check": sanitize_text(r.get("Check", "Unknown Check")),
            "Status": str(r.get("Result", "UNKNOWN")).upper(),
            "Details": sanitize_text(r.get("Details", "")),
            "Timestamp": ""
        })
    return table


def display_results(results, args=None):
    tablefmt = getattr(args, "format", "grid") if args else "grid"
    show_raw = getattr(args, "show_raw", False) if args else False
    max_rows = getattr(args, "max_rows", 0) if args else 0
    trunc_len = getattr(args, "truncate_details", 120) if args else 120

    def trunc(s, n):
        if s is None:
            return ""
        s = str(s)
        return s if n <= 0 or len(s) <= n else s[: max(0, n - 1)] + "…"

    print("\n" + "=" * 80)
    print("TEST EXECUTION SUMMARY".center(80))
    print("=" * 80)
    print(f"Total Hosts: {results['summary']['total_hosts']}")
    print(f"Passed Hosts: {results['summary']['passed_hosts']}")
    print(f"Total Tests Executed: {results['summary']['total_tests']}")
    print(f"Mode: {results['summary'].get('mode', 'current')}")
    print("=" * 80 + "\n")

    headers, rows = build_universal_table(results)

    if "Message" in headers and trunc_len > 0:
        i = headers.index("Message")
        rows = [r[:i] + [trunc(r[i], trunc_len)] + r[i + 1:] for r in rows]

    disp_rows = rows if max_rows <= 0 else rows[:max_rows]
    dprint(f"ACTIVE_HEADERS={headers}")
    print(tabulate(disp_rows, headers=headers, tablefmt=tablefmt, showindex=False))

    if show_raw:
        print("\nRaw Data:")
        print(json.dumps(results["results_by_host"], indent=2))

    print("\n" + "=" * 80)
    print("EXECUTION COMPLETE".center(80))
    print("=" * 80)


# ----------------------- Async orchestration -----------------------------------
async def validate_host(hostname, username, password, tests, test_defs, idx, mode="current", snapshot_name=None, compare_with=None):
    conn_step, exec_step = (idx * 2) - 1, idx * 2
    send_progress("STEP_START", {"step": conn_step, "name": f"Connect to {hostname}"}, f"Connecting to {hostname}...")
    try:
        with Device(host=hostname, user=username, passwd=password, timeout=30) as dev:
            send_progress("STEP_COMPLETE", {"step": conn_step}, f"Successfully connected to {hostname}.")

            if mode == "snapshot":
                send_progress("STEP_START", {"step": exec_step, "name": f"Take Snapshots on {hostname}"}, f"Taking {len(tests)} snapshots on {hostname}...")
            elif mode == "compare":
                send_progress("STEP_START", {"step": exec_step, "name": f"Compare Snapshots on {hostname}"}, f"Comparing {len(tests)} snapshots on {hostname}...")
            else:
                send_progress("STEP_START", {"step": exec_step, "name": f"Run Validations on {hostname}"}, f"Executing {len(tests)} tests on {hostname}...")

            host_results = []
            for test_name in tests:
                if test_name not in test_defs:
                    continue
                if mode == "snapshot":
                    tr = take_jsnapy_snapshot(dev, test_name, test_defs[test_name], snapshot_name, origin_host=hostname)
                    status = "SUCCESS" if not any(r["Status"] == "ERROR" for r in tr["table"]["rows"]) else "ERROR"
                    send_progress("TEST_COMPLETE", {"host": hostname, "test": test_name, "status": status, "mode": "snapshot", "snapshot_name": snapshot_name}, f"Snapshot {test_name} completed on {hostname}")
                elif mode == "compare":
                    tr = compare_jsnapy_snapshots(dev, test_name, test_defs[test_name], compare_with, snapshot_name, origin_host=hostname)
                    status = "SUCCESS" if not any(r["Status"] == "ERROR" for r in tr["table"]["rows"]) else "ERROR"
                    send_progress("TEST_COMPLETE", {"host": hostname, "test": test_name, "status": status, "mode": "compare", "pre_snapshot": compare_with, "post_snapshot": snapshot_name}, f"Comparison {test_name} completed on {hostname}")
                else:
                    tr = run_jsnapy_test(dev, test_name, test_defs[test_name], origin_host=hostname)
                    status = "SUCCESS" if not any(r["Status"] == "FAILED" for r in tr["table"]["rows"]) else "WARNING"
                    send_progress("TEST_COMPLETE", {"host": hostname, "test": test_name, "status": status, "mode": "current"}, f"Test {test_name} completed on {hostname}")
                host_results.append(tr)

            send_progress("STEP_COMPLETE", {"step": exec_step}, f"Finished all operations on {hostname}.")
            return {"hostname": sanitize_text(hostname), "status": "success", "test_results": host_results, "mode": mode, "snapshot_name": snapshot_name, "compare_with": compare_with}

    except (ConnectError, ConnectTimeoutError, ConnectAuthError, Exception) as e:
        msg = f"An error occurred with host {hostname}: {sanitize_text(str(e))}"
        send_progress("STEP_COMPLETE", {"step": conn_step, "status": "FAILED"}, msg)
        return {"hostname": sanitize_text(hostname), "status": "error", "message": msg}


# ----------------------- Main async orchestrator -------------------------------
async def main_async(args):
    candidates = [Path(__file__).parent / 'tests.yml', Path(__file__).parent / 'test.yml']
    tests_yml = next((p for p in candidates if p.exists()), candidates[0])
    with open(tests_yml) as f:
        test_defs = yaml.safe_load(f)

    if args.list_tests:
        categorized = {}
        for test_id, details in (test_defs or {}).items():
            if test_id in ("test_suites", "global_config", "thresholds"):
                continue
            cat = sanitize_text((details or {}).get("category", "Uncategorized"))
            categorized.setdefault(cat, []).append({
                "id": sanitize_text(test_id),
                "title": sanitize_text((details or {}).get("title", test_id)),
                "description": sanitize_text((details or {}).get("description", "No description provided.")),
                "category": cat,
            })
        return {"success": True, "discovered_tests": categorized}

    hosts = [h.strip() for h in args.hostname.split(",")]
    tests_to_run = [t.strip() for t in args.tests.split(",")]
    mode = getattr(args, 'mode', 'current')
    snap = getattr(args, 'snapshot_name', None)
    comp = getattr(args, 'compare_with', None)

    if mode == "snapshot" and not snap:
        raise ValueError("Snapshot mode requires --snapshot-name parameter")
    if mode == "compare" and (not snap or not comp):
        raise ValueError("Compare mode requires both --snapshot-name and --compare-with parameters")

    total_steps = len(hosts) * 2
    send_progress(
        "OPERATION_START",
        {"total_steps": total_steps, "mode": mode, "snapshot_name": snap, "compare_with": comp},
        f"Starting {'validation' if mode=='current' else 'snapshot comparison' if mode=='compare' else 'snapshot collection'} for {len(hosts)} host(s)."
    )

    results = await asyncio.gather(*[
        validate_host(h, args.username, args.password, tests_to_run, test_defs, i + 1, mode, snap, comp)
        for i, h in enumerate(hosts)
    ])

    final = {
        "type": "result",
        "data": {
            "results_by_host": results,
            "summary": {
                "passed_hosts": sum(1 for r in results if r["status"] == "success"),
                "total_tests": len(tests_to_run) * len(hosts),
                "total_hosts": len(hosts),
                "tests_per_host": len(tests_to_run),
                "mode": mode,
                "snapshot_name": snap,
                "compare_with": comp
            }
        }
    }
    return final


# ----------------------- CLI entrypoint ----------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Asynchronous Network Validation Tool with Universal, Schema-Driven Tables")

    parser.add_argument("--hostname", help="Comma-separated device IPs")
    parser.add_argument("--username", help="Device login username")
    parser.add_argument("--password", help="Device login password")
    parser.add_argument("--tests", help="Comma-separated test IDs (from tests.yml)")
    parser.add_argument("--list_tests", action="store_true", help="List available tests")

    parser.add_argument("--mode", choices=["current", "snapshot", "compare"], default="current", help="Operation mode")
    parser.add_argument("--snapshot-name", dest="snapshot_name", help="Name for snapshot (snapshot/compare modes)")
    parser.add_argument("--compare-with", dest="compare_with", help="Pre-snapshot name (compare mode)")

    parser.add_argument("--format", choices=["grid", "github", "simple", "plain", "fancy_grid"], default="grid", help="Table format")
    parser.add_argument("--show_raw", action="store_true", help="Include raw JSON payloads at the end")
    parser.add_argument("--max_rows", type=int, default=0, help="Max rows to print (0 = no limit)")
    parser.add_argument("--truncate_details", type=int, default=120, help="Truncate Message column (0 = no truncation)")
    parser.add_argument("--debug", action="store_true", help="Enable debug prints")

    args = parser.parse_args()

    try:
        global DEBUG_ENABLED
        DEBUG_ENABLED = bool(args.debug)

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

        print(json.dumps(final_output))

    except Exception as e:
        msg = f"A critical script error occurred: {sanitize_text(str(e))}"
        send_progress("OPERATION_COMPLETE", {"status": "FAILED"}, msg)
        print(json.dumps({"type": "error", "message": msg}))
        print(f"CRITICAL ERROR: {traceback.format_exc()}", file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()