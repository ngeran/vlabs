import yaml
from jnpr.jsnapy import SnapAdmin
import sys
from pathlib import Path
import tempfile
import os
import traceback

HOSTNAME = "172.27.200.200"
USERNAME = "admin"
PASSWORD = "manolis1"
TEST_FILENAME = "test_debug.yml"

print("--- STARTING FINAL DEBUG RUNNER (v4 - The Monolith Fix) ---", flush=True)

# This will be the path to our single, temporary, all-in-one config file
temp_config_path = None

try:
    # Build the ABSOLUTE path to the test file from this script's location
    script_dir = Path(__file__).parent
    abs_test_file_path = (script_dir / "tests" / TEST_FILENAME).resolve()

    # Create the complete configuration as a Python dictionary
    monolithic_config_data = {
        'hosts': [{
            'device': HOSTNAME,
            'username': USERNAME,
            'passwd': PASSWORD
        }],
        # Provide the absolute path directly in the test list.
        'tests': [
            str(abs_test_file_path)
        ]
    }
    
    # Write this complete configuration to a temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yml', delete=False) as temp_config:
        temp_config_path = temp_config.name
        yaml.dump(monolithic_config_data, temp_config, default_flow_style=False)
    
    print(f"✅ Created monolithic config file at: {temp_config_path}", flush=True)
    print(f"   -> Its content points to test file: {abs_test_file_path}", flush=True)

    # --- THE CRITICAL CALL ---
    # Instantiate SnapAdmin by passing it the path to our single, complete config file.
    # Then call snapcheck with NO arguments.
    print(f"Instantiating SnapAdmin with single config file...", flush=True)
    js = SnapAdmin(config_file=temp_config_path)

    print(f"Calling snapcheck (no arguments)...", flush=True)
    result = js.snapcheck()

    print("\n--- JSNAPY EXECUTION COMPLETE ---", flush=True)
    print("RAW JSNAPY RESULT:", flush=True)
    print(result, flush=True)
    
    final_status = "UNKNOWN"
    if result:
        for res in result:
            if hasattr(res, 'result') and res.result == "Passed":
                final_status = "SUCCESS"
                print(f"\n🎉🎉🎉 TEST PASSED! 🎉🎉🎉", flush=True)
                break
        if final_status != "SUCCESS":
             final_status = "FAILURE"
             print(f"\n🔥🔥🔥 TEST FAILED! 🔥🔥🔥", flush=True)
             if result and hasattr(result[0], 'err_mssg'):
                 print(f"REASON: {result[0].err_mssg}", flush=True)

    if final_status == "UNKNOWN":
        print("\n🤔 Result was empty or in an unexpected format.", flush=True)

except Exception as e:
    print("\n\n🔥🔥🔥 CATASTROPHIC FAILURE CAUGHT! 🔥🔥🔥", flush=True)
    print(f"ERROR TYPE: {type(e).__name__}", flush=True)
    print(f"ERROR MESSAGE: {e}", flush=True)
    print("\n--- FULL TRACEBACK ---", flush=True)
    traceback.print_exc()
    sys.exit(1)

finally:
    # Always clean up the temporary config file
    if temp_config_path and os.path.exists(temp_config_path):
        os.unlink(temp_config_path)
        print(f"✅ Cleaned up temporary config file: {temp_config_path}", flush=True)
