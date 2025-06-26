# vlabs/python_pipeline/run_jsnapy_tests/run_jsnapy_tests_dynamic.py
import argparse
import os
import sys
import json
import logging
import tempfile
import yaml
import time
import glob
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional
from pathlib import Path

# --- CORRECT IMPORT STATEMENT ---
from jnpr.jsnapy import SnapAdmin
# --- END CORRECT IMPORT STATEMENT ---
from jnpr.junos.exception import ConnectError

# Python Pipeline path management
SCRIPT_DIR = Path(__file__).parent                           # /python_pipeline/run_jsnapy_tests/
PIPELINE_ROOT = SCRIPT_DIR.parent                           # /python_pipeline/
UTILS_DIR = PIPELINE_ROOT / 'utils'                        # /python_pipeline/utils/
ASSETS_DIR = PIPELINE_ROOT / 'assets'                      # /python_pipeline/assets/
TEST_CONFIGS_DIR = SCRIPT_DIR / 'test_configs'             # /python_pipeline/run_jsnapy_tests/test_configs/
CONFIGS_DIR = SCRIPT_DIR / 'configs'                       # /python_pipeline/run_jsnapy_tests/configs/
LOGS_DIR = SCRIPT_DIR / 'logs'                             # /python_pipeline/run_jsnapy_tests/logs/

# Ensure directories exist
TEST_CONFIGS_DIR.mkdir(exist_ok=True)
CONFIGS_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

# Add utils to Python path for shared utilities
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
    """Dynamic test configuration"""
    name: str
    file: str
    description: str
    rpc_fallback: str
    enabled: bool = True
    timeout: int = 15
    parameters: Dict[str, Any] = field(default_factory=dict)

