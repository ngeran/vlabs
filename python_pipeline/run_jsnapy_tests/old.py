# vlabs/python_pipeline/run_jsnapy_tests/run_jsnapy_tests_dynamic.py
"""
Environment-Aware JSNAPy Test Runner
Author: nikos-geranios_vgi
Enhanced: 2025-06-26 18:31:13 UTC
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

# Existing imports...
from jnpr.jsnapy import SnapAdmin
from jnpr.junos.exception import ConnectError

# Path setup (same as before)
SCRIPT_DIR = Path(__file__).parent
PIPELINE_ROOT = SCRIPT_DIR.parent
UTILS_DIR = PIPELINE_ROOT / 'utils'

# Directory structure
TESTS_DIR = SCRIPT_DIR / 'tests'
CONFIG_DIR = SCRIPT_DIR / 'config'
LOGS_DIR = SCRIPT_DIR / 'logs'

# Ensure directories exist
TESTS_DIR.mkdir(exist_ok=True)
CONFIG_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

sys.path.insert(0, str(UTILS_DIR))

try:
    from connect_to_hosts import connect_to_hosts, disconnect_from_hosts
except ImportError:
    print(f"Warning: Could not import connect_to_hosts from {UTILS_DIR}")
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

# ✨ HERE: Replace your existing TestConfig with the enhanced version
@dataclass 
class TestConfig:
    """Enhanced test configuration with environment safety"""
    name: str
    file: str
    description: str
    rpc_fallback: str
    enabled: bool = True
    timeout: int = 15
    parameters: Dict[str, Any] = field(default_factory=dict)
    test_type: str = "jsnapy"
    discovered: bool = True
    location: str = "tests/"
    
    # ✨ NEW: Environment and Safety Classifications
    environment_classification: str = "development"  # development, staging, production
    safety_level: str = "safe"                      # safe, monitoring_only, potentially_disruptive
    production_approved: bool = False               # Explicit production approval
    requires_change_control: bool = False           # Change management requirement
    max_impact_level: str = "low"                  # low, medium, high, critical

class IndustryStandardTestRunner:
    """Enhanced test runner with environment awareness"""
    
    def __init__(self, tests_directory: str = None, config_directory: str = None, 
                 target_environment: str = None):
        
        # ✨ Enhanced environment detection
        self.target_environment = target_environment or os.getenv('TARGET_ENVIRONMENT', 'development')
        self.deployment_context = os.getenv('DEPLOYMENT_CONTEXT', 'lab')
        
        # Rest of your initialization...
        self.tests_dir = Path(tests_directory) if tests_directory else TESTS_DIR
        self.config_dir = Path(config_directory) if config_directory else CONFIG_DIR
        
        # Enhanced environment configuration
        self.environment = {
            'lab_environment': self.deployment_context,
            'target_environment': self.target_environment,
            'device_vendor': 'juniper',
            'network_type': os.getenv('NETWORK_TYPE', 'enterprise'),
            'deployment_mode': 'container',
            'safety_mode': self._determine_safety_mode(),
            'production_mode': self.target_environment == 'production',
            'configured_at': time.strftime("%Y-%m-%d %H:%M:%S"),
            'configured_by': 'nikos-geranios_vgi',
            'pipeline_root': str(PIPELINE_ROOT),
            'directory_standard': 'industry_standard'
        }
        
        # Setup logging
        self.logger = self._setup_basic_logging()
        
        # Migration and discovery
        migration_results = self._migrate_to_industry_standard()
        self.external_config = self._load_existing_configs()
        self.discovered_tests = self._discover_tests()
        self.config = self._get_test_config()
        self.logger = self._setup_logging()
        self._log_initialization_summary(migration_results)
    
    def _determine_safety_mode(self) -> str:
        """Determine safety mode based on environment"""
        safety_modes = {
            'production': 'production_safe',
            'staging': 'staging_safe',
            'development': 'development_safe',
            'lab': 'lab_safe'
        }
        return safety_modes.get(self.target_environment, 'development_safe')
    
    # ✨ NEW: Environment metadata extraction
    def _extract_environment_metadata(self, test_file_path: Path) -> Dict[str, Any]:
        """Extract environment metadata from test file"""
        try:
            with open(test_file_path, 'r') as f:
                content = yaml.safe_load(f)
            
            # Look for test_metadata section in YAML
            if isinstance(content, dict) and 'test_metadata' in content:
                metadata = content['test_metadata']
                self.logger.debug(f"Found environment metadata in {test_file_path.name}: {metadata}")
                return metadata
            
            # Default metadata for tests without explicit classification
            default_metadata = {
                'environment_classification': 'development',
                'safety_level': 'safe',
                'production_approved': False,
                'requires_change_control': False,
                'max_impact_level': 'low',
                'approved_for_environments': ['development', 'lab'],
                'created_by': 'nikos-geranios_vgi'
            }
            
            self.logger.debug(f"Using default metadata for {test_file_path.name}")
            return default_metadata
            
        except Exception as e:
            self.logger.warning(f"Could not extract environment metadata from {test_file_path}: {e}")
            return {
                'environment_classification': 'development',
                'safety_level': 'safe',
                'production_approved': False,
                'max_impact_level': 'low'
            }
    
    # ✨ NEW: Environment appropriateness check
    def _is_test_appropriate_for_environment(self, metadata: Dict[str, Any]) -> bool:
        """Check if test is appropriate for current target environment"""
        
        # Get test's environment settings
        test_env_classification = metadata.get('environment_classification', 'development')
        approved_envs = metadata.get('approved_for_environments', [test_env_classification])
        restricted_envs = metadata.get('restricted_environments', [])
        production_approved = metadata.get('production_approved', False)
        max_impact = metadata.get('max_impact_level', 'low')
        
        self.logger.debug(f"Checking test appropriateness: target={self.target_environment}, "
                         f"approved={approved_envs}, restricted={restricted_envs}, "
                         f"prod_approved={production_approved}")
        
        # Check if current environment is explicitly restricted
        if self.target_environment in restricted_envs:
            if self.target_environment == 'production' and production_approved:
                self.logger.info(f"Test approved for production with explicit approval")
                return True
            self.logger.warning(f"Test restricted for {self.target_environment} environment")
            return False
        
        # Check if current environment is in approved list
        if self.target_environment in approved_envs:
            self.logger.debug(f"Test approved for {self.target_environment}")
            return True
        
        # Special handling for production
        if self.target_environment == 'production':
            if not production_approved or max_impact in ['high', 'critical']:
                self.logger.warning(f"Test not production-approved or high impact ({max_impact})")
                return False
        
        # Conservative default - allow for dev/lab environments
        is_appropriate = self.target_environment in ['development', 'lab']
        self.logger.debug(f"Conservative check result: {is_appropriate}")
        return is_appropriate
    
    # ✨ ENHANCED: Discovery with environment filtering
    def _discover_tests(self) -> Dict[str, Dict[str, Any]]:
        """Discover tests with environment classification"""
        discovered = {}
        
        test_patterns = ['test_*.yml', 'test_*.yaml', '*_test.yml', '*_test.yaml']
        
        self.logger.info(f"🔍 Discovering tests for {self.target_environment} environment in {self.tests_dir}")
        
        for pattern in test_patterns:
            test_files = glob.glob(str(self.tests_dir / pattern))
            
            for test_file in test_files:
                test_name = self._extract_test_name(test_file)
                test_info = self._analyze_test_file(test_file)
                
                if test_info:
                    # Extract environment metadata
                    env_metadata = self._extract_environment_metadata(Path(test_file))
                    
                    # Check if appropriate for current environment
                    is_appropriate = self._is_test_appropriate_for_environment(env_metadata)
                    
                    # Build complete test information
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
                        'location': 'tests/',
                        # ✨ NEW: Environment metadata
                        'environment_classification': env_metadata.get('environment_classification', 'development'),
                        'safety_level': env_metadata.get('safety_level', 'safe'),
                        'production_approved': env_metadata.get('production_approved', False),
                        'requires_change_control': env_metadata.get('requires_change_control', False),
                        'max_impact_level': env_metadata.get('max_impact_level', 'low'),
                        'environment_appropriate': is_appropriate,
                        'approved_environments': env_metadata.get('approved_for_environments', ['development']),
                        'restricted_environments': env_metadata.get('restricted_environments', [])
                    }
                    
                    if is_appropriate:
                        self.logger.info(f"✅ Discovered environment-appropriate test: {test_name}")
                    else:
                        self.logger.warning(f"⚠️ Discovered test not appropriate for {self.target_environment}: {test_name}")
        
        appropriate_count = sum(1 for t in discovered.values() if t['environment_appropriate'])
        self.logger.info(f"📊 Discovery complete: {len(discovered)} total tests, {appropriate_count} appropriate for {self.target_environment}")
        
        return discovered
    
    # ✨ ENHANCED: Test config with all environment fields
    def get_test_by_name(self, test_name: str) -> Optional[TestConfig]:
        """Get a specific test configuration by name with environment data"""
        if test_name in self.config['tests']:
            test_data = self.config['tests'][test_name]
            
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
                location=test_data.get('location', 'tests/'),
                # ✨ NEW: Environment fields
                environment_classification=test_data.get('environment_classification', 'development'),
                safety_level=test_data.get('safety_level', 'safe'),
                production_approved=test_data.get('production_approved', False),
                requires_change_control=test_data.get('requires_change_control', False),
                max_impact_level=test_data.get('max_impact_level', 'low')
            )
        return None
    
    # Continue with all your existing methods...
    # (I'll show the key ones that need updates)
    
    def run_tests(self, hostname: str, username: str, password: str, 
                  test_names: List[str] = None, override_environment_check: bool = False) -> Dict[str, Any]:
        """Enhanced run_tests with environment safety checks"""
        
        available_tests = self.get_available_tests()
        
        # ✨ Environment safety validation
        if not override_environment_check:
            # Filter tests appropriate for environment
            appropriate_tests = {
                name: test for name, test in available_tests.items()
                if getattr(test, 'environment_classification', 'development') in ['development', self.target_environment] or
                   (self.target_environment == 'production' and getattr(test, 'production_approved', False))
            }
            
            if self.target_environment == 'production':
                production_safe_tests = {
                    name: test for name, test in appropriate_tests.items()
                    if getattr(test, 'production_approved', False) and
                       getattr(test, 'max_impact_level', 'high') in ['low', 'medium']
                }
                
                if test_names:
                    unsafe_tests = [name for name in test_names if name not in production_safe_tests]
                    if unsafe_tests:
                        return {
                            "status": "error",
                            "message": f"🚨 PRODUCTION SAFETY: Tests {unsafe_tests} not approved for production",
                            "target_environment": self.target_environment,
                            "production_safe_tests": list(production_safe_tests.keys()),
                            "safety_notice": "Use --override_environment_check flag if you have proper authorization",
                            "safety_check_time": "2025-06-26 18:31:13",
                            "checked_by": "nikos-geranios_vgi"
                        }
                
                available_tests = production_safe_tests
            else:
                available_tests = appropriate_tests
        
        # Determine tests to run
        if test_names:
            invalid_tests = [name for name in test_names if name not in available_tests]
            if invalid_tests:
                return {
                    "status": "error",
                    "message": f"❌ Invalid test names for {self.target_environment}: {', '.join(invalid_tests)}",
                    "available_tests": list(available_tests.keys()),
                    "target_environment": self.target_environment
                }
            tests_to_run = test_names
        else:
            tests_to_run = list(available_tests.keys())
        
        # Log environment context
        self.logger.info(f"🌍 Running {len(tests_to_run)} tests in {self.target_environment} environment")
        self.logger.info(f"🛡️ Safety mode: {self.environment['safety_mode']}")
        
        # Execute tests
        results = []
        for test_name in tests_to_run:
            self.logger.info(f"🧪 Executing {self.target_environment}-appropriate test: {test_name}")
            result = self.execute_jsnapy_test(test_name, hostname, username, password)
            results.append(result)
        
        return self._format_results_with_environment(results, hostname, tests_to_run)

    # Add all your existing methods here...
    # (keeping them the same, just ensuring they work with the enhanced TestConfig)

# Continue with main() function that includes environment argument...

def main():
    """Enhanced main with environment specification"""
    parser = argparse.ArgumentParser(
        description="Environment-Aware Industry Standard Test Runner - Enhanced by nikos-geranios_vgi"
    )
    
    parser.add_argument("--hostname", required=True, help="Target device hostname or IP address")
    parser.add_argument("--username", required=True, help="SSH username") 
    parser.add_argument("--password", required=True, help="SSH password")
    parser.add_argument("--tests", help="Comma-separated test names to run")
    
    # ✨ NEW: Environment specification
    parser.add_argument("--environment", 
                       choices=["development", "lab", "staging", "production"],
                       default="development",
                       help="Target environment (default: development)")
    
    parser.add_argument("--override_environment_check", action="store_true",
                       help="Override environment safety checks (requires authorization)")
    
    parser.add_argument("--list_tests", action="store_true", help="List environment-appropriate tests")
    parser.add_argument("--network_type", default="enterprise", 
                       choices=["enterprise", "service_provider", "datacenter"])
    
    args = parser.parse_args()
    
    # Set environment variables
    os.environ['NETWORK_TYPE'] = args.network_type
    os.environ['TARGET_ENVIRONMENT'] = args.environment
    
    try:
        # Initialize environment-aware test runner
        runner = IndustryStandardTestRunner(target_environment=args.environment)
        
        if args.list_tests:
            tests = runner.get_available_tests()
            print(json.dumps({
                "environment_context": {
                    "target_environment": args.environment,
                    "safety_mode": runner.environment['safety_mode'],
                    "production_mode": runner.environment['production_mode'],
                    "configured_by": "nikos-geranios_vgi",
                    "enhanced_at": "2025-06-26 18:31:13"
                },
                "discovered_tests": {
                    name: {
                        "description": config.description,
                        "file": config.file,
                        "environment_classification": config.environment_classification,
                        "safety_level": config.safety_level,
                        "production_approved": config.production_approved,
                        "max_impact_level": config.max_impact_level,
                        "requires_change_control": config.requires_change_control
                    } for name, config in tests.items()
                },
                "total_tests": len(tests)
            }, indent=2))
            return
        
        # Parse and run tests
        test_names = [name.strip() for name in args.tests.split(',') if name.strip()] if args.tests else None
        
        print(f"🌍 Starting {args.environment.upper()} Environment Tests for {args.hostname}...")
        print(f"🛡️ Safety Mode: {runner.environment['safety_mode']}")
        print(f"👤 Enhanced by: nikos-geranios_vgi at 2025-06-26 18:31:13")
        
        results = runner.run_tests(
            hostname=args.hostname,
            username=args.username,
            password=args.password,
            test_names=test_names,
            override_environment_check=args.override_environment_check
        )
        
        print(json.dumps(results, indent=2))
        
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": f"❌ Environment-aware testing error: {str(e)}",
            "target_environment": args.environment,
            "enhanced_by": "nikos-geranios_vgi",
            "error_time": "2025-06-26 18:31:13"
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
