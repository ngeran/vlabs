#!/usr/bin/env python3 Baseline v1
"""
Optimized Environment-Aware JSNAPy Test Runner for Web UI
Author: nikos-geranios_vgi
Final Definitive Version: This version merges the pre-execution reachability check
with the intelligent error handling for the '--deepcopy--' bug.
"""
import asyncio
import argparse
import os
import sys
import json
import logging
import yaml
import time
import glob
import hashlib
import getpass
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
from functools import lru_cache
from datetime import datetime
import socket

try:
    from lxml import etree
    from jnpr.jsnapy import SnapAdmin
    from jnpr.junos import Device
    from jnpr.junos.exception import ConnectError
    import psutil
except ImportError as e:
    raise ImportError(f"Missing required libraries. Details: {e}")

# --- Directory and Constant Setup ---
SCRIPT_DIR = Path(__file__).parent
TESTS_DIR = SCRIPT_DIR / 'tests'
LOGS_DIR = SCRIPT_DIR / 'logs'
CACHE_DIR = SCRIPT_DIR / 'cache'
for d in [TESTS_DIR, LOGS_DIR, CACHE_DIR]:
    d.mkdir(exist_ok=True, parents=True)

# --- Data Structures ---
@dataclass
class TestResult:
    test_name: str; device: str; result: bool; message: str; execution_time: float = 0.0
    details: Dict[str, Any] = field(default_factory=dict); timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

@dataclass
class TestConfig:
    name: str; file: str; description: str; category: str = "General"
    display_hints: Optional[Dict[str, Any]] = None

# --- Core Service Classes ---
class ConfigCache:
    @lru_cache(maxsize=128)
    def load_yaml_cached(self, file_path: str) -> Dict[str, Any]:
        try:
            with open(file_path, 'r') as f: return yaml.safe_load(f)
        except Exception: return {}

class JSNAPyConfigManager:
    def setup(self):
        jsnapy_dir = Path.home() / ".jsnapy"; jsnapy_dir.mkdir(exist_ok=True, parents=True)
        (jsnapy_dir / "jsnapy.cfg").write_text(f"[DEFAULT]\nsnapshot_path = {CACHE_DIR.resolve()}\ntest_file_path = {TESTS_DIR.resolve()}\n")
        if not (jsnapy_dir / "logging.yml").exists(): (jsnapy_dir / "logging.yml").write_text("{'version': 1}")

class TestDiscovery:
    def __init__(self, tests_dir: Path, cache: ConfigCache):
        self.tests_dir, self.cache = tests_dir, cache

    def discover(self) -> Dict[str, Dict[str, Any]]:
        discovered = {}
        for file in glob.glob(str(self.tests_dir / 'test_*.y*ml')) + glob.glob(str(self.tests_dir / '*_test.y*ml')):
            if info := self._process_file(file): discovered[info['name']] = info
        return discovered

    def _process_file(self, file: str) -> Optional[Dict[str, Any]]:
        content = self.cache.load_yaml_cached(file); meta = content.get('test_metadata', {})
        return {'name': Path(file).stem, 'file': os.path.basename(file), 'description': meta.get('description', 'N/A'),
                'category': meta.get('category', 'General'), 'display_hints': meta.get('display_hints')}

class TestExecutor:
    def __init__(self, tests_dir: Path):
        self.tests_dir, self.logger = tests_dir, logging.getLogger(__name__)
        JSNAPyConfigManager().setup()

    async def run(self, configs: List[TestConfig], host: str, user: str, pswd: str) -> List[TestResult]:
        with ThreadPoolExecutor(max_workers=3) as executor:
            loop = asyncio.get_event_loop()
            futures = [loop.run_in_executor(executor, self._execute_single, tc, host, user, pswd) for tc in configs]
            return await asyncio.gather(*futures)

    def _execute_single(self, config: TestConfig, host: str, user: str, pswd: str) -> TestResult:
        """This function is bulletproof and intelligently handles the '--deepcopy--' bug."""
        start_time = time.time()
        details = {'display_hints': config.display_hints}
        success, message, result_obj = False, "Test did not run.", None
        
        try:
            with Device(host=host, user=user, passwd=pswd, port=22, timeout=20) as dev:
                result_obj = SnapAdmin().snapcheck(data={'hosts': [{'device': dev}], 'tests': [str(self.tests_dir / config.file)]})
                success, message = self._parse_jsnapy(result_obj)
        except ConnectError as e:
            success, message = False, f"ConnectError: {e}"
        except Exception as e:
            if "Invalid tag name '--deepcopy--'" in str(e):
                self.logger.warning(f"Handled known JSNAPy '--deepcopy--' bug for {config.name}.")
                s, m = self._parse_jsnapy(result_obj)
                success, message = (True, m + " (Note: Handled a benign library error)") if s else (False, m or f"Execution error: {e}")
            else:
                success, message = False, f"Execution error: {e}"
                self.logger.error(f"Error in _execute_single for {config.name}: {e}", exc_info=True)
        
        # Decoupled Data Extraction
        try:
            snap_file = next(iter(sorted(CACHE_DIR.glob(f"{host}*.xml"), key=os.path.getmtime, reverse=True)), None)
            if snap_file and snap_file.exists():
                details.update(self._extract_details(snap_file, config.name))
        except Exception as e:
            self.logger.error(f"Data extraction failed for {host}: {e}")

        return TestResult(config.name, host, success, message, time.time() - start_time, details)

    def _extract_details(self, snap_file: Path, test_name: str) -> Dict[str, Any]:
        """Robustly parses XML using recover=True."""
        try:
            parser = etree.XMLParser(remove_comments=True, recover=True)
            tree = etree.parse(str(snap_file), parser)
            if 'interface' in test_name:
                return {'extracted_data': self._extract(tree, './/physical-interface', ['name', 'admin-status', 'oper-status', 'description', 'mtu'])}
            return {}
        except Exception: return {}

    def _extract(self, tree: etree._ElementTree, xpath: str, fields: List[str]) -> List[Dict[str, Any]]:
        return [{f: el.findtext(f, 'N/A').strip() for f in fields} for el in tree.findall(xpath)]

    def _parse_jsnapy(self, res) -> Tuple[bool, str]:
        if not res or not isinstance(res, list): return False, "No valid result from JSNAPy"
        failures = [getattr(r, 'err_mssg', 'Unknown') for r in res if hasattr(r, 'result') and r.result != 'Passed']
        count = sum(1 for r in res if hasattr(r, 'result'))
        if count == 0: return False, "FAIL: 0 checks ran. Data may not exist."
        if failures: return False, f"FAIL: {len(failures)} of {count} checks failed."
        return True, "PASS: All checks passed."

