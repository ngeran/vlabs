---

### Part 1: How to Add and Execute a New Python Script

This is the standard operating procedure for a developer to contribute a new script to your platform. This should be saved as `CONTRIBUTING.md` or a similar name in your project's repository.

***

# How to Add a New Python Script

This guide outlines the step-by-step process for creating a new Python script and integrating it into the vLabs platform.

### Step 1: Create the Script Directory

All scripts must live in their own directory inside the `python_pipeline/` folder. The name of this directory becomes the script's unique `id`.

1.  Choose a descriptive, unique ID for your script (e.g., `get_arp_table`).
2.  Create a new directory: `python_pipeline/tools/get_arp_table/`

Your directory structure should look like this:
```
python_pipeline/
└── tools/
    ├── jsnapy_runner/
    └── get_arp_table/  <-- Your new script's home
```

### Step 2: Write the Python Script (`run.py`)

Inside your new directory, create a file named `run.py`. This script **must** adhere to the following contract to work with the UI:

*   **Use `argparse`**: It must parse command-line arguments.
*   **Standard Arguments**: It must accept `--hostname`, `--username`, and `--password` for execution runs, and `--list_tests` for discovery if applicable.
*   **Output Streams**:
    *   Use `print(..., file=sys.stderr)` for all progress messages, logs, and human-readable tables.
    *   The **very last thing** printed to `print(...)` (i.e., `stdout`) **must** be a single JSON object.
*   **Graceful Exits**: The script **must** `sys.exit(0)` even if an operational error (like a connection failure) occurs. The failure should be communicated in the final JSON output.

**`run.py` Template:**
```python
# python_pipeline/tools/get_arp_table/run.py
import argparse, sys, json

def main():
    try:
        # 1. Define Arguments
        parser = argparse.ArgumentParser(description="A brief description of your script.")
        parser.add_argument("--hostname", help="Target hostname(s), comma-separated.")
        parser.add_argument("--username", help="Device username.")
        parser.add_argument("--password", help="Device password.")
        # Add any other custom arguments your script needs
        parser.add_argument("--vlan", help="Optional VLAN ID to filter ARP table.")
        args = parser.parse_args()

        # 2. Your Script's Core Logic
        # (Connect to device, get data, etc.)
        print(f"--- Connecting to {args.hostname}... ---", file=sys.stderr)
        
        # 3. Format the final result as a Python dictionary
        final_result = {
            "status": "completed",
            "results_by_host": [{
                "hostname": args.hostname,
                "status": "success",
                "test_results": [{
                    "title": f"ARP Table for VLAN {args.vlan or 'all'}",
                    "headers": ["MAC Address", "IP Address", "Interface"],
                    "data": [
                        {"MAC Address": "00:11:22:AA:BB:CC", "IP Address": "10.0.0.1", "Interface": "ge-0/0/1"},
                        {"MAC Address": "00:11:22:AA:BB:DD", "IP Address": "10.0.0.2", "Interface": "ge-0/0/2"}
                    ]
                }]
            }]
        }

        # 4. Print the final result to stdout as a JSON string
        print(json.dumps(final_result, indent=2))

    except Exception as e:
        # On any failure, print a structured JSON error and exit cleanly
        error_output = {"status": "error", "message": str(e)}
        print(json.dumps(error_output, indent=2))
        sys.exit(0)

if __name__ == "__main__":
    main()
```

### Step 3: Create the Script's Metadata (`metadata.yml`)

This file tells the UI what options to display in the sidebar. Create a `metadata.yml` file in your script's directory.

**`metadata.yml` Template:**
```yaml
# python_pipeline/tools/get_arp_table/metadata.yml

# Parameters that the UI should render as form fields in the sidebar.
parameters:
  - name: "vlan"
    label: "VLAN ID"
    type: "number" # Can be 'text', 'number', 'boolean' (checkbox), or 'enum' (dropdown)
    description: "Specify a VLAN ID to filter the ARP table."
    required: false
    placeholder: "e.g., 100"

# (Optional) Capabilities for advanced features
capabilities:
  # Set to true if this script supports the --list_tests flag
  dynamicDiscovery: false 
```

### Step 4: Register the Script (`scripts.yaml`)

Finally, add an entry for your new script in the main `python_pipeline/scripts.yaml` file.

