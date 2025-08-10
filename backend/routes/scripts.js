// ==============================================================================
// FILE: routes/scripts.js
// ==============================================================================
// Overview:
// This module defines API routes for script-related operations in the Vlabs backend.
// It handles listing scripts, discovering tests, and executing scripts with real-time
// WebSocket updates, supporting network automation tasks in a Dockerized environment.
//
// Key Features:
// - Lists all scripts with their metadata.
// - Discovers JSNAPy tests for a given script.
// - Executes scripts with parameter processing and real-time output streaming.
// - Supports inventory file parsing to extract hostnames.
//
// Dependencies:
// - express: Web framework for routing.
// - js-yaml: Parses YAML configuration files.
// - fs: Node.js module for file system operations.
// - path: Node.js module for path manipulation.
// - child_process: Node.js module for spawning Docker processes.
// - ../config/paths: Path constants for script directories.
// - ../utils/dockerUtils: Test discovery function.
// - ../utils/scriptUtils: Metadata and utility functions.
// - ../utils/executeWithRealTimeUpdates: Utility for real-time script execution.
//
// How to Use:
// 1. Mount in server.js: `app.use('/api/scripts', require('./routes/scripts'));`.
// 2. Ensure WebSocket clients are stored in `app.locals.clients`.
// 3. Test endpoints with tools like Postman or curl.
// 4. Verify Docker image `vlabs-python-runner` and volume mounts are configured.
// 5. Monitor logs for script execution details.
//
// API Endpoints:
// - GET /api/scripts/list: Lists all scripts with metadata.
// - POST /api/scripts/discover-tests: Discovers JSNAPy tests for a script.
// - POST /api/scripts/run: Executes a script with parameters and WebSocket updates.
// - POST /api/scripts/run-stream: Executes a script with detailed streaming logic.

// ==============================================================================
// SECTION 1: IMPORTS
// ==============================================================================
const express = require("express"); // Web framework for routing
const router = express.Router(); // Express router instance
const yaml = require("js-yaml"); // YAML parsing
const fs = require("fs"); // File system operations
const path = require("path"); // Path manipulation
const { spawn } = require("child_process"); // Spawn Docker processes
const {
  SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER,
  PYTHON_PIPELINE_PATH_ON_HOST,
  SCRIPT_MOUNT_POINT_IN_CONTAINER,
  PYTHON_PIPELINE_MOUNT_PATH,
} = require("../config/paths"); // Path constants
const { executeTestDiscovery } = require("../utils/dockerUtils"); // Test discovery utility
const {
  getScriptIndividualMetadata,
  generateUniqueId,
  safeJsonParse,
} = require("../utils/scriptUtils"); // Script utilities
const {
  executeWithRealTimeUpdates,
} = require("../utils/executeWithRealTimeUpdates.js"); // Real-time execution utility

// ==============================================================================
// SECTION 2: LIST SCRIPTS
// ==============================================================================
// GET /api/scripts/list
// List all scripts with their metadata from scripts.yaml
router.get("/list", (req, res) => {
  try {
    // Load scripts configuration
    const config = yaml.load(
      fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"),
    );
    if (!config || !Array.isArray(config.scripts)) {
      console.error(
        `[BACKEND] Scripts configuration malformed or missing at: ${SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER}`,
      );
      return res
        .status(500)
        .json({ success: false, message: "Scripts configuration malformed." });
    }
    // Map scripts with their metadata
    const scripts = config.scripts
      .map((scriptDef) => {
        const metadata = getScriptIndividualMetadata(scriptDef);
        return metadata ? { ...scriptDef, ...metadata } : null;
      })
      .filter(Boolean);
    console.log(
      `[BACKEND] Found scripts: ${scripts.map((s) => s.id).join(", ")}`,
    );
    res.json({ success: true, scripts });
  } catch (e) {
    console.error(`[BACKEND] Failed to load script list: ${e.message}`);
    res
      .status(500)
      .json({
        success: false,
        message: `Failed to load script list: ${e.message}`,
      });
  }
});

