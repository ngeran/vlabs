# python_pipeline/get_device_facts/get_device_facts.py

import argparse
import sys
import os
import json
import yaml # For loading YAML inventory files
import logging
from pathlib import Path
import socket # For the dry_run reachability check

# Assuming 'utils' and 'connect_to_hosts' are in the /app/python-scripts/utils directory
# The 'vlabs-python-runner' Docker container mounts 'python_pipeline' to '/app/python-scripts'
# So, 'utils' will be directly importable as a package.
from utils import utils
from utils import connect_to_hosts

# Configure logging for the script
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stderr # Send logs to stderr so they don't interfere with stdout JSON output
)
logger = logging.getLogger(__name__)

def main():
    parser = argparse.ArgumentParser(description="Connects to network devices and retrieves facts.")
    parser.add_argument('--username', required=True, help='Username for device login.')
    parser.add_argument('--password', required=True, help='Password for device login.')
    parser.add_argument('--get_version', action='store_true', help='If set, fetch "show version" instead of basic facts. (Currently not exposed in UI).')
    parser.add_argument('--dry_run', action='store_true', help='If set, only simulate connection without fetching data.')
    parser.add_argument('--extra_cli_args', type=str, default='', help="This argument is for Ansible CLI, but included for metadata compatibility. It will be ignored in this non-Ansible script. (Currently not exposed in UI).")

    # Arguments for host/inventory selection
    parser.add_argument('--inventory_file', type=str, help="Name of the Ansible-like inventory YAML file (e.g., 'my_inventory.yml') from the data directory.")
    parser.add_argument('--hosts', type=str, help="Comma-separated list of hosts (IPs or hostnames) to target manually.")

    args = parser.parse_args()

    # --- Input Validation and Host List Determination ---
    target_hosts = []

    if not args.inventory_file and not args.hosts:
        logger.error("ERROR: Either --inventory_file or --hosts must be provided.")
        print(json.dumps({'status': 'error', 'message': 'Either --inventory_file or --hosts must be provided.'}), file=sys.stdout)
        sys.exit(1)
    if args.inventory_file and args.hosts:
        logger.error("ERROR: Cannot provide both --inventory_file and --hosts. Choose one.")
        print(json.dumps({'status': 'error', 'message': 'Cannot provide both --inventory_file and --hosts. Choose one.'}), file=sys.stdout)
        sys.exit(1)

    if args.hosts:
        target_hosts = [{'ip_address': h.strip()} for h in args.hosts.split(',') if h.strip()]
        if not target_hosts:
            logger.error("ERROR: No valid hosts provided in --hosts argument.")
            print(json.dumps({'status': 'error', 'message': 'No valid hosts provided in --hosts argument.'}), file=sys.stdout)
            sys.exit(1)
        logger.info(f"Targeting manually specified hosts: {[h['ip_address'] for h in target_hosts]}")

    elif args.inventory_file:
        # Construct full path to the inventory file within the data directory
        # __file__ is /app/python-scripts/get_device_facts/get_device_facts.py inside container
        data_dir = Path(os.path.dirname(__file__)).parent / 'data'
        full_inventory_path = data_dir / args.inventory_file
        
        if not full_inventory_path.exists():
            logger.error(f"Inventory file not found: {full_inventory_path}")
            print(json.dumps({'status': 'error', 'message': f"Inventory file not found at {full_inventory_path}"}), file=sys.stdout)
            sys.exit(1)

        try:
            inventory_data = utils.load_yaml_file(str(full_inventory_path))
            if not inventory_data:
                logger.error("Failed to load inventory data from YAML.")
                print(json.dumps({'status': 'error', 'message': 'Failed to load inventory data from YAML.'}), file=sys.stdout)
                sys.exit(1)
            target_hosts = utils.flatten_inventory(inventory_data)
            logger.info(f"Loaded hosts from inventory file: {full_inventory_path}")
        except Exception as e:
            logger.error(f"Error reading inventory file {full_inventory_path}: {e}")
            print(json.dumps({'status': 'error', 'message': f"Error reading inventory file {full_inventory_path}: {e}"}), file=sys.stdout)
            sys.exit(1)

    if not target_hosts:
        logger.warning("No hosts found to connect to after processing arguments.")
        print(json.dumps({'status': 'warning', 'message': 'No hosts found to connect to.'}), file=sys.stdout)
        sys.exit(0) # Exit successfully if no hosts to process

    results = []
    connections_to_close = []

    try: # This is the main try block for the entire script's execution loop
        for host_entry in target_hosts:
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
                continue # Move to the next host in the loop

            logger.info(f"--- Processing Device: {hostname} ({ip_address}) ---")

            # --- DRY RUN LOGIC STARTS ---
            if args.dry_run:
                logger.info(f"DRY RUN enabled for {hostname} ({ip_address}). Performing reachability check.")
                message = ""
                status = ""
                try:
                    port_to_check = 22 # Default SSH port. Adjust if your devices use a different management port.
                    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                        s.settimeout(2) # 2-second timeout for the connection attempt
                        result_code = s.connect_ex((ip_address, port_to_check)) # Returns 0 on success, error code otherwise
                        
                        if result_code == 0:
                            message = f"Host Name {hostname} ({ip_address}) Reachable on port {port_to_check}."
                            status = 'reachable'
                            logger.info(message)
                        else:
                            error_map = {
                                111: "Connection refused (port closed or firewall)", # ECONNREFUSED
                                113: "No route to host",                             # EHOSTUNREACH
                                101: "Network is unreachable"                        # ENETUNREACH
                            }
                            error_detail = error_map.get(result_code, f"Error Code: {result_code}")
                            message = f"Host Name {hostname} ({ip_address}) Not Reachable on port {port_to_check} ({error_detail})."
                            status = 'not_reachable'
                            logger.warning(message)
                except socket.gaierror:
                    message = f"Host Name {hostname} ({ip_address}) Not Reachable (DNS resolution failed or invalid IP/hostname)."
                    status = 'not_reachable'
                    logger.warning(message)
                except Exception as e:
                    message = f"Host Name {hostname} ({ip_address}) Not Reachable (Unexpected error during check: {e})."
                    status = 'not_reachable'
                    logger.warning(message)
                
                results.append({
                    'host_name': hostname,
                    'ip_address': ip_address,
                    'status': status,
                    'message': message
                })
                continue # Skip the actual connection/fact-gathering for this host and move to the next
            # --- DRY RUN LOGIC ENDS ---

            # --- ACTUAL CONNECTION AND FACT GATHERING LOGIC (NOT DRY RUN) STARTS ---
            # This part will only execute if args.dry_run is FALSE
            connections = []
            try: # This inner try block covers connection attempt and potential failures for THIS host
                connections = connect_to_hosts.connect_to_hosts(ip_address, args.username, args.password)
                
                if not connections:
                    logger.error(f"Failed to establish connection to {hostname} ({ip_address}). 'connect_to_hosts' returned no connections.")
                    results.append({
                        'host_name': hostname,
                        'ip_address': ip_address,
                        'status': 'failed',
                        'message': 'Failed to establish connection.'
                    })
                    continue # Move to the next host if connection failed
                
                dev = connections[0] # Assuming connect_to_hosts returns a list, take the first/only
                connections_to_close.append(dev) # Add to list for later disconnection

                try: # Another inner try for fetching data (if connection successful)
                    device_info = {}
                    if args.get_version:
                        logger.info(f"Fetching 'show version' from {hostname}")
                        version_output = dev.cli("show version", warning=False) # Assumes 'dev' has a .cli() method
                        device_info['show_version'] = version_output.strip()
                        logger.info(f"Fetched 'show version' for {hostname}")
                    else:
                        logger.info(f"Fetching device facts from {hostname}")
                        device_facts = dev.facts # Assumes 'dev' has a .facts property
                        device_info['facts'] = {
                            'hostname': device_facts.get('hostname'),
                            'model': device_facts.get('model'),
                            'os_version': device_facts.get('os_version'),
                            'serialnumber': device_facts.get('serialnumber'),
                            'current_re': device_facts.get('current_re'),
                            'ifd_style': device_facts.get('ifd_style'),
                            'platform': device_facts.get('platform')
                        }
                        logger.info(f"Fetched facts for {hostname}")

                    results.append({
                        'host_name': hostname,
                        'ip_address': ip_address,
                        'status': 'success',
                        'data': device_info
                    })

                except Exception as e: # Catch errors during data fetching (e.g., dev.cli() or dev.facts fails)
                    logger.error(f"Error fetching data from {hostname}: {str(e)}")
                    results.append({
                        'host_name': hostname,
                        'ip_address': ip_address,
                        'status': 'failed',
                        'message': f"Error fetching data: {str(e)}"
                    })

            except Exception as e: # Catch errors during connection attempt (e.g., connect_to_hosts fails)
                logger.error(f"Connection attempt to {hostname} ({ip_address}) failed unexpectedly: {e}")
                results.append({
                    'host_name': hostname,
                    'ip_address': ip_address,
                    'status': 'failed',
                    'message': f'Connection failed (outer exception): {str(e)}'
                })
            # --- ACTUAL CONNECTION AND FACT GATHERING LOGIC ENDS ---

    except Exception as main_e: # Catch any unexpected errors in the main loop structure
        logger.error(f"An unhandled error occurred during script execution: {main_e}", exc_info=True)
        # Output a generic error for the frontend if something critical goes wrong
        print(json.dumps({'status': 'error', 'message': f'Script execution failed critically: {main_e}'}), file=sys.stdout)
        sys.exit(1) # Indicate failure

    finally:
        # Ensure all connections are closed
        if connections_to_close:
            logger.info("Disconnecting from all devices.")
            try:
                connect_to_hosts.disconnect_from_hosts(connections_to_close)
            except Exception as e:
                logger.error(f"Error during disconnection: {e}")

    # Print final results in JSON format for easy parsing by the backend/frontend
    print(json.dumps(results, indent=2), file=sys.stdout)
    logger.info("Script execution finished.")
    sys.exit(0) # Exit successfully

if __name__ == "__main__":
    main()
