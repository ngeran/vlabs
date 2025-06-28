import os
import sys
import json
import yaml
from pathlib import Path
from functools import lru_cache
import tempfile
import shutil

# Constants
SCRIPT_DIR = Path(__file__).parent
PIPELINE_ROOT = SCRIPT_DIR.parent
UTILS_DIR = PIPELINE_ROOT / 'utils'
TESTS_DIR = SCRIPT_DIR / 'tests'
CONFIG_DIR = SCRIPT_DIR / 'config'
LOGS_DIR = SCRIPT_DIR / 'logs'
CACHE_DIR = SCRIPT_DIR / 'cache'

# Ensure directories exist
for directory in [TESTS_DIR, CONFIG_DIR, LOGS_DIR, CACHE_DIR]:
    directory.mkdir(exist_ok=True)

@lru_cache(maxsize=1)
def load_config(config_file_path: Path):
    """Loads a YAML configuration file from the specified path."""
    try:
        with open(config_file_path, 'r') as f:
            return yaml.safe_load(f)
    except FileNotFoundError:
        print(f"Error: Configuration file not found at {config_file_path}")
        sys.exit(1)
    except yaml.YAMLError as e:
        print(f"Error parsing YAML file: {e}")
        sys.exit(1)

@lru_cache(maxsize=1)
def get_jsnapy_config_path(environment: str):
    """Returns the path to the JSNAPy configuration file for a given environment."""
    config_name = f'jsnapy_{environment}.yml'
    config_path = CONFIG_DIR / config_name
    if not config_path.exists():
        raise FileNotFoundError(
            f"JSNAPy configuration for environment '{environment}' not found at {config_path}"
        )
    return str(config_path)

@lru_cache(maxsize=1)
def get_tests_from_config():
    """Dynamically loads tests from configuration files."""
    try:
        tests_data = {}
        for test_config_file in CONFIG_DIR.glob('test_*.yaml'):
            test_name = test_config_file.stem
            test_config = load_config(test_config_file)
            tests_data[test_name] = test_config
        return tests_data
    except Exception as e:
        print(f"Error loading tests from config: {e}")
        sys.exit(1)
        
def generate_jsnapy_snapshot_path(hostname: str, test_name: str, snapshot_type: str) -> str:
    """Generates a consistent and unique file path for JSNAPy snapshots."""
    snapshot_dir = CACHE_DIR / hostname / test_name
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    return str(snapshot_dir / f"{snapshot_type}.xml")

def generate_temp_jsnapy_config(hostname: str, username: str, password: str, test_name: str, environment: str):
    """Generates a temporary JSNAPy configuration file for a single test."""
    try:
        # Load the base environment configuration
        base_config_path = get_jsnapy_config_path(environment)
        jsnapy_config = load_config(Path(base_config_path))
        
        # Load the specific test configuration
        test_config = load_config(CONFIG_DIR / f"{test_name}.yaml")
        
        # Update hosts and test files
        jsnapy_config['hosts'] = {
            hostname: {
                'username': username,
                'password': password,
            }
        }
        
        jsnapy_config['tests'] = [
            {'test_file': f'../config/{test_name}.yaml'}
        ]
        
        # Create a temporary directory for the config
        temp_dir = tempfile.mkdtemp(prefix="jsnapy_config_")
        temp_config_path = os.path.join(temp_dir, 'jsnapy.yml')
        
        # Write the updated config to the temporary file
        with open(temp_config_path, 'w') as f:
            yaml.dump(jsnapy_config, f)
            
        return temp_config_path
    except Exception as e:
        print(f"Error generating temporary JSNAPy config: {e}")
        sys.exit(1)

def cleanup_temp_dir(temp_config_path: str):
    """Removes the temporary directory used for the JSNAPy config."""
    temp_dir = os.path.dirname(temp_config_path)
    shutil.rmtree(temp_dir)

@lru_cache(maxsize=32)
def get_hash_of_file(file_path: Path):
    """Calculates the MD5 hash of a file for caching purposes."""
    hasher = hashlib.md5()
    with open(file_path, 'rb') as afile:
        buf = afile.read(65536)
        while len(buf) > 0:
            hasher.update(buf)
            buf = afile.read(65536)
    return hasher.hexdigest()
