# python_pipeline/jsnapy_tests/run_test_version.py
import argparse
import json
import os
import sys
import logging
from jnpr.jsnapy import SnapAdmin
from jnpr.junos.exception import ConnectError, RpcError

# Import your custom utilities
from utils.utils import merge_host_data # Used for getting host credentials

# Configure logging for this script
logger = logging.getLogger(__name__)

def run_jsnapy_test(hostname, test_file_name, hosts_data_file, inventory_file):
    """
    Connects to a device using JSNAPy and runs a specific test file.
    """
    try:
        # Step 1: Load and merge host data using your utility function
        pipeline_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..')) # Adjust path to python_pipeline root
        full_hosts_data_path = os.path.join(pipeline_root, 'data', hosts_data_file)
        full_inventory_path = os.path.join(pipeline_root, 'data', inventory_file)
        
        merged_data = merge_host_data(full_inventory_path, full_hosts_data_path)
        
        if not merged_data:
            raise RuntimeError("Failed to load or merge host data.")

        # Step 2: Find the specific host's credentials
        target_host = None
        for host in merged_data.get('hosts', []):
            if host.get('host_name') == hostname or host.get('ip_address') == hostname:
                target_host = host
                break
        
        if not target_host:
            return {"error": f"Host '{hostname}' not found in inventory."}

        # Step 3: Prepare JSNAPy config for the test
        jsnapy_config = {
            "hosts": {
                hostname: {
                    "user": target_host.get('username'),
                    "passwd": target_host.get('password'),
                    "port": 830 # Default NETCONF port
                }
            },
            "snapshots": {} # Not taking snapshots directly here, but config requires it
        }

        # Write the configuration to a temporary file for JSNAPy
        temp_config_path = f"/tmp/jsnapy_test_config_{os.getpid()}.yml"
        with open(temp_config_path, 'w') as f:
            f.write(json.dumps(jsnapy_config))
        
        logger.info(f"Using JSNAPy config from: {temp_config_path}")

        # Determine the full path to the JSNAPy test definition file
        full_test_file_path = os.path.join(os.path.dirname(__file__), test_file_name)
        if not os.path.exists(full_test_file_path):
            raise FileNotFoundError(f"JSNAPy test file not found: {full_test_file_path}")

        # Initialize SnapAdmin. It needs the path to the config file and a base directory for snapshots/results.
        # JSNAPy uses 'test_file_path' to load the actual tests to perform.
        snap_path_base = os.path.join(pipeline_root, 'assets', 'session_runs')
        os.makedirs(snap_path_base, exist_ok=True) # Ensure base path exists

        js = SnapAdmin(
            temp_config_path, 
            snap_path=snap_path_base # JSNAPy will create host/snapshot subdirs
        )
        
        # JSNAPy `check` method
        # This will run the test defined in `test_file_name`
        logger.info(f"Running JSNAPy test '{test_file_name}' on host '{hostname}'...")
        # You might need a pre and post snapshot for 'check'.
        # For a simple 'check' without diff, you might just have one snapshot in the test file.
        # JSNAPy's check method expects test files that define pre/post/compare.
        # The `test_version.yml` is defined with an RPC, so it's a single-shot check.

        # JSNAPy's check API is designed to run tests defined with 'pre' and 'post' snapshots.
        # To run a simple RPC check as defined in test_version.yml, we need to adapt.
        # The easiest way is often to use the check API with dummy snapshots, or
        # manually execute RPCs and then apply assertions using jsnapy.util.compare.
        # A more direct approach for simple RPC checks in JSNAPy is sometimes through SnapAdmin.rpc.
        
        # Let's adapt to use jsnapy's check with a single snapshot scenario.
        # If the test file doesn't involve a 'compare', check just takes a snapshot and tests immediately.
        # JSNAPy needs 'pre' and 'post' to be defined in the test file for `check()` to work.
        # Since our `test_version.yml` directly uses RPC, it's more like a "single RPC validation".
        # We'll need a dummy snapshot if we want to use `js.check` with that test file.
        # This is a common point of confusion with JSNAPy.

        # For a simple 'RPC based test' like `test_version.yml`, `js.check` requires a pre-existing
        # snapshot (or the test file itself defines a way to take implicit snapshots).
        # A simpler way to just run the RPC and get the output is often to use PyEZ directly
        # within run_test_version.py, then process it.
        # However, since you asked for JSNAPy, we should use its `check` if possible.

        # Let's adjust this: JSNAPy's `check` method expects snapshots.
        # If the test is defined as an RPC check (no pre/post), you might need to use `js.snapshot`
        # and then process.
        # A more straightforward way for "Test Version" to leverage JSNAPy:
        # Define the test in test_version.yml to use the 'rpc' key directly, as done,
        # but the Python execution needs to be precise.

        # JSNAPy's 'check' method will look for specific keywords in the test file
        # (e.g., 'pre_snapshot', 'post_snapshot', 'tests').
        # If test_version.yml ONLY has 'tests', SnapAdmin.check() might not be the right call.
        
        # Let's use `SnapAdmin().run_rpc` if `test_version.yml` is configured for it
        # or simplify:
        # Given the test_version.yml structure, it's really an RPC check.
        # JSNAPy's `check` method is more for comparison.
        # For a simple RPC test, you generally just run the RPC via PyEZ,
        # then apply JSNAPy's assertion logic manually or adapt the test file.

        # Let's adapt. We will make run_test_version.py:
        # 1. Take a snapshot
        # 2. Run the test (which needs to compare against a snapshot or run an RPC)
        # This means test_version.yml itself needs a 'snapshot' definition, not just 'rpc'.
        # Let's simplify and assume the `test_version.yml` takes one implicit snapshot
        # and then runs tests on it. This is a common JSNAPy pattern.

        # REVISING test_version.yml to be more JSNAPy-idiomatic for `check()`
        # A JSNAPy test run by `check()` typically compares a 'pre' and 'post' snapshot,
        # or checks against a single live snapshot with rules.
        # Let's make this simple: Take a single snapshot and run assertions on it.
        # JSNAPy requires 'pre' and 'post' in the test file.
        # Or, you can just run `js.verify_cli_rpc()` directly if the test is a simple RPC check.
        
        # For "Test Version", `js.verify_cli_rpc` is more appropriate.
        # It takes an RPC command and test assertions.
        # We need to extract the 'rpc' and 'item' from `test_version.yml`
        
        # Load the test_version.yml to get its RPC and items
        test_definition = load_yaml_file(full_test_file_path)
        if not test_definition or 'tests' not in test_definition:
            raise ValueError(f"Invalid JSNAPy test definition in {test_file_name}")
        
        test_name = list(test_definition['tests'].keys())[0] # Assumes one test definition per file
        test_details = test_definition['tests'][test_name]
        
        rpc_command = test_details.get('rpc')
        test_items = test_details.get('item', [])

        if not rpc_command or not test_items:
            raise ValueError("JSNAPy test definition missing 'rpc' or 'item' sections.")

        logger.info(f"Running RPC '{rpc_command}' for test '{test_name}' on {hostname}")
        # This will execute the RPC and verify against the provided items.
        # JSNAPy's verify_cli_rpc is good for single-RPC checks.
        test_results = js.verify_cli_rpc(
            hostname, 
            rpc=rpc_command, 
            tests_def=test_items # Pass the 'item' list directly as tests_def
        )
        
        # test_results will be a dictionary containing success/fail for each host.
        final_status = "Pass" if all(host_res['status'] == 'Pass' for host_res in test_results.values()) else "Fail"
        
        result_details = {
            "test_name": test_name,
            "host": hostname,
            "overall_status": final_status,
            "details": test_results
        }
        
        logger.info(f"JSNAPy test '{test_name}' for {hostname} completed with status: {final_status}")
        return result_details

    except ConnectError as e:
        logger.error(f"Connection failed for {hostname}: {e}")
        return {"error": f"Connection failed to {hostname}: {e}"}
    except FileNotFoundError as e:
        logger.error(f"File not found: {e}")
        return {"error": str(e)}
    except ValueError as e:
        logger.error(f"Configuration error for JSNAPy: {e}")
        return {"error": f"Configuration error: {e}"}
    except Exception as e:
        logger.error(f"An unexpected error occurred: {e}", exc_info=True)
        return {"error": f"An unexpected error occurred: {e}"}
    finally:
        if 'temp_config_path' in locals() and os.path.exists(temp_config_path):
            os.remove(temp_config_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run a JSNAPy test on a Juniper device.")
    parser.add_argument("--hostname", required=True, help="Hostname or IP address of the device.")
    parser.add_argument("--test_file_name", required=True, help="Name of the JSNAPy test YAML file (e.g., test_version.yml).")
    parser.add_argument("--hosts_data_file", default="hosts_data.yml", help="YAML file with host credentials (in data/ dir).")
    parser.add_argument("--inventory_file", default="inventory.yml", help="YAML file with device inventory (in data/ dir).")

    args = parser.parse_args()

    # Add python_pipeline root to sys.path for relative imports to work when run directly
    script_dir = os.path.dirname(__file__)
    jsnapy_tests_dir = os.path.abspath(os.path.join(script_dir, '..')) # goes to python_pipeline/jsnapy_tests
    pipeline_root = os.path.abspath(os.path.join(jsnapy_tests_dir, '..')) # goes to python_pipeline/
    if pipeline_root not in sys.path:
        sys.path.insert(0, pipeline_root)

    # To be consistent with other scripts, wrap the output in a dict keyed by hostname
    results = {
      args.hostname: run_jsnapy_test(
        args.hostname,
        args.test_file_name,
        args.hosts_data_file,
        args.inventory_file
      )
    }

    print(json.dumps(results, indent=2))
