import asyncio
import os
import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional
from jnpr.jsnapy import SnapAdmin
from jnpr.junos.exception import ConnectError

# Import functions from the config module
from config import generate_temp_jsnapy_config, cleanup_temp_dir

# Set up logging for JSNAPy
logging.getLogger('jnpr.jsnapy').setLevel(logging.WARNING)

@dataclass
class TestResult:
    test_name: str
    status: str
    message: str = ""
    error: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)

class TestRunner:
    """Handles the execution of JSNAPy tests."""
    def __init__(self, hostname: str, username: str, password: str, environment: str):
        self.hostname = hostname
        self.username = username
        self.password = password
        self.environment = environment
        
    def _run_single_test_sync(self, test_name: str) -> TestResult:
        """Synchronously runs a single JSNAPy test."""
        temp_config_path = None
        try:
            temp_config_path = generate_temp_jsnapy_config(
                hostname=self.hostname,
                username=self.username,
                password=self.password,
                test_name=test_name,
                environment=self.environment
            )
            
            # Initialize SnapAdmin with the temporary config
            jsnapy_admin = SnapAdmin(conf_file=temp_config_path)
            
            # Run the test and get the results
            jsnapy_result = jsnapy_admin.check()
            
            # Process the JSNAPy result
            test_passed = jsnapy_result.passed or jsnapy_result.not_run
            test_status = "passed" if test_passed else "failed"
            
            # Get detailed results
            details = {}
            for host_result in jsnapy_result:
                host_details = {}
                for testcase in host_result.test_cases:
                    host_details[testcase.name] = {
                        "status": "passed" if testcase.result == 'Pass' else "failed",
                        "reason": testcase.reason,
                    }
                details[str(host_result.device)] = host_details

            return TestResult(
                test_name=test_name,
                status=test_status,
                message=f"Test '{test_name}' {'passed' if test_passed else 'failed'}",
                details=details
            )

        except ConnectError as e:
            return TestResult(
                test_name=test_name,
                status="error",
                message="Connection Error",
                error=str(e),
            )
        except Exception as e:
            return TestResult(
                test_name=test_name,
                status="error",
                message="Execution Error",
                error=str(e),
            )
        finally:
            if temp_config_path:
                cleanup_temp_dir(temp_config_path)

    async def run_tests_async(self, test_names: List[str], max_workers: int = 5) -> Dict[str, Any]:
        """Runs multiple JSNAPy tests asynchronously using a thread pool."""
        start_time = asyncio.get_event_loop().time()
        
        # Use a ThreadPoolExecutor for blocking I/O operations
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            loop = asyncio.get_event_loop()
            tasks = {
                loop.run_in_executor(executor, self._run_single_test_sync, test_name): test_name
                for test_name in test_names
            }
            
            results = []
            for future in as_completed(tasks):
                result = await future
                results.append(result)
                print(f"✅ Test '{result.test_name}' finished with status: {result.status}")

        end_time = asyncio.get_event_loop().time()
        duration = end_time - start_time

        return {
            "status": "completed",
            "total_tests_run": len(results),
            "duration_seconds": round(duration, 2),
            "test_results": [r.__dict__ for r in results]
        }
