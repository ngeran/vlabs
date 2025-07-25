#!/usr/bin/env python3
"""
================================================================================
SCRIPT:             Device Code Upgrade
FILENAME:           run.py
VERSION:            4.0
AUTHOR:             Network Infrastructure Team
LAST UPDATED:       2025-07-25
================================================================================

DESCRIPTION:
    This script provides a robust, automated solution for upgrading the firmware
    on network devices, specifically targeting Juniper products running Junos.
    It is designed to be executed from a web UI or other automation tools by
    accepting all necessary parameters via command-line arguments.

KEY FEATURES:
    - Concurrent Upgrades: Utilizes a thread pool to upgrade multiple devices
      simultaneously, significantly reducing total maintenance time.
    - Pre-emptive Validation: Before starting the upgrade, it connects to the
      device to verify that the specified software image file exists in the
      /var/tmp/ directory, preventing failed jobs due to missing files.
    - Version Safety: Checks the device's current version against the target
      version and will skip the upgrade if the device is already compliant.
    - Post-Reboot Monitoring: Actively probes the device after a reboot,
      waiting for it to become reachable via both ping and NETCONF.
    - Final Verification: After the device comes back online, it re-connects
      to verify that the running software version matches the target version.
    - Actionable Reporting: Generates a clear, color-coded summary table upon
      completion, detailing the success or failure for each device with
      specific error messages.

HOW TO GUIDE:

  1. Prerequisites:
     - Ensure the target device has NETCONF over SSH enabled.
     - The software image file must be pre-staged (e.g., via SCP) into the
       `/var/tmp/` directory on the target device.
     - The executing environment must have network connectivity to the devices.

  2. Execution from the Web UI / Command Line:
     The script is executed by passing all parameters as command-line arguments.

     Example:
     python run.py \\
       --hostname "192.168.1.10,192.168.1.11" \\
       --username "netadmin" \\
       --password "yourSecretPassword" \\
       --image-filename "junos-vmx-x86-64-21.4R1.12.tgz" \\
       --target-version "21.4R1.12"
================================================================================
"""

# ================================================================================
# SECTION 1: IMPORTS AND CONFIGURATION
# --------------------------------------------------------------------------------
# All necessary libraries and initial script-wide configurations are defined here.
# ================================================================================
import argparse
import logging
import sys
import time
import subprocess
import concurrent.futures
from typing import List, Optional
from enum import Enum
from dataclasses import dataclass

# Third-party libraries
from jnpr.junos import Device
from jnpr.junos.utils.sw import SW
from rich.console import Console
from rich.table import Table

# Configure a logger that prints to standard output for capture by the backend.
# This ensures all log messages are visible in the Docker container's logs.
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)-8s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

# Initialize Rich Console for styled terminal output (e.g., the final table).
console = Console()


# ================================================================================
# SECTION 2: DATA STRUCTURES
# --------------------------------------------------------------------------------
# Enums and Dataclasses for tracking the state of the upgrade process.
# ================================================================================

class UpgradePhase(Enum):
    """A clear enumeration of all possible steps in the upgrade workflow."""
    PENDING = "pending"
    CONNECTING = "connecting"
    CHECKING_IMAGE = "checking_image"
    CHECKING_VERSION = "checking_version"
    INSTALLING = "installing"
    REBOOTING = "rebooting"
    PROBING = "probing"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"

@dataclass
class DeviceStatus:
    """A data structure to track the complete upgrade status for a single device."""
    hostname: str
    target_version: str
    phase: UpgradePhase = UpgradePhase.PENDING
    message: str = "Waiting to start"
    initial_version: Optional[str] = None
    final_version: Optional[str] = None
    error: Optional[str] = None
    success: bool = False

    def update_phase(self, phase: UpgradePhase, message: str = ""):
        """Helper method to update the phase and log the change."""
        self.phase = phase
        self.message = message or phase.value.replace("_", " ").title()
        logger.info(f"[{self.hostname}] STATUS: {self.phase.name} - {self.message}")


# ================================================================================
# SECTION 3: DEVICE UPGRADE WORKFLOW
# --------------------------------------------------------------------------------
# This section contains the core function that performs the upgrade on a single
# target device from start to finish.
# ================================================================================

def upgrade_device(hostname: str, username: str, password: str, image_filename: str, target_version: str) -> DeviceStatus:
    """
    Performs the entire upgrade workflow for a single device. This function is
    designed to be executed in a separate thread for concurrency.

    Returns:
        DeviceStatus: An object containing the final state of the operation.
    """
    status = DeviceStatus(hostname=hostname, target_version=target_version)
    dev = None
    full_image_path_on_device = f"/var/tmp/{image_filename}"

    try:
        # STEP 1: Connect and run pre-checks.
        status.update_phase(UpgradePhase.CONNECTING, "Establishing NETCONF connection...")
        dev = Device(host=hostname, user=username, password=password, auto_probe=True, timeout=30)
        dev.open()
        dev.timeout = 720  # Increase timeout for long operations like install.
        status.update_phase(UpgradePhase.CONNECTING, "Connection established.")
        status.initial_version = dev.facts.get("version", "Unknown")
        status.final_version = status.initial_version

        # STEP 2: Verify the image file exists before proceeding. This is a critical pre-check.
        status.update_phase(UpgradePhase.CHECKING_IMAGE, f"Verifying image '{image_filename}' exists in /var/tmp/...")
        if image_filename not in dev.cli("file list /var/tmp/", warning=False):
            raise Exception(f"Image '{image_filename}' not found. Please upload it to /var/tmp/ on the device.")

        # STEP 3: Check if the device is already on the target version.
        status.update_phase(UpgradePhase.CHECKING_VERSION, f"Current version: {status.initial_version}")
        if status.initial_version == target_version:
            status.update_phase(UpgradePhase.SKIPPED, "Device is already on the target version.")
            status.success = True
            return status

        # STEP 4: Perform the software installation.
        status.update_phase(UpgradePhase.INSTALLING, "Starting software installation. This may take a while...")
        sw = SW(dev)
        install_success = sw.install(package=full_image_path_on_device, validate=True, no_copy=True, progress=True)
        if not install_success:
            raise Exception("The sw.install command returned False. Check device logs for details (e.g., 'show log messages').")

        # STEP 5: Initiate the reboot.
        status.update_phase(UpgradePhase.REBOOTING, "Installation successful. Initiating device reboot...")
        sw.reboot()
        # Connection will be lost at this point.

    except Exception as e:
        status.update_phase(UpgradePhase.FAILED, "Process stopped due to an error.")
        status.error = str(e)
        return status

    finally:
        # Ensure the connection is always closed if it was opened.
        if dev and dev.connected:
            dev.close()

    # STEP 6: Probe the device until it comes back online.
    status.update_phase(UpgradePhase.PROBING, "Waiting for device to respond after reboot...")
    time.sleep(60)  # Grace period for the reboot process to start.

    max_wait, interval, start_time, device_online = 900, 30, time.time(), False
    while time.time() - start_time < max_wait:
        try:
            # First, check for basic network reachability.
            ping_result = subprocess.run(["ping", "-c", "1", "-W", "2", hostname], check=True, capture_output=True)
            if ping_result.returncode == 0:
                logger.info(f"[{hostname}] Ping successful. Attempting full NETCONF connection...")
                # If pingable, attempt a full connection to ensure the NETCONF service is ready.
                with Device(host=hostname, user=username, password=password, auto_probe=True, timeout=20) as probe_dev:
                    logger.info(f"[{hostname}] Device is back online and NETCONF is responsive.")
                    device_online = True
                    break
        except Exception:
            logger.info(f"[{hostname}] Device is not yet fully online. Retrying in {interval}s...")
            time.sleep(interval)

    if not device_online:
        status.update_phase(UpgradePhase.FAILED, "Device did not become reachable after reboot.")
        status.error = "Device was unreachable after the 15-minute timeout period."
        return status

    # STEP 7: Re-connect and verify the final software version.
    status.update_phase(UpgradePhase.VERIFYING, "Device online. Verifying final software version...")
    try:
        with Device(host=hostname, user=username, password=password, auto_probe=True) as final_dev:
            final_ver = final_dev.facts.get("version")
            status.final_version = final_ver
            if final_ver == target_version:
                status.update_phase(UpgradePhase.COMPLETED, f"Upgrade successful. Final version: {final_ver}")
                status.success = True
            else:
                raise Exception(f"Version mismatch after upgrade. Expected '{target_version}', but found '{final_ver}'.")
    except Exception as e:
        status.update_phase(UpgradePhase.FAILED, "Could not verify final version.")
        status.error = str(e)

    return status


