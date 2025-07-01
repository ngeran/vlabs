import psutil
from datetime import datetime
import json
import sys

def get_system_info():
    """Returns a dictionary with system-wide performance metrics."""
    # cpu_percent() requires an interval, so we use a small one
    cpu_percent = psutil.cpu_percent(interval=0.1)
    memory_info = psutil.virtual_memory()
    disk_info = psutil.disk_usage('/')
    
    return {
        "cpu_percent": cpu_percent,
        "memory_percent": memory_info.percent,
        "disk_percent": disk_info.percent,
        "timestamp": datetime.now().isoformat()
    }

def print_error_message(message: str, environment: str):
    """Prints a structured JSON error message and exits."""
    print(json.dumps({
        "status": "error",
        "message": message,
        "environment": environment,
        "timestamp": datetime.now().isoformat()
    }, indent=2))
    sys.exit(1)
