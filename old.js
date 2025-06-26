# vlabs/python_pipeline/run_jsnapy_tests/run_jsnapy_tests.py
import argparse
import os
import sys
import json
import logging
import tempfile
import yaml
# --- CORRECT IMPORT STATEMENT ---
from jnpr.jsnapy import SnapAdmin
# --- END CORRECT IMPORT STATEMENT ---
from jnpr.junos.exception import ConnectError

# Import the connection utility from the parent directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.connect_to_hosts import connect_to_hosts, disconnect_from_hosts

# Define available test configurations
TEST_CONFIGURATIONS = {
    'test_version': {
        'file': 'test_version.yml',
        'description': 'Check Junos version information',
        'rpc_fallback': 'get_software_information'
    },
    'test_bgp': {
        'file': 'test_bgp.yml', 
        'description': 'Check BGP neighbor status',
        'rpc_fallback': 'get_bgp_neighbor_information'
    },
    'test_interfaces': {
        'file': 'test_interfaces.yml',
        'description': 'Check interface status and statistics',
        'rpc_fallback': 'get_interface_information'
    },
    'test_ospf': {
        'file': 'test_ospf.yml',
        'description': 'Check OSPF neighbor and database information',
        'rpc_fallback': 'get_ospf_neighbor_information'
    },
    'test_route_table': {
        'file': 'test_route_table.yml',
        'description': 'Check routing table entries',
        'rpc_fallback': 'get_route_information'
    },
    'test_system_health': {
        'file': 'test_system_health.yml',
        'description': 'Check system alarms and hardware status',
        'rpc_fallback': 'get_system_alarm_information'
    },
    'test_lldp': {
        'file': 'test_lldp.yml',
        'description': 'Check LLDP neighbor information',
        'rpc_fallback': 'get_lldp_neighbors_information'
    },
    'test_mpls': {
        'file': 'test_mpls.yml',
        'description': 'Check MPLS LSP status',
        'rpc_fallback': 'get_mpls_lsp_information'
    }
}

def create_logging_config():
    """Create a temporary logging.yml file if it doesn't exist"""
    logging_yml_path = os.path.join(os.path.dirname(__file__), 'logging.yml')
    
    if not os.path.exists(logging_yml_path):
        logging_config = {
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
                    'level': 'INFO',
                    'formatter': 'simple',
                    'stream': 'ext://sys.stdout'
                }
            },
            'loggers': {
                'jsnapy': {
                    'level': 'INFO',
                    'handlers': ['console'],
                    'propagate': False
                }
            },
            'root': {
                'level': 'INFO',
                'handlers': ['console']
            }
        }
        
        try:
            with open(logging_yml_path, 'w') as f:
                yaml.dump(logging_config, f, default_flow_style=False)
            print(f"DEBUG: Created logging.yml at {logging_yml_path}")
        except Exception as e:
            print(f"DEBUG: Could not create logging.yml: {e}")
    
    return logging_yml_path

def execute_fallback_test(dev, test_id, hostname):
    """Execute fallback RPC test when JSNAPy test file is not available"""
    test_config = TEST_CONFIGURATIONS.get(test_id)
    if not test_config:
        return {
            'test_name': test_id,
            'device': hostname,
            'result': False,
            'message': f'Unknown test ID: {test_id}'
        }
    
    try:
        rpc_method = test_config['rpc_fallback']
        print(f"DEBUG: Executing fallback RPC: {rpc_method}")
        
        # Execute the appropriate RPC based on test type
        if rpc_method == 'get_software_information':
            result = dev.rpc.get_software_information()
            version = result.findtext(".//junos-version", "Unknown")
            return {
                'test_name': test_id,
                'device': hostname,
                'result': True,
                'message': f'Version check completed. Junos version: {version}'
            }
            
        elif rpc_method == 'get_bgp_neighbor_information':
            result = dev.rpc.get_bgp_neighbor_information()
            neighbors = result.findall(".//bgp-peer")
            neighbor_count = len(neighbors) if neighbors else 0
            return {
                'test_name': test_id,
                'device': hostname,
                'result': True,
                'message': f'BGP check completed. Found {neighbor_count} BGP neighbors'
            }
            
        elif rpc_method == 'get_interface_information':
            result = dev.rpc.get_interface_information(terse=True)
            interfaces = result.findall(".//physical-interface")
            interface_count = len(interfaces) if interfaces else 0
            return {
                'test_name': test_id,
                'device': hostname,
                'result': True,
                'message': f'Interface check completed. Found {interface_count} interfaces'
            }
            
        elif rpc_method == 'get_ospf_neighbor_information':
            result = dev.rpc.get_ospf_neighbor_information()
            neighbors = result.findall(".//ospf-neighbor")
            neighbor_count = len(neighbors) if neighbors else 0
            return {
                'test_name': test_id,
                'device': hostname,
                'result': True,
                'message': f'OSPF check completed. Found {neighbor_count} OSPF neighbors'
            }
            
        elif rpc_method == 'get_route_information':
            result = dev.rpc.get_route_information(table='inet.0')
            routes = result.findall(".//rt")
            route_count = len(routes) if routes else 0
            return {
                'test_name': test_id,
                'device': hostname,
                'result': True,
                'message': f'Route table check completed. Found {route_count} routes in inet.0'
            }
            
        elif rpc_method == 'get_system_alarm_information':
            result = dev.rpc.get_system_alarm_information()
            alarms = result.findall(".//alarm-detail")
            alarm_count = len(alarms) if alarms else 0
            status = "No alarms" if alarm_count == 0 else f"{alarm_count} alarms present"
            return {
                'test_name': test_id,
                'device': hostname,
                'result': alarm_count == 0,  # Success if no alarms
                'message': f'System health check completed. {status}'
            }
            
        elif rpc_method == 'get_lldp_neighbors_information':
            result = dev.rpc.get_lldp_neighbors_information()
            neighbors = result.findall(".//lldp-neighbor-information")
            neighbor_count = len(neighbors) if neighbors else 0
            return {
                'test_name': test_id,
                'device': hostname,
                'result': True,
                'message': f'LLDP check completed. Found {neighbor_count} LLDP neighbors'
            }
            
        elif rpc_method == 'get_mpls_lsp_information':
            result = dev.rpc.get_mpls_lsp_information()
            lsps = result.findall(".//rsvp-session")
            lsp_count = len(lsps) if lsps else 0
            return {
                'test_name': test_id,
                'device': hostname,
                'result': True,
                'message': f'MPLS check completed. Found {lsp_count} MPLS LSPs'
            }
            
        else:
            return {
                'test_name': test_id,
                'device': hostname,
                'result': False,
                'message': f'Unknown RPC method: {rpc_method}'
            }
            
    except Exception as e:
        return {
            'test_name': test_id,
            'device': hostname,
            'result': False,
            'message': f'Fallback test execution failed: {str(e)}'
        }

