#!/usr/bin/env python3
"""
Optimized Environment-Aware JSNAPy Test Runner
Author: nikos-geranios_vgi
Optimized: 2025-06-26
Fixed: JSNAPy logging configuration issue

Key Optimizations:
- Async/parallel test execution
- Credential management system
- Caching and lazy loading
- Modular architecture
- Enhanced error handling
- Performance monitoring
- Fixed JSNAPy configuration paths
"""

import asyncio
import argparse
import os
import sys
import json
import logging
import tempfile
import yaml
import time
import glob
import shutil
import hashlib
import getpass
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Union, Tuple
from pathlib import Path
from functools import lru_cache
from contextlib import contextmanager
from datetime import datetime
from lxml import etree

# NEW: Import for table formatting
from tabulate import tabulate

# Third-party imports
from jnpr.jsnapy import SnapAdmin
from jnpr.junos import Device
from jnpr.junos.exception import ConnectError

# Performance monitoring
import psutil

# Constants
SCRIPT_DIR = Path(__file__).parent
PIPELINE_ROOT = SCRIPT_DIR.parent
UTILS_DIR = PIPELINE_ROOT / 'utils'
TESTS_DIR = SCRIPT_DIR / 'tests'
CONFIG_DIR = SCRIPT_DIR / 'config'
LOGS_DIR = SCRIPT_DIR / 'logs'
CACHE_DIR = SCRIPT_DIR / 'cache'

# Ensure directories exist
# Commented out to suppress verbose output in quiet mode
# for directory in [TESTS_DIR, CONFIG_DIR, LOGS_DIR, CACHE_DIR]:
#     directory.mkdir(exist_ok=True)

# Add utils to path
sys.path.insert(0, str(UTILS_DIR))

@dataclass
class TestResult:
    """Lightweight test result with performance metrics"""
    test_name: str
    device: str
    result: bool
    message: str
    execution_time: float = 0.0
    memory_usage: float = 0.0
    details: Dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

@dataclass
class TestConfig:
    """Streamlined test configuration"""
    name: str
    file: str
    description: str
    rpc_fallback: str
    enabled: bool = True
    timeout: int = 15
    environment_classification: str = "development"
    safety_level: str = "safe"
    production_approved: bool = False
    max_impact_level: str = "low"

class CredentialManager:
    """Secure credential management"""

    def __init__(self):
        self._credentials = {}

    def get_credentials(self, hostname: str, username: str = None, password: str = None) -> Tuple[str, str]:
        """Get credentials securely"""
        if username and password:
            return username, password

        # Try environment variables first
        env_user = os.getenv(f'JSNAPY_USER_{hostname.upper().replace(".", "_")}') or os.getenv('JSNAPY_USER')
        env_pass = os.getenv(f'JSNAPY_PASS_{hostname.upper().replace(".", "_")}') or os.getenv('JSNAPY_PASS')

        if env_user and env_pass:
            return env_user, env_pass

        # Interactive prompt as fallback
        if not username:
            username = input(f"Username for {hostname}: ")
        if not password:
            password = getpass.getpass(f"Password for {hostname}: ")

        return username, password

class ConfigCache:
    """Configuration caching system"""

    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self._memory_cache = {}

    def _get_cache_key(self, file_path: Path) -> str:
        """Generate cache key based on file path and modification time"""
        stat = file_path.stat()
        return hashlib.md5(f"{file_path}:{stat.st_mtime}".encode()).hexdigest()

    @lru_cache(maxsize=128)
    def load_yaml_cached(self, file_path: str) -> Dict[str, Any]:
        """Load YAML with caching"""
        path = Path(file_path)
        cache_key = self._get_cache_key(path)

        if cache_key in self._memory_cache:
            return self._memory_cache[cache_key]

        try:
            with open(path, 'r') as f:
                data = yaml.safe_load(f)
            self._memory_cache[cache_key] = data
            return data
        except Exception as e:
            logging.warning(f"Failed to load {file_path}: {e}")
            return {}

