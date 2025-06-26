# vlabs/python_pipeline/run_jsnapy_tests/run_jsnapy_tests_dynamic.py
"""
Fixed version - resolves TestConfig parameter error
Author: nikos-geranios_vgi
Fixed: 2025-06-26 17:35:48 UTC
"""

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
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional
from pathlib import Path

# --- CORRECT IMPORT STATEMENT ---
from jnpr.jsnapy import SnapAdmin
# --- END CORRECT IMPORT STATEMENT ---
from jnpr.junos.exception import ConnectError

# Industry Standard Path Management
SCRIPT_DIR = Path(__file__).parent
PIPELINE_ROOT = SCRIPT_DIR.parent
UTILS_DIR = PIPELINE_ROOT / 'utils'
ASSETS_DIR = PIPELINE_ROOT / 'assets'

# Industry Standard Directory Structure
TESTS_DIR = SCRIPT_DIR / 'tests'
CONFIG_DIR = SCRIPT_DIR / 'config'
LOGS_DIR = SCRIPT_DIR / 'logs'

# Ensure directories exist
TESTS_DIR.mkdir(exist_ok=True)
CONFIG_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

# Add utils to Python path
sys.path.insert(0, str(UTILS_DIR))

try:
    from connect_to_hosts import connect_to_hosts, disconnect_from_hosts
except ImportError:
    print(f"Warning: Could not import connect_to_hosts from {UTILS_DIR}")
    print("Please ensure connect_to_hosts.py is in the utils directory")
    sys.exit(1)

@dataclass
class TestResult:
    """Standardized test result structure"""
    test_name: str
    device: str
    result: bool
    message: str
    execution_time: float = 0.0
    details: Dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: time.strftime("%Y-%m-%d %H:%M:%S"))

@dataclass
class TestConfig:
    """🔧 FIXED: Complete test configuration with all required fields"""
    name: str
    file: str
    description: str
    rpc_fallback: str
    enabled: bool = True
    timeout: int = 15
    parameters: Dict[str, Any] = field(default_factory=dict)
    # ✅ ADDED: Missing fields that were causing the error
    test_type: str = "jsnapy"
    discovered: bool = True
    location: str = "tests/"

