# vlabs/python_pipeline/get_device_facts/get_device_facts.py

import argparse
import sys
import os
import json # For structured output
from pathlib import Path
import logging

# Import utility modules from the 'utils' package
# The 'vlabs-python-runner' Docker container mounts 'python_pipeline' to '/app/python-scripts'
# So, 'utils' will be directly importable.
from utils import utils
from utils import connect_to_hosts

# Configure logging for the script (separate from connect_to_hosts.py's internal logging)
# This sends logs to stdout/stderr, which will be captured by the backend
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stdout # Ensure logs go to stdout for backend capture
)
logger = logging.getLogger(__name__)

# Define the path to the inventory.yml file relative to the script's mount point
# Assuming this script is run from /app/python-scripts/get_device_facts/
# and data/inventory.yml is at /app/python-scripts/data/inventory.yml
INVENTORY_FILE_PATH = Path('/app/python-scripts/data/inventory.yml')

def main():
    parser = argparse.ArgumentParser(description="Connects to network devices and retrieves facts.")
    parser.add_argument('--username', required=True, help='Username for device login.')
    parser.add_argument('--password', required=True, help='Password for device login.')
    parser.add_argument('--get_version', action='store_true', help='If set, fetch "show version" instead of basic facts.')
    parser.add_argument('--dry_run', action='store_true', help='If set, only simulate connection without fetching data.')

    args = parser.parse_args()

    # Log command-line arguments (for debugging in backend output)
    logger.info(f"Script started with arguments: username={args.username}, get_version={args.get_version}, dry_run={args.dry_run}")

    if not INVENTORY_FILE_PATH.exists():
        logger.error(f"Inventory file not found: {INVENTORY_FILE_PATH}")
        print(f"ERROR: Inventory file not found at {INVENTORY_FILE_PATH}")
        sys.exit(1)

    # Load the inventory
    inventory_data = utils.load_yaml_file(str(INVENTORY_FILE_PATH))
    if not inventory_data:
        logger.error("Failed to load inventory data.")
        print("ERROR: Failed to load inventory data from YAML.")
        sys.exit(1)

    # Flatten the inventory to get a list of all hosts
    all_hosts = utils.flatten_inventory(inventory_data)
    if not all_hosts:
        logger.warning("No hosts found in inventory.")
        print("WARNING: No hosts found in inventory to connect to.")
        sys.exit(0) # Exit successfully if no hosts to process

    results = []
    connections_to_close = []

    try:
        for host_entry in all_hosts:
            ip_address = host_entry.get('ip_address')
            hostname = host_entry.get('host_name', ip_address)

            if not ip_address:
                logger.warning(f"Skipping host entry with no IP address: {host_entry}")
                results.append({
                    'host_name': hostname,
                    'ip_address': 'N/A',
                    'status': 'skipped',
                    'message': 'No IP address specified for host.'
                })
                continue

            print(f"\n--- Processing Device: {hostname} ({ip_address}) ---")
            logger.info(f"Attempting to connect to {hostname} ({ip_address})")

            if args.dry_run:
                print(f"DRY RUN: Would connect to {ip_address}")
                results.append({
                    'host_name': hostname,
                    'ip_address': ip_address,
                    'status': 'dry_run',
                    'message': 'Dry run: Connection simulated.'
                })
                continue

            # Connect to the host
            connections = connect_to_hosts.connect_to_hosts(ip_address, args.username, args.password)
            if not connections:
                logger.error(f"Failed to establish connection to {hostname} ({ip_address}).")
                results.append({
                    'host_name': hostname,
                    'ip_address': ip_address,
                    'status': 'failed',
                    'message': 'Failed to connect.'
                })
                continue

            dev = connections[0] # Assuming connect_to_hosts returns a list, take the first/only
            connections_to_close.append(dev) # Add to list for later disconnection

            try:
                device_info = {}
                if args.get_version:
                    logger.info(f"Fetching 'show version' from {hostname}")
                    version_output = dev.cli("show version", warning=False)
                    device_info['show_version'] = version_output.strip()
                    print(f"Fetched 'show version' for {hostname}")
                else:
                    logger.info(f"Fetching device facts from {hostname}")
                    # PyeZ facts can be large, only include relevant ones for demonstration
                    device_facts = dev.facts
                    device_info['facts'] = {
                        'hostname': device_facts.get('hostname'),
                        'model': device_facts.get('model'),
                        'os_version': device_facts.get('os_version'),
                        'serialnumber': device_facts.get('serialnumber'),
                        'current_re': device_facts.get('current_re'),
                        'ifd_style': device_facts.get('ifd_style'),
                        'platform': device_facts.get('platform')
                    }
                    print(f"Fetched facts for {hostname}")

                results.append({
                    'host_name': hostname,
                    'ip_address': ip_address,
                    'status': 'success',
                    'data': device_info
                })

            except Exception as e:
                logger.error(f"Error fetching data from {hostname}: {str(e)}")
                print(f"ERROR: Error fetching data from {hostname}: {str(e)}")
                results.append({
                    'host_name': hostname,
                    'ip_address': ip_address,
                    'status': 'failed',
                    'message': f"Error fetching data: {str(e)}"
                })

    finally:
        # Ensure all connections are closed
        if connections_to_close:
            connect_to_hosts.disconnect_from_hosts(connections_to_close)

    # Print final results in JSON format for easy parsing by the backend/frontend
    print("\n--- SCRIPT RESULTS (JSON) ---")
    print(json.dumps(results, indent=2))
    logger.info("Script execution finished.")

if __name__ == "__main__":
    main()
