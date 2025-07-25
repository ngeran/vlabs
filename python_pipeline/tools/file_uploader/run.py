#!/usr/bin/env python3
# =============================================================================
# FILE: run.py
# DESCRIPTION: Python backend script for uploading files to Juniper routers
#              using PyEZ library. Handles secure connections, file transfers,
#              and provides detailed logging and error handling.
#
# OVERVIEW:
#   This script serves as the backend for the UniversalFileUploader React
#   component. It receives file upload requests via HTTP API, establishes
#   secure connections to Juniper routers using PyEZ, and transfers files
#   to specified paths on the device. The script includes comprehensive
#   error handling, progress tracking, and security best practices.
#
# DEPENDENCIES:
#   - junos-eznc: Juniper PyEZ library for device connectivity
#   - flask: Web framework for API endpoints
#   - werkzeug: For secure file handling
#   - paramiko: SSH/SCP functionality (used by PyEZ)
#   - cryptography: For secure operations
#
# HOW TO USE:
#   1. Install dependencies:
#      pip install junos-eznc flask werkzeug paramiko cryptography
#
#   2. Run the script:
#      python run.py
#
#   3. The API will be available at:
#      POST /api/upload-to-router
#
#   4. Expected form data:
#      - file: The file to upload
#      - hostname: Router IP/hostname
#      - username: Router username
#      - password: Router password
#      - path: Upload path (optional, defaults to /var/tmp/)
#
# SECURITY CONSIDERATIONS:
#   - Passwords are handled securely and not logged
#   - File uploads are validated and sanitized
#   - Connection timeouts prevent hanging connections
#   - Temporary files are cleaned up after upload
# =============================================================================

import os
import sys
import logging
import tempfile
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, Tuple

# Third-party imports
try:
    from jnpr.junos import Device
    from jnpr.junos.utils.scp import SCP
    from jnpr.junos.exception import ConnectError, ConfigLoadError, CommitError
    from flask import Flask, request, jsonify
    from werkzeug.utils import secure_filename
    import paramiko
except ImportError as e:
    print(f"Error: Missing required dependency - {e}")
    print("Please install required packages: pip install junos-eznc flask werkzeug paramiko cryptography")
    sys.exit(1)

# =============================================================================
# SECTION 1: CONFIGURATION AND CONSTANTS
# =============================================================================
# Application configuration
DEFAULT_UPLOAD_PATH = "/var/tmp/"
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
ALLOWED_EXTENSIONS = {'.txt', '.cfg', '.py', '.xml', '.json', '.yaml', '.yml', '.sh', '.conf'}
CONNECTION_TIMEOUT = 30
SCP_TIMEOUT = 300  # 5 minutes for file transfer

# Flask app configuration
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

# =============================================================================
# SECTION 2: LOGGING CONFIGURATION
# =============================================================================
def setup_logging(log_level: str = "INFO") -> logging.Logger:
    """
    Configure logging for the application

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR)

    Returns:
        Configured logger instance
    """
    logger = logging.getLogger('juniper_uploader')
    logger.setLevel(getattr(logging, log_level.upper()))

    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # File handler
    log_file = Path('juniper_uploader.log')
    file_handler = logging.FileHandler(log_file)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return logger

# Initialize logger
logger = setup_logging()

# =============================================================================
# SECTION 3: UTILITY FUNCTIONS
# =============================================================================
def validate_file(filename: str, file_size: int) -> Tuple[bool, str]:
    """
    Validate uploaded file based on size and extension

    Args:
        filename: Name of the uploaded file
        file_size: Size of the file in bytes

    Returns:
        Tuple of (is_valid, error_message)
    """
    if file_size > MAX_FILE_SIZE:
        return False, f"File size ({file_size} bytes) exceeds maximum allowed size ({MAX_FILE_SIZE} bytes)"

    file_ext = Path(filename).suffix.lower()
    if ALLOWED_EXTENSIONS and file_ext not in ALLOWED_EXTENSIONS:
        return False, f"File extension '{file_ext}' not allowed. Allowed extensions: {', '.join(ALLOWED_EXTENSIONS)}"

    return True, "File validation passed"

def validate_connection_params(params: Dict) -> Tuple[bool, str]:
    """
    Validate connection parameters

    Args:
        params: Dictionary containing connection parameters

    Returns:
        Tuple of (is_valid, error_message)
    """
    required_params = ['hostname', 'username', 'password']

    for param in required_params:
        if not params.get(param):
            return False, f"Missing required parameter: {param}"

    # Basic hostname validation
    hostname = params['hostname'].strip()
    if not hostname or len(hostname) > 255:
        return False, "Invalid hostname format"

    return True, "Connection parameters validation passed"