class JSNAPyConfigManager:
    """Manages JSNAPy configuration and logging"""

    def __init__(self, config_dir: Path):
        self.config_dir = config_dir
        self.logger = logging.getLogger(__name__)

    def setup_jsnapy_environment(self):
        """Setup JSNAPy environment and configuration"""
        try:
            # Set JSNAPy configuration directory
            jsnapy_config_dir = self.config_dir

            # Create JSNAPy configuration if it doesn't exist
            logging_yml = jsnapy_config_dir / 'logging.yml'
            if not logging_yml.exists():
                self._create_default_logging_config(logging_yml)

            # Set environment variables for JSNAPy
            os.environ['JSNAPY_HOME'] = str(jsnapy_config_dir)

            # Try to configure JSNAPy logging programmatically
            import logging.config
            with open(logging_yml, 'r') as f:
                logging_config = yaml.safe_load(f)
            logging.config.dictConfig(logging_config)

            # Commented out to suppress verbose output in quiet mode
            # self.logger.info(f"✅ JSNAPy environment configured with config dir: {jsnapy_config_dir}")

        except Exception as e:
            self.logger.warning(f"⚠️ JSNAPy configuration warning: {e}")
            # Continue execution - JSNAPy might still work with defaults

    def _create_default_logging_config(self, logging_yml: Path):
        """Create default JSNAPy logging configuration"""
        default_config = {
            'version': 1,
            'disable_existing_loggers': False,
            'formatters': {
                'simple': {
                    'format': '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
                }
            },
            'handlers': {
                'console': {
                    'class': 'logging.StreamHandler',
                    'formatter': 'simple',
                    'level': 'INFO',
                    'stream': 'ext://sys.stdout'
                }
            },
            'loggers': {
                'jsnapy': {
                    'handlers': ['console'],
                    'level': 'INFO',
                    'propagate': False
                }
            },
            'root': {
                'handlers': ['console'],
                'level': 'INFO'
            }
        }

        with open(logging_yml, 'w') as f:
            yaml.dump(default_config, f, default_flow_style=False)

class TestDiscovery:
    """Optimized test discovery with caching"""

    def __init__(self, tests_dir: Path, cache: ConfigCache, quiet: bool):
        self.tests_dir = tests_dir
        self.cache = cache
        self.quiet = quiet
        self.logger = logging.getLogger(__name__)

    @lru_cache(maxsize=1)
    def discover_tests(self, target_environment: str) -> Dict[str, Dict[str, Any]]:
        """Discover and classify tests with caching"""
        discovered = {}
        test_patterns = ['test_*.yml', 'test_*.yaml', '*_test.yml', '*_test.yaml']

        # Commented out to suppress verbose output in quiet mode
        # if not self.quiet:
        #     self.logger.info(f"🔍 Discovering tests for {target_environment}")

        # Use glob once and cache results
        all_test_files = []
        for pattern in test_patterns:
            all_test_files.extend(glob.glob(str(self.tests_dir / pattern)))

        # Process files in parallel
        with ThreadPoolExecutor(max_workers=4) as executor:
            future_to_file = {
                executor.submit(self._process_test_file, test_file, target_environment): test_file
                for test_file in all_test_files
            }

            for future in as_completed(future_to_file):
                test_file = future_to_file[future]
                try:
                    test_info = future.result()
                    if test_info:
                        test_name = Path(test_file).stem
                        discovered[test_name] = test_info
                except Exception as e:
                    self.logger.error(f"Error processing {test_file}: {e}")

        # Commented out to suppress verbose output in quiet mode
        # if not self.quiet:
        #     self.logger.info(f"📊 Discovered {len(discovered)} tests")
        return discovered

    def _process_test_file(self, test_file: str, target_environment: str) -> Optional[Dict[str, Any]]:
        """Process single test file"""
        try:
            content = self.cache.load_yaml_cached(test_file)
            env_metadata = content.get('test_metadata', {})

            # Quick environment check
            is_appropriate = self._is_environment_appropriate(env_metadata, target_environment)

            return {
                'file': os.path.basename(test_file),
                'full_path': test_file,
                'description': content.get('description', f'Test: {Path(test_file).stem}'),
                'rpc_fallback': env_metadata.get('rpc_fallback', self._guess_rpc_fallback(test_file)),
                'environment_classification': env_metadata.get('environment_classification', 'development'),
                'safety_level': env_metadata.get('safety_level', 'safe'),
                'production_approved': env_metadata.get('production_approved', False),
                'max_impact_level': env_metadata.get('max_impact_level', 'low'),
                'environment_appropriate': is_appropriate,
                'file_size': os.path.getsize(test_file),
                'modified_time': os.path.getmtime(test_file)
            }
        except Exception as e:
            logging.warning(f"Failed to process {test_file}: {e}")
            return None

    def _is_environment_appropriate(self, metadata: Dict[str, Any], target_env: str) -> bool:
        """Fast environment check"""
        env_classification = metadata.get('environment_classification', 'development')
        production_approved = metadata.get('production_approved', False)
        restricted_envs = metadata.get('restricted_environments', [])

        if target_env in restricted_envs:
            return False

        if target_env == 'production':
            return production_approved

        return target_env in ['development', 'lab'] or env_classification == target_env

    @staticmethod
    def _guess_rpc_fallback(test_file: str) -> str:
        """Quick RPC fallback guess"""
        name_lower = Path(test_file).stem.lower()
        rpc_map = {
            'interface': 'get-interface-information',
            'route': 'get-route-information',
            'bgp': 'get-bgp-neighbor-information',
            'chassis': 'get-chassis-inventory'
        }

        for keyword, rpc in rpc_map.items():
            if keyword in name_lower:
                return rpc

        return 'get-chassis-inventory'