```yaml
# python_pipeline/scripts.yaml
scripts:
  - id: tools/jsnapy_runner
    # ... existing scripts ...

  # Add your new script here
  - id: tools/get_arp_table
    displayName: "Get ARP Table"
    description: "Retrieves and displays the ARP table from a network device."
    category: "Network Troubleshooting"
    scriptFile: "run.py"
    metadataFile: "metadata.yml"
```
**Important:** The `id` **must** match the directory path you created in Step 1.

### Step 5: Test and Verify

1.  **Restart the Backend**: Stop and restart your `node server.js`.
2.  **Refresh the Frontend**: Refresh the web UI in your browser.
3.  **Find Your Script**: Use the category filter to find "Network Troubleshooting". Your "Get ARP Table" script should appear in the dropdown.
4.  **Check Sidebar Options**: When you select your script, the "VLAN ID" input field should appear in the "Script Options" section of the sidebar.
5.  **Execute**: Fill in the device credentials, run the script, and verify that the output is rendered correctly.

***

### Part 2: Making the CI/CD Pipeline Even Better

Now that we have a formal process, we can build a CI/CD pipeline around it to enforce quality and automate deployment. Here is a strategic roadmap from foundational checks to a full automation engine.

#### Phase 1: Foundational Quality Checks (The "Safety Net")

This is the most critical phase. The goal is to automatically prevent common errors from ever being merged into your `main` branch. These checks should run on every Pull Request.

1.  **Code Linting**:
    *   **Python**: Use `flake8` or `black` to automatically check for code style and simple errors in all `*.py` files.
    *   **JavaScript/React**: Use `eslint` to enforce code style and catch common bugs in the frontend `*.jsx` files.

2.  **Configuration Validation (Most Important!)**:
    *   Create a simple Python script (e.g., `scripts/validate_config.py`) that runs in your CI pipeline. This script would:
        *   Load `python_pipeline/scripts.yaml`.
        *   For **every entry**, it must verify:
            *   The `id` field exists.
            *   The directory specified by the `id` (`python_pipeline/<id>`) actually exists.
            *   The `scriptFile` listed (`<id>/<scriptFile>`) actually exists.
            *   The `metadataFile` listed (`<id>/<metadataFile>`) actually exists.
    *   If any of these checks fail, the CI pipeline fails, blocking the PR and telling the developer exactly what to fix. This **eliminates** the entire class of "File not found" errors we debugged.

#### Phase 2: Automated Testing (The "Confidence Builder")

This phase adds deeper testing to ensure that scripts not only exist but also behave correctly.

1.  **Python Unit Tests**:
    *   For each new Python script, a corresponding `test_run.py` should be created.
    *   Use `pytest` and `unittest.mock` to test the script's logic *without* connecting to a real device. You can mock the `Device` object and test things like: "If I give the script this fake XML data, does it parse it into the correct JSON structure?"

2.  **Frontend Component Tests**:
    *   Use `Jest` and `React Testing Library` to test individual React components. For example: "Does the `DeviceAuthFields` component correctly switch between manual and inventory mode when the button is clicked?"

3.  **End-to-End (E2E) Testing**:
    *   Use a framework like **Cypress** or **Playwright**.
    *   The CI pipeline would start the entire application stack (backend, frontend).
    *   The E2E test would then control a real browser to:
        1.  Navigate to the Python Script Runner page.
        2.  Select your new "Get ARP Table" script from the dropdown.
        3.  Fill in the `hostname` and credentials.
        4.  Click the "Run Script" button.
        5.  **Assert that the output table appears correctly in the UI.**

#### Phase 3: Automated Build & Deployment (The "Efficiency Engine")

This phase automates the release process after a Pull Request is successfully tested and merged.

1.  **Automated Docker Builds**:
    *   Configure your CI/CD platform (GitHub Actions, GitLab CI, Jenkins) to, upon a merge to the `main` branch:
        *   Build the `vlabs-backend` Docker image.
        *   Build the `vlabs-python-runner` Docker image.
        *   Tag them with a version number (e.g., `v1.2.3`) and `:latest`.
        *   Push these new images to a container registry (Docker Hub, AWS ECR, Google GCR).

2.  **Continuous Deployment**:
    *   **For Staging**: After the images are pushed, automatically trigger a deployment to your staging/testing server. This could be a simple script on the server that runs `docker-compose pull && docker-compose up -d`.
    *   **For Production**: The deployment to production could be a manual "click-to-deploy" action in your CI/CD tool, or it could be fully automated after the staging deployment is verified.

