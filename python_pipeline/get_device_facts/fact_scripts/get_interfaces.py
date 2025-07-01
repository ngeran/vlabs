# python_pipeline/get_device_facts/fact_scripts/get_interfaces.py
import json
import argparse
import os
import sys

# Import your existing utilities
# Assuming python_pipeline is added to PYTHONPATH or this script is run appropriately
# (e.g., via `python -m python_pipeline.get_device_facts.fact_scripts.get_interfaces`
# or by ensuring `python_pipeline` is on sys.path)
# Given the directory structure, relative imports should work if run correctly.
# If this causes issues, ensure `python_pipeline` is a package (it has __init__.py at root)
# and your backend correctly sets up PYTHONPATH or calls these as modules.
# For now, a relative import based on typical package structure:
from ...utils.connect_to_hosts import connect_to_hosts, disconnect_from_hosts
from ...utils.utils import load_yaml_file, merge_host_data # Assuming you need merge_host_data or just load_yaml_file
from jnpr.junos.exception import ConnectError, RpcError
from jnpr.junos import Device # Still needed for type hinting and specific exceptions

def get_interfaces_from_device(dev: Device):
    """
    Retrieves interface information from a single Juniper device using its PyEZ connection.
    This function now takes an *already opened* PyEZ Device object.
    """
    try:
        # Use dev.rpc or dev.cli as per your utils.py's capture_device_state
        # Since your capture_device_state uses dev.cli("show interfaces terse"), let's stick to that.
        interfaces_cli_output = dev.cli("show interfaces terse", warning=False)
        
        # You can choose to return the raw CLI output, or parse it further.
        # For a simple 'fact', the raw output might be sufficient,
        # or you can parse it into a dictionary here if needed.
        # For consistency with the PyEZ example, let's keep a structure.
        # Parsing CLI output robustly can be complex.
        # For now, let's return it as a string under a key.
        return {"interfaces_terse_output": interfaces_cli_output.strip()}

    except RpcError as err:
        return {"error": f"RPC error on {dev.hostname}: {err}"}
    except Exception as err:
        return {"error": f"An unexpected error occurred for {dev.hostname}: {err}"}