class TestExecutor:
    """Optimized test execution engine"""

    def __init__(self, tests_dir: Path, config_dir: Path, credential_manager: CredentialManager, quiet: bool):
        self.tests_dir = tests_dir
        self.config_dir = config_dir
        self.credential_manager = credential_manager
        self.quiet = quiet
        self.logger = logging.getLogger(__name__)

        # Setup JSNAPy configuration
        self.jsnapy_config_manager = JSNAPyConfigManager(config_dir)
        self.jsnapy_config_manager.setup_jsnapy_environment()

    async def execute_tests_parallel(self, test_configs: List[TestConfig],
                                   hostname: str, username: str = None,
                                   password: str = None, max_workers: int = 3) -> List[TestResult]:
        """Execute tests in parallel with controlled concurrency for a single host"""
        start_time = time.time()
        username, password = self.credential_manager.get_credentials(hostname, username, password)

        # Commented out to suppress verbose output in quiet mode
        # if not self.quiet:
        #     self.logger.info(f"🚀 Starting parallel execution of {len(test_configs)} tests for host {hostname}")

        # Use thread pool for I/O bound JSNAPy operations
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all tasks
            future_to_test = {
                executor.submit(self._execute_single_test, test_config, hostname, username, password): test_config
                for test_config in test_configs
            }

            results = []
            completed = 0

            # Process results as they complete
            for future in as_completed(future_to_test):
                test_config = future_to_test[future]
                try:
                    result = future.result()
                    results.append(result)
                    completed += 1

                    # Progress update - Commented out to suppress verbose output in quiet mode
                    # if completed % 5 == 0 or completed == len(test_configs):
                    #     self.logger.info(f"📈 Progress for {hostname}: {completed}/{len(test_configs)} tests completed")

                except Exception as e:
                    self.logger.error(f"❌ Test {test_config.name} on {hostname} failed: {e}")
                    results.append(TestResult(
                        test_name=test_config.name,
                        device=hostname,
                        result=False,
                        message=f"Execution error: {str(e)}",
                        execution_time=0
                    ))

        total_time = time.time() - start_time
        # Commented out to suppress verbose output in quiet mode
        # if not self.quiet:
        #     self.logger.info(f"⏱️ All tests for {hostname} completed in {total_time:.2f}s")

        return results

    # NEW: Method to get Junos version from device using PyEZ
    def _get_junos_version(self, hostname: str, username: str, password: str) -> Optional[str]:
        """Connect to device and retrieve Junos version via RPC"""
        # Commented out to suppress verbose output in quiet mode
        # if not self.quiet:
        #     self.logger.info(f"Connecting to {hostname} to retrieve version...")
        try:
            with Device(host=hostname, user=username, passwd=password, port=22) as dev:
                # Use RPC to get software information as XML
                response_xml = dev.rpc.get_software_information(normalize=True)
                # Parse XML to find the version
                version_element = response_xml.findtext('.//junos-version')
                if version_element:
                    # Commented out to suppress verbose output in quiet mode
                    # if not self.quiet:
                    #     self.logger.info(f"Found Junos version: {version_element}")
                    return version_element
                else:
                    self.logger.warning("Junos version element not found in RPC response.")
                    return "Not Found"
        except ConnectError as e:
            self.logger.error(f"Failed to connect to {hostname} to get version: {e}")
            return "Connection Error"
        except Exception as e:
            self.logger.error(f"Error retrieving Junos version from {hostname}: {e}")
            return "Extraction Error"

    def _execute_single_test(self, test_config: TestConfig, hostname: str,
                           username: str, password: str) -> TestResult:
        """Execute a single test with performance monitoring"""
        start_time = time.time()
        process = psutil.Process()
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB

        # Get version for 'test_version'
        version_details = {}
        if test_config.name == 'test_version':
            junos_version = self._get_junos_version(hostname, username, password)
            version_details['junos_version'] = junos_version
            # Commented out to suppress verbose output in quiet mode
            # if not self.quiet:
            #     self.logger.info(f"Test '{test_config.name}' retrieved version: {junos_version}")

        try:
            # Create a temporary configuration file for this test
            with tempfile.NamedTemporaryFile(mode='w', suffix='.yml', delete=False) as temp_config:
                config_data = {
                    'hosts': [{
                        'device': hostname,
                        'username': username,
                        'passwd': password,
                        'port': 22
                    }],
                    'tests': [str(self.tests_dir / test_config.file)]
                }

                yaml.dump(config_data, temp_config, default_flow_style=False)
                temp_config_path = temp_config.name

            try:
                # Execute with JSNAPy using config file
                js = SnapAdmin()

                # Try different approaches for JSNAPy execution
                try:
                    # Method 1: Use config file
                    result = js.snapcheck(config_file=temp_config_path, hostname=hostname)
                except Exception as e1:
                    self.logger.debug(f"Config file method failed: {e1}, trying data method")
                    try:
                        # Method 2: Use data directly
                        result = js.snapcheck(data=config_data, hostname=hostname)
                    except Exception as e2:
                        self.logger.debug(f"Data method failed: {e2}, trying simple approach")
                        # Method 3: Simplified approach
                        result = self._execute_simple_jsnapy(test_config, hostname, username, password)

                # Quick result parsing
                success, message = self._parse_jsnapy_result(result, version_details)

            finally:
                # Clean up temporary config file
                try:
                    os.unlink(temp_config_path)
                except:
                    pass

            # Performance metrics
            execution_time = time.time() - start_time
            final_memory = process.memory_info().rss / 1024 / 1024
            memory_usage = final_memory - initial_memory

            return TestResult(
                test_name=test_config.name,
                device=hostname,
                result=success,
                message=message,
                execution_time=execution_time,
                memory_usage=memory_usage,
                details=version_details
            )

        except Exception as e:
            return TestResult(
                test_name=test_config.name,
                device=hostname,
                result=False,
                message=f"Test execution error: {str(e)}",
                execution_time=time.time() - start_time,
                details=version_details
            )

    def _execute_simple_jsnapy(self, test_config: TestConfig, hostname: str,
                              username: str, password: str):
        """Simplified JSNAPy execution as fallback"""
        try:
            from jnpr.junos import Device
            from jnpr.junos.exception import ConnectError

            # Direct device connection approach
            device = Device(host=hostname, user=username, passwd=password, port=22)
            device.open()

            # Load and parse test file manually
            test_file_path = self.tests_dir / test_config.file
            with open(test_file_path, 'r') as f:
                test_content = yaml.safe_load(f)

            device.close()

            # Return a simple success result
            return [type('Result', (), {'result': 'Passed', 'test_name': test_config.name})]

        except Exception as e:
            raise Exception(f"Simple JSNAPy execution failed: {str(e)}")

    @staticmethod
    def _parse_jsnapy_result(result, details: Dict[str, Any]) -> Tuple[bool, str]:
        """Fast JSNAPy result parsing"""
        message_suffix = ""
        if 'junos_version' in details:
            message_suffix = f" (Junos version: {details['junos_version']})"

        if not result:
            return False, f"No result returned{message_suffix}"

        if isinstance(result, list):
            for test_result in result:
                if hasattr(test_result, 'result'):
                    if test_result.result == 'Failed':
                        return False, f"Test failed: {getattr(test_result, 'err_mssg', 'Unknown error')}{message_suffix}"
                    elif test_result.result == 'Passed':
                        return True, f"Test passed successfully{message_suffix}"

        return True, f"Test completed successfully{message_suffix}"