class TestRunner:
    def __init__(self, env: str):
        self._setup_logging()
        self.target_env = env
        self.discovery = TestDiscovery(TESTS_DIR, ConfigCache())
        self.executor = TestExecutor(TESTS_DIR)
        self.all_tests = self.discovery.discover()

    def _setup_logging(self):
        logging.getLogger('jnpr.junos').setLevel(logging.CRITICAL); logging.getLogger('ncclient').setLevel(logging.CRITICAL)
        logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', handlers=[logging.FileHandler(LOGS_DIR / f'runner_{datetime.now().strftime("%Y%m%d")}.log')])
    
    def is_host_reachable(self, host: str, port: int = 22, timeout: int = 3) -> bool:
        """Performs a quick TCP socket check for reachability."""
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return True
        except (socket.timeout, socket.gaierror, OSError):
            return False

    async def run(self, hostnames: List[str], user: str, pswd: str, test_names: List[str]) -> Dict[str, Any]:
        configs = [TestConfig(**self.all_tests[name]) for name in test_names if name in self.all_tests] if test_names else [TestConfig(**data) for data in self.all_tests.values()]
        if not configs: return {"status": "error", "message": "No valid tests found."}
        
        # --- PRE-EXECUTION REACHABILITY CHECK (Your Suggestion) ---
        for host in hostnames:
            if not self.is_host_reachable(host):
                return {"status": "error", "message": f"Host Unreachable: Could not connect to {host}. Please check the IP address and network connectivity."}

        tasks = [self.executor.run(configs, host, user, pswd) for host in hostnames]
        all_results = [item for sublist in await asyncio.gather(*tasks) for item in sublist]

        if any("ConnectError" in r.message for r in all_results if not r.result):
            return {"status": "error", "message": "Authentication Failure. Please check username and password."}
        
        return self._summarize(all_results, hostnames)

    def _summarize(self, results: List[TestResult], hosts: List[str]) -> Dict[str, Any]:
        passed = sum(1 for r in results if r.result)
        return {"status": "completed", "environment": self.target_env,
                "summary": {"hosts": hosts, "passed": passed, "failed": len(results) - passed},
                "results": [asdict(r) for r in results]}

def main():
    """Main entry point: guaranteed to always exit with status 0."""
    final_output = {}
    try:
        parser = argparse.ArgumentParser(description="JSNAPy Test Runner for Web UI")
        hostname_group = parser.add_mutually_exclusive_group(required=True)
        hostname_group.add_argument("--hostname"); hostname_group.add_argument("--hostnames")
        parser.add_argument("--username"); parser.add_argument("--password")
        parser.add_argument("--tests"); parser.add_argument("--environment", default="development")
        parser.add_argument("--list_tests", action="store_true")
        args = parser.parse_args()

        runner = TestRunner(env=args.environment)
        if args.list_tests:
            final_output = {"discovered_tests": runner.all_tests}
        else:
            hostnames_str = args.hostname or args.hostnames
            if not hostnames_str: raise ValueError("Hostname is required.")
            hostnames = [h.strip() for h in hostnames_str.split(',')]
            tests = args.tests.split(',') if args.tests else None
            final_output = asyncio.run(runner.run(hostnames, args.username, args.password, tests))
    except Exception as e:
        final_output = {"status": "error", "message": f"A critical script error occurred: {e}", "error_type": type(e).__name__}
    finally:
        print(json.dumps(final_output, indent=2))
        sys.exit(0) 

if __name__ == "__main__":
    main()