By implementing these phases, you'll create a highly professional, resilient, and efficient workflow that allows your team to contribute new functionality with high confidence and minimal manual intervention.

### Overview of the Process

The system is designed to distinguish between two types of scripts based on the `scripts.yaml` manifest:

1.  **Template-Based Scripts (`templateGeneration: true`):** These scripts use a two-step workflow: "1. Generate Config" -> "2. Apply to Device". They use the `/api/templates/apply` endpoint and the `useTemplateApplication` hook.
2.  **Generic Streaming Scripts (no `templateGeneration` capability):** These scripts use a simpler one-step workflow: "Run Script". They use the dedicated `/api/scripts/run-stream` endpoint and the `useScriptRunnerStream` hook, which is exactly what we want for our new script.

Our goal is to create a script that fits into the second category.

---

### Step 1: Create the Script's Directory and Files

First, we need to create the directory structure and the Python script itself. Following the existing pattern, we'll place it inside the `tools/` directory.

1.  **Create the Directory:**
    Create a new folder named `health_check` inside the `python_pipeline/tools/` directory.

    ```bash
    mkdir -p python_pipeline/tools/health_check
    ```

2.  **Create the Metadata File (`metadata.yml`):**
    This file provides additional, more detailed metadata that isn't required in the main `scripts.yaml`. It's good practice to include it.

    Create `python_pipeline/tools/health_check/metadata.yml`:
    ```yaml
    # python_pipeline/tools/health_check/metadata.yml
    name: "Device Health Check"
    version: "1.0.0"
    author: "Your Name"
    description: "A comprehensive script to check device health, including CPU, memory, and interface status. Streams output in real-time."
    parameters:
      - name: "target_host"
        label: "Target Hostname or IP"
        type: "string"
        required: true
        description: "The device to run the health check against."
      - name: "check_level"
        label: "Check Level"
        type: "string"
        required: false
        placeholder: "standard"
        description: "Specify 'standard' or 'deep' for the check level. Defaults to 'standard'."
    ```

3.  **Create the Python Script (`run.py`):**
    This is the core logic. The key to making it WebSocket-capable is to print output incrementally and ensure the output buffer is flushed. The backend's `python -u` flag helps with this, but using `flush=True` in your Python `print` statements is a robust way to guarantee it.

    Create `python_pipeline/tools/health_check/run.py`:
    ```python
    #!/usr/bin/env python3
    
    import time
    import sys
    import argparse
    
    def run_health_check(target_host, check_level):
        """
        Simulates a health check script that streams its output.
        """
        print(f"--- Starting Health Check for {target_host} (Level: {check_level}) ---", flush=True)
    
        # Step 1: Pinging device
        print("\n[1/4] Checking device reachability...", flush=True)
        time.sleep(1)
        print(f"  > PING {target_host}: 56 data bytes", flush=True)
        time.sleep(0.5)
        print(f"  > 64 bytes from {target_host}: icmp_seq=0 ttl=64 time=1.23 ms", flush=True)
        print("  > SUCCESS: Device is reachable.", flush=True)
    
        # Step 2: Checking CPU
        print("\n[2/4] Checking CPU utilization...", flush=True)
        time.sleep(1.5)
        print("  > CPU load: 15%", flush=True)
        print("  > SUCCESS: CPU utilization is within normal parameters.", flush=True)
    
        # Step 3: Checking Memory
        print("\n[3/4] Checking memory usage...", flush=True)
        time.sleep(1.5)
        print("  > Memory usage: 45%", flush=True)
        # Example of printing to stderr for warnings or non-critical errors
        print("  > WARNING: High memory watermark reached in the last 24 hours.", file=sys.stderr, flush=True)
        print("  > SUCCESS: Current memory usage is acceptable.", flush=True)
    
        # Step 4: Checking Interfaces
        if check_level == 'deep':
            print("\n[4/4] Performing deep interface check...", flush=True)
            time.sleep(1)
            print("  > Checking ge-0/0/0... UP", flush=True)
            time.sleep(0.5)
            print("  > Checking ge-0/0/1... UP", flush=True)
            time.sleep(0.5)
            print("  > Checking ge-0/0/2... DOWN", file=sys.stderr, flush=True)
            print("  > ALERT: Interface ge-0/0/2 is down!", file=sys.stderr, flush=True)
        else:
            print("\n[4/4] Performing standard interface check...", flush=True)
            time.sleep(1)
            print("  > All critical interfaces are UP.", flush=True)
    
        print("\n--- Health Check Complete ---", flush=True)
    
    
    if __name__ == "__main__":
        parser = argparse.ArgumentParser(description="Device Health Check Script")
        # These arguments will be passed from the frontend via the DeviceAuthFields component
        parser.add_argument("--hostname", help="Target device hostname or IP", required=True)
        parser.add_argument("--check_level", help="Level of check ('standard' or 'deep')", default="standard")
        # Add other common args even if not used, to prevent errors
        parser.add_argument("--username", help="Device username")
        parser.add_argument("--password", help="Device password")
        parser.add_argument("--inventory", help="Inventory file path")
        
        args = parser.parse_args()
    
        # The script gets the target from the --hostname parameter
        run_health_check(args.hostname, args.check_level)
    ```