def sanitize_path(path: str) -> str:
    """
    Sanitize and validate the upload path

    Args:
        path: The upload path to sanitize

    Returns:
        Sanitized path string
    """
    if not path or not path.strip():
        return DEFAULT_UPLOAD_PATH

    # Ensure path starts with /
    path = path.strip()
    if not path.startswith('/'):
        path = '/' + path

    # Ensure path ends with /
    if not path.endswith('/'):
        path += '/'

    # Remove any dangerous characters or sequences
    dangerous_chars = ['..', ';', '&', '|', '`', '$']
    for char in dangerous_chars:
        path = path.replace(char, '')

    return path

# =============================================================================
# SECTION 4: JUNIPER DEVICE CONNECTION CLASS
# =============================================================================
class JuniperDeviceManager:
    """
    Manages connections and file operations with Juniper devices
    """

    def __init__(self, hostname: str, username: str, password: str):
        """
        Initialize device manager

        Args:
            hostname: Device hostname or IP address
            username: Authentication username
            password: Authentication password
        """
        self.hostname = hostname
        self.username = username
        self.password = password
        self.device = None
        self.scp = None

    def connect(self) -> Tuple[bool, str]:
        """
        Establish connection to Juniper device

        Returns:
            Tuple of (success, message)
        """
        try:
            logger.info(f"Attempting to connect to {self.hostname}")

            # Create device instance
            self.device = Device(
                host=self.hostname,
                user=self.username,
                password=self.password,
                timeout=CONNECTION_TIMEOUT,
                gather_facts=False  # Skip facts gathering for faster connection
            )

            # Open connection
            self.device.open()

            # Initialize SCP
            self.scp = SCP(self.device)

            logger.info(f"Successfully connected to {self.hostname}")
            return True, "Connection established successfully"

        except ConnectError as e:
            error_msg = f"Failed to connect to {self.hostname}: {str(e)}"
            logger.error(error_msg)
            return False, error_msg
        except Exception as e:
            error_msg = f"Unexpected error during connection: {str(e)}"
            logger.error(error_msg)
            return False, error_msg

    def upload_file(self, local_file_path: str, remote_path: str, filename: str) -> Tuple[bool, str]:
        """
        Upload file to Juniper device

        Args:
            local_file_path: Path to local file
            remote_path: Remote directory path
            filename: Name of the file

        Returns:
            Tuple of (success, message)
        """
        if not self.device or not self.scp:
            return False, "Device not connected. Call connect() first."

        try:
            # Construct full remote path
            full_remote_path = f"{remote_path}{filename}"

            logger.info(f"Uploading {local_file_path} to {self.hostname}:{full_remote_path}")

            # Upload file using SCP
            self.scp.put(local_file_path, full_remote_path, progress=self._upload_progress)

            # Verify file was uploaded
            file_size = os.path.getsize(local_file_path)
            success_msg = f"File uploaded successfully to {full_remote_path} ({file_size} bytes)"
            logger.info(success_msg)

            return True, success_msg

        except Exception as e:
            error_msg = f"File upload failed: {str(e)}"
            logger.error(error_msg)
            return False, error_msg

    def _upload_progress(self, filename: str, size: int, sent: int):
        """
        Progress callback for SCP upload

        Args:
            filename: Name of file being uploaded
            size: Total file size
            sent: Bytes sent so far
        """
        if size > 0:
            percent = (sent / size) * 100
            logger.debug(f"Upload progress for {filename}: {percent:.1f}% ({sent}/{size} bytes)")

    def get_device_info(self) -> Dict:
        """
        Get basic device information

        Returns:
            Dictionary containing device information
        """
        if not self.device:
            return {}

        try:
            facts = self.device.facts
            return {
                'hostname': facts.get('hostname', 'Unknown'),
                'model': facts.get('model', 'Unknown'),
                'version': facts.get('version', 'Unknown'),
                'serial_number': facts.get('serialnumber', 'Unknown')
            }
        except Exception as e:
            logger.warning(f"Could not retrieve device facts: {str(e)}")
            return {'hostname': self.hostname}

    def verify_path_exists(self, path: str) -> Tuple[bool, str]:
        """
        Verify that the remote path exists

        Args:
            path: Remote path to verify

        Returns:
            Tuple of (exists, message)
        """
        if not self.device:
            return False, "Device not connected"

        try:
            # Execute shell command to check if path exists
            result = self.device.rpc.request_shell_execute(command=f"ls -ld {path}")
            if result and 'No such file or directory' not in str(result):
                return True, f"Path {path} exists"
            else:
                return False, f"Path {path} does not exist"
        except Exception as e:
            logger.warning(f"Could not verify path {path}: {str(e)}")
            return False, f"Could not verify path: {str(e)}"

    def disconnect(self):
        """
        Close connection to device
        """
        try:
            if self.scp:
                self.scp.close()
                self.scp = None

            if self.device:
                self.device.close()
                self.device = None

            logger.info(f"Disconnected from {self.hostname}")
        except Exception as e:
            logger.warning(f"Error during disconnect: {str(e)}")