def main(hosts=None, inventory_file=None):
    """
    Main function to orchestrate getting interface facts using PyEZ and your utilities.
    Expects either hosts (comma-separated) or an inventory_file path.
    """
    results = {}
    devices_to_process_info = [] # Will store dicts like {'ip_address': '...', 'username': '...', 'password': '...'}

    # Determine connection parameters based on input
    if hosts:
        # For hosts passed directly, we need *some* credentials.
        # Assuming your connect_to_hosts can take a single username/password for all.
        # In a real app, these would come from environment variables or a secure config.
        username = os.environ.get("JUNOS_USERNAME")
        password = os.environ.get("JUNOS_PASSWORD")
        if not username or not password:
            raise ValueError("JUNOS_USERNAME and JUNOS_PASSWORD environment variables must be set for direct host connections.")
        
        for host_ip in hosts.split(','):
            devices_to_process_info.append({
                'ip_address': host_ip.strip(),
                'username': username,
                'password': password
            })

    elif inventory_file:
        # Construct the full path to the inventory and hosts_data files
        # The 'base_path' for `load_yaml_file` should be from the 'python_pipeline' root.
        # This script is at python_pipeline/get_device_facts/fact_scripts/get_interfaces.py
        # So we need to go up two directories (fact_scripts -> get_device_facts -> python_pipeline)
        pipeline_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
        
        full_inventory_path = os.path.join(pipeline_root, 'data', inventory_file)
        # Assuming hosts_data.yml is always named that and is in the 'data' directory
        full_hosts_data_path = os.path.join(pipeline_root, 'data', 'hosts_data.yml')

        merged_data = merge_host_data(full_inventory_path, full_hosts_data_path)
        
        if not merged_data:
            raise RuntimeError(f"Failed to load or merge inventory data from {inventory_file} and hosts_data.yml.")
        
        # The merged_data will have a 'hosts' key which is a list of dictionaries
        # with 'ip_address', 'username', 'password', etc.
        # Use the global username/password from merged_data if not specific to host.
        global_username = merged_data.get('username')
        global_password = merged_data.get('password')

        for host_entry in merged_data.get('hosts', []):
            host_ip = host_entry.get('ip_address')
            host_user = host_entry.get('username', global_username)
            host_pass = host_entry.get('password', global_password)

            if host_ip and host_user and host_pass: # Ensure we have minimum info
                devices_to_process_info.append({
                    'ip_address': host_ip,
                    'username': host_user,
                    'password': host_pass
                })
            else:
                sys.stderr.write(f"Warning: Incomplete host entry in merged inventory for {host_ip}.\n")
                
    else:
        raise ValueError("Either 'hosts' or 'inventory_file' must be provided.")

    if not devices_to_process_info:
        return json.dumps({"error": "No valid devices found to process."})

    # Group devices by username/password if connect_to_hosts expects uniform creds per call
    # Or, if connect_to_hosts handles list of IPs with same creds, simplify.
    # Given your connect_to_hosts takes (host: Union[str, List[str]], username, password)
    # it implies uniform credentials per call to connect_to_hosts.
    # A single call might connect to multiple devices if they share credentials.

    # Let's assume for now connect_to_hosts needs to be called per-host if credentials differ.
    # If all hosts in your inventory share global credentials, you could optimize this.
    
    # Iterate through unique credential sets (IP, user, pass) if needed,
    # or simply connect to each device individually.
    
    for device_info in devices_to_process_info:
        ip = device_info['ip_address']
        user = device_info['username']
        pw = device_info['password']
        
        connections = []
        try:
            # connect_to_hosts returns a list of Device objects
            # It already handles logging and printing connection status
            connections = connect_to_hosts(host=ip, username=user, password=pw)
            
            if not connections:
                # connect_to_hosts logs error, so we just capture it in results
                results[ip] = {"error": "Failed to establish connection."}
                continue
            
            # Assuming connect_to_hosts returns a list containing one device for a single IP
            dev = connections[0] 
            
            # Now, use the opened device object to get facts
            device_result = get_interfaces_from_device(dev)
            results[ip] = device_result

        except ConnectError as e:
            results[ip] = {"error": f"Connection error: {str(e)}"}
        except Exception as e:
            results[ip] = {"error": f"An error occurred while processing {ip}: {str(e)}"}
        finally:
            if connections:
                disconnect_from_hosts(connections)

    return json.dumps(results, indent=2)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Get interface facts from Juniper devices using PyEZ and your utilities.")
    parser.add_argument("--hosts", type=str, help="Comma-separated list of Juniper device IPs/hostnames.")
    parser.add_argument("--inventory_file", type=str, help="Name of inventory YAML file in data/ directory (e.g., inventory.yml).")
    args = parser.parse_args()

    try:
        # Add python_pipeline root to sys.path so relative imports work if not run as module
        # This is often needed when running a script directly that uses relative imports from a package.
        # A more robust solution might involve setting PYTHONPATH environment variable or using `python -m`
        # if `python_pipeline` is intended to be a top-level package.
        # For development, this can help:
        script_dir = os.path.dirname(__file__)
        get_device_facts_dir = os.path.abspath(os.path.join(script_dir, '..'))
        pipeline_root = os.path.abspath(os.path.join(get_device_facts_dir, '..'))
        if pipeline_root not in sys.path:
            sys.path.insert(0, pipeline_root)

        output = main(hosts=args.hosts, inventory_file=args.inventory_file)
        print(output)
    except FileNotFoundError as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
    except ValueError as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
    except RuntimeError as e: # Catching inventory parsing errors
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"An unhandled error occurred in main: {str(e)}"}), file=sys.stderr)
        sys.exit(1)