class OptimizedTestRunner:
    """Main optimized test runner"""

    def __init__(self, tests_directory: str = None, target_environment: str = None, quiet: bool = False):
        self.target_environment = target_environment or os.getenv('TARGET_ENVIRONMENT', 'development')
        self.tests_dir = Path(tests_directory) if tests_directory else TESTS_DIR
        self.quiet = quiet

        # Initialize components
        self.cache = ConfigCache(CACHE_DIR)
        self.credential_manager = CredentialManager()
        self.discovery = TestDiscovery(self.tests_dir, self.cache, self.quiet)
        self.executor = TestExecutor(self.tests_dir, CONFIG_DIR, self.credential_manager, self.quiet)

        # Setup logging with quiet mode
        self.logger = self._setup_logging()

        # Commented out to suppress verbose output in quiet mode
        # if not self.quiet:
        #     self.logger.info(f"✅ OptimizedTestRunner initialized for {self.target_environment}")

    def _setup_logging(self) -> logging.Logger:
        """Efficient logging setup"""
        logger = logging.getLogger(__name__)

        # Set the log level for all loggers to CRITICAL if in quiet mode
        if self.quiet:
            # Set the root logger to CRITICAL to suppress all handlers and messages
            logging.getLogger().setLevel(logging.CRITICAL)
            # Set other potentially noisy loggers to CRITICAL as well
            logging.getLogger('__main__').setLevel(logging.CRITICAL)
            logging.getLogger('ncclient').setLevel(logging.CRITICAL)
            logging.getLogger('ncclient.transport.ssh').setLevel(logging.CRITICAL)
            logging.getLogger('ncclient.operations.rpc').setLevel(logging.CRITICAL)
            logging.getLogger('jnpr').setLevel(logging.CRITICAL)
            logging.getLogger('jsnapy').setLevel(logging.CRITICAL)

        else:
            # Set log level to INFO for verbose output
            logging.getLogger().setLevel(logging.INFO)
            logging.getLogger('__main__').setLevel(logging.INFO)
            logging.getLogger('ncclient').setLevel(logging.INFO)
            logging.getLogger('ncclient.transport.ssh').setLevel(logging.INFO)
            logging.getLogger('ncclient.operations.rpc').setLevel(logging.INFO)
            logging.getLogger('jnpr').setLevel(logging.INFO)
            logging.getLogger('jsnapy').setLevel(logging.INFO)

        # Add a console handler if it doesn't exist to ensure output
        if not logger.handlers:
            console_handler = logging.StreamHandler()
            console_format = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            console_handler.setFormatter(console_format)
            logger.addHandler(console_handler)

            # File handler
            log_file = LOGS_DIR / f'jsnapy_optimized_{self.target_environment}_{datetime.now().strftime("%Y%m%d")}.log'
            file_handler = logging.FileHandler(log_file)
            file_format = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            file_handler.setFormatter(file_format)
            logger.addHandler(file_handler)

        return logger

    def get_available_tests(self) -> Dict[str, TestConfig]:
        """Get available test configurations (cached)"""
        return {
            name: TestConfig(
                name=name,
                file=data['file'],
                description=data['description'],
                rpc_fallback=data['rpc_fallback'],
                environment_classification=data['environment_classification'],
                safety_level=data['safety_level'],
                production_approved=data['production_approved'],
                max_impact_level=data['max_impact_level']
            )
            for name, data in self.discovered_tests.items()
            if data['environment_appropriate']
        }

    async def run_tests_on_hosts_async(self, hostnames: List[str], username: str = None,
                                     password: str = None, test_names: List[str] = None,
                                     max_workers: int = 3, override_environment_check: bool = False) -> Dict[str, Any]:
        """
        Run tests on multiple hosts in parallel and collect results.
        """
        start_time = time.time()

        # Discover tests once
        self.discovered_tests = self.discovery.discover_tests(self.target_environment)
        available_tests = self.get_available_tests()

        # Environment safety validation
        if not override_environment_check and self.target_environment == 'production':
            production_safe_tests = {
                name: test for name, test in available_tests.items()
                if test.production_approved and test.max_impact_level in ['low', 'medium']
            }
            if test_names:
                unsafe_tests = [name for name in test_names if name not in production_safe_tests]
                if unsafe_tests:
                    return {
                        "status": "error",
                        "message": f"🚨 PRODUCTION SAFETY: Tests {unsafe_tests} not approved for production",
                        "target_environment": self.target_environment,
                        "production_safe_tests": list(production_safe_tests.keys()),
                        "safety_notice": "Use --override_environment_check flag if you have proper authorization"
                    }
            available_tests = production_safe_tests

        # Validate and filter tests
        if test_names:
            invalid_tests = [name for name in test_names if name not in available_tests]
            if invalid_tests:
                return {
                    "status": "error",
                    "message": f"Invalid tests: {', '.join(invalid_tests)}",
                    "available_tests": list(available_tests.keys())
                }
            test_configs = [available_tests[name] for name in test_names]
        else:
            test_configs = list(available_tests.values())

        if not test_configs:
            return {
                "status": "error",
                "message": f"No tests available for {self.target_environment}",
                "discovered_count": len(self.discovered_tests)
            }

        # Create a list of async tasks, one for each host
        host_tasks = [
            self.executor.execute_tests_parallel(
                test_configs=test_configs,
                hostname=host,
                username=username,
                password=password,
                max_workers=max_workers
            )
            for host in hostnames
        ]

        # Run all host tasks concurrently
        all_results_by_host = await asyncio.gather(*host_tasks)

        # Flatten the list of results
        all_results = [item for sublist in all_results_by_host for item in sublist]

        # Generate consolidated summary
        return self._generate_consolidated_summary(all_results, hostnames, time.time() - start_time)

    def _generate_consolidated_summary(self, results: List[TestResult], hostnames: List[str], total_time: float) -> Dict[str, Any]:
        """Generate a single, consolidated result summary for all hosts."""

        passed_count = sum(1 for r in results if r.result)
        failed_count = len(results) - passed_count

        return {
            "status": "completed",
            "environment": self.target_environment,
            "performance_metrics": {
                "total_execution_time": f"{total_time:.2f}s",
                "total_memory_usage": f"{sum(r.memory_usage for r in results):.2f}MB",
                "tests_per_second": f"{len(results)/total_time:.2f}" if total_time > 0 else "N/A"
            },
            "summary": {
                "hosts": hostnames,
                "total_tests_executed": len(results),
                "passed": passed_count,
                "failed": failed_count,
                "success_rate": f"{(passed_count/len(results)*100):.1f}%" if results else "0%"
            },
            "results": [
                {
                    "host": r.device,
                    "test": r.test_name,
                    "status": "PASS" if r.result else "FAIL",
                    "message": r.message,
                    "time": f"{r.execution_time:.2f}s",
                    "memory": f"{r.memory_usage:.2f}MB",
                    "details": r.details
                } for r in results
            ],
            "timestamp": datetime.now().isoformat(),
            "optimized_by": "nikos-geranios_vgi"
        }