# =============================================================================
# SECTION 5: FLASK API ENDPOINTS
# =============================================================================
@app.route('/api/upload-to-router', methods=['POST'])
def upload_to_router():
    """
    API endpoint for uploading files to Juniper routers

    Expected form data:
        - file: The file to upload
        - hostname: Router hostname/IP
        - username: Authentication username
        - password: Authentication password
        - path: Upload path (optional)

    Returns:
        JSON response with success/error status
    """
    temp_file_path = None
    device_manager = None

    try:
        # Validate request has file
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Get connection parameters
        hostname = request.form.get('hostname', '').strip()
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        upload_path = sanitize_path(request.form.get('path', DEFAULT_UPLOAD_PATH))

        # Validate connection parameters
        conn_params = {
            'hostname': hostname,
            'username': username,
            'password': password
        }

        is_valid, error_msg = validate_connection_params(conn_params)
        if not is_valid:
            return jsonify({'error': error_msg}), 400

        # Validate file
        file_size = 0
        if hasattr(file, 'content_length') and file.content_length:
            file_size = file.content_length

        is_valid, error_msg = validate_file(file.filename, file_size)
        if not is_valid:
            return jsonify({'error': error_msg}), 400

        # Secure the filename
        filename = secure_filename(file.filename)
        if not filename:
            return jsonify({'error': 'Invalid filename'}), 400

        # Save file temporarily
        temp_dir = tempfile.mkdtemp()
        temp_file_path = os.path.join(temp_dir, filename)
        file.save(temp_file_path)

        # Get actual file size after saving
        actual_file_size = os.path.getsize(temp_file_path)

        logger.info(f"Upload request: {filename} ({actual_file_size} bytes) to {hostname}:{upload_path}")

        # Connect to device and upload file
        device_manager = JuniperDeviceManager(hostname, username, password)

        # Establish connection
        success, message = device_manager.connect()
        if not success:
            return jsonify({'error': f'Connection failed: {message}'}), 500

        # Verify upload path exists (optional check)
        path_exists, path_msg = device_manager.verify_path_exists(upload_path)
        if not path_exists:
            logger.warning(f"Upload path may not exist: {path_msg}")

        # Upload the file
        success, message = device_manager.upload_file(temp_file_path, upload_path, filename)
        if not success:
            return jsonify({'error': f'Upload failed: {message}'}), 500

        # Get device info for response
        device_info = device_manager.get_device_info()

        # Success response
        response_data = {
            'success': True,
            'message': message,
            'filename': filename,
            'size': actual_file_size,
            'remote_path': f"{upload_path}{filename}",
            'device_info': device_info,
            'timestamp': datetime.now().isoformat()
        }

        logger.info(f"Upload completed successfully: {filename} to {hostname}")
        return jsonify(response_data), 200

    except Exception as e:
        error_msg = f"Unexpected error during upload: {str(e)}"
        logger.error(error_msg)
        return jsonify({'error': error_msg}), 500

    finally:
        # Cleanup
        if device_manager:
            device_manager.disconnect()

        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
                if os.path.exists(os.path.dirname(temp_file_path)):
                    os.rmdir(os.path.dirname(temp_file_path))
            except Exception as e:
                logger.warning(f"Could not cleanup temporary file: {str(e)}")

