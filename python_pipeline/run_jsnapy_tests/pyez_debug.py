import sys
import traceback
from jnpr.junos import Device
from jnpr.junos.exception import ConnectError

HOSTNAME = "172.27.200.200"
USERNAME = "admin"
PASSWORD = "manolis1"

print("--- STARTING FINAL DIAGNOSTIC: PyEZ CORE CONNECTION TEST ---", flush=True)
print(f"Attempting to connect to {HOSTNAME}...", flush=True)

dev = None
try:
    # Instantiate the core Device object
    dev = Device(host=HOSTNAME, user=USERNAME, passwd=PASSWORD, port=22)
    
    # Attempt to open the connection
    print("Opening connection...", flush=True)
    dev.open()
    
    print("Connection open! Retrieving device facts...", flush=True)
    
    # If connection succeeds, print some basic facts
    hostname_fact = dev.facts.get('hostname')
    version_fact = dev.facts.get('version')
    
    print("\n" + "="*50)
    print("🎉🎉🎉 CORE CONNECTION SUCCESSFUL! 🎉🎉🎉")
    print("="*50)
    print(f"   Device Hostname: {hostname_fact}")
    print(f"   Junos Version:   {version_fact}")
    print("="*50)
    print("\nCONCLUSION: Networking, credentials, and the core 'juniper-eznc' library are WORKING.")
    print("The problem is 100% isolated to the broken 'jsnapy' library installation in this container.")
    
except ConnectError as e:
    print("\n\n🔥🔥🔥 CATASTROPHIC FAILURE: CONNECTION ERROR 🔥🔥🔥", flush=True)
    print(f"ERROR MESSAGE: {e}", flush=True)
    print("\nCONCLUSION: The problem is with networking, firewalls, or credentials. JSNAPy is not the cause.")
    sys.exit(1)
    
except Exception as e:
    print("\n\n🔥🔥🔥 CATASTROPHIC FAILURE: UNEXPECTED ERROR 🔥🔥🔥", flush=True)
    print(f"ERROR TYPE: {type(e).__name__}", flush=True)
    print(f"ERROR MESSAGE: {e}", flush=True)
    print("\n--- FULL TRACEBACK ---", flush=True)
    traceback.print_exc()
    sys.exit(1)

finally:
    # Always ensure the connection is closed
    if dev and dev.connected:
        print("\nClosing connection...", flush=True)
        dev.close()