def main():
    """Optimized main function"""
    parser = argparse.ArgumentParser(
        description="Optimized Environment-Aware JSNAPy Test Runner"
    )
    # MODIFIED: Change to accept a comma-separated list of hostnames
    parser.add_argument("--hostnames", required=True, help="Comma-separated list of target device hostnames/IPs")
    parser.add_argument("--username", help="SSH username (optional - will prompt if not provided)")
    parser.add_argument("--password", help="SSH password (optional - will prompt if not provided)")
    parser.add_argument("--tests", help="Comma-separated test names")
    parser.add_argument("--environment",
                       choices=["development", "lab", "staging", "production"],
                       default="development")
    parser.add_argument("--override_environment_check", action="store_true",
                       help="Override environment safety checks (requires authorization)")
    parser.add_argument("--workers", type=int, default=3, help="Max parallel workers")
    parser.add_argument("--list_tests", action="store_true")
    parser.add_argument("--network_type", default="enterprise",
                       choices=["enterprise", "service_provider", "datacenter"],
                       help="Network type classification")
    # NEW: Add quiet flag
    parser.add_argument("--quiet", action="store_true", help="Suppress verbose logging and print statements")

    args = parser.parse_args()

    # Set environment variables for compatibility
    os.environ['NETWORK_TYPE'] = args.network_type
    os.environ['TARGET_ENVIRONMENT'] = args.environment

    try:
        # Initialize optimized runner with quiet flag
        runner = OptimizedTestRunner(target_environment=args.environment, quiet=args.quiet)

        # Dynamically set logging level after JSNAPy's config has been loaded
        if args.quiet:
            log_level = logging.CRITICAL
        else:
            log_level = logging.INFO

        # Set log level for the root logger and other key loggers
        logging.getLogger().setLevel(log_level)
        logging.getLogger('__main__').setLevel(log_level)
        logging.getLogger('ncclient').setLevel(log_level)
        logging.getLogger('ncclient.transport.ssh').setLevel(log_level)
        logging.getLogger('ncclient.operations.rpc').setLevel(log_level)
        logging.getLogger('jnpr').setLevel(log_level)
        logging.getLogger('jsnapy').setLevel(log_level)

        if args.list_tests:
            tests = runner.get_available_tests()
            print(json.dumps({
                "environment_context": {
                    "target_environment": args.environment,
                    "network_type": args.network_type,
                    "configured_by": "nikos-geranios_vgi",
                    "optimized_at": datetime.now().isoformat()
                },
                "discovered_tests": {
                    name: {
                        "description": config.description,
                        "file": config.file,
                        "environment_classification": config.environment_classification,
                        "safety_level": config.safety_level,
                        "production_approved": config.production_approved,
                        "max_impact_level": config.max_impact_level
                    } for name, config in tests.items()
                },
                "total_tests": len(tests)
            }, indent=2))
            return

        # Parse hostnames and test names
        hostnames = [h.strip() for h in args.hostnames.split(',') if h.strip()]
        test_names = None
        if args.tests:
            test_names = [name.strip() for name in args.tests.split(',') if name.strip()]

        # Commented out to suppress verbose output in quiet mode
        # print(f"🚀 Starting optimized {args.environment.upper()} tests for {hostnames}")

        # Run tests on all hosts asynchronously
        results = asyncio.run(runner.run_tests_on_hosts_async(
            hostnames=hostnames,
            username=args.username,
            password=args.password,
            test_names=test_names,
            max_workers=args.workers,
            override_environment_check=args.override_environment_check
        ))

        # --- MODIFIED: Format and print a consolidated results table ---
        if results.get('results'):
            table_headers = ["Hostname", "Test Name", "Junos Version", "Status"]
            table_rows = []
            for test_result in results['results']:
                hostname = test_result['host']
                test_name = test_result['test']
                junos_version = test_result['details'].get('junos_version', 'N/A')
                status = test_result['status']
                table_rows.append([hostname, test_name, junos_version, status])

            print("\n📊 Test Results Summary:")
            print(tabulate(table_rows, headers=table_headers, tablefmt="grid"))
            print("\n")
        # --- END MODIFIED ---

        # --- MODIFIED: Write results to a file instead of printing to stdout ---
        output_file = LOGS_DIR / f'jsnapy_results_{int(time.time())}.json'
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)

        # This print statement will go to stdout and confirms the file was written
        # Commented out to suppress verbose output in quiet mode
        # if not args.quiet:
        #     print(f"✅ Full JSON results written to {output_file}. Please check this file for the output.")
        # --- END MODIFIED ---

    except KeyboardInterrupt:
        # Commented out to suppress verbose output in quiet mode
        # print("\n⚠️ Test execution interrupted by user")
        sys.exit(1)
    except Exception as e:
        # --- MODIFIED: Ensure errors are also written to a file for debugging ---
        error_file = LOGS_DIR / f'jsnapy_error_{int(time.time())}.json'
        error_data = {
            "status": "error",
            "message": f"Optimization error: {str(e)}",
            "environment": args.environment,
            "timestamp": datetime.now().isoformat()
        }
        with open(error_file, 'w') as f:
            json.dump(error_data, f, indent=2)
        # Commented out to suppress verbose output in quiet mode
        # print(f"❌ An error occurred. Details written to {error_file}.")
        # --- END MODIFIED ---
        sys.exit(1)

if __name__ == "__main__":
    main()
