# vlabs/python_pipeline/run_jsnapy_tests/run_jsnapy_tests.py

import argparse
import os
import sys
import json
import yaml
from jnpr.jsnapy import SnapAdmin
from jnpr.junos.exception import ConnectError

# The `connect_to_hosts` utility is no longer used in this script.
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.connect_to_hosts import connect_to_hosts, disconnect_from_hosts

def main():
    """
    Orchestrates JSNAPy tests by creating a temporary config file and running a specified test file.
    """
    parser = argparse.ArgumentParser(description="Run JSNAPy tests on a network device.")
    parser.add_argument("--hostname", required=True, help="The target device hostname or IP.")
    parser.add_argument("--username", required=True, help="The SSH username for the device.")
    parser.add_argument("--password", required=True, help="The SSH password for the device.")
    parser.add_argument("--test_ids", required=True, help="Comma-separated IDs of tests to run (e.g., 'test_version,test_bgp').")

    args = parser.parse_args()
    hostname = args.hostname
    username = args.username
    password = args.password
    test_ids_str = args.test_ids # This parameter is for display only in this version.

    # --- JSNAPy Test Execution Phase ---
    print(f"DEBUG: Selected test IDs: {test_ids_str}")

    # This path is relative to the location of this script.
    test_file_path = os.path.join(os.path.dirname(__file__), 'test_version.yml')
    
    # We will create a temporary config file with the default JSNAPy name.
    temp_config_path = os.path.join(os.path.dirname(__file__), 'jsnapy.conf')

    try:
        if not os.path.exists(test_file_path):
            print(json.dumps({"status": "error", "message": f"JSNAPy test file not found at: {test_file_path}"}))
            return

        # 1. Create a temporary config dictionary for JSNAPy
        jsnapy_config_data = {
            "hosts": {
                "host": hostname,
                "user": username, # <--- CORRECTED LINE
                "passwd": password,
            }
        }

        # 2. Write the config to the temporary jsnapy.conf file.
        with open(temp_config_path, 'w') as f:
            yaml.dump(jsnapy_config_data, f)
        print(f"DEBUG: Temporary JSNAPy config written to: {temp_config_path}")

        # 3. Instantiate SnapAdmin with NO arguments.
        # It will automatically find and use the jsnapy.conf file in the same directory.
        jsnapy_admin = SnapAdmin()
        print(f"DEBUG: Running JSNAPy tests from file: {test_file_path}")
        print(f"DEBUG: Connecting to {hostname}...")
        
        # 4. Call the verify_file method. It will use the configuration
        # from the file and the test definitions from the test file path.
        # The 'id' parameter is not supported in this API version.
        results = jsnapy_admin.verify_file(check_file=test_file_path)
        
        # Process the results and provide structured output
        output_data = {
            "status": "success",
            "message": "JSNAPy tests completed.",
            "test_results": []
        }

        # Iterate through the results to format them for the UI
        for result in results:
            output_data["test_results"].append({
                "test_name": result.test_name,
                "host": result.device,
                "result": "Passed" if result.result else "Failed",
                "details": result.message
            })

        print(json.dumps(output_data, indent=2))

    except Exception as e:
        # Catch any unexpected errors during execution
        print(json.dumps({"status": "error", "message": f"An unexpected error occurred during test execution: {str(e)}"}))

    finally:
        # 5. Clean up the temporary config file.
        if os.path.exists(temp_config_path):
            os.remove(temp_config_path)
            print(f"DEBUG: Cleaned up temporary config file: {temp_config_path}")
        
        # No manual disconnection needed, as JSNAPy handles it within its lifecycle.
        pass

if __name__ == "__main__":
    main()