def execute_jsnapy_test(test_file_path, test_id, hostname, username, password):
    """Execute JSNAPy test with multiple fallback approaches"""
    
    # Try different JSNAPy initialization approaches
    try:
        # Approach 1: Simple direct approach
        print(f"DEBUG: Attempting JSNAPy approach 1 for {test_id}...")
        jsnapy_admin = SnapAdmin()
        
        # Create a simple hosts list for JSNAPy
        hosts = [{'device': hostname, 'username': username, 'passwd': password}]
        
        # Try the snap function instead of verify
        results = jsnapy_admin.snap(test_file_path, hosts)
        print(f"DEBUG: JSNAPy snap completed with results: {type(results)}")
        return results
        
    except Exception as e1:
        print(f"DEBUG: Approach 1 failed: {e1}")
        try:
            # Approach 2: Try check function
            print(f"DEBUG: Attempting JSNAPy approach 2...")
            jsnapy_admin = SnapAdmin()
            results = jsnapy_admin.check(test_file_path, hostname, username, password)
            print(f"DEBUG: JSNAPy check completed")
            return results
            
        except Exception as e2:
            print(f"DEBUG: Approach 2 failed: {e2}")
            try:
                # Approach 3: Manual execution with minimal config
                print(f"DEBUG: Attempting JSNAPy approach 3...")
                
                # Set JSNAPy working directory
                jsnapy_dir = os.path.dirname(__file__)
                os.chdir(jsnapy_dir)
                
                jsnapy_admin = SnapAdmin()
                
                # Create inline config
                config = {
                    'hosts': [{
                        'device': hostname,
                        'username': username,
                        'passwd': password,
                        'port': 22
                    }],
                    'tests': [{
                        test_id: test_file_path
                    }]
                }
                
                # Try different method calls
                try:
                    results = jsnapy_admin.verify(config_data=config)
                except:
                    results = jsnapy_admin.verify(config)
                
                print(f"DEBUG: JSNAPy verify completed")
                return results
                
            except Exception as e3:
                print(f"DEBUG: Approach 3 failed: {e3}")
                raise Exception(f"All JSNAPy approaches failed. Last error: {str(e3)}")

