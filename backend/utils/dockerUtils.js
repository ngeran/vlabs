// ==============================================================================
// FILE: utils/dockerUtils.js
// ==============================================================================
// Overview:
// This module provides utility functions for Docker-related operations in the Vlabs
// backend. It handles test discovery for scripts and checks Docker Compose statuses
// for lab management, interacting with Docker containers via CLI commands.
//
// Key Features:
// - Executes test discovery for scripts using Docker containers.
// - Caches test discovery results to reduce redundant calls.
// - Retrieves Docker Compose service statuses for labs.
//
// Dependencies:
// - child_process: Node.js module for executing Docker commands.
// - path: Node.js module for path manipulation.
// - js-yaml: Parses YAML configuration files.
// - ../config/paths: Path constants and cache state.
//
// How to Use:
// 1. Import functions: `const { executeTestDiscovery } = require('./utils/dockerUtils');`.
// 2. Use `executeTestDiscovery` for script test discovery in routes.
// 3. Use `getDockerComposeStatus` for lab status checks.
// 4. Ensure Docker is installed and `vlabs-python-runner` image is available.
// 5. Verify volume mounts in `config/paths` are correctly configured.
//
// API Endpoints:
// None directly; supports routes like `/api/scripts/discover-tests` and `/api/labs/*`.

// ==============================================================================
// SECTION 1: IMPORTS
// ==============================================================================
const { exec } = require("child_process"); // Execute shell commands
const path = require("path"); // Path manipulation
const fs = require("fs"); // File system operations
const yaml = require("js-yaml"); // YAML parsing
const {
  PUBLIC_MOUNT_PATH,
  SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER,
  PYTHON_PIPELINE_PATH_ON_HOST,
  SCRIPT_MOUNT_POINT_IN_CONTAINER,
  testDiscoveryCache,
  CACHE_DURATION,
} = require("../config/paths"); // Path constants and cache

// ==============================================================================
// SECTION 2: DOCKER COMPOSE STATUS
// ==============================================================================
// Check status of Docker Compose services for a lab
function getDockerComposeStatus(labPath) {
  return new Promise((resolve) => {
    const labDirectory = path.join(PUBLIC_MOUNT_PATH, labPath);
    const dockerComposeFilePath = path.join(labDirectory, "docker-compose.yml");
    // Check if docker-compose.yml exists
    if (!fs.existsSync(dockerComposeFilePath))
      return resolve({
        status: "stopped",
        message: "Lab definition file not found.",
      });

    const command = `docker compose -f "${dockerComposeFilePath}" ps --format json`;
    exec(command, { cwd: labDirectory }, (error, stdout) => {
      // Handle command execution errors
      if (error)
        return resolve({
          status: "stopped",
          message: `Docker Compose command failed: ${error.message}`,
        });
      if (!stdout.trim())
        return resolve({
          status: "stopped",
          message: "No active containers found.",
        });

      // Parse JSON output from Docker Compose
      let services = stdout
        .trim()
        .split("\n")
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      // Determine lab status based on service states
      if (services.every((s) => s.State === "running"))
        return resolve({
          status: "running",
          message: "All lab containers are running.",
        });
      if (services.some((s) => s.State === "exited" || s.State === "degraded"))
        return resolve({
          status: "failed",
          message: "Some lab containers are unhealthy.",
        });
      if (services.some((s) => s.State === "starting"))
        return resolve({
          status: "starting",
          message: "Lab containers are starting.",
        });

      resolve({ status: "unknown", message: "Lab status is indeterminate." });
    });
  });
}
// ==============================================================================
// SECTION 3: TEST DISCOVERY (CORRECTED VERSION)
// ==============================================================================
function executeTestDiscovery(scriptId, environment = "development") {
  // --> CHANGE 1: We now only use `resolve` to handle all outcomes.
  return new Promise((resolve) => {
    const cacheKey = `${scriptId}-${environment}`;
    const cached = testDiscoveryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(
        `[dockerUtils] Returning cached test discovery for '${scriptId}'.`,
      );
      return resolve({ success: true, ...cached.data });
    }

    const scriptsCfg = yaml.load(
      fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"),
    );
    const scriptDef = scriptsCfg.scripts.find((s) => s.id === scriptId);
    if (!scriptDef) {
      // If script is not found, resolve with a failure message.
      return resolve({
        success: false,
        message: `Script definition not found for ID: ${scriptId}`,
      });
    }

    const scriptPath = path.join(
      SCRIPT_MOUNT_POINT_IN_CONTAINER,
      scriptDef.path,
      "run.py",
    );
    const args = [
      "run",
      "--rm",
      "-v",
      `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`,
      "vlabs-python-runner",
      "python",
      scriptPath,
      "--list_tests",
    ];

    console.log(`[dockerUtils] Executing command: docker ${args.join(" ")}`);

    exec(
      `docker ${args.join(" ")}`,
      { timeout: 60000 },
      (err, stdout, stderr) => {
        // --> CHANGE 2: Handle the error case by resolving with success: false.
        if (err) {
          // We capture `stderr` from the Python script, which contains the real error.
          console.error(
            `[dockerUtils] Test discovery script failed. Stderr: ${stderr}`,
          );
          return resolve({ success: false, message: stderr || err.message });
        }

        // --> CHANGE 3: Wrap the success case in a try/catch for JSON parsing.
        try {
          const result = JSON.parse(stdout);
          const dataToCache = {
            ...result,
            backend_metadata: { discovery_time: new Date().toISOString() },
          };
          testDiscoveryCache.set(cacheKey, {
            data: dataToCache,
            timestamp: Date.now(),
          });
          // Resolve with a success: true flag.
          resolve({ success: true, ...dataToCache });
        } catch (pErr) {
          // If the Python script returns something that isn't valid JSON.
          console.error(
            `[dockerUtils] Failed to parse JSON from discovery script. Stdout: ${stdout}`,
          );
          resolve({
            success: false,
            message: `Failed to parse test discovery output: ${pErr.message}`,
          });
        }
      },
    );
  });
}
// ==============================================================================
// SECTION 4: EXPORTS
// ==============================================================================
module.exports = { getDockerComposeStatus, executeTestDiscovery };
