# python_pipeline/tools/backup_and_restore/utils/shared_utils.py

import json
import logging
import sys
import time
from datetime import datetime
from enum import Enum
from typing import Dict, Any, Optional

# =================================================================
# SHARED PROGRESS TRACKER CLASS
# =================================================================
class NotificationLevel(Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    SUCCESS = "SUCCESS"

class ProgressTracker:
    """A class to manage and broadcast the progress of a multi-step operation."""
    
    def __init__(self):
        self.steps = []
        self.current_step_index = -1
        self.start_time = None
        self.step_start_time = None
        
    def start_operation(self, operation_name: str):
        self.start_time = time.time()
        self.operation_name = operation_name
        self._notify(
            level=NotificationLevel.INFO,
            message=f"Starting: {operation_name}",
            event_type="OPERATION_START",
            data={"operation": operation_name}
        )
        
    def start_step(self, step_name: str, description: str = ""):
        self.current_step_index += 1
        self.step_start_time = time.time()
        step_info = {
            "step": self.current_step_index + 1,
            "name": step_name,
            "description": description,
            "status": "IN_PROGRESS",
            "start_time": datetime.now().isoformat(),
            "duration": None,
            "details": {}
        }
        self.steps.append(step_info)
        self._notify(
            level=NotificationLevel.INFO,
            message=f"Step {step_info['step']}: {step_name}",
            event_type="STEP_START",
            data=step_info
        )
            
    def update_step(self, details: Optional[Dict] = None, message: Optional[str] = None):
        if self.current_step_index < 0: return
        current = self.steps[self.current_step_index]
        if details:
            current["details"].update(details)
        self._notify(
            level=NotificationLevel.INFO,
            message=message or f"Updating: {current['name']}",
            event_type="STEP_UPDATE",
            data=current
        )
                
    def complete_step(self, status: str = "COMPLETED", details: Optional[Dict] = None):
        if self.current_step_index < 0: return
        current = self.steps[self.current_step_index]
        current["status"] = status
        current["duration"] = time.time() - self.step_start_time
        current["end_time"] = datetime.now().isoformat()
        if details:
            current["details"].update(details)
        level = NotificationLevel.SUCCESS if status == "COMPLETED" else NotificationLevel.ERROR
        self._notify(
            level=level,
            message=f"Step {current['step']} {status.lower()}: {current['name']} ({current['duration']:.2f}s)",
            event_type="STEP_COMPLETE",
            data=current
        )
            
    def complete_operation(self, status: str = "SUCCESS"):
        total_duration = time.time() - self.start_time if self.start_time else 0
        level = NotificationLevel.SUCCESS if status == "SUCCESS" else NotificationLevel.ERROR
        self._notify(
            level=level,
            message=f"Operation completed in {total_duration:.2f}s with status: {status}",
            event_type="OPERATION_COMPLETE",
            data={
                "operation": getattr(self, 'operation_name', 'Unknown'),
                "status": status,
                "total_duration": total_duration
            }
        )

    def _notify(self, level: NotificationLevel, message: str, event_type: str, data: Dict[Any, Any] = None):
        notification_data = {
            "timestamp": datetime.now().isoformat(),
            "level": level.value,
            "message": message,
            "event_type": event_type,
            "data": data or {}
        }
        print(f"JSON_PROGRESS: {json.dumps(notification_data)}", file=sys.stderr, flush=True)

    def get_summary(self):
        return {"operation": getattr(self, 'operation_name', 'Unknown'), "steps": self.steps}

# =================================================================
# SHARED LOGGING SETUP FUNCTION
# =================================================================
def setup_logging(log_file='backup_restore.log'):
    """Configures logging to a file and returns a logger instance."""
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    if root_logger.hasHandlers():
        root_logger.handlers.clear()
    
    file_handler = logging.FileHandler(log_file, mode='a')
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)
    
    return logging.getLogger(__name__)