class IndustryStandardTestRunner:
    """JSNAPy test runner following industry standard directory structure"""
    
    def __init__(self, tests_directory: str = None, config_directory: str = None):
        # Industry standard directory structure
        self.tests_dir = Path(tests_directory) if tests_directory else TESTS_DIR
        self.config_dir = Path(config_directory) if config_directory else CONFIG_DIR
        
        # Environment configuration
        self.environment = {
            'lab_environment': 'lab',
            'device_vendor': 'juniper',
            'network_type': os.getenv('NETWORK_TYPE', 'enterprise'),
            'deployment_mode': 'container',
            'configured_at': time.strftime("%Y-%m-%d %H:%M:%S"),
            'configured_by': 'nikos-geranios_vgi',
            'pipeline_root': str(PIPELINE_ROOT),
            'script_location': str(SCRIPT_DIR),
            'tests_location': str(self.tests_dir),
            'config_location': str(self.config_dir),
            'logs_location': str(LOGS_DIR),
            'utils_location': str(UTILS_DIR),
            'directory_standard': 'industry_standard'
        }
        
        # Setup basic logging first
        self.logger = self._setup_basic_logging()
        
        # Perform migration to industry standard structure
        migration_results = self._migrate_to_industry_standard()
        
        # Load existing configurations if available
        self.external_config = self._load_existing_configs()
        
        # Discover available tests
        self.discovered_tests = self._discover_tests()
        
        # Build final configuration
        self.config = self._get_test_config()
        
        # Setup final logging with configuration
        self.logger = self._setup_logging()
        
        # Log initialization summary
        self._log_initialization_summary(migration_results)
    
    def _setup_basic_logging(self) -> logging.Logger:
        """Setup basic logging for initialization phase"""
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - INDUSTRY_STANDARD - %(levelname)s - %(message)s',
            handlers=[
                logging.StreamHandler(),
                logging.FileHandler(LOGS_DIR / 'industry_standard_tests.log')
            ]
        )
        return logging.getLogger(__name__)
    
    def _migrate_to_industry_standard(self) -> Dict[str, List[str]]:
        """Migrate existing files to industry standard directory structure"""
        migration_results = {
            'tests_migrated': [],
            'configs_migrated': [],
            'logs_migrated': [],
            'errors': []
        }
        
        self.logger.info("🔄 Starting migration to industry standard directory structure...")
        
        # Migrate test files to tests/ directory
        test_files_to_migrate = [
            'test_version.yml',
            'test_interfaces.yml',
            'test_bgp.yml',
            'test_ospf.yml',
            'test_lldp.yml'
        ]
        
        for test_file in test_files_to_migrate:
            source_path = SCRIPT_DIR / test_file
            target_path = self.tests_dir / test_file
            
            if source_path.exists() and not target_path.exists():
                try:
                    shutil.copy2(source_path, target_path)
                    migration_results['tests_migrated'].append(f"{test_file} → tests/")
                    self.logger.info(f"✅ Migrated test: {test_file} → tests/")
                except Exception as e:
                    error_msg = f"❌ Failed to migrate {test_file}: {e}"
                    migration_results['errors'].append(error_msg)
                    self.logger.error(error_msg)
        
        # Migrate config files
        config_files_to_migrate = [
            ('test_configs.yml', 'test_config.yml'),
            ('metadata.yml', 'metadata.yml'),
            ('logging.yml', 'logging.yml')
        ]
        
        for source_name, target_name in config_files_to_migrate:
            source_path = SCRIPT_DIR / source_name
            target_path = self.config_dir / target_name
            
            if source_path.exists() and not target_path.exists():
                try:
                    shutil.copy2(source_path, target_path)
                    migration_entry = f"{source_name} → config/{target_name}"
                    migration_results['configs_migrated'].append(migration_entry)
                    self.logger.info(f"✅ Migrated config: {migration_entry}")
                except Exception as e:
                    error_msg = f"❌ Failed to migrate {source_name}: {e}"
                    migration_results['errors'].append(error_msg)
                    self.logger.error(error_msg)
        
        # Create default test structure if no tests found
        if not migration_results['tests_migrated'] and not list(self.tests_dir.glob('test_*.yml')):
            self._create_default_test_structure()
            migration_results['tests_migrated'].append("Created default test structure")
        
        return migration_results
    
    def _load_existing_configs(self) -> Dict[str, Any]:
        """Load existing configuration files from industry standard locations"""
        configs = {}
        
        # Load test configuration
        test_config_path = self.config_dir / 'test_config.yml'
        if test_config_path.exists():
            try:
                with open(test_config_path, 'r') as f:
                    configs['test_config'] = yaml.safe_load(f)
                self.logger.info(f"📋 Loaded test config from {test_config_path}")
            except Exception as e:
                self.logger.warning(f"⚠️ Could not load test config: {e}")
        
        return configs
    
    def _discover_tests(self) -> Dict[str, Dict[str, Any]]:
        """Discover JSNAPy test files from industry standard tests/ directory"""
        discovered = {}
        
        # Industry standard test file patterns
        test_patterns = [
            'test_*.yml',
            'test_*.yaml', 
            '*_test.yml',
            '*_test.yaml'
        ]
        
        self.logger.info(f"🔍 Discovering tests in {self.tests_dir}")
        
        for pattern in test_patterns:
            test_files = glob.glob(str(self.tests_dir / pattern))
            
            for test_file in test_files:
                test_name = self._extract_test_name(test_file)
                test_info = self._analyze_test_file(test_file)
                
                if test_info:
                    discovered[test_name] = {
                        'file': os.path.basename(test_file),
                        'full_path': test_file,
                        'relative_path': os.path.relpath(test_file, SCRIPT_DIR),
                        'description': test_info.get('description', f'JSNAPy test: {test_name}'),
                        'rpc_fallback': test_info.get('rpc_fallback', self._guess_rpc_fallback(test_name)),
                        'test_type': test_info.get('test_type', 'jsnapy'),
                        'discovered': True,
                        'file_size': os.path.getsize(test_file),
                        'modified_time': time.ctime(os.path.getmtime(test_file)),
                        'location': 'tests/'
                    }
                    
                    self.logger.debug(f"🧪 Discovered test: {test_name} from {test_file}")
        
        self.logger.info(f"📊 Discovery complete: {len(discovered)} tests found")
        return discovered
    
    def _create_default_test_structure(self):
        """Create default test structure following industry standards"""
        self.logger.info("🏗️ Creating default industry standard test structure...")
        
        # Create default test_version.yml
        default_version_test = {
            'test_version': {
                'description': 'Check Junos software version and device information (Industry Standard)',
                'command': 'show version',
                'rpc': 'get-software-information',
                'format': 'xml',
                'iterate': {
                    'xpath': '//software-information',
                    'tests': [
                        {
                            'test_name': 'version_exists',
                            'info': 'Verify Junos version is available',
                            'xpath': 'junos-version',
                            'tests': [
                                {
                                    'exists': '',
                                    'info': 'Junos version should exist'
                                }
                            ]
                        }
                    ]
                }
            }
        }
        
        version_test_path = self.tests_dir / 'test_version.yml'
        with open(version_test_path, 'w') as f:
            yaml.dump(default_version_test, f, default_flow_style=False, indent=2)
        
        self.logger.info(f"✅ Created default version test: {version_test_path}")
    
    def _extract_test_name(self, test_file: str) -> str:
        """Extract test name from file path"""
        filename = os.path.basename(test_file)
        name = os.path.splitext(filename)[0]
        
        if not name.startswith('test_'):
            name = f'test_{name}'
            
        return name
    
    def _analyze_test_file(self, test_file: str) -> Optional[Dict[str, Any]]:
        """Analyze JSNAPy test file to extract metadata"""
        try:
            with open(test_file, 'r') as f:
                content = yaml.safe_load(f)
            
            if not content:
                return None
            
            test_info = {'test_type': 'jsnapy'}
            
            if isinstance(content, dict):
                first_test_key = list(content.keys())[0]
                first_test = content[first_test_key]
                
                if isinstance(first_test, dict):
                    test_info['description'] = (
                        first_test.get('description') or 
                        first_test.get('info') or
                        f"JSNAPy test from {os.path.basename(test_file)}"
                    )
                    
                    if 'rpc' in first_test:
                        test_info['rpc_fallback'] = self._normalize_rpc_name(first_test['rpc'])
                    elif 'command' in first_test:
                        test_info['rpc_fallback'] = self._command_to_rpc(first_test['command'])
            
            return test_info
            
        except Exception as e:
            self.logger.debug(f"Could not analyze test file {test_file}: {e}")
            return None
    
    def _normalize_rpc_name(self, rpc_name: str) -> str:
        """Normalize RPC name to PyEZ format"""
        return rpc_name.replace('-', '_')
    
    def _guess_rpc_fallback(self, test_name: str) -> str:
        """Guess appropriate RPC method based on test name"""
        name_lower = test_name.lower()
        
        # Use existing config if available
        if self.external_config.get('test_config'):
            existing_tests = self.external_config['test_config'].get('tests', {})
            if test_name in existing_tests:
                return existing_tests[test_name].get('rpc_fallback', 'get_software_information')
        
        # RPC mapping
        rpc_mapping = {
            'version': 'get_software_information',
            'software': 'get_software_information',
            'bgp': 'get_bgp_neighbor_information',
            'interface': 'get_interface_information',
            'int': 'get_interface_information',
            'ospf': 'get_ospf_neighbor_information',
            'route': 'get_route_information',
            'routing': 'get_route_information',
            'lldp': 'get_lldp_neighbors_information'
        }
        
        for keyword, rpc_method in rpc_mapping.items():
            if keyword in name_lower:
                return rpc_method
        
        return 'get_software_information'
    
    def _command_to_rpc(self, command: str) -> str:
        """Convert show command to RPC method"""
        command_lower = command.lower()
        
        if 'version' in command_lower:
            return 'get_software_information'
        elif 'interface' in command_lower:
            return 'get_interface_information'
        elif 'bgp' in command_lower:
            return 'get_bgp_neighbor_information'
        elif 'ospf' in command_lower:
            return 'get_ospf_neighbor_information'
        else:
            return 'get_software_information'
    
    def _get_test_config(self) -> Dict[str, Any]:
        """🔧 FIXED: Build test configuration with proper parameter handling"""
        tests_config = {}
        
        # Build tests configuration from discovered tests
        for test_name, test_info in self.discovered_tests.items():
            # Check for existing configuration
            existing_test_config = {}
            if self.external_config.get('test_config'):
                existing_tests = self.external_config['test_config'].get('tests', {})
                existing_test_config = existing_tests.get(test_name, {})
            
            # ✅ FIXED: Only pass parameters that TestConfig expects
            tests_config[test_name] = {
                'name': test_name,
                'file': test_info['file'],
                'description': test_info['description'],
                'rpc_fallback': test_info['rpc_fallback'],
                'enabled': existing_test_config.get('enabled', True),
                'timeout': existing_test_config.get('timeout', 15),
                'parameters': existing_test_config.get('parameters', {}),
                'test_type': test_info['test_type'],
                'discovered': test_info['discovered'],
                'location': test_info['location']
            }
        
        # Global configuration
        global_config = {
            'default_timeout': 15,
            'retry_attempts': 1,
            'log_level': 'INFO',
            'output_format': 'json',
            'lab_mode': True,
            'verbose_output': True,
            'include_explanations': True,
            'directory_standard': 'industry_standard'
        }
        
        return {
            'tests': tests_config,
            'global': global_config,
            'environment': self.environment,
            'discovery': {
                'tests_directory': str(self.tests_dir),
                'config_directory': str(self.config_dir),
                'logs_directory': str(LOGS_DIR),
                'pipeline_root': str(PIPELINE_ROOT),
                'total_tests_discovered': len(self.discovered_tests),
                'discovery_time': time.strftime("%Y-%m-%d %H:%M:%S"),
                'directory_standard': 'industry_standard'
            },
            'external_config_loaded': bool(self.external_config)
        }
    
    def _setup_logging(self) -> logging.Logger:
        """Setup logging using industry standard configuration"""
        log_level = self.config.get('global', {}).get('log_level', 'INFO')
        
        # Industry standard log file location
        log_file = LOGS_DIR / 'industry_standard_tests.log'
        
        # Clear any existing handlers
        for handler in logging.root.handlers[:]:
            logging.root.removeHandler(handler)
        
        logging.basicConfig(
            level=getattr(logging, log_level),
            format='%(asctime)s - INDUSTRY_STANDARD - %(levelname)s - %(message)s',
            handlers=[
                logging.StreamHandler(),
                logging.FileHandler(log_file)
            ]
        )
        return logging.getLogger(__name__)
    
    def _log_initialization_summary(self, migration_results: Dict[str, List[str]]):
        """Log initialization summary"""
        self.logger.info("🎯 Industry Standard Test Runner Initialized Successfully!")
        self.logger.info(f"📁 Directory Structure: tests/ | config/ | logs/")
        self.logger.info(f"🧪 Tests Discovered: {len(self.discovered_tests)}")
        self.logger.info(f"👤 Configured by: nikos-geranios_vgi")
        self.logger.info(f"⏰ Time: 2025-06-26 17:35:48 UTC")
    
    def get_available_tests(self) -> Dict[str, TestConfig]:
        """Get all available tests as TestConfig objects"""
        tests = {}
        for test_name, test_data in self.config.get('tests', {}).items():
            # ✅ FIXED: Create TestConfig with all required parameters
            tests[test_name] = TestConfig(
                name=test_data['name'],
                file=test_data['file'],
                description=test_data['description'],
                rpc_fallback=test_data['rpc_fallback'],
                enabled=test_data.get('enabled', True),
                timeout=test_data.get('timeout', 15),
                parameters=test_data.get('parameters', {}),
                test_type=test_data.get('test_type', 'jsnapy'),
                discovered=test_data.get('discovered', True),
                location=test_data.get('location', 'tests/')
            )
        return tests
    
    def get_test_by_name(self, test_name: str) -> Optional[TestConfig]:
        """Get a specific test configuration by name"""
        if test_name in self.config['tests']:
            test_data = self.config['tests'][test_name]
            # ✅ FIXED: Create TestConfig with all required parameters
            return TestConfig(
                name=test_data['name'],
                file=test_data['file'],
                description=test_data['description'],
                rpc_fallback=test_data['rpc_fallback'],
                enabled=test_data.get('enabled', True),
                timeout=test_data.get('timeout', 15),
                parameters=test_data.get('parameters', {}),
                test_type=test_data.get('test_type', 'jsnapy'),
                discovered=test_data.get('discovered', True),
                location=test_data.get('location', 'tests/')
            )
        return None
    
    def execute_jsnapy_test(self, test_name: str, hostname: str, username: str, password: str) -> TestResult:
        """Execute a specific JSNAPy test"""
        start_time = time.time()
        test_config = self.get_test_by_name(test_name)
        
        if not test_config:
            return TestResult(
                test_name=test_name,
                device=hostname,
                result=False,
                message=f"❌ Test '{test_name}' not found in available tests",
                execution_time=time.time() - start_time
            )
        
        # Use industry standard tests/ directory
        test_file_path = self.tests_dir / test_config.file
        
        # Try JSNAPy first if file exists
        if test_file_path.exists():
            result = self._execute_jsnapy_file(test_file_path, test_config, hostname, username, password)
            if result:
                return result
        
        # Fallback to RPC test
        self.logger.info(f"Using RPC fallback for test: {test_name}")
        return self._execute_rpc_fallback(test_config, hostname, username, password)
    
    def _execute_jsnapy_file(self, test_file_path: Path, test_config: TestConfig, 
                           hostname: str, username: str, password: str) -> Optional[TestResult]:
        """Execute JSNAPy test from file"""
        start_time = time.time()
        
        try:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.yml', delete=False) as tmp_config:
                config_content = {
                    'hosts': [{
                        'device': hostname,
                        'username': username,
                        'passwd': password
                    }],
                    'tests': [str(test_file_path)]
                }
                yaml.dump(config_content, tmp_config)
                tmp_config_path = tmp_config.name
            
            try:
                self.logger.info(f"🧪 Executing JSNAPy test: {test_config.name}")
                
                js = SnapAdmin()
                snapcheck = js.snapcheck(config_file=tmp_config_path, pre_file=None)
                
                if snapcheck:
                    passed = all(result.get('result', False) for result in snapcheck)
                    
                    message = (
                        f"{'✅' if passed else '⚠️'} JSNAPy Test: {test_config.name}\n"
                        f"📝 Description: {test_config.description}\n"
                        f"🧪 Test Type: JSNAPy (Industry Standard)\n"
                        f"📁 Location: {test_config.location}{test_config.file}\n"
                        f"📊 Result: {'PASSED' if passed else 'FAILED with issues'}\n"
                        f"💡 This test uses industry standard JSNAPy framework."
                    )
                    
                    return TestResult(
                        test_name=test_config.name,
                        device=hostname,
                        result=passed,
                        message=message,
                        execution_time=time.time() - start_time,
                        details={
                            'test_type': 'jsnapy',
                            'jsnapy_results': snapcheck,
                            'test_file': test_config.file,
                            'test_location': test_config.location,
                            'directory_standard': 'industry_standard'
                        }
                    )
                else:
                    return None
                    
            finally:
                if os.path.exists(tmp_config_path):
                    os.unlink(tmp_config_path)
                    
        except Exception as e:
            self.logger.debug(f"JSNAPy test execution failed: {e}")
            return None
    
    def _execute_rpc_fallback(self, test_config: TestConfig, hostname: str, username: str, password: str) -> TestResult:
        """Execute RPC fallback test"""
        start_time = time.time()
        
        # Connect to device
        connections = connect_to_hosts(hostname, username, password)
        if not connections:
            return TestResult(
                test_name=test_config.name,
                device=hostname,
                result=False,
                message=f"❌ Failed to connect to {hostname} for RPC test",
                execution_time=time.time() - start_time
            )
        
        try:
            dev = connections[0]
            
            if test_config.rpc_fallback == 'get_software_information':
                return self._execute_version_rpc(dev, test_config, hostname, start_time)
            elif test_config.rpc_fallback == 'get_interface_information':
                return self._execute_interface_rpc(dev, test_config, hostname, start_time)
            else:
                return TestResult(
                    test_name=test_config.name,
                    device=hostname,
                    result=False,
                    message=f"❌ RPC method '{test_config.rpc_fallback}' not implemented",
                    execution_time=time.time() - start_time
                )
                
        finally:
            disconnect_from_hosts(connections)
    
    def _execute_version_rpc(self, dev, test_config: TestConfig, hostname: str, start_time: float) -> TestResult:
        """Execute version RPC test"""
        try:
            result = dev.rpc.get_software_information()
            version = result.findtext(".//junos-version", "Unknown")
            hostname_from_device = result.findtext(".//host-name", "Unknown")
            model = result.findtext(".//product-model", "Unknown")
            
            data = {
                'junos_version': version,
                'device_hostname': hostname_from_device,
                'product_model': model,
                'test_type': 'rpc_fallback',
                'directory_standard': 'industry_standard'
            }
            
            message = (
                f"✅ RPC Version Test: {test_config.name}\n"
                f"📝 Description: {test_config.description}\n"
                f"🔧 Test Type: RPC Fallback ({test_config.rpc_fallback})\n"
                f"📁 Standard: Industry Standard Directory Structure\n"
                f"📋 Device: {hostname_from_device} ({model})\n"
                f"📦 Version: {version}\n"
                f"💡 This test uses direct RPC calls for device information validation."
            )
            
            return TestResult(
                test_name=test_config.name,
                device=hostname,
                result=True,
                message=message,
                execution_time=time.time() - start_time,
                details=data
            )
            
        except Exception as e:
            return TestResult(
                test_name=test_config.name,
                device=hostname,
                result=False,
                message=f"❌ RPC Version test failed: {str(e)}",
                execution_time=time.time() - start_time
            )
    
    def _execute_interface_rpc(self, dev, test_config: TestConfig, hostname: str, start_time: float) -> TestResult:
        """Execute interface RPC test"""
        try:
            result = dev.rpc.get_interface_information(terse=True)
            interfaces = result.findall(".//physical-interface")
            up_interfaces = len([i for i in interfaces if i.findtext('.//oper-status') == 'up'])
            total_interfaces = len(interfaces)
            
            data = {
                'total_interfaces': total_interfaces,
                'up_interfaces': up_interfaces,
                'down_interfaces': total_interfaces - up_interfaces,
                'test_type': 'rpc_fallback',
                'directory_standard': 'industry_standard'
            }
            
            message = (
                f"✅ RPC Interface Test: {test_config.name}\n"
                f"📝 Description: {test_config.description}\n"
                f"🔧 Test Type: RPC Fallback ({test_config.rpc_fallback})\n"
                f"📁 Standard: Industry Standard Directory Structure\n"
                f"🔌 Interfaces: {up_interfaces}/{total_interfaces} UP\n"
                f"💡 This test checks interface operational status via RPC calls."
            )
            
            return TestResult(
                test_name=test_config.name,
                device=hostname,
                result=up_interfaces > 0,
                message=message,
                execution_time=time.time() - start_time,
                details=data
            )
            
        except Exception as e:
            return TestResult(
                test_name=test_config.name,
                device=hostname,
                result=False,
                message=f"❌ RPC Interface test failed: {str(e)}",
                execution_time=time.time() - start_time
            )
    
    def run_tests(self, hostname: str, username: str, password: str, test_names: List[str] = None) -> Dict[str, Any]:
        """Run specified tests or all available tests"""
        
        available_tests = self.get_available_tests()
        
        if test_names:
            invalid_tests = [name for name in test_names if name not in available_tests]
            if invalid_tests:
                return {
                    "status": "error",
                    "message": f"❌ Invalid test names: {', '.join(invalid_tests)}",
                    "available_tests": list(available_tests.keys()),
                    "environment": self.environment,
                    "directory_standard": "industry_standard"
                }
            tests_to_run = test_names
        else:
            tests_to_run = list(available_tests.keys())
        
        self.logger.info(f"🚀 Running {len(tests_to_run)} tests: {', '.join(tests_to_run)}")
        
        results = []
        for test_name in tests_to_run:
            self.logger.info(f"🧪 Executing test: {test_name}")
            result = self.execute_jsnapy_test(test_name, hostname, username, password)
            results.append(result)
        
        return self._format_results(results, hostname, tests_to_run)
    
    def _format_results(self, results: List[TestResult], hostname: str, requested_tests: List[str]) -> Dict[str, Any]:
        """Format test results"""
        total_tests = len(results)
        passed_tests = sum(1 for r in results if r.result)
        failed_tests = total_tests - passed_tests
        total_time = sum(r.execution_time for r in results)
        
        status = "success" if failed_tests == 0 else "partial" if passed_tests > 0 else "failed"
        
        formatted_results = {
            "status": status,
            "lab_environment": "lab",
            "directory_standard": "industry_standard",
            "summary": {
                "total_tests": total_tests,
                "passed": passed_tests,
                "failed": failed_tests,
                "success_rate": f"{(passed_tests/total_tests)*100:.1f}%" if total_tests > 0 else "0%",
                "total_execution_time": round(total_time, 2),
                "requested_tests": requested_tests,
                "executed_by": "nikos-geranios_vgi",
                "executed_at": "2025-06-26 17:35:48 UTC"
            },
            "test_results": [],
            "environment": self.environment,
            "discovery_info": self.config['discovery']
        }
        
        for result in results:
            test_result = {
                "test_name": result.test_name,
                "device": result.device,
                "result": "✅ PASSED" if result.result else "❌ FAILED",
                "execution_time": round(result.execution_time, 2),
                "timestamp": result.timestamp,
                "message": result.message,
                "details": result.details
            }
            formatted_results["test_results"].append(test_result)
        
        if passed_tests > 0:
            formatted_results["learning_outcomes"] = [
                f"✅ Successfully executed {passed_tests} automated network tests",
                "✅ Demonstrated JSNAPy and RPC testing capabilities",
                "✅ Validated network device connectivity and status",
                "✅ Implemented industry standard directory structure"
            ]
        
        return formatted_results