### Step 2: Register the New Script in the Manifest

Now, you must add an entry for your new script in `python_pipeline/scripts.yaml`. This is how the frontend discovers it and knows how to handle it.

1.  **Edit `scripts.yaml`:**
    Open the file and add a new entry to the `scripts` list.

    ```yaml
    # python_pipeline/scripts.yaml
    
    scripts:
      # ... [existing script entries for JSNAPy and Device Configuration] ...
    
      # --- NEW: DEVICE HEALTH CHECK SCRIPT ---
      - id: "tools/health_check"               # MUST match the directory path
        displayName: "Device Health Check"       # Name shown in the UI dropdown
        description: "Runs a real-time health check on a device, streaming output."
        category: "Diagnostics"                # Used for filtering in the UI
        tags:
          - diagnostics
          - health_check
          - streaming
          - real-time
        scriptFile: "run.py"                   # The executable script in the directory
        metadataFile: "metadata.yml"           # The corresponding metadata file
        # CRITICAL: We DO NOT add a 'capabilities' block.
        # The absence of 'capabilities.templateGeneration: true' tells the frontend
        # to use the generic, single-button "Run Script" streaming workflow.
    ```

**Key Insight:** The most important part of this step is what you *don't* add. By omitting the `capabilities.templateGeneration` flag, you signal to `PythonScriptRunner.jsx` that this is a generic script, which correctly routes it to the `handleRunOtherScript` function and the `useScriptRunnerStream` hook.

### Step 3: Verify Backend and Frontend Integration (No Code Changes Needed)

The beauty of the existing system is that **no changes are required in `server.js` or `PythonScriptRunner.jsx`**. The code is already built to handle this case generically.

*   **Backend (`server.js`):** The `/api/scripts/run-stream` endpoint is generic. It takes any `scriptId`, finds its path, and executes it, streaming `stdout`/`stderr` over the WebSocket connection associated with the `wsClientId`.
*   **Frontend (`PythonScriptRunner.jsx`):** The component's logic will automatically adapt:
    1.  It will fetch the new script from `/api/scripts/list`.
    2.  When you select "Device Health Check" from the dropdown, it will check `selectedScript.capabilities?.templateGeneration`.
    3.  This will be `undefined` (and thus falsy).
    4.  The component will therefore render the single, blue **"Run Script"** button instead of the two-step green and blue buttons.
    5.  Clicking this button triggers `handleRunOtherScript`, which uses the `useScriptRunnerStream` hook to correctly call the streaming backend endpoint.

### Step 4: Run and Test

You are now ready to run your new script.

1.  **Restart Your Application:** Make sure the backend server reloads the new `scripts.yaml` file. If you are using a tool like `nodemon`, this should happen automatically. Otherwise, restart the server.
2.  **Open the UI:** Navigate to the Script Runner page in your browser.
3.  **Select the Script:** Open the "Select Script" dropdown. You should now see **"Device Health Check"**. The description you provided will appear below it.
4.  **Fill in Parameters:** The `DeviceAuthFields` component will appear. Enter a target hostname (e.g., `192.168.1.1`). The other parameters from your `run.py`'s `argparse` will also be available if you were to build a UI for them.
5.  **Run the Script:** Click the blue **"Run Script"** button.
6.  **Watch the Real-Time Output:** The `StreamedOutputDisplay` panel will appear, and you will see the output from your Python script being printed line-by-line, exactly as the `time.sleep()` calls dictate. Lines printed to `stderr` will appear in the red error panel.

Congratulations! You have successfully added a new, WebSocket-enabled Python script to the platform, leveraging the existing generic streaming architecture.