class PipelineLabTestRunner:
    """Lab test runner integrated with existing python_pipeline structure"""
    
    def __init__(self, test_configs_directory: str = None, configs_directory: str = None):
        # Use existing pipeline structure
        self.test_configs_dir = Path(test_configs_directory) if test_configs_directory else TEST_CONFIGS_DIR
        self.configs_dir = Path(configs_directory) if configs_directory else CONFIGS_DIR
        
        # Pipeline environment configuration
        self.environment = {
            'lab_environment': 'lab',
            'device_vendor': 'juniper',
            'network_type': os.getenv('NETWORK_TYPE', 'enterprise'),
            'deployment_mode': 'container',
            'configured_at': time.strftime("%Y-%m-%d %H:%M:%S"),
            'configured_by': 'nikos-geranios_vgi',
            'pipeline_root': str(PIPELINE_ROOT),
            'script_location': str(SCRIPT_DIR),
            'test_configs_location': str(self.test_configs_dir),
            'utils_location': str(UTILS_DIR)
        }
        
        # Load existing configurations if available
        self.external_config = self._load_existing_configs()
        
        # Discover available tests
        self.discovered_tests = self._discover_jsnapy_tests()
        
        self.config = self._get_pipeline_config()
        self.logger = self._setup_logging()
        
        self.logger.info(f"Pipeline Lab Test Runner initialized")
        self.logger.info(f"Pipeline root: {PIPELINE_ROOT}")
        self.logger.info(f"Script directory: {SCRIPT_DIR}")
        self.logger.info(f"Test configs: {self.test_configs_dir}")
        self.logger.info(f"Discovered {len(self.discovered_tests)} tests")
        
        # Migrate existing test files if needed
        self._migrate_existing_tests()
    
    def _load_existing_configs(self) -> Dict[str, Any]:
        """Load existing configuration files from the pipeline"""
        configs = {}
        
        # Try to load test_configs.yml
        test_configs_path = self.configs_dir / 'test_configs.yml'
        if not test_configs_path.exists():
            # Check if it's in the script directory (original location)
            original_path = SCRIPT_DIR / 'test_configs.yml'
            if original_path.exists():
                test_configs_path = original_path
        
        if test_configs_path.exists():
            try:
                with open(test_configs_path, 'r') as f:
                    configs['test_configs'] = yaml.safe_load(f)
                self.logger.info(f"Loaded existing test configs from {test_configs_path}")
            except Exception as e:
                self.logger.warning(f"Could not load test configs: {e}")
        
        # Try to load metadata.yml
        metadata_path = self.configs_dir / 'metadata.yml'
        if not metadata_path.exists():
            original_path = SCRIPT_DIR / 'metadata.yml'
            if original_path.exists():
                metadata_path = original_path
        
        if metadata_path.exists():
            try:
                with open(metadata_path, 'r') as f:
                    configs['metadata'] = yaml.safe_load(f)
                self.logger.info(f"Loaded existing metadata from {metadata_path}")
            except Exception as e:
                self.logger.warning(f"Could not load metadata: {e}")
        
        return configs
    
    def _migrate_existing_tests(self):
        """Migrate existing test files to centralized test_configs directory"""
        # Files to migrate from script root to test_configs/
        test_files_to_migrate = [
            'test_version.yml',
            'test_interfaces.yml'
        ]
        
        migrated_files = []
        
        for test_file in test_files_to_migrate:
            source_path = SCRIPT_DIR / test_file
            target_path = self.test_configs_dir / test_file
            
            if source_path.exists() and not target_path.exists():
                try:
                    import shutil
                    shutil.copy2(source_path, target_path)
                    migrated_files.append(test_file)
                    self.logger.info(f"Migrated {test_file} to test_configs/")
                except Exception as e:
                    self.logger.warning(f"Could not migrate {test_file}: {e}")
        
        # Files to migrate from script root to configs/
        config_files_to_migrate = [
            'test_configs.yml',
            'metadata.yml',
            'logging.yml'
        ]
        
        for config_file in config_files_to_migrate:
            source_path = SCRIPT_DIR / config_file
            target_path = self.configs_dir / config_file
            
            if source_path.exists() and not target_path.exists():
                try:
                    import shutil
                    shutil.copy2(source_path, target_path)
                    migrated_files.append(config_file)
                    self.logger.info(f"Migrated {config_file} to configs/")
                except Exception as e:
                    self.logger.warning(f"Could not migrate {config_file}: {e}")
        
        # Move log file to logs/
        log_file = 'network_automation.log'
        source_log = SCRIPT_DIR / log_file
        target_log = LOGS_DIR / log_file
        
        if source_log.exists() and not target_log.exists():
            try:
                import shutil
                shutil.move(source_log, target_log)
                migrated_files.append(log_file)
                self.logger.info(f"Moved {log_file} to logs/")
            except Exception as e:
                self.logger.warning(f"Could not move {log_file}: {e}")
        
        if migrated_files:
            self.logger.info(f"Migration complete: {len(migrated_files)} files organized")
    
    def _discover_jsnapy_tests(self) -> Dict[str, Dict[str, Any]]:
        """Discover JSNAPy test files from pipeline test configs directory"""
        discovered = {}
        
        # Look for JSNAPy test files
        test_patterns = [
            'test_*.yml',
            'test_*.yaml', 
            '*_test.yml',
            '*_test.yaml'
        ]
        
        self.logger = self._setup_basic_logging()
        
        for pattern in test_patterns:
            test_files = glob.glob(str(self.test_configs_dir / pattern))
            
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
                        'modified_time': time.ctime(os.path.getmtime(test_file))
                    }
                    
                    self.logger.debug(f"Discovered test: {test_name} from {test_file}")
        
        # If no tests discovered, create defaults and re-discover
        if not discovered:
            self.logger.warning(f"No JSNAPy test files found in {self.test_configs_dir}")
            self._create_default_test_structure()
            return self._discover_jsnapy_tests()
        
        return discovered
    
    def _setup_basic_logging(self) -> logging.Logger:
        """Setup basic logging for discovery phase"""
        # Check for existing logging configuration
        logging_config_path = self.configs_dir / 'logging.yml'
        if logging_config_path.exists():
            try:
                with open(logging_config_path, 'r') as f:
                    logging_config = yaml.safe_load(f)
                # Apply existing logging configuration if available
                log_level = logging_config.get('level', 'INFO')
            except:
                log_level = 'INFO'
        else:
            log_level = 'INFO'
        
        logging.basicConfig(
            level=getattr(logging, log_level),
            format='%(asctime)s - PIPELINE_LAB - %(levelname)s - %(message)s',
            handlers=[
                logging.StreamHandler(),
                logging.FileHandler(LOGS_DIR / 'pipeline_tests.log')
            ]
        )
        return logging.getLogger(__name__)
    
    def _extract_test_name(self, test_file: str) -> str:
        """Extract test name from file path"""
        filename = os.path.basename(test_file)
        name = os.path.splitext(filename)[0]
        
        if not name.startswith('test_'):
            name = f'test_{name}'
            
        return name
    
    def _analyze_test_file(self, test_file: str) -> Optional[Dict[str, Any]]:
        """Analyze a JSNAPy test file to extract metadata"""
        try:
            with open(test_file, 'r') as f:
                content = yaml.safe_load(f)
            
            if not content:
                return None
            
            test_info = {'test_type': 'jsnapy'}
            
            # Extract information from JSNAPy test structure
            if isinstance(content, dict):
                # Get the first test definition
                first_test_key = list(content.keys())[0]
                first_test = content[first_test_key]
                
                if isinstance(first_test, dict):
                    test_info['description'] = (
                        first_test.get('description') or 
                        first_test.get('info') or
                        f"JSNAPy test from {os.path.basename(test_file)}"
                    )
                    
                    # Extract RPC from test definition
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
        
        # Use existing pipeline knowledge if available
        if self.external_config.get('test_configs'):
            existing_tests = self.external_config['test_configs'].get('tests', {})
            if test_name in existing_tests:
                return existing_tests[test_name].get('rpc_fallback', 'get_software_information')
        
        rpc_mapping = {
            'version': 'get_software_information',
            'software': 'get_software_information',
            'bgp': 'get_bgp_neighbor_information',
            'interface': 'get_interface_information',
            'int': 'get_interface_information',
            'ospf': 'get_ospf_neighbor_information',
            'route': 'get_route_information',
            'routing': 'get_route_information',
            'lldp': 'get_lldp_neighbors_information',
            'isis': 'get_isis_adjacency_information',
            'ldp': 'get_ldp_neighbor_information',
            'mpls': 'get_mpls_lsp_information',
            'chassis': 'get_chassis_inventory',
            'hardware': 'get_chassis_inventory'
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
    
    def _create_default_test_structure(self):
        """Create default test structure compatible with existing pipeline"""
        self.logger.info("Creating default test structure in pipeline...")
        
        # Create default test_version.yml compatible with existing structure
        default_version_test = {
            'test_version': {
                'description': 'Check Junos software version and device information',
                'command': 'show version',
                'rpc': 'get-software-information',
                'format': 'xml',
                'iterate': {
                    'xpath': '//software-information',
                    'tests': [
                        {
                            'test_name': 'version_check',
                            'info': 'Verify Junos version is available',
                            'xpath': 'junos-version',
                            'tests': [
                                {
                                    'exists': '',
                                    'info': 'Junos version should exist'
                                }
                            ]
                        },
                        {
                            'test_name': 'hostname_check',
                            'info': 'Verify device hostname is configured',
                            'xpath': 'host-name',
                            'tests': [
                                {
                                    'exists': '',
                                    'info': 'Device hostname should be configured'
                                }
                            ]
                        }
                    ]
                }
            }
        }
        
        version_test_path = self.test_configs_dir / 'test_version.yml'
        with open(version_test_path, 'w') as f:
            yaml.dump(default_version_test, f, default_flow_style=False)
        
        self.logger.info(f"Created default version test: {version_test_path}")
    
    def _get_pipeline_config(self) -> Dict[str, Any]:
        """Get pipeline configuration integrating with existing configs"""
        tests_config = {}
        
        # Build tests configuration from discovered tests
        for test_name, test_info in self.discovered_tests.items():
            # Check if this test has existing configuration
            existing_test_config = {}
            if self.external_config.get('test_configs'):
                existing_tests = self.external_config['test_configs'].get('tests', {})
                existing_test_config = existing_tests.get(test_name, {})
            
            tests_config[test_name] = {
                'name': test_name,
                'file': test_info['file'],
                'description': test_info['description'],
                'rpc_fallback': test_info['rpc_fallback'],
                'enabled': existing_test_config.get('enabled', True),
                'timeout': existing_test_config.get('timeout', 15),
                'parameters': existing_test_config.get('parameters', {}),
                'test_type': test_info['test_type'],
                'discovered': test_info['discovered']
            }
        
        # Use existing global config if available
        global_config = {
            'default_timeout': 15,
            'retry_attempts': 1,
            'log_level': 'INFO',
            'output_format': 'json',
            'lab_mode': True,
            'verbose_output': True,
            'include_explanations': True
        }
        
        if self.external_config.get('test_configs'):
            external_global = self.external_config['test_configs'].get('global', {})
            global_config.update(external_global)
        
        return {
            'tests': tests_config,
            'global': global_config,
            'environment': self.environment,
            'discovery': {
                'test_configs_directory': str(self.test_configs_dir),
                'configs_directory': str(self.configs_dir),
                'pipeline_root': str(PIPELINE_ROOT),
                'total_tests_discovered': len(self.discovered_tests),
                'discovery_time': time.strftime("%Y-%m-%d %H:%M:%S")
            },
            'external_config': bool(self.external_config)
        }
    
    def _setup_logging(self) -> logging.Logger:
        """Setup logging using pipeline configuration"""
        log_level = self.config.get('global', {}).get('log_level', 'INFO')
        
        # Setup file logging in pipeline logs directory
        log_file = LOGS_DIR / 'pipeline_tests.log'
        
        logging.basicConfig(
            level=getattr(logging, log_level),
            format='%(asctime)s - PIPELINE_LAB - %(levelname)s - %(message)s',
            handlers=[
                logging.StreamHandler(),
                logging.FileHandler(log_file)
            ]
        )
        return logging.getLogger(__name__)
    
    def get_pipeline_info(self) -> Dict[str, Any]:
        """Get information about the pipeline structure"""
        return {
            "pipeline_structure": {
                "pipeline_root": str(PIPELINE_ROOT),
                "script_directory": str(SCRIPT_DIR),
                "test_configs_dir": str(self.test_configs_dir),
                "configs_dir": str(self.configs_dir),
                "utils_dir": str(UTILS_DIR),
                "assets_dir": str(ASSETS_DIR),
                "logs_dir": str(LOGS_DIR)
            },
            "discovered_tests": len(self.discovered_tests),
            "test_files": [info['file'] for info in self.discovered_tests.values()],
            "external_config_loaded": bool(self.external_config),
            "environment": self.environment
        }
    
    # ... [Include all the execution methods from the previous version] ...
    # [get_available_tests, execute_jsnapy_test, run_tests, etc.]

def main():
    """Main function integrated with existing pipeline structure"""
    parser = argparse.ArgumentParser(
        description="Pipeline Lab Test Runner - Integrated with existing python_pipeline structure"
    )
    parser.add_argument("--hostname", required=True, help="Target device hostname or IP address")
    parser.add_argument("--username", required=True, help="SSH username") 
    parser.add_argument("--password", required=True, help="SSH password")
    parser.add_argument("--tests", help="Comma-separated test names to run")
    parser.add_argument("--test_configs_dir", help="Custom test configs directory")
    parser.add_argument("--configs_dir", help="Custom configs directory")
    parser.add_argument("--list_tests", action="store_true", help="List discovered tests and exit")
    parser.add_argument("--show_pipeline", action="store_true", help="Show pipeline structure info")
    parser.add_argument("--network_type", default="enterprise", 
                       choices=["enterprise", "service_provider", "datacenter"],
                       help="Network type (default: enterprise)")
    
    args = parser.parse_args()
    
    # Set environment
    os.environ['NETWORK_TYPE'] = args.network_type
    
    # Initialize pipeline test runner
    runner = PipelineLabTestRunner(args.test_configs_dir, args.configs_dir)
    
    # Handle pipeline structure info request
    if args.show_pipeline:
        info = runner.get_pipeline_info()
        print(json.dumps(info, indent=2))
        return
    
    # Handle list tests request
    if args.list_tests:
        tests = runner.get_available_tests()
        print(json.dumps({
            "pipeline_structure": runner.get_pipeline_info()["pipeline_structure"],
            "discovered_tests": {
                name: {
                    "description": config.description,
                    "file": config.file,
                    "rpc_fallback": config.rpc_fallback,
                    "test_type": runner.discovered_tests[name]['test_type'],
                    "discovered": runner.discovered_tests[name]['discovered'],
                    "location": runner.discovered_tests[name]['relative_path']
                } for name, config in tests.items()
            },
            "total_tests": len(tests),
            "external_config_loaded": runner.config.get('external_config', False)
        }, indent=2))
        return
    
    # Parse test names
    test_names = None
    if args.tests:
        test_names = [name.strip() for name in args.tests.split(',') if name.strip()]
    
    # Run tests
    try:
        print(f"🧪 Starting Pipeline Lab Tests for {args.hostname}...")
        print(f"📁 Using pipeline structure: {PIPELINE_ROOT}")
        
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
            "pipeline_location": str(PIPELINE_ROOT),
            "script_location": str(SCRIPT_DIR)
        }))

if __name__ == "__main__":
    main()