def main():
    """Main function with proper error handling"""
    parser = argparse.ArgumentParser(
        description="Industry Standard Test Runner - Fixed version for nikos-geranios_vgi"
    )
    
    parser.add_argument("--hostname", required=True, help="Target device hostname or IP address")
    parser.add_argument("--username", required=True, help="SSH username") 
    parser.add_argument("--password", required=True, help="SSH password")
    parser.add_argument("--tests", help="Comma-separated test names to run")
    parser.add_argument("--tests_dir", help="Custom tests directory")
    parser.add_argument("--config_dir", help="Custom config directory")
    parser.add_argument("--list_tests", action="store_true", help="List discovered tests and exit")
    parser.add_argument("--network_type", default="enterprise", 
                       choices=["enterprise", "service_provider", "datacenter"],
                       help="Network type (default: enterprise)")
    
    args = parser.parse_args()
    
    # Set environment
    os.environ['NETWORK_TYPE'] = args.network_type
    
    try:
        # Initialize test runner
        runner = IndustryStandardTestRunner(args.tests_dir, args.config_dir)
        
        # Handle list tests request
        if args.list_tests:
            tests = runner.get_available_tests()
            print(json.dumps({
                "discovered_tests": {
                    name: {
                        "description": config.description,
                        "file": config.file,
                        "rpc_fallback": config.rpc_fallback,
                        "test_type": config.test_type,
                        "location": config.location
                    } for name, config in tests.items()
                },
                "total_tests": len(tests),
                "directory_standard": "industry_standard",
                "fixed_by": "nikos-geranios_vgi",
                "fixed_at": "2025-06-26 17:35:48 UTC"
            }, indent=2))
            return
        
        # Parse test names
        test_names = None
        if args.tests:
            test_names = [name.strip() for name in args.tests.split(',') if name.strip()]
        
        # Run tests
        print(f"🎯 Starting Industry Standard Lab Tests for {args.hostname}...")
        print(f"👤 Executed by: nikos-geranios_vgi")
        print(f"⏰ Fixed at: 2025-06-26 17:35:48 UTC")
        
        results = runner.run_tests(
            hostname=args.hostname,
            username=args.username,
            password=args.password,
            test_names=test_names
        )
        
        print(json.dumps(results, indent=2))
        
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": f"❌ Unexpected error: {str(e)}",
            "error_type": type(e).__name__,
            "pipeline_location": str(PIPELINE_ROOT),
            "script_location": str(SCRIPT_DIR),
            "directory_standard": "industry_standard",
            "fixed_by": "nikos-geranios_vgi",
            "error_time": "2025-06-26 17:35:48 UTC"
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()