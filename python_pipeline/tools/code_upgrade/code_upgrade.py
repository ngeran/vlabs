import logging
import os
import subprocess
import time
from typing import Dict, List

from jnpr.junos import Device
from jnpr.junos.exception import (
    ConnectError,
    ConnectRefusedError,
    ConnectTimeoutError,
    ProbeError,
    RpcError,
)
from jnpr.junos.utils.sw import SW
from tabulate import tabulate

from scripts.connect_to_hosts import connect_to_hosts, disconnect_from_hosts
from scripts.utils import load_yaml_file, save_yaml_file

logger = logging.getLogger(__name__)


def display_vendors(vendors: List[Dict]) -> int:
    """Display a menu of vendors and return the user's choice."""
    print("\nSelect a vendor:")
    vendor_table = [[i, vendor["vendor-name"]] for i, vendor in enumerate(vendors, 1)]
    print(tabulate(vendor_table, headers=["Option", "Vendor"], tablefmt="grid"))
    max_retries = 5
    retries = 0
    while retries < max_retries:
        try:
            choice = input(f"Select a vendor (1-{len(vendors)}): ").strip()
            logger.info(f"Raw vendor input received: '{choice}'")
            if not choice:
                logger.error("Empty input received")
                print(
                    f"Invalid choice. Please enter a number between 1 and {
                        len(vendors)
                    }"
                )
                retries += 1
                continue
            choice = int(choice)
            if 1 <= choice <= len(vendors):
                logger.info(f"Valid vendor choice selected: {choice}")
                return choice - 1
            logger.error(f"Choice out of range: {choice}")
            print(f"Invalid choice. Please enter a number between 1 and {len(vendors)}")
            retries += 1
        except ValueError:
            logger.error(f"Non-numeric input: '{choice}'")
            print(f"Invalid choice. Please enter a number between 1 and {len(vendors)}")
            retries += 1
        except EOFError:
            logger.error("EOF received during input")
            print(
                f"Input interrupted. Please enter a number between 1 and {len(vendors)}"
            )
            retries += 1
        except KeyboardInterrupt:
            logger.info("Vendor selection interrupted by user (Ctrl+C)")
            print("\nProgram interrupted by user. Exiting.")
            return None
    logger.error(f"Max retries ({max_retries}) reached in display_vendors")
    print("Too many invalid attempts. Exiting.")
    return None


def display_products(products: List[Dict]) -> int:
    """Display a menu of products and return the user's choice."""
    print("\nSelect a product:")
    product_table = [[i, product["product"]] for i, product in enumerate(products, 1)]
    print(tabulate(product_table, headers=["Option", "Product"], tablefmt="grid"))
    max_retries = 5
    retries = 0
    while retries < max_retries:
        try:
            choice = input(f"Select a product (1-{len(products)}): ").strip()
            logger.info(f"Raw product input received: '{choice}'")
            if not choice:
                logger.error("Empty input received")
                print(
                    f"Invalid choice. Please enter a number between 1 and {
                        len(products)
                    }"
                )
                retries += 1
                continue
            choice = int(choice)
            if 1 <= choice <= len(products):
                logger.info(f"Valid product choice selected: {choice}")
                return choice - 1
            logger.error(f"Choice out of range: {choice}")
            print(
                f"Invalid choice. Please enter a number between 1 and {len(products)}"
            )
            retries += 1
        except ValueError:
            logger.error(f"Non-numeric input: '{choice}'")
            print(
                f"Invalid choice. Please enter a number between 1 and {len(products)}"
            )
            retries += 1
        except EOFError:
            logger.error("EOF received during input")
            print(
                f"Input interrupted. Please enter a number between 1 and {
                    len(products)
                }"
            )
            retries += 1
        except KeyboardInterrupt:
            logger.info("Product selection interrupted by user (Ctrl+C)")
            print("\nProgram interrupted by user. Exiting.")
            return None
    logger.error(f"Max retries ({max_retries}) reached in display_products")
    print("Too many invalid attempts. Exiting.")
    return None


def display_releases(product: Dict) -> Dict:
    """Display available releases for a product and return the selected release dictionary."""
    releases = product.get("releases", [])
    if not releases:
        logger.error(f"No releases found for product {product['product']}")
        print(f"Error: No releases found for product {product['product']}")
        return None
    print("\nAvailable releases:")
    release_table = [[i, release["release"]] for i, release in enumerate(releases, 1)]
    print(tabulate(release_table, headers=["Option", "Release"], tablefmt="grid"))
    max_retries = 5
    retries = 0
    while retries < max_retries:
        try:
            choice = input(f"Select a release (1-{len(releases)}): ").strip()
            logger.info(f"Raw release input received: '{choice}'")
            if not choice:
                logger.error("Empty input received")
                print(
                    f"Invalid choice. Please enter a number between 1 and {
                        len(releases)
                    }"
                )
                retries += 1
                continue
            choice = int(choice)
            if 1 <= choice <= len(releases):
                logger.info(
                    f"Valid release choice selected: {releases[choice - 1]['release']}"
                )
                return releases[choice - 1]
            logger.error(f"Choice out of range: {choice}")
            print(
                f"Invalid choice. Please enter a number between 1 and {len(releases)}"
            )
            retries += 1
        except ValueError:
            logger.error(f"Non-numeric input: '{choice}'")
            print(
                f"Invalid choice. Please enter a number between 1 and {len(releases)}"
            )
            retries += 1
        except EOFError:
            logger.error("EOF received during input")
            print(
                f"Input interrupted. Please enter a number between 1 and {
                    len(releases)
                }"
            )
            retries += 1
        except KeyboardInterrupt:
            logger.info("Release selection interrupted by user (Ctrl+C)")
            print("\nProgram interrupted by user. Exiting.")
            return None
    logger.error(f"Max retries ({max_retries}) reached in display_releases")
    print("Too many invalid attempts. Exiting.")
    return None


def get_host_ips() -> List[str]:
    """Prompt user to read hosts from upgrade_hosts.yml or enter IPs manually."""
    host_ips = []
    upgrade_hosts_file = os.path.join(
        os.getenv("VECTOR_PY_DIR", "/home/nikos/github/ngeran/vector-py"),
        "data/upgrade_hosts.yml",
    )

    try:
        choice = input("Read hosts from upgrade_hosts.yml? (y/n): ").strip().lower()
        logger.info(f"User chose to read from file: {choice}")

        if choice == "y" and os.path.exists(upgrade_hosts_file):
            try:
                hosts_data = load_yaml_file(upgrade_hosts_file)
                host_ips = hosts_data.get("hosts", [])
                logger.info(f"Loaded hosts from {upgrade_hosts_file}: {host_ips}")
                print(f"Loaded hosts: {host_ips}")
            except Exception as e:
                logger.error(f"Error reading {upgrade_hosts_file}: {e}")
                print(f"Error reading {upgrade_hosts_file}: {e}")

        while True:
            ip = input("Enter a host IP (or press Enter to finish): ").strip()
            if not ip:
                break
            if "." in ip and all(part.isdigit() for part in ip.split(".")):
                host_ips.append(ip)
                logger.info(f"Added host IP: {ip}")
            else:
                logger.error(f"Invalid IP address: {ip}")
                print(f"Invalid IP address: {ip}")

        if host_ips:
            try:
                save_yaml_file(upgrade_hosts_file, {"hosts": host_ips})
                logger.info(f"Saved hosts to {upgrade_hosts_file}: {host_ips}")
                print(f"Saved hosts to {upgrade_hosts_file}")
            except Exception as e:
                logger.error(f"Error saving {upgrade_hosts_file}: {e}")
                print(f"Error saving {upgrade_hosts_file}: {e}")

        return host_ips
    except KeyboardInterrupt:
        logger.info("Host input interrupted by user (Ctrl+C)")
        print("\nProgram interrupted by user. Exiting.")
        return []


def get_credentials() -> tuple:
    """Prompt user for username and password."""
    try:
        username = input("Username: ").strip()
        password = input("Password: ").strip()
        logger.info(f"Received credentials - username: {username}")
        return username, password
    except KeyboardInterrupt:
        logger.info("Credential input interrupted by user (Ctrl+C)")
        print("\nProgram interrupted by user. Exiting.")
        return "", ""


def check_image_exists(dev: Device, image_path: str, hostname: str) -> bool:
    """Check if the upgrade image exists on the device."""
    try:
        image_name = image_path.split("/")[-1]
        result = dev.cli("file list /var/tmp/", warning=False)
        if image_name in result.split():
            logger.info(f"Image {image_path} found on {hostname}")
            print(f"✅ Image {image_path} found on {hostname}")
            return True
        logger.error(f"Image {image_path} not found on {hostname}")
        print(f"❌ Image {image_path} not found on {hostname}")
        return False
    except Exception as e:
        logger.error(f"Error checking image on {hostname}: {e}")
        print(f"❌ Error checking image on {hostname}: {e}")
        return False


def check_current_version(dev: Device, hostname: str, target_version: str) -> bool:
    """Check current Junos version and warn about downgrade."""
    logger.info(f"Checking current version on {hostname}")
    print(f"Checking current version on {hostname}...")
    try:
        current_version = dev.facts.get("version")
        if not current_version:
            logger.warning(
                f"No version found in facts on {hostname}. Falling back to CLI."
            )
            version_output = dev.cli("show version", warning=False)
            for line in version_output.splitlines():
                if "JUNOS Software Release" in line:
                    current_version = line.split("[")[-1].strip("]").strip()
                    break
        if current_version:
            logger.info(f"Current Junos version on {hostname}: {current_version}")
            print(f"✅ Current Junos version on {hostname}: {current_version}")
            if current_version == target_version:
                logger.info(
                    f"{hostname} already on target version {
                        target_version
                    }. Skipping upgrade."
                )
                print(
                    f"✅ {hostname} already on target version {
                        target_version
                    }. Skipping upgrade."
                )
                return False
            current_parts = [
                int(x) if x.isdigit() else x
                for x in current_version.replace("-", ".").split(".")
            ]
            target_parts = [
                int(x) if x.isdigit() else x
                for x in target_version.replace("-", ".").split(".")
            ]
            if current_parts > target_parts:
                logger.warning(
                    f"Selected version {target_version} is older than current {
                        current_version
                    } on {hostname}"
                )
                print(
                    f"⚠️ Warning: Selected version {
                        target_version
                    } is older than current {current_version} on {hostname}."
                )
                choice = input("Proceed with downgrade? (y/n): ").strip().lower()
                if choice != "y":
                    logger.info(f"User chose to skip downgrade on {hostname}")
                    print(f"Skipping upgrade for {hostname} to avoid downgrade.")
                    return False
        return True
    except Exception as e:
        logger.warning(
            f"Failed to check Junos version on {hostname}: {
                e
            }. Proceeding with upgrade."
        )
        print(
            f"⚠️ Warning: Failed to check Junos version on {hostname}: {
                e
            }. Proceeding with upgrade."
        )
        return True


def probe_device(
    hostname: str, username: str, password: str, max_wait: int = 900, interval: int = 60
) -> bool:
    """Probe device availability using ping and PyEZ connection until it responds or times out."""
    logger.info(f"Probing {hostname} for availability post-reboot")
    print(f"Probing {hostname} for availability post-reboot...")
    start_time = time.time()
    while time.time() - start_time < max_wait:
        try:
            # Check ping
            ping_result = subprocess.run(
                ["ping", "-c", "1", "-W", "2", hostname],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            if ping_result.returncode != 0:
                logger.debug(f"Ping to {hostname} failed: {ping_result.stderr}")
                print(
                    f"⚠️ {hostname} not yet reachable via ping. Retrying in {
                        interval
                    } seconds..."
                )
                time.sleep(interval)
                continue

            # Check PyEZ connection
            connections = connect_to_hosts([hostname], username, password)
            if connections:
                logger.info(f"{hostname} is reachable and PyEZ connection is up")
                print(f"✅ {hostname} is reachable and PyEZ connection is up")
                disconnect_from_hosts(connections)
                return True
            logger.debug(f"PyEZ connection to {hostname} failed")
            print(
                f"⚠️ {hostname} pingable but PyEZ not ready. Retrying in {
                    interval
                } seconds..."
            )
        except Exception as e:
            logger.debug(f"Probe to {hostname} failed: {e}")
            print(
                f"⚠️ {hostname} not yet fully reachable. Retrying in {
                    interval
                } seconds..."
            )
        time.sleep(interval)
    logger.error(f"{hostname} did not become reachable within {max_wait} seconds")
    print(f"❌ {hostname} did not become reachable within {max_wait} seconds")
    return False


def verify_version(
    hostname: str,
    username: str,
    password: str,
    target_version: str,
    max_attempts: int = 30,
    retry_interval: int = 30,
) -> tuple:
    """
    Connects to a device, retrieves version via PyEZ facts, and compares to the target.
    Uses connect_to_hosts for connection management.

    Args:
        hostname: Device IP address or hostname.
        username: Login username.
        password: Login password.
        target_version: The desired JUNOS version string.
        max_attempts: Maximum number of connection/verification attempts.
        retry_interval: Seconds to wait between retry attempts.

    Returns:
        tuple: (bool: True if version matches target, False otherwise,
                str: Detected version string or None if detection failed,
                str: Error message if verification failed, None otherwise)
    """
    logger.info(
        f"Attempting to verify version on {hostname} against target '{target_version}'"
    )
    print(
        f"Attempting to verify version on {hostname} against target '{
            target_version
        }'..."
    )

    last_exception = None

    for attempt in range(max_attempts):
        connections = []
        try:
            print(f"Attempt {attempt + 1}/{max_attempts}: Connecting to {hostname}...")
            logger.info(
                f"Attempt {attempt + 1}/{max_attempts}: Connecting to {hostname}..."
            )

            # Connect using connect_to_hosts
            connections = connect_to_hosts([hostname], username, password)
            if not connections:
                raise ConnectError(f"{hostname}: Failed to establish connection")

            dev = connections[0]
            if not dev.connected:
                logger.error(
                    f"Attempt {attempt + 1}: Connection to {
                        hostname
                    } reported as not connected"
                )
                raise ConnectError(
                    f"{hostname}: Connection failed (connected flag is False)"
                )

            print(f"✅ Successfully connected to {hostname} (Attempt {attempt + 1})")
            logger.info(
                f"✅ Successfully connected to {hostname} (Attempt {attempt + 1})"
            )

            # Get version using facts
            logger.debug(f"Retrieving facts from {hostname}")
            facts = dev.facts
            current_version = facts.get("version")

            if current_version:
                logger.info(
                    f"Version found on {hostname}: {current_version} (via facts)"
                )
                print(f"✅ Version on {hostname}: {current_version} (via facts)")

                # Compare base version (strip sub-release like .5)
                base_current = (
                    current_version.split(".")[0]
                    if "." in current_version
                    else current_version
                )
                base_target = (
                    target_version.split(".")[0]
                    if "." in target_version
                    else target_version
                )
                match = base_current == base_target
                if match:
                    print(
                        f"✅ Version {current_version} matches target {target_version}."
                    )
                    logger.info(
                        f"Version {current_version} matches target {target_version}."
                    )
                    disconnect_from_hosts(connections)
                    return True, current_version, None
                else:
                    print(
                        f"❌ Version mismatch: Found {current_version}, Target {
                            target_version
                        }."
                    )
                    logger.warning(
                        f"Version mismatch on {hostname}: Found {
                            current_version
                        }, Target {target_version}."
                    )
                    disconnect_from_hosts(connections)
                    return (
                        False,
                        current_version,
                        f"Version mismatch: Found {current_version}, Target {
                            target_version
                        }",
                    )
            else:
                err_msg = "Version key not found in device facts."
                logger.warning(f"{err_msg} on {hostname} (Attempt {attempt + 1})")
                last_exception = ValueError(err_msg)

        except ConnectRefusedError as e:
            last_exception = e
            logger.warning(
                f"Attempt {attempt + 1} failed: Connection refused by {
                    hostname
                }. Device likely still booting or NETCONF not ready."
            )
            print("❌ Connection refused. Retrying...")
        except (ConnectError, ConnectTimeoutError, ProbeError) as e:
            last_exception = e
            logger.warning(
                f"PyEZ Connection/Auth Attempt {attempt + 1} failed for {hostname}: {
                    type(e).__name__
                } - {e}"
            )
            print(
                f"⚠️ PyEZ Connection/Auth Attempt {attempt + 1} failed: {
                    type(e).__name__
                }. Retrying..."
            )
        except RpcError as e:
            last_exception = e
            logger.warning(
                f"PyEZ RPC Error Attempt {attempt + 1} failed for {hostname}: {
                    type(e).__name__
                } - {e}"
            )
            print(f"⚠️ PyEZ RPC Error on Attempt {attempt + 1}. Retrying...")
        except Exception as e:
            last_exception = e
            logger.error(
                f"Unexpected Exception during PyEZ Attempt {attempt + 1} for {
                    hostname
                }: {type(e).__name__} - {e}",
                exc_info=True,
            )
            print(f"⚠️ Unexpected Exception on Attempt {attempt + 1}: {e}. Retrying...")
        finally:
            if connections:
                logger.debug(
                    f"Closing connections to {hostname} after attempt {attempt + 1}"
                )
                disconnect_from_hosts(connections)

        if attempt < max_attempts - 1:
            logger.info(
                f"Waiting {retry_interval} seconds before next attempt ({attempt + 2}/{
                    max_attempts
                }) to verify {hostname}"
            )
            print(f"Retrying in {retry_interval} seconds...")
            time.sleep(retry_interval)
        else:
            logger.error(
                f"All {max_attempts} verification attempts failed for {
                    hostname
                }. Last recorded error: {last_exception}"
            )
            print(f"❌ All {max_attempts} verification attempts failed for {hostname}.")

    error_message = f"Failed to connect and verify version on {hostname} after {
        max_attempts
    } attempts. Last error: {str(last_exception)}"
    return False, None, error_message


def code_upgrade():
    """Perform code upgrade on selected devices."""
    upgrade_status = []
    try:
        logger.info("Starting code_upgrade action")
        print("Starting code upgrade process...")

        # Load upgrade_data.yml
        upgrade_data_file = os.path.join(
            os.getenv("VECTOR_PY_DIR", "/home/nikos/github/ngeran/vector-py"),
            "data/upgrade_data.yml",
        )
        upgrade_data = load_yaml_file(upgrade_data_file)
        if not upgrade_data:
            logger.error("Failed to load upgrade_data.yml")
            print("❌ Error: Failed to load upgrade_data.yml")
            return
        vendors = upgrade_data.get("products", [])
        logger.info(f"Loaded vendors: {[v['vendor-name'] for v in vendors]}")

        # Display vendor menu
        vendor_idx = display_vendors(vendors)
        if vendor_idx is None:
            logger.error("No vendor selected")
            return
        selected_vendor = vendors[vendor_idx]
        logger.info(f"Selected vendor: {selected_vendor['vendor-name']}")
        print(f"Selected vendor: {selected_vendor['vendor-name']}")

        # Aggregate products from switches, firewalls, and routers
        products = []
        for device_type in ["switches", "firewalls", "routers"]:
            products.extend(selected_vendor.get(device_type, []))
        logger.info(f"Loaded products: {[p['product'] for p in products]}")

        # Display product menu
        product_idx = display_products(products)
        if product_idx is None:
            logger.error("No product selected")
            return
        selected_product = products[product_idx]
        logger.info(f"Selected product: {selected_product['product']}")
        print(f"Selected product: {selected_product['product']}")

        # Display release menu
        selected_release = display_releases(selected_product)
        if selected_release is None:
            logger.error("No release selected")
            return
        logger.info(f"Selected release: {selected_release['release']}")
        print(f"Selected release: {selected_release['release']}")

        # Get host IPs
        host_ips = get_host_ips()
        if not host_ips:
            logger.error("No host IPs provided")
            print("❌ Error: No host IPs provided")
            return
        logger.info(f"Host IPs: {host_ips}")
        print(f"Hosts to upgrade: {host_ips}")

        # Get credentials
        username, password = get_credentials()
        if not username or not password:
            logger.error("No credentials provided")
            print("❌ Error: No credentials provided")
            return

        # Connect to hosts
        print("Connecting to devices...")
        connections = connect_to_hosts(host_ips, username, password)
        if not connections:
            logger.error("No devices connected for code upgrade")
            print("❌ Error: No devices connected for code upgrade")
            return
        logger.info(f"Connected to devices: {[dev.hostname for dev in connections]}")

        # Perform upgrade
        image_path = f"/var/tmp/{selected_release['os']}"
        target_version = selected_release["release"]
        for dev in connections:
            hostname = dev.hostname
            status = {"hostname": hostname, "success": False, "error": None}
            try:
                # Set timeouts
                dev.timeout = 600
                dev.open(timeout=300)

                print(f"✅ Successfully logged in to {hostname}")

                # Check image existence
                if not check_image_exists(dev, image_path, hostname):
                    logger.error(
                        f"Skipping upgrade for {hostname} due to missing image"
                    )
                    print(f"❌ Skipping upgrade for {hostname} due to missing image")
                    status["error"] = "Missing image"
                    upgrade_status.append(status)
                    dev.close()
                    continue

                # Check current version
                if not check_current_version(dev, hostname, target_version):
                    status["success"] = True
                    upgrade_status.append(status)
                    dev.close()
                    continue

                # Perform upgrade
                sw = SW(dev)
                print(
                    f"Installing software with validation (no reboot) on {hostname}..."
                )
                try:
                    success = sw.install(
                        package=image_path, validate=True, no_copy=True, progress=True
                    )
                    if success:
                        print("✅ Installation validated successfully. Rebooting...")
                        sw.reboot()
                        logger.info(f"Reboot initiated on {hostname}")
                        print(f"✅ Reboot initiated on {hostname}")
                    else:
                        print(
                            "❌ Installation did not complete successfully. No reboot issued."
                        )
                        logger.error(f"Software upgrade failed on {hostname}")
                        status["error"] = "Installation failed"
                        upgrade_status.append(status)
                        dev.close()
                        continue
                except ConnectError as e:
                    logger.error(f"Connection error on {hostname}: {e}")
                    print(f"❌ Connection error: {e}")
                    status["error"] = f"Connection error: {e}"
                    upgrade_status.append(status)
                    dev.close()
                    continue
                except RpcError as e:
                    logger.error(f"RPC error during install on {hostname}: {e}")
                    print(f"❌ RPC error during install: {e}")
                    status["error"] = f"RPC error: {e}"
                    upgrade_status.append(status)
                    dev.close()
                    continue
                except Exception as e:
                    logger.error(f"Unexpected error on {hostname}: {e}")
                    print(f"❌ Unexpected error: {e}")
                    status["error"] = f"Unexpected error: {e}"
                    upgrade_status.append(status)
                    dev.close()
                    continue

                # Wait for reboot and probe device
                print(f"Device {hostname} is rebooting. Waiting for availability...")
                time.sleep(60)  # Initial delay to allow reboot to start
                if dev.connected:
                    dev.close()

                # Probe device until available
                if not probe_device(
                    hostname, username, password, max_wait=900, interval=60
                ):
                    logger.error(
                        f"Failed to confirm {hostname} availability after reboot"
                    )
                    print(f"❌ Failed to confirm {hostname} availability after reboot")
                    status["error"] = "Device not reachable after reboot"
                    upgrade_status.append(status)
                    continue

                # Verify version
                success, current_version, error = verify_version(
                    hostname, username, password, target_version
                )
                if success:
                    logger.info(
                        f"Upgrade successful on {hostname}. Version: {current_version}"
                    )
                    print(
                        f"✅ Upgrade successful on {hostname}. Version: {
                            current_version
                        }"
                    )
                    status["success"] = True
                else:
                    logger.error(f"Version verification failed on {hostname}: {error}")
                    print(f"❌ Version verification failed on {hostname}: {error}")
                    status["error"] = f"Version verification failed: {error}"
                upgrade_status.append(status)

            except Exception as e:
                logger.error(f"Error upgrading {hostname}: {e}")
                print(f"❌ Error upgrading {hostname}: {e}")
                status["error"] = str(e)
                upgrade_status.append(status)
                if dev.connected:
                    dev.close()

        disconnect_from_hosts(connections)

        # Summarize upgrade status
        successful = [s for s in upgrade_status if s["success"]]
        failed = [s for s in upgrade_status if not s["success"]]
        logger.info(
            f"Upgrade summary: {len(successful)} successful, {len(failed)} failed"
        )
        print("\nUpgrade Summary:")
        print(f"Successful: {len(successful)} device(s)")
        for s in successful:
            print(f"  - {s['hostname']}")
        print(f"Failed: {len(failed)} device(s)")
        for s in failed:
            print(f"  - {s['hostname']}: {s['error']}")

        if failed:
            logger.warning("Code upgrade process completed with failures")
            print("Code upgrade process completed with failures.")
        else:
            logger.info("Code upgrade process completed successfully")
            print("Code upgrade process completed successfully.")

    except KeyboardInterrupt:
        logger.info("Code upgrade interrupted by user (Ctrl+C)")
        print("\nProgram interrupted by user. Exiting.")
    except Exception as e:
        logger.error(f"Error in code_upgrade: {e}")
        print(f"❌ Error: {e}")
