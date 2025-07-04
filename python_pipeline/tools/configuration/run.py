# python_pipeline/configuration/run.py

import argparse
import json
import sys
import os
import logging

# Assume these are in python_pipeline/configuration/utils/
# Adjust imports based on your actual `PYTHONPATH` or project structure
try:
    from utils.connect_to_hosts import connect_to_hosts, disconnect_from_hosts
    from utils.utils import load_yaml_file # For loading inventory.yml
    # If run.py needs to do its own rendering, import render_template.
    # from utils.render_template import render_template
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
    # Arguments expected from the Node.js backend (server.js /api/scripts/run)
    parser.add_argument('--template_id', type=str, required=True, help="ID of the template being used.")
    parser.add_argument('--rendered_config', type=str, required=True,
                        help="The pre-rendered configuration content to apply.")
    parser.add_argument('--inventory_file', type=str, required=True,
                        help="Path to the YAML inventory file (e.g., data/inventory.yml).")
    parser.add_argument('--target_host', type=str, required=True,
                        help="Hostname or IP of the target Juniper device from inventory.")
    parser.add_argument('--username', type=str, required=True, help="Username for device connection.")
    parser.add_argument('--password', type=str, required=True, help="Password for device connection.")
    # Add other parameters as needed that might influence the application process
    # parser.add_argument('--commit_check_only', action='store_true', help="Perform a commit check only.")

    args = parser.parse_args()

    results = {
        "success": False,
        "message": "",
        "details": {}
    }

    logger.info(f"Starting configuration application for template: {args.template_id} on {args.target_host}")
    print(f"DEBUG: Starting configuration application for template: {args.template_id} on {args.target_host}")

    try:
        # 1. Load Inventory (using utils.py)
        # The inventory file path will be relative to the mount point for python_pipeline/
        # Make sure server.js sends the correct path (e.g., 'data/inventory.yml')
        # The `load_yaml_file` in utils expects an absolute path or path relative to execution
        # Here, we assume the inventory file is within the SCRIPT_MOUNT_POINT_IN_CONTAINER/data or similar
        # For this script running inside Docker, the `inventory_file` will be the path *within* the container.
        # Example: inventory_file might be '/app/python-scripts/data/inventory.yml'
        
        # Adjust inventory_full_path if `args.inventory_file` is just 'inventory.yml' and needs prepending
        # Or, ensure `server.js` sends the full container path to inventory.
        
        # For simplicity, let's assume `args.inventory_file` is the full path accessible by this script
        inventory_data = load_yaml_file(args.inventory_file)
        if not inventory_data:
            raise Exception(f"Failed to load inventory from {args.inventory_file}")

        # Find the target host in the inventory
        target_device_info = None
        # Assuming inventory is a list of host entries or a dict of groups
        # You'll need to adapt this based on your inventory structure (e.g., Ansible inventory format)
        # For simplicity, let's assume a flat list of devices for now, or you iterate through groups.
        
        # Example simple inventory structure:
        # devices:
        #   - name: 'r1'
        #     ip: '10.0.0.1'
        #     role: 'router'
        #   - name: 's1'
        #     ip: '10.0.0.2'
        #     role: 'switch'

        # Example: Simple search for target_host (by name or IP)
        found_in_inventory = False
        if 'devices' in inventory_data and isinstance(inventory_data['devices'], list):
            for device_entry in inventory_data['devices']:
                if device_entry.get('name') == args.target_host or device_entry.get('ip') == args.target_host:
                    target_device_info = device_entry
                    found_in_inventory = True
                    break
        
        if not found_in_inventory:
            raise Exception(f"Target host '{args.target_host}' not found in inventory.")

        # Ensure we have the IP from inventory, not just the name
        device_ip = target_device_info.get('ip')
        if not device_ip:
            raise Exception(f"IP address not found for target host '{args.target_host}' in inventory.")


        # 2. Connect to the device (using connect_to_hosts.py)
        connections = connect_to_hosts(
            host=device_ip, # Use the IP from inventory
            username=args.username,
            password=args.password
        )

        if not connections:
            raise Exception(f"Failed to establish connection to {device_ip}. Check credentials and connectivity.")

        # We expect only one connection since we targeted a single host
        dev = connections[0]
        logger.info(f"Connected to device {dev.hostname} ({dev.facts['version']})")
        print(f"DEBUG: Connected to device {dev.hostname}")

        # 3. Apply the rendered configuration
        # Junos PyEZ provides load_config for configuration
        # Use 'set' merge for applying configuration fragments
        # Or 'text' for full configurations, which is common for Jinja2 outputs.
        # Consider using `config_mode='private'` for better safety if multiple users.

        logger.info(f"Loading configuration for {dev.hostname}...")
        print(f"DEBUG: Loading configuration for {dev.hostname}...")
        
        # Load configuration (assumes args.rendered_config is a string)
        # Use format='set' if your template generates 'set' commands
        # Use format='text' if your template generates full configuration hierarchy
        # The `jinja2` templates like bgp.j2, interface.j2, ospf.j2 typically output
        # configuration in Junos text format.
        dev.load_config(
            config_text=args.rendered_config,
            format='text', # Or 'set', 'xml' based on your template output
            merge=True, # Merge with existing configuration
            # overwrite=True, # Use with caution!
            # update=True, # Use for diff-based updates
        )
        logger.info(f"Configuration loaded to candidate for {dev.hostname}.")
        print(f"DEBUG: Configuration loaded to candidate for {dev.hostname}.")

        # Commit the configuration
        logger.info(f"Committing configuration for {dev.hostname}...")
        print(f"DEBUG: Committing configuration for {dev.hostname}...")
        dev.commit()
        logger.info(f"Configuration committed successfully on {dev.hostname}.")
        print(f"DEBUG: Configuration committed successfully on {dev.hostname}.")

        results["success"] = True
        results["message"] = f"Configuration '{args.template_id}' applied successfully to {dev.hostname}."
        results["details"] = {
            "device_hostname": dev.hostname,
            "applied_config": args.rendered_config,
            "template_id": args.template_id,
        }

    except Exception as e:
        logger.error(f"Error during configuration application: {e}", exc_info=True)
        print(f"ERROR: Configuration application failed: {e}")
        results["success"] = False
        results["message"] = f"Failed to apply configuration: {e}"
        results["details"] = {"error": str(e)}
    finally:
        # Ensure disconnection even if errors occur
        if 'connections' in locals() and connections:
            disconnect_from_hosts(connections)
            logger.info("Disconnected from devices.")
            print("DEBUG: Disconnected from devices.")
        
        # Output results as JSON to stdout for the Node.js backend to capture
        print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
