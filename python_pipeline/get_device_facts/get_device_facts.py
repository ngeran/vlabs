# python_pipeline/get_device_facts/get_device_facts.py
import subprocess
import json
import sys
import os

def run_fact_script(script_name, hosts=None, inventory_file=None):
    """Runs a single fact-gathering script as a subprocess."""
    # The individual fact scripts are now in a subfolder "fact_scripts"
    script_path = os.path.join(os.path.dirname(__file__), 'fact_scripts', script_name)
    
    command = [sys.executable, script_path]

    if hosts:
        command.extend(["--hosts", hosts])
    elif inventory_file:
        command.extend(["--inventory_file", inventory_file])
    else:
        return {"error": "Neither hosts nor inventory_file provided."}

    try:
        result = subprocess.run(command, capture_output=True, text=True, check=False)

        if result.returncode != 0:
            error_output = result.stderr.strip()
            try:
                error_json = json.loads(error_output)
                return {"error": f"Script '{script_name}' failed: {error_json.get('error', 'Unknown error')}"}
            except json.JSONDecodeError:
                return {"error": f"Script '{script_name}' failed unexpectedly: {error_output}"}
        else:
            try:
                return json.loads(result.stdout)
            except json.JSONDecodeError:
                return {"error": f"Script '{script_name}' returned invalid JSON: {result.stdout}"}
    except FileNotFoundError:
        return {"error": f"Fact script '{script_name}' not found at {script_path}. Check script name and path."}
    except Exception as e:
        return {"error": f"Failed to execute '{script_name}' subprocess: {str(e)}"}

def main(hosts=None, inventory_file=None, fact_types=None):
    """
    Main entry point for get_device_facts, orchestrating fact gathering.
    fact_types should be a comma-separated string of fact aliases (e.g., "interfaces,version").
    """
    if not fact_types:
        return json.dumps({"error": "No fact types specified for collection."})

    # Map friendly fact aliases to their script filenames
    # This acts as a whitelist for allowed scripts
    script_map = {
        "interfaces": "get_interfaces.py",
        "version": "get_version.py",
        "ospf_neighbors": "get_ospf_neighbors.py",
        "routes": "get_routes.py",
        # Add more mappings here as you create new fact scripts
    }

    results = {}
    for fact_alias in fact_types.split(','):
        fact_alias = fact_alias.strip()
        script_filename = script_map.get(fact_alias)
        
        if not script_filename:
            results[fact_alias] = {"error": f"Unknown or unsupported fact type: '{fact_alias}'."}
            continue

        script_result = run_fact_script(script_filename, hosts=hosts, inventory_file=inventory_file)
        
        # Merge results. Assuming each script returns a dictionary keyed by hostname.
        for host, data in script_result.items():
            if host not in results:
                results[host] = {}
            if "error" in data: # Propagate script-specific errors for a host
                results[host][f"{fact_alias}_error"] = data["error"]
            else: # Merge successful data under the fact_alias
                results[host][fact_alias] = data

    return json.dumps(results, indent=2)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Orchestrate gathering of device facts.")
    parser.add_argument("--hosts", type=str, help="Comma-separated list of hosts (e.g., host1,host2)")
    parser.add_argument("--inventory_file", type=str, help="Path to inventory file in data/ directory (e.g., my_inventory.yaml)")
    parser.add_argument("--fact_types", type=str, required=True,
                        help="Comma-separated list of fact types to collect (e.g., interfaces,version)")
    args = parser.parse_args()

    try:
        output = main(hosts=args.hosts, inventory_file=args.inventory_file, fact_types=args.fact_types)
        print(output)
    except ValueError as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"An unhandled error occurred: {str(e)}"}), file=sys.stderr)
        sys.exit(1)