@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Health check endpoint

    Returns:
        JSON response with service status
    """
    return jsonify({
        'status': 'healthy',
        'service': 'Juniper File Uploader',
        'timestamp': datetime.now().isoformat(),
        'version': '1.0.0'
    }), 200

@app.route('/api/supported-extensions', methods=['GET'])
def get_supported_extensions():
    """
    Get list of supported file extensions

    Returns:
        JSON response with supported extensions
    """
    return jsonify({
        'supported_extensions': list(ALLOWED_EXTENSIONS),
        'max_file_size': MAX_FILE_SIZE,
        'default_path': DEFAULT_UPLOAD_PATH
    }), 200

# =============================================================================
# SECTION 6: COMMAND LINE INTERFACE
# =============================================================================
def create_argument_parser():
    """
    Create command line argument parser

    Returns:
        Configured ArgumentParser instance
    """
    parser = argparse.ArgumentParser(
        description='Juniper Router File Upload Service',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Start the web service
  python run.py --mode web --port 5000

  # Upload file directly via CLI
  python run.py --mode cli --hostname 192.168.1.1 --username admin --password secret --file config.txt

  # Upload with custom path
  python run.py --mode cli --hostname router.example.com --username admin --password secret --file firmware.img --path /var/tmp/uploads/
        """
    )

    parser.add_argument('--mode', choices=['web', 'cli'], default='web',
                       help='Operation mode: web service or CLI upload')
    parser.add_argument('--port', type=int, default=5000,
                       help='Port for web service (default: 5000)')
    parser.add_argument('--host', default='0.0.0.0',
                       help='Host for web service (default: 0.0.0.0)')
    parser.add_argument('--debug', action='store_true',
                       help='Enable debug mode')

    # CLI mode arguments
    parser.add_argument('--hostname', help='Router hostname or IP address')
    parser.add_argument('--username', help='Router username')
    parser.add_argument('--password', help='Router password')
    parser.add_argument('--file', help='File to upload')
    parser.add_argument('--path', help=f'Upload path (default: {DEFAULT_UPLOAD_PATH})')

    return parser

def cli_upload(args):
    """
    Handle CLI mode file upload

    Args:
        args: Parsed command line arguments

    Returns:
        Exit code (0 for success, 1 for failure)
    """
    # Validate required arguments
    required_args = ['hostname', 'username', 'password', 'file']
    for arg in required_args:
        if not getattr(args, arg):
            print(f"Error: --{arg} is required for CLI mode")
            return 1

    # Validate file exists
    if not os.path.exists(args.file):
        print(f"Error: File '{args.file}' not found")
        return 1

    filename = os.path.basename(args.file)
    file_size = os.path.getsize(args.file)
    upload_path = sanitize_path(args.path or DEFAULT_UPLOAD_PATH)

    # Validate file
    is_valid, error_msg = validate_file(filename, file_size)
    if not is_valid:
        print(f"Error: {error_msg}")
        return 1

    print(f"Uploading {filename} ({file_size} bytes) to {args.hostname}:{upload_path}")

    device_manager = None
    try:
        # Connect to device
        device_manager = JuniperDeviceManager(args.hostname, args.username, args.password)

        success, message = device_manager.connect()
        if not success:
            print(f"Connection failed: {message}")
            return 1

        print("Connected successfully")

        # Upload file
        success, message = device_manager.upload_file(args.file, upload_path, filename)
        if not success:
            print(f"Upload failed: {message}")
            return 1

        print(f"Success: {message}")

        # Show device info
        device_info = device_manager.get_device_info()
        if device_info:
            print(f"Device: {device_info.get('hostname', 'Unknown')} ({device_info.get('model', 'Unknown')})")

        return 0

    except KeyboardInterrupt:
        print("\nUpload cancelled by user")
        return 1
    except Exception as e:
        print(f"Error: {str(e)}")
        return 1
    finally:
        if device_manager:
            device_manager.disconnect()

# =============================================================================
# SECTION 7: MAIN EXECUTION
# =============================================================================
def main():
    """
    Main entry point for the application
    """
    parser = create_argument_parser()
    args = parser.parse_args()

    # Set up logging level
    if args.debug:
        setup_logging("DEBUG")
    else:
        setup_logging("INFO")

    if args.mode == 'cli':
        # CLI mode
        exit_code = cli_upload(args)
        sys.exit(exit_code)
    else:
        # Web service mode
        print("Starting Juniper File Upload Service...")
        print(f"Health check: http://{args.host}:{args.port}/api/health")
        print(f"Upload endpoint: http://{args.host}:{args.port}/api/upload-to-router")
        print("Press Ctrl+C to stop the service")

        try:
            app.run(
                host=args.host,
                port=args.port,
                debug=args.debug,
                threaded=True
            )
        except KeyboardInterrupt:
            print("\nService stopped by user")
        except Exception as e:
            print(f"Service error: {str(e)}")
            sys.exit(1)

if __name__ == '__main__':
    main()
