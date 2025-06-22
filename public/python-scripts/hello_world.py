# vlabs/public/python-scripts/hello_world.py
import sys
import os
from datetime import datetime

# Test if some of the required libraries can be imported
try:
    import paramiko
    import yaml
    print(f"[{datetime.now()}] Successfully imported PyEZ, Paramiko, and YAML!")
except ImportError as e:
    print(f"[{datetime.now()}] ERROR: Failed to import a library: {e}", file=sys.stderr)
    sys.exit(1)

print(f"[{datetime.now()}] Hello from Python script inside Docker!")
print(f"[{datetime.now()}] Python version: {sys.version}")
print(f"[{datetime.now()}] Current working directory: {os.getcwd()}")

# Example of a parameter (we'll pass this from Node.js later)
if len(sys.argv) > 1:
    message = sys.argv[1]
    print(f"[{datetime.now()}] Received message: {message}")
else:
    print(f"[{datetime.now()}] No message received.")

sys.exit(0) # Exit successfully