// ==============================================================================
// SECTION 3: DISCOVER TESTS (ENHANCED VERSION)
// ==============================================================================
// POST /api/scripts/discover-tests
// Discover JSNAPy tests for a script with robust error handling.
router.post("/discover-tests", async (req, res) => {
  const { scriptId, environment = "development" } = req.body;
  console.log(
    `[BACKEND] Received request to discover tests for scriptId: '${scriptId}'`,
  );

  // 1. INPUT VALIDATION
  if (!scriptId) {
    // Bad Request: The client did not provide the required field.
    return res
      .status(400)
      .json({
        success: false,
        message: "scriptId is required in the request body.",
      });
  }

  try {
    // 2. EXECUTION AND RESPONSE HANDLING
    // We assume `executeTestDiscovery` is improved to return an object with a `success` flag
    // and specific error details, rather than just throwing a generic error.
    const discoveryResult = await executeTestDiscovery(scriptId, environment);

    if (!discoveryResult.success) {
      // The discovery script ran but reported a failure (e.g., file not found, YAML error).
      console.error(
        `[BACKEND] Test discovery for '${scriptId}' failed with a known error: ${discoveryResult.message}`,
      );

      // 3. SPECIFIC ERROR RESPONSES
      // Send a specific status code based on the error type for better frontend handling.
      // A 400-level error is appropriate here because the issue is with the input data (the YAML file), not the server itself.
      return res.status(400).json({
        success: false,
        message:
          discoveryResult.message ||
          "Failed to discover tests due to a configuration error.", // Use the detailed message from the script.
      });
    }

    // Success case: The script ran and found the tests.
    console.log(
      `[BACKEND] Successfully discovered tests for scriptId: '${scriptId}'.`,
    );
    res.json({ success: true, ...discoveryResult });
  } catch (error) {
    // 4. UNEXPECTED ERROR HANDLING
    // This block now catches truly unexpected errors, like Docker daemon not running,
    // permission issues, or a bug in the `executeTestDiscovery` function itself.
    console.error(
      `[BACKEND] An unexpected system error occurred during test discovery for '${scriptId}':`,
      error,
    );

    // A 500 Internal Server Error is appropriate for unexpected failures.
    res.status(500).json({
      success: false,
      message:
        "A critical server error occurred during test discovery. Please check the backend logs for details.",
    });
  }
});
// ==============================================================================
// SECTION 4: RUN SCRIPT
// ==============================================================================
// POST /api/scripts/run
// Execute a script with parameters and stream updates via WebSocket
router.post("/run", async (req, res) => {
  const { scriptId, parameters, wsClientId } = req.body;
  const clients = req.app.locals.clients; // Access WebSocket clients
  console.log(
    `[DEBUG][API] /api/scripts/run called for scriptId: ${scriptId} with wsClientId: ${wsClientId}`,
  );
  console.log(`[DEBUG][API] Original parameters:`, parameters);

  // Validate WebSocket client
  if (!wsClientId) {
    return res
      .status(400)
      .json({
        success: false,
        message: "WebSocket Client ID is required for real-time updates.",
      });
  }
  const clientWs = clients.get(wsClientId);
  if (!clientWs || clientWs.readyState !== 1) {
    return res
      .status(404)
      .json({
        success: false,
        message: "WebSocket client not found or is not open.",
      });
  }

  // Validate script ID
  if (!scriptId) {
    return res
      .status(400)
      .json({ success: false, message: "scriptId is required." });
  }
  const config = yaml.load(
    fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"),
  );
  const scriptDef = config.scripts.find((s) => s.id === scriptId);
  if (!scriptDef) {
    return res
      .status(404)
      .json({ success: false, message: "Script definition not found." });
  }

  // Process inventory file to extract hostnames
  let processedParameters = { ...parameters };
  if (parameters && parameters.inventory_file) {
    try {
      const filename = path.basename(parameters.inventory_file);
      const inventoryFilePath = path.join("/python_pipeline/data", filename);
      console.log(
        `[DEBUG][API] Reading inventory file from: ${inventoryFilePath}`,
      );
      if (!fs.existsSync(inventoryFilePath)) {
        throw new Error(`Inventory file not found: ${inventoryFilePath}`);
      }
      const inventoryContent = fs.readFileSync(inventoryFilePath, "utf8");
      const inventoryData = yaml.load(inventoryContent);
      let hostnames = [];
      if (Array.isArray(inventoryData)) {
        for (const location of inventoryData) {
          if (location.routers && Array.isArray(location.routers)) {
            for (const router of location.routers) {
              if (router.ip_address) hostnames.push(router.ip_address);
              else if (router.host_name) hostnames.push(router.host_name);
            }
          }
        }
      }
      if (hostnames.length === 0) {
        throw new Error(
          `No hosts found in inventory file: ${parameters.inventory_file}`,
        );
      }
      const hostnameString = hostnames.join(",");
      console.log(
        `[DEBUG][API] Resolved hostnames from inventory: ${hostnameString}`,
      );
      processedParameters = { ...parameters, hostname: hostnameString };
      delete processedParameters.inventory_file;
    } catch (error) {
      console.error(
        `[DEBUG][API] Error processing inventory file:`,
        error.message,
      );
      return res.status(400).json({
        success: false,
        message: `Error processing inventory file: ${error.message}`,
      });
    }
  }

  console.log(`[DEBUG][API] Processed parameters:`, processedParameters);
  res
    .status(202)
    .json({
      success: true,
      message: `Script '${scriptId}' execution started.`,
    });

  // Construct Docker command
  const scriptPath = path.join(
    SCRIPT_MOUNT_POINT_IN_CONTAINER,
    scriptDef.path,
    "run.py",
  );
  const dockerArgs = [
    "run",
    "--rm",
    "--network=host",
    "-v",
    `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`,
    "vlabs-python-runner",
    "stdbuf",
    "-oL",
    "-eL",
    "python",
    "-u",
    scriptPath,
  ];

  // Add parameters to Docker command
  if (processedParameters) {
    for (const [key, value] of Object.entries(processedParameters)) {
      if (value !== undefined && value !== null && value !== "") {
        dockerArgs.push(`--${key}`);
        dockerArgs.push(String(value));
      }
    }
  }

  console.log("[DEBUG][API] Final Docker command:", dockerArgs.join(" "));
  executeWithRealTimeUpdates("docker", dockerArgs, clientWs);
});