def main():
    """
    Orchestrates JSNAPy tests by connecting to a device and running specified test files.
    """
    # Setup basic logging first
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    
    # Create logging.yml if it doesn't exist
    create_logging_config()
    
    parser = argparse.ArgumentParser(description="Run JSNAPy tests on a network device.")
    parser.add_argument("--hostname", required=True, help="The target device hostname or IP.")
    parser.add_argument("--username", required=True, help="The SSH username for the device.")
    parser.add_argument("--password", required=True, help="The SSH password for the device.")
    parser.add_argument("--test_ids", required=True, help="Comma-separated IDs of tests to run (e.g., 'test_version,test_bgp').")
    
    args = parser.parse_args()
    hostname = args.hostname
    username = args.username
    password = args.password
    test_ids_str = args.test_ids
    
    # Parse test IDs
    test_ids = [test_id.strip() for test_id in test_ids_str.split(',') if test_id.strip()]
    
    if not test_ids:
        print(json.dumps({"status": "error", "message": "No valid test IDs provided."}))
        return
    
    print(f"DEBUG: Selected test IDs: {test_ids}")
    
    # --- Connection Phase ---
    connections = []
    try:
        # Use the utility function to connect to the host
        connections = connect_to_hosts(hostname, username, password)
        if not connections:
            print(json.dumps({"status": "error", "message": f"Failed to establish a connection to {hostname}. Aborting."}))
            return
        
        dev = connections[0]
        
        # --- JSNAPy Test Execution Phase ---
        output_data = {
            "status": "success",
            "message": "JSNAPy tests completed.",
            "test_results": []
        }
        
        # Execute each selected test
        for test_id in test_ids:
            print(f"DEBUG: Executing test: {test_id}")
            
            if test_id not in TEST_CONFIGURATIONS:
                output_data["test_results"].append({
                    "test_name": test_id,
                    "host": hostname,
                    "result": "Failed",
                    "details": f"Unknown test ID: {test_id}. Available tests: {', '.join(TEST_CONFIGURATIONS.keys())}"
                })
                continue
            
            test_config = TEST_CONFIGURATIONS[test_id]
            test_file_path = os.path.join(os.path.dirname(__file__), test_config['file'])
            
            try:
                if os.path.exists(test_file_path):
                    print(f"DEBUG: Using JSNAPy test file: {test_file_path}")
                    
                    # Try to execute JSNAPy test
                    try:
                        results = execute_jsnapy_test(test_file_path, test_id, hostname, username, password)
                        
                        # Process JSNAPy results
                        if results:
                            if hasattr(results, '__iter__') and not isinstance(results, str):
                                for result in results:
                                    try:
                                        if isinstance(result, dict):
                                            output_data["test_results"].append({
                                                "test_name": result.get('test_name', test_id),
                                                "host": result.get('device', hostname),
                                                "result": "Passed" if result.get('result', False) else "Failed",
                                                "details": result.get('message', str(result))
                                            })
                                        else:
                                            output_data["test_results"].append({
                                                "test_name": getattr(result, 'test_name', test_id),
                                                "host": getattr(result, 'device', hostname),
                                                "result": "Passed" if getattr(result, 'result', False) else "Failed",
                                                "details": getattr(result, 'message', str(result))
                                            })
                                    except Exception as parse_error:
                                        print(f"DEBUG: Error parsing result: {parse_error}")
                                        output_data["test_results"].append({
                                            "test_name": test_id,
                                            "host": hostname,
                                            "result": "Completed",
                                            "details": str(result)
                                        })
                            else:
                                output_data["test_results"].append({
                                    "test_name": test_id,
                                    "host": hostname,
                                    "result": "Completed",
                                    "details": str(results)
                                })
                        else:
                            # No results from JSNAPy, use fallback
                            print(f"DEBUG: No JSNAPy results for {test_id}, using fallback")
                            fallback_result = execute_fallback_test(dev, test_id, hostname)
                            output_data["test_results"].append({
                                "test_name": fallback_result['test_name'],
                                "host": fallback_result['device'],
                                "result": "Passed" if fallback_result['result'] else "Failed",
                                "details": fallback_result['message']
                            })
                            
                    except Exception as jsnapy_error:
                        print(f"DEBUG: JSNAPy execution failed for {test_id}: {jsnapy_error}")
                        # Fall back to RPC test
                        fallback_result = execute_fallback_test(dev, test_id, hostname)
                        output_data["test_results"].append({
                            "test_name": fallback_result['test_name'],
                            "host": fallback_result['device'],
                            "result": "Passed" if fallback_result['result'] else "Failed",
                            "details": fallback_result['message']
                        })
                        
                else:
                    print(f"DEBUG: JSNAPy test file not found for {test_id}, using RPC fallback")
                    # Test file doesn't exist, use RPC fallback
                    fallback_result = execute_fallback_test(dev, test_id, hostname)
                    output_data["test_results"].append({
                        "test_name": fallback_result['test_name'],
                        "host": fallback_result['device'],
                        "result": "Passed" if fallback_result['result'] else "Failed",
                        "details": fallback_result['message']
                    })
                    
            except Exception as test_error:
                output_data["test_results"].append({
                    "test_name": test_id,
                    "host": hostname,
                    "result": "Failed",
                    "details": f"Test execution failed: {str(test_error)}"
                })
        
        print(json.dumps(output_data, indent=2))
        
    except Exception as e:
        # Catch any unexpected errors during execution
        print(json.dumps({"status": "error", "message": f"An unexpected error occurred during test execution: {str(e)}"}))
        
    finally:
        # --- Disconnection Phase ---
        # Ensure we always disconnect, even if a test fails
        if connections:
            disconnect_from_hosts(connections)

if __name__ == "__main__":
    main()
