# python_pipeline/configuration/run.py

import argparse
import json
import sys
import os
import logging

# Import PyEZ specifics for configuration and error handling
from jnpr.junos.utils.config import Config
from jnpr.junos.exception import ConnectError, ConfigLoadError, CommitError

# Assume these are in python_pipeline/configuration/utils/
# Adjust imports based on your actual `PYTHONPATH` or project structure
try:
    from utils.connect_to_hosts import connect_to_hosts, disconnect_from_hosts
    from utils.utils import load_yaml_file
except ImportError:
    # Fallback for direct execution/different PYTHONPATH
    sys.path.append(os.path.join(os.path.dirname(__file__), 'utils'))
    from connect_to_hosts import connect_to_hosts, disconnect_from_hosts
    from utils import load_yaml_file


# Configure logging for run.py
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(name)s - %(message)s',
    filename='run_configuration.log', # Log file for this script
    filemode='a' # Append mode
)
logger = logging.getLogger(__name__)

def main():
    parser = argparse.ArgumentParser(description="Generate and apply Juniper configurations.")
    parser.add_argument('--template_id', type=str, required=True, help="ID of the template being used.")
    parser.add_argument('--rendered_config', type=str, required=True, help="The pre-rendered configuration content to apply.")
    parser.add_argument('--inventory_file', type=str, required=True, help="Path to the YAML inventory file.")
    parser.add_argument('--target_host', type=str, required=True, help="Hostname or IP of the target device from inventory.")
    parser.add_argument('--username', type=str, required=True, help="Username for device connection.")
    parser.add_argument('--password', type=str, required=True, help="Password for device connection.")
    # ✨ NEW: Add a commit check flag for safer dry-runs
    parser.add_argument('--commit_check', action='store_true', help="Perform a 'commit check' only; do not apply.")

    args = parser.parse_args()

    results = {
        "success": False,
        "message": "",
        "details": {}
    }
    
    connections = [] # Initialize here to ensure it exists in `finally`

    logger.info(f"Starting configuration run for template '{args.template_id}' on '{args.target_host}'")
    print(f"DEBUG: Starting run for template: {args.template_id} on host: {args.target_host}")

    try:
        # 1. Load Inventory
        logger.info(f"Loading inventory from: {args.inventory_file}")
        inventory_data = load_yaml_file(args.inventory_file)
        if not inventory_data:
            raise ValueError(f"Failed to load or parse inventory from {args.inventory_file}")

        # 2. Find Target Host and its IP
        # This logic assumes an inventory format like:
        # devices:
        #   - name: 'r1'
        #     ip: '10.0.0.1'
        target_device_info = None
        if 'devices' in inventory_data and isinstance(inventory_data.get('devices'), list):
            for device in inventory_data['devices']:
                if device.get('name') == args.target_host or device.get('ip') == args.target_host:
                    target_device_info = device
                    break
        
        if not target_device_info:
            raise ValueError(f"Target host '{args.target_host}' not found in inventory file.")

        device_ip = target_device_info.get('ip')
        if not device_ip:
            raise ValueError(f"IP address not found for target host '{args.target_host}' in inventory.")
        
        logger.info(f"Found target device '{args.target_host}' with IP '{device_ip}' in inventory.")
        print(f"DEBUG: Target device resolved to IP: {device_ip}")

        # 3. Connect to the device
        connections = connect_to_hosts(host=device_ip, username=args.username, password=args.password)
        if not connections:
            # The connect_to_hosts function logs details, so we just raise a general failure here.
            raise ConnectError(f"Failed to establish connection to {device_ip}. Check logs and connectivity from the container.")

        dev = connections[0]
        logger.info(f"Successfully connected to device: {dev.hostname} (Junos {dev.facts.get('version')})")
        print(f"DEBUG: Connected to device {dev.hostname}")

        # 4. ✨ REFACTORED: Apply Configuration using the 'Config' utility
        # This is the robust method you highlighted in your example.
        logger.info(f"Locking configuration database for {dev.hostname}...")
        print(f"DEBUG: Locking configuration database for {dev.hostname}...")
        with Config(dev, mode='private') as cu:
            logger.info(f"Loading configuration onto candidate for {dev.hostname}...")
            print(f"DEBUG: Loading rendered config (format=text, merge=True)...")
            
            # The 'text' format is correct for hierarchical Junos config from Jinja2
            cu.load(template_path=None, template_vars=None, config_text=args.rendered_config, format='text', merge=True)
            
            logger.info("Configuration loaded. Checking for differences...")
            print("DEBUG: Checking for configuration differences...")

            # See what changes will be applied
            diff = cu.pdiff()
            if not diff:
                results["success"] = True
                results["message"] = f"No configuration changes required for {dev.hostname}."
                results["details"] = {"device_hostname": dev.hostname, "diff": "No changes."}
                logger.info(f"No changes to apply on {dev.hostname}. Skipping commit.")
                print(f"DEBUG: No changes to apply. Skipping commit.")
                # The 'finally' block will handle disconnection and printing results
                return # Exit the try block early

            logger.info(f"Changes to be applied:\n{diff}")
            print(f"DEBUG: Changes to be applied:\n{diff}")
            
            # 5. Commit Check (Dry-Run) or Full Commit
            if args.commit_check:
                logger.info(f"Performing a 'commit check' on {dev.hostname}...")
                print(f"DEBUG: Performing commit check (dry-run)...")
                cu.commit_check()
                results["success"] = True
                results["message"] = f"'commit check' successful for {dev.hostname}."
                results["details"] = {"device_hostname": dev.hostname, "diff": diff}
            else:
                logger.info(f"Committing configuration on {dev.hostname}...")
                print(f"DEBUG: Committing changes...")
                cu.commit(comment=f"Applied template {args.template_id} via automation pipeline")
                logger.info(f"Configuration committed successfully on {dev.hostname}.")
                print(f"DEBUG: Configuration committed successfully.")
                results["success"] = True
                results["message"] = f"Configuration '{args.template_id}' applied successfully to {dev.hostname}."
                results["details"] = {"device_hostname": dev.hostname, "applied_diff": diff}

    except (ConnectError, ConfigLoadError, CommitError) as e:
        # Catch specific PyEZ errors for better feedback
        error_msg = f"A PyEZ error occurred: {e.__class__.__name__} - {str(e)}"
        logger.error(error_msg, exc_info=True)
        print(f"ERROR: {error_msg}")
        results["success"] = False
        results["message"] = error_msg
        results["details"] = {"error": str(e)}
    except (ValueError, KeyError) as e:
        # Catch data/inventory related errors
        error_msg = f"Data or Inventory Error: {str(e)}"
        logger.error(error_msg, exc_info=True)
        print(f"ERROR: {error_msg}")
        results["success"] = False
        results["message"] = error_msg
        results["details"] = {"error": str(e)}
    except Exception as e:
        # Generic catch-all for any other exceptions
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.error(error_msg, exc_info=True)
        print(f"ERROR: {error_msg}")
        results["success"] = False
        results["message"] = error_msg
        results["details"] = {"error": str(e)}
    finally:
        # Ensure disconnection happens and results are always printed
        if connections:
            disconnect_from_hosts(connections)
            logger.info("Disconnected from all devices.")
            print("DEBUG: Disconnected from all devices.")
        
        print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
