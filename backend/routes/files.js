// ==============================================================================
// FILE: routes/files.js
// ==============================================================================
// Overview:
// This module defines an API route for handling file uploads in the Vlabs backend.
// It processes uploaded files using multer, executes a script with the uploaded file
// in a Docker container, and streams execution results via WebSocket. The file is
// deleted after execution to manage storage.
//
// Key Features:
// - Handles file uploads with multer middleware.
// - Executes scripts with uploaded files in a Docker container.
// - Streams script execution output (stdout/stderr) to WebSocket clients.
// - Generates unique run IDs for tracking executions.
// - Deletes temporary files after execution to prevent storage accumulation.
// - Validates WebSocket client and script definitions before execution.
//
// Dependencies:
// - express: Web framework for defining API routes.
// - fs: Node.js module for file system operations.
// - path: Node.js module for path manipulation.
// - child_process: Node.js module for spawning Docker processes.
// - js-yaml: Library for parsing YAML configuration files.
// - ../config/paths: Path constants for script and upload directories.
// - ../utils/scriptUtils: Utilities for script metadata and JSON parsing.
// - ../utils/executeWithRealTimeUpdates: Utility for real-time script execution.
//
// How to Use:
// 1. Mount in server.js with multer: `app.use('/api/files', require('./routes/files')(upload));`.
// 2. Ensure WebSocket clients are stored in `app.locals.clients`.
// 3. Ensure `HOST_PROJECT_ROOT` is set and upload directory is mounted in Docker.
// 4. Test the endpoint with a multipart/form-data POST request including a file and parameters:
//    Example: `curl -X POST http://localhost:3001/api/files/upload -F "file=@/path/to/file" -F "scriptId=script1" -F "wsClientId=client123"`.
// 5. Verify WebSocket receives execution updates (script_start, progress, result, script_end).
// 6. Monitor logs for execution and file deletion details.
// 7. Ensure `vlabs-python-runner` Docker image is available and scripts.yaml is configured.
//
// API Endpoints:
// - POST /api/files/upload: Uploads a file and executes a script with WebSocket updates.

// ==============================================================================
// SECTION 1: IMPORTS
// ==============================================================================
const express = require("express"); // Web framework for routing
const router = express.Router(); // Express router instance
const fs = require("fs"); // File system operations for file deletion
const path = require("path"); // Path manipulation for file paths
const { spawn } = require("child_process"); // Spawn Docker processes
const {
  SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER,
  PYTHON_PIPELINE_PATH_ON_HOST,
  PYTHON_PIPELINE_MOUNT_PATH,
} = require("../config/paths"); // Path constants
const { generateUniqueId, safeJsonParse } = require("../utils/scriptUtils"); // Script utilities
const { executeWithRealTimeUpdates } = require("../utils/executeWithRealTimeUpdates.js"); // Real-time execution utility

// ==============================================================================
// SECTION 2: FILE UPLOAD AND EXECUTION
// ==============================================================================
// POST /api/files/upload
// Handle file upload and execute script with WebSocket streaming
module.exports = (upload) => {
  router.post("/upload", upload.single("file"), (req, res) => {
    const { scriptId, wsClientId, remoteFilename, ...otherParameters } = req.body;
    const clients = req.app.locals.clients; // Access WebSocket clients
    const runId = generateUniqueId(); // Generate unique run ID

    // Validate inputs
    if (!wsClientId) return res.status(400).json({ success: false, message: "wsClientId is required." });
    if (!req.file) return res.status(400).json({ success: false, message: "File is required." });

    // Validate WebSocket client
    const clientWs = clients.get(wsClientId);
    if (!clientWs || clientWs.readyState !== 1) {
      fs.unlinkSync(req.file.path); // Clean up uploaded file
      return res.status(404).json({ success: false, message: `WebSocket client not found or not connected.` });
    }

    // Load and validate script configuration
    const config = require("js-yaml").load(fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"));
    const scriptDef = config.scripts.find((s) => s.id === scriptId);
    if (!scriptDef) {
      fs.unlinkSync(req.file.path); // Clean up uploaded file
      return res.status(404).json({ success: false, message: `Script definition for '${scriptId}' not found.` });
    }

    // Acknowledge request
    res.status(202).json({ success: true, message: "File upload received, starting execution.", runId });

    // Construct Docker command
    const hostUploadDirectory = path.resolve(process.env.HOST_PROJECT_ROOT, "python_pipeline/temp_uploads");
    const scriptPathInContainer = path.join(PYTHON_PIPELINE_MOUNT_PATH, scriptDef.path, "run.py");
    const dockerArgs = [
      "run",
      "--rm",
      "-v",
      `${PYTHON_PIPELINE_PATH_ON_HOST}:${PYTHON_PIPELINE_MOUNT_PATH}:ro`,
      "-v",
      `${hostUploadDirectory}:/uploads`,
      "vlabs-python-runner",
      "stdbuf",
      "-oL",
      "-eL",
      "python",
      "-u",
      scriptPathInContainer,
      "--mode",
      "cli",
      "--file",
      req.file.path,
      "--remote-filename",
      req.file.originalname,
      "--run-id",
      runId,
    ];

    // Add additional parameters to command
    const commandLineParams = { ...otherParameters };
    for (const [key, value] of Object.entries(commandLineParams)) {
      if (value) dockerArgs.push(`--${key}`, String(value));
    }

    console.log("[BACKEND][SPAWN] Executing command:", "docker", dockerArgs.join(" "));

    // Notify script start via WebSocket
    if (clientWs.readyState === 1) {
      clientWs.send(JSON.stringify({ type: "script_start", runId, scriptId }));
    }

    // Execute script with real-time updates
    executeWithRealTimeUpdates("docker", dockerArgs, clientWs, req.file.path);
  });

  return router;
};
