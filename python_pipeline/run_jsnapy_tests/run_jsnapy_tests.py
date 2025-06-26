# vlabs/python_pipeline/run_jsnapy_tests/run_jsnapy_tests_dynamic.py
import argparse
import os
import sys
import json
import logging
import tempfile
import yaml
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional
from pathlib import Path

# --- CORRECT IMPORT STATEMENT ---
from jnpr.jsnapy import SnapAdmin
# --- END CORRECT IMPORT STATEMENT ---
from jnpr.junos.exception import ConnectError

# Import the connection utility from the parent directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.connect_to_hosts import connect_to_hosts, disconnect_from_hosts

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
    timeout: int = 30
    parameters: Dict[str, Any] = field(default_factory=dict)
    thresholds: Dict[str, Any] = field(default_factory=dict)
    xpath_checks: List[Dict[str, Any]] = field(default_factory=list)
    critical: bool = False

class DynamicTestRunner:
    """Dynamic JSNAPy test runner with configuration-driven approach"""
    
    def __init__(self, config_file: str = None):
        self.config_file = config_file or os.path.join(os.path.dirname(__file__), 'test_configs.yml')
        self.config = self._load_configuration()
        self.logger = self._setup_logging()
        
    def _load_configuration(self) -> Dict[str, Any]:
        """Load test configuration from YAML file"""
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r') as f:
                    return yaml.safe_load(f)
            else:
                self.logger.warning(f"Configuration file {self.config_file} not found, using defaults")
                return self._get_default_config()
        except Exception as e:
            print(f"Error loading configuration: {e}")
            return self._get_default_config()
    
    def _get_default_config(self) -> Dict[str, Any]:
        """Fallback configuration if config file is not available"""
        return {
            'tests': {
                'test_version': {
                    'file': 'test_version.yml',
                    'description': 'Check Junos version information',
                    'rpc_fallback': 'get_software_information',
                    'enabled': True
                },
                'test_bgp': {
                    'file': 'test_bgp.yml',
                    'description': 'Check BGP neighbor status',
                    'rpc_fallback': 'get_bgp_neighbor_information',
                    'enabled': True
                },
                'test_interfaces': {
                    'file': 'test_interfaces.yml',
                    'description': 'Check interface status',
                    'rpc_fallback': 'get_interface_information',
                    'enabled': True
                },
                'test_ospf': {
                    'file': 'test_ospf.yml',
                    'description': 'Check OSPF neighbors',
                    'rpc_fallback': 'get_ospf_neighbor_information',
                    'enabled': True
                },
                'test_route_table': {
                    'file': 'test_route_table.yml',
                    'description': 'Check routing table',
                    'rpc_fallback': 'get_route_information',
                    'enabled': True
                },
                'test_lldp': {
                    'file': 'test_lldp.yml',
                    'description': 'Check LLDP neighbors',
                    'rpc_fallback': 'get_lldp_neighbors_information',
                    'enabled': True
                }
            },
            'global': {
                'default_timeout': 30,
                'max_concurrent_tests': 5,
                'retry_attempts': 2,
                'log_level': 'INFO'
            }
        }
    
    def _setup_logging(self) -> logging.Logger:
        """Setup dynamic logging configuration"""
        log_level = self.config.get('global', {}).get('log_level', 'INFO')
        logging.basicConfig(
            level=getattr(logging, log_level),
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        return logging.getLogger(__name__)
    
    def get_available_tests(self) -> Dict[str, TestConfig]:
        """Get all available tests as TestConfig objects"""
        tests = {}
        for test_name, test_data in self.config.get('tests', {}).items():
            tests[test_name] = TestConfig(
                name=test_name,
                **test_data
            )
        return tests
    
    def get_enabled_tests(self) -> Dict[str, TestConfig]:
        """Get only enabled tests"""
        return {name: config for name, config in self.get_available_tests().items() 
                if config.enabled}
    
    def apply_device_profile(self, device_type: str = None):
        """Apply device-specific configuration overrides"""
        if not device_type or 'device_profiles' not in self.config:
            return
        
        profile = self.config['device_profiles'].get(device_type)
        if not profile:
            return
        
        # Apply profile-specific test overrides
        for test_name, overrides in profile.get('tests', {}).items():
            if test_name in self.config['tests']:
                self.config['tests'][test_name].update(overrides)
    
    def validate_thresholds(self, test_config: TestConfig, data: Dict[str, Any]) -> bool:
        """Validate test results against configured thresholds"""
        if not test_config.thresholds:
            return True
        
        try:
            for threshold_name, threshold_value in test_config.thresholds.items():
                if threshold_name.startswith('min_'):
                    metric_name = threshold_name[4:]  # Remove 'min_' prefix
                    actual_value = data.get(metric_name, 0)
                    if actual_value < threshold_value:
                        return False
                elif threshold_name.startswith('max_'):
                    metric_name = threshold_name[4:]  # Remove 'max_' prefix
                    actual_value = data.get(metric_name, 0)
                    if actual_value > threshold_value:
                        return False
            return True
        except Exception as e:
            self.logger.error(f"Threshold validation error: {e}")
            return False
    
    def execute_xpath_checks(self, test_config: TestConfig, xml_result) -> List[str]:
        """Execute dynamic XPath checks on XML results"""
        issues = []
        
        for check in test_config.xpath_checks:
            try:
                xpath = check['path']
                elements = xml_result.findall(xpath)
                
                if 'expected_min_length' in check:
                    if len(elements) < check['expected_min_length']:
                        issues.append(f"XPath {xpath}: Expected at least {check['expected_min_length']} elements, found {len(elements)}")
                
                if 'expected_values' in check and 'attribute' in check:
                    for element in elements:
                        attr_value = element.get(check['attribute'])
                        if attr_value not in check['expected_values']:
                            issues.append(f"XPath {xpath}: Attribute {check['attribute']} has value '{attr_value}', expected one of {check['expected_values']}")
                            
            except Exception as e:
                issues.append(f"XPath check failed: {e}")
        
        return issues
    
    def execute_fallback_test(self, dev, test_config: TestConfig, hostname: str) -> TestResult:
        """Execute enhanced fallback RPC test with dynamic validation"""
        start_time = time.time()
        
        try:
            rpc_method = test_config.rpc_fallback
            self.logger.debug(f"Executing fallback RPC: {rpc_method}")
            
            # Get parameters from config
            params = test_config.parameters
            
            # Execute RPC based on method
            if rpc_method == 'get_software_information':
                result = dev.rpc.get_software_information()
                version = result.findtext(".//junos-version", "Unknown")
                
                data = {'version': version}
                xpath_issues = self.execute_xpath_checks(test_config, result)
                
                return TestResult(
                    test_name=test_config.name,
                    device=hostname,
                    result=len(xpath_issues) == 0,
                    message=f'Version check completed. Junos version: {version}' + 
                           (f' Issues: {"; ".join(xpath_issues)}' if xpath_issues else ''),
                    execution_time=time.time() - start_time,
                    details=data
                )
                
            elif rpc_method == 'get_bgp_neighbor_information':
                result = dev.rpc.get_bgp_neighbor_information()
                neighbors = result.findall(".//bgp-peer")
                neighbor_count = len(neighbors)
                
                # Check neighbor states
                established_count = len([n for n in neighbors if n.findtext('.//peer-state') == 'Established'])
                down_count = neighbor_count - established_count
                
                data = {
                    'neighbors': neighbor_count,
                    'established_neighbors': established_count,
                    'down_neighbors': down_count
                }
                
                threshold_passed = self.validate_thresholds(test_config, data)
                xpath_issues = self.execute_xpath_checks(test_config, result)
                
                return TestResult(
                    test_name=test_config.name,
                    device=hostname,
                    result=threshold_passed and len(xpath_issues) == 0,
                    message=f'BGP check completed. {established_count}/{neighbor_count} neighbors established' +
                           (f' Issues: {"; ".join(xpath_issues)}' if xpath_issues else ''),
                    execution_time=time.time() - start_time,
                    details=data
                )
                
            elif rpc_method == 'get_interface_information':
                terse = params.get('terse', True)
                result = dev.rpc.get_interface_information(terse=terse)
                interfaces = result.findall(".//physical-interface")
                interface_count = len(interfaces)
                
                # Count up interfaces
                up_interfaces = len([i for i in interfaces if i.findtext('.//oper-status') == 'up'])
                
                data = {
                    'interfaces': interface_count,
                    'up_interfaces': up_interfaces,
                    'down_interfaces': interface_count - up_interfaces
                }
                
                threshold_passed = self.validate_thresholds(test_config, data)
                
                return TestResult(
                    test_name=test_config.name,
                    device=hostname,
                    result=threshold_passed,
                    message=f'Interface check completed. {up_interfaces}/{interface_count} interfaces up',
                    execution_time=time.time() - start_time,
                    details=data
                )
                
            elif rpc_method == 'get_ospf_neighbor_information':
                result = dev.rpc.get_ospf_neighbor_information()
                neighbors = result.findall(".//ospf-neighbor")
                neighbor_count = len(neighbors)
                
                # Count full neighbors
                full_neighbors = len([n for n in neighbors if n.findtext('.//neighbor-state') == 'Full'])
                
                data = {
                    'neighbors': neighbor_count,
                    'full_neighbors': full_neighbors,
                    'down_neighbors': neighbor_count - full_neighbors
                }
                
                threshold_passed = self.validate_thresholds(test_config, data)
                
                return TestResult(
                    test_name=test_config.name,
                    device=hostname,
                    result=threshold_passed,
                    message=f'OSPF check completed. {full_neighbors}/{neighbor_count} neighbors in Full state',
                    execution_time=time.time() - start_time,
                    details=data
                )
                
            elif rpc_method == 'get_route_information':
                table = params.get('table', 'inet.0')
                result = dev.rpc.get_route_information(table=table)
                routes = result.findall(".//rt")
                route_count = len(routes)
                
                data = {
                    'routes': route_count,
                    'table': table
                }
                
                threshold_passed = self.validate_thresholds(test_config, data)
                
                return TestResult(
                    test_name=test_config.name,
                    device=hostname,
                    result=threshold_passed,
                    message=f'Route table check completed. {route_count} routes in {table}',
                    execution_time=time.time() - start_time,
                    details=data
                )
                
            elif rpc_method == 'get_lldp_neighbors_information':
                result = dev.rpc.get_lldp_neighbors_information()
                neighbors = result.findall(".//lldp-neighbor-information")
                neighbor_count = len(neighbors)
                
                data = {
                    'lldp_neighbors': neighbor_count
                }
                
                threshold_passed = self.validate_thresholds(test_config, data)
                
                return TestResult(
                    test_name=test_config.name,
                    device=hostname,
                    result=threshold_passed,
                    message=f'LLDP check completed. {neighbor_count} LLDP neighbors found',
                    execution_time=time.time() - start_time,
                    details=data
                )
                
            # Add more RPC methods as needed...
            else:
                return TestResult(
                    test_name=test_config.name,
                    device=hostname,
                    result=False,
                    message=f'Unknown RPC method: {rpc_method}',
                    execution_time=time.time() - start_time
                )
                
        except Exception as e:
            return TestResult(
                test_name=test_config.name,
                device=hostname,
                result=False,
                message=f'Fallback test execution failed: {str(e)}',
                execution_time=time.time() - start_time
            )
    
    def execute_single_test(self, test_config: TestConfig, dev, hostname: str, 
                           username: str, password: str) -> TestResult:
        """Execute a single test with timeout and retry logic"""
        retry_attempts = self.config.get('global', {}).get('retry_attempts', 2)
        retry_delay = self.config.get('global', {}).get('retry_delay', 5)
        
        for attempt in range(retry_attempts + 1):
            try:
                if attempt > 0:
                    self.logger.info(f"Retrying test {test_config.name}, attempt {attempt + 1}")
                    time.sleep(retry_delay)
                
                test_file_path = os.path.join(os.path.dirname(__file__), test_config.file)
                
                # Try JSNAPy first if file exists
                if os.path.exists(test_file_path):
                    try:
                        result = self._execute_jsnapy_test(test_file_path, test_config, 
                                                         hostname, username, password)
                        if result:
                            return result
                    except Exception as e:
                        self.logger.debug(f"JSNAPy test failed: {e}")
                
                # Fall back to RPC test
                return self.execute_fallback_test(dev, test_config, hostname)
                
            except Exception as e:
                if attempt == retry_attempts:
                    return TestResult(
                        test_name=test_config.name,
                        device=hostname,
                        result=False,
                        message=f'Test failed after {retry_attempts + 1} attempts: {str(e)}'
                    )
                self.logger.warning(f"Test attempt {attempt + 1} failed: {e}")
    
    def _execute_jsnapy_test(self, test_file_path: str, test_config: TestConfig,
                           hostname: str, username: str, password: str) -> Optional[TestResult]:
        """Execute JSNAPy test with enhanced error handling"""
        start_time = time.time()
        
        try:
            # Create a temporary config file for JSNAPy
            with tempfile.NamedTemporaryFile(mode='w', suffix='.yml', delete=False) as tmp_config:
                config_content = {
                    'hosts': [{
                        'device': hostname,
                        'username': username,
                        'passwd': password
                    }],
                    'tests': [test_file_path]
                }
                yaml.dump(config_content, tmp_config)
                tmp_config_path = tmp_config.name
            
            try:
                # Initialize JSNAPy
                js = SnapAdmin()
                
                # Run the test
                snapcheck = js.snapcheck(config_file=tmp_config_path, pre_file=None)
                
                # Process results
                if snapcheck:
                    passed = all(result.get('result', False) for result in snapcheck)
                    message = f"JSNAPy test completed. Result: {'PASS' if passed else 'FAIL'}"
                    
                    return TestResult(
                        test_name=test_config.name,
                        device=hostname,
                        result=passed,
                        message=message,
                        execution_time=time.time() - start_time,
                        details={'jsnapy_results': snapcheck}
                    )
                else:
                    return None
                    
            finally:
                # Clean up temporary file
                if os.path.exists(tmp_config_path):
                    os.unlink(tmp_config_path)
                    
        except Exception as e:
            self.logger.error(f"JSNAPy test execution failed: {e}")
            return None
    
    def run_tests(self, hostname: str, username: str, password: str, 
                  test_ids: List[str] = None, device_type: str = None,
                  parallel: bool = False) -> Dict[str, Any]:
        """Run tests with dynamic configuration and optional parallelization"""
        
        # Apply device profile if specified
        if device_type:
            self.apply_device_profile(device_type)
        
        # Get available tests
        available_tests = self.get_enabled_tests()
        
        # Filter tests if specific IDs provided
        if test_ids:
            tests_to_run = {tid: available_tests[tid] for tid in test_ids 
                           if tid in available_tests}
        else:
            tests_to_run = available_tests
        
        if not tests_to_run:
            return {
                "status": "error",
                "message": "No valid tests to run",
                "available_tests": list(available_tests.keys())
            }
        
        # Connect to device
        connections = connect_to_hosts(hostname, username, password)
        if not connections:
            return {
                "status": "error",
                "message": f"Failed to connect to {hostname}"
            }
        
        try:
            dev = connections[0]
            results = []
            
            if parallel:
                # Parallel execution
                max_workers = min(len(tests_to_run), 
                                self.config.get('global', {}).get('max_concurrent_tests', 5))
                
                with ThreadPoolExecutor(max_workers=max_workers) as executor:
                    future_to_test = {
                        executor.submit(self.execute_single_test, test_config, dev, 
                                      hostname, username, password): test_name
                        for test_name, test_config in tests_to_run.items()
                    }
                    
                    for future in as_completed(future_to_test):
                        test_name = future_to_test[future]
                        try:
                            result = future.result()
                            results.append(result)
                        except Exception as e:
                            results.append(TestResult(
                                test_name=test_name,
                                device=hostname,
                                result=False,
                                message=f'Parallel execution failed: {str(e)}'
                            ))
            else:
                # Sequential execution
                for test_name, test_config in tests_to_run.items():
                    result = self.execute_single_test(test_config, dev, hostname, 
                                                    username, password)
                    results.append(result)
            
            # Format output
            return self._format_results(results, hostname)
            
        finally:
            disconnect_from_hosts(connections)
    
    def _format_results(self, results: List[TestResult], hostname: str) -> Dict[str, Any]:
        """Format test results based on configured output format"""
        output_format = self.config.get('global', {}).get('output_format', 'json')
        
        # Calculate summary statistics
        total_tests = len(results)
        passed_tests = sum(1 for r in results if r.result)
        failed_tests = total_tests - passed_tests
        total_time = sum(r.execution_time for r in results)
        
        # Check for critical test failures
        critical_failures = [r for r in results if not r.result and 
                           self.get_available_tests().get(r.test_name, TestConfig('', '', '', '')).critical]
        
        formatted_results = {
            "status": "critical" if critical_failures else ("success" if failed_tests == 0 else "warning"),
            "summary": {
                "total_tests": total_tests,
                "passed": passed_tests,
                "failed": failed_tests,
                "total_execution_time": round(total_time, 2),
                "critical_failures": len(critical_failures)
            },
            "test_results": []
        }
        
        for result in results:
            test_result = {
                "test_name": result.test_name,
                "host": result.device,
                "result": "Passed" if result.result else "Failed",
                "details": result.message,
                "execution_time": round(result.execution_time, 2),
                "timestamp": result.timestamp
            }
            
            # Add detailed metrics if available
            if result.details:
                test_result["metrics"] = result.details
            
            formatted_results["test_results"].append(test_result)
        
        return formatted_results

def main():
    """Enhanced main function with dynamic configuration support"""
    parser = argparse.ArgumentParser(description="Run dynamic JSNAPy tests on network devices.")
    parser.add_argument("--hostname", required=True, help="Target device hostname or IP")
    parser.add_argument("--username", required=True, help="SSH username")
    parser.add_argument("--password", required=True, help="SSH password")
    parser.add_argument("--test_ids", help="Comma-separated test IDs (runs all enabled tests if not specified)")
    parser.add_argument("--device_type", help="Device type for profile-specific configurations")
    parser.add_argument("--config", help="Path to test configuration file")
    parser.add_argument("--parallel", action="store_true", help="Run tests in parallel")
    parser.add_argument("--list_tests", action="store_true", help="List available tests and exit")
    
    args = parser.parse_args()
    
    # Initialize test runner
    runner = DynamicTestRunner(args.config)
    
    # Handle list tests request
    if args.list_tests:
        tests = runner.get_available_tests()
        print(json.dumps({
            "available_tests": {
                name: {
                    "description": config.description,
                    "enabled": config.enabled,
                    "timeout": config.timeout
                } for name, config in tests.items()
            }
        }, indent=2))
        return
    
    # Parse test IDs
    test_ids = None
    if args.test_ids:
        test_ids = [tid.strip() for tid in args.test_ids.split(',') if tid.strip()]
    
    # Run tests
    try:
        results = runner.run_tests(
            hostname=args.hostname,
            username=args.username,
            password=args.password,
            test_ids=test_ids,
            device_type=args.device_type,
            parallel=args.parallel
        )
        
        print(json.dumps(results, indent=2))
        
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": f"Unexpected error: {str(e)}"
        }))

if __name__ == "__main__":
    main()
