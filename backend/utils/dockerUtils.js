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
      return resolve({ status: "stopped", message: "Lab definition file not found." });

    const command = `docker compose -f "${dockerComposeFilePath}" ps --format json`;
    exec(command, { cwd: labDirectory }, (error, stdout) => {
      // Handle command execution errors
      if (error) return resolve({ status: "stopped", message: `Docker Compose command failed: ${error.message}` });
      if (!stdout.trim()) return resolve({ status: "stopped", message: "No active containers found." });

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
        return resolve({ status: "running", message: "All lab containers are running." });
      if (services.some((s) => s.State === "exited" || s.State === "degraded"))
        return resolve({ status: "failed", message: "Some lab containers are unhealthy." });
      if (services.some((s) => s.State === "starting"))
        return resolve({ status: "starting", message: "Lab containers are starting." });

      resolve({ status: "unknown", message: "Lab status is indeterminate." });
    });
  });
}

// ==============================================================================
// SECTION 3: TEST DISCOVERY
// ==============================================================================
// Execute test discovery for a script using Docker
function executeTestDiscovery(scriptId, environment = "development") {
  return new Promise((resolve, reject) => {
    // Check cache for existing results
    const cacheKey = `${scriptId}-${environment}`;
    const cached = testDiscoveryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) return resolve(cached.data);

    // Load script configuration
    const scriptsCfg = yaml.load(fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"));
    const scriptDef = scriptsCfg.scripts.find((s) => s.id === scriptId);
    if (!scriptDef) return reject(new Error(`Script definition not found for ID: ${scriptId}`));

    // Construct Docker command for test discovery
    const scriptPath = path.join(SCRIPT_MOUNT_POINT_IN_CONTAINER, scriptDef.path, "run.py");
    const args = [
      "run",
      "--rm",
      "-v",
      `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`,
      "vlabs-python-runner",
      "python",
      scriptPath,
      "--list_tests",
      "--environment",
      environment,
    ];

    // Execute Docker command with timeout
    exec(`docker ${args.join(" ")}`, { timeout: 60000 }, (err, stdout) => {
      if (err) return reject(new Error(`Test discovery failed: ${err.message}`));
      try {
        // Parse and cache test discovery results
        const result = { ...JSON.parse(stdout), backend_metadata: { discovery_time: new Date().toISOString() } };
        testDiscoveryCache.set(cacheKey, { data: result, timestamp: Date.now() });
        resolve(result);
      } catch (pErr) {
        reject(new Error(`Failed to parse test discovery output: ${pErr.message}`));
      }
    });
  });
}

// ==============================================================================
// SECTION 4: EXPORTS
// ==============================================================================
module.exports = { getDockerComposeStatus, executeTestDiscovery };