# ================================================================================
# SECTION 4: MAIN ORCHESTRATION LOGIC
# --------------------------------------------------------------------------------
# This function manages the overall process, including concurrent execution
# and final reporting.
# ================================================================================

def code_upgrade(host_ips: List[str], username: str, password: str, image_filename: str, target_version: str):
    """Orchestrates the concurrent upgrade of multiple devices and prints a summary."""
    logger.info(f"Starting upgrade process for hosts: {', '.join(host_ips)}")
    final_statuses = []

    # Use a thread pool to run the upgrade function on all hosts concurrently.
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(5, len(host_ips))) as executor:
        future_to_hostname = {
            executor.submit(upgrade_device, h, username, password, image_filename, target_version): h
            for h in host_ips
        }
        for future in concurrent.futures.as_completed(future_to_hostname):
            try:
                final_statuses.append(future.result())
            except Exception as e:
                hostname = future_to_hostname[future]
                logger.error(f"[{hostname}] A critical, unhandled exception occurred in its worker thread: {e}", exc_info=True)
                error_status = DeviceStatus(hostname=hostname, target_version=target_version, phase=UpgradePhase.FAILED, error=str(e))
                final_statuses.append(error_status)

    # --- Print Final Summary Table ---
    console.print("\n\n" + "="*80, style="bold cyan")
    console.print("FINAL UPGRADE SUMMARY", style="bold cyan", justify="center")
    console.print("="*80, style="bold cyan")

    summary_table = Table(show_header=True, header_style="bold magenta", title="Upgrade Results", expand=True)
    summary_table.add_column("Hostname", style="cyan", width=20)
    summary_table.add_column("Final Status", style="white", width=15)
    summary_table.add_column("Initial Version", style="yellow", width=25)
    summary_table.add_column("Final Version", style="yellow", width=25)
    summary_table.add_column("Details", style="white")

    for status in sorted(final_statuses, key=lambda s: s.hostname):
        status_style = "green" if status.success else "red"
        summary_table.add_row(
            status.hostname,
            f"[{status_style}]{status.phase.name}[/{status_style}]",
            status.initial_version or "N/A",
            status.final_version or "N/A",
            status.error or status.message
        )
    console.print(summary_table)


# ================================================================================
# SECTION 5: SCRIPT ENTRY POINT
# --------------------------------------------------------------------------------
# This is the main execution block that runs when the script is called directly.
# It handles parsing and validating command-line arguments.
# ================================================================================

if __name__ == "__main__":
    # Define the command-line interface for the script.
    parser = argparse.ArgumentParser(
        description="Juniper Device Upgrade Automation Script (UI-Driven)",
        formatter_class=argparse.RawTextHelpFormatter # Allows for better help text formatting.
    )
    parser.add_argument("--hostname", required=True, help="Comma-separated list of target device hostnames or IPs.")
    parser.add_argument("--username", required=True, help="The username for device authentication.")
    parser.add_argument("--password", required=True, help="The password for device authentication.")
    parser.add_argument("--image_filename", required=True, help="The exact FILENAME of the software image.\n(e.g., 'junos-vmx-x86-64-21.4R1.12.tgz')\nNOTE: The script assumes this file is in /var/tmp/ on the device.")
    parser.add_argument("--target_version", required=True, help="The target Junos version string to verify against after upgrade.\n(e.g., '21.4R1.12')")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose DEBUG-level logging.")

    args = parser.parse_args()

    # Set logging level based on the verbose flag.
    if args.verbose:
        logger.setLevel(logging.DEBUG)
        logger.debug("Verbose logging enabled.")

    logger.info("Script execution started with validated arguments.")

    try:
        # Sanitize the hostname input.
        host_ips = [ip.strip() for ip in args.hostname.split(",") if ip.strip()]
        if not host_ips:
            raise ValueError("The --hostname argument cannot be empty.")

        # Launch the main orchestration function.
        code_upgrade(
            host_ips=host_ips,
            username=args.username,
            password=args.password,
            image_filename=args.image_filename,
            target_version=args.target_version
        )
        logger.info("Script has completed its execution.")

    except Exception as e:
        logger.fatal(f"A critical error occurred in the main execution block: {e}", exc_info=True)
        sys.exit(1)