// =================================================================================================
//
// SECTION 5: RUN SCRIPT WITH STREAMING (UNIFIED)
//
// OVERVIEW:
//   This API endpoint is the primary entry point for executing complex, long-running scripts
//   like the Backup and Restore tool. It is responsible for validating the request,
//   constructing a precise Docker command with the correct volume mounts and parameters,
//   and then handing off the execution to the unified `executeWithRealTimeUpdates` utility.
//
// KEY FEATURES:
//   - Unified Execution Logic: This endpoint has been refactored to delegate its execution
//     to the central `executeWithRealTimeUpdates` utility. This ensures that all scripts,
//     regardless of which API route initiates them, are handled by the same robust, "bilingual"
//     stream processor, eliminating inconsistencies and bugs.
//   - Comprehensive Command Construction: It dynamically builds a complex Docker command,
//     including multiple volume mounts (for the main Python pipeline and specific tool
//     directories like backups) and all necessary script parameters.
//   - Immediate Feedback: It immediately sends a `script_start` message to the client,
//     providing instant feedback that the process has been successfully initiated.
//
// HOW-TO GUIDE (INTEGRATION):
//   This endpoint is called by frontend components (like the `BackupAndRestoreRunner`) that
//   need to run a script and receive detailed, real-time progress updates.
//
//   1. The frontend makes a POST request to `/api/scripts/run-stream`.
//   2. The request body must include `scriptId`, `wsClientId`, and a `parameters` object.
//   3. This handler constructs and logs the full Docker command for debugging.
//   4. It then calls `executeWithRealTimeUpdates`, which takes over and handles the entire
//      lifecycle of the script run, including all WebSocket communication.
//
// =================================================================================================
// POST /api/scripts/run-stream
// Execute a script with detailed streaming logic using the unified utility.
router.post("/run-stream", (req, res) => {
  // -----------------------------------------------------------------------------------------------
  // Subsection 5.1: Request Validation & Initialization
  // -----------------------------------------------------------------------------------------------
  const { scriptId, parameters, wsClientId } = req.body;
  const clients = req.app.locals.clients; // Access the globally managed WebSocket clients.
  const runId = generateUniqueId(); // Create a unique ID for this specific execution.

  // Validate that all required information is present in the request.
  if (!scriptId || !wsClientId) {
    return res
      .status(400)
      .json({
        success: false,
        message: "scriptId and wsClientId are required.",
      });
  }
  const clientWs = clients.get(wsClientId);
  if (!clientWs || clientWs.readyState !== 1) {
    return res
      .status(404)
      .json({
        success: false,
        message: `WebSocket client not found or connection is not open.`,
      });
  }

  // -----------------------------------------------------------------------------------------------
  // Subsection 5.2: Script Definition & Metadata Loading
  // -----------------------------------------------------------------------------------------------
  // Load the main script configuration to find the definition for the requested script.
  const config = yaml.load(
    fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"),
  );
  const baseScriptDef = config.scripts.find((s) => s.id === scriptId);
  if (!baseScriptDef) {
    return res
      .status(404)
      .json({
        success: false,
        message: `Script with ID '${scriptId}' not found in scripts.yaml.`,
      });
  }

  // Merge the base definition (e.g., path) with its specific metadata (e.g., displayName).
  const individualMetadata = getScriptIndividualMetadata(baseScriptDef);
  const scriptDef = { ...baseScriptDef, ...individualMetadata };

  // Acknowledge the HTTP request immediately with a 202 "Accepted" status.
  // This tells the client that the process has started and that further updates will arrive via WebSocket.
  res
    .status(202)
    .json({ success: true, message: "Script execution started.", runId });

  // -----------------------------------------------------------------------------------------------
  // Subsection 5.3: Docker Command Construction
  // -----------------------------------------------------------------------------------------------
  // Define the absolute path to the Python script inside the container's filesystem.
  const scriptPathInContainer = path.join(
    PYTHON_PIPELINE_MOUNT_PATH,
    scriptDef.path,
    "run.py",
  );

  // Define the necessary volume mounts.
  const mainVolumeMount = `${process.env.HOST_PROJECT_ROOT}/python_pipeline:${PYTHON_PIPELINE_MOUNT_PATH}`;
  const backupVolumeMount = `${process.env.HOST_PROJECT_ROOT}/python_pipeline/tools/backup_and_restore/backups:/backups`;

  // Assemble the Docker command arguments piece by piece for clarity.
  const dockerOptions = [
    "run",
    "--rm",
    "--network=host",
    "-v",
    mainVolumeMount,
    "-v",
    backupVolumeMount,
  ];
  const commandAndArgs = [
    "vlabs-python-runner",
    "stdbuf",
    "-oL",
    "-eL",
    "python",
    "-u",
    scriptPathInContainer,
  ];

  // Dynamically append all parameters from the request to the command.
  for (const [key, value] of Object.entries(parameters || {})) {
    if (value === null || value === undefined || value === "") continue;
    if (value === true) {
      commandAndArgs.push(`--${key}`);
    } else if (value !== false) {
      commandAndArgs.push(`--${key}`, String(value));
    }
  }
  const finalDockerCommand = [...dockerOptions, ...commandAndArgs];

  // -----------------------------------------------------------------------------------------------
  // Subsection 5.4: Execution Hand-off
  // -----------------------------------------------------------------------------------------------
  // Log the final command for debugging and traceability.
  console.log("--- EXECUTING DOCKER COMMAND (via /run-stream) ---");
  console.log(`docker ${finalDockerCommand.join(" ")}`);
  console.log("------------------------------------------------");

  // Send the initial "start" message to the WebSocket client.
  if (clientWs.readyState === 1) {
    clientWs.send(JSON.stringify({ type: "script_start", runId, scriptId }));
  }

  // --- ### THE UNIFIED FIX ### ---
  // Delegate the entire execution and stream handling process to the central utility.
  // This ensures consistent, reliable behavior for all scripts run through this endpoint.
  // The utility will handle all stdout/stderr processing and send all necessary
  // 'progress', 'result', and 'script_end' messages to the client.
  executeWithRealTimeUpdates("docker", finalDockerCommand, clientWs);
});
// ==============================================================================
// SECTION 6: EXPORTS
// ==============================================================================
module.exports = router;
