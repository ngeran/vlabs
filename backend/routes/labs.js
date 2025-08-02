// ==============================================================================
// FILE: routes/labs.js
// ==============================================================================
// Overview:
// This module defines API routes for lab management in the Vlabs backend. It handles
// launching, stopping, and checking the status of labs using Docker Compose, supporting
// network simulation and testing environments.
//
// Key Features:
// - Launches labs using Docker Compose `up` command.
// - Stops labs using Docker Compose `down` command.
// - Retrieves status for individual or all labs.
// - Updates in-memory lab status cache.
//
// Dependencies:
// - express: Web framework for routing.
// - child_process: Node.js module for executing Docker Compose commands.
// - path: Node.js module for path manipulation.
// - ../config/paths: Path constants and lab status cache.
// - ../utils/dockerUtils: Docker Compose status utility.
//
// How to Use:
// 1. Mount in server.js: `app.use('/api/labs', require('./routes/labs'));`.
// 2. Ensure Docker Compose files exist in `PUBLIC_MOUNT_PATH`.
// 3. Test endpoints with tools like Postman or curl.
// 4. Verify Docker and Docker Compose are installed and accessible.
// 5. Monitor labStatuses in `config/paths` for state consistency.
//
// API Endpoints:
// - POST /api/labs/launch: Launches a lab using Docker Compose.
// - POST /api/labs/stop: Stops a lab using Docker Compose.
// - GET /api/labs/status-by-path: Retrieves status for a specific lab.
// - GET /api/labs/all-statuses: Retrieves statuses for all labs.

// ==============================================================================
// SECTION 1: IMPORTS
// ==============================================================================
const express = require("express"); // Web framework for routing
const router = express.Router(); // Express router instance
const { exec } = require("child_process"); // Execute shell commands
const path = require("path"); // Path manipulation
const fs = require("fs"); // File system operations
const { PUBLIC_MOUNT_PATH, labStatuses } = require("../config/paths"); // Path constants and state
const { getDockerComposeStatus } = require("../utils/dockerUtils"); // Docker status utility

// ==============================================================================
// SECTION 2: LAUNCH LAB
// ==============================================================================
// POST /api/labs/launch
// Launch a lab using Docker Compose
router.post("/launch", async (req, res) => {
  const { labPath } = req.body;
  if (!labPath) return res.status(400).json({ success: false, message: "labPath is required." });
  const labDirectory = path.join(PUBLIC_MOUNT_PATH, labPath);
  if (!fs.existsSync(path.join(labDirectory, "docker-compose.yml")))
    return res.status(404).json({ success: false, message: "Lab definition file not found." });

  // Update lab status
  labStatuses[labPath] = { status: "starting", message: "Initiating lab launch..." };

  // Execute Docker Compose up command
  const command = `docker compose -f "${path.join(labDirectory, "docker-compose.yml")}" up -d`;
  exec(command, { cwd: labDirectory }, (error) => {
    if (error) {
      labStatuses[labPath] = { status: "failed", message: `Launch failed: ${error.message}` };
      return res.status(500).json({ success: false, message: `Failed to launch lab: ${error.message}` });
    }
    res.json({ success: true, message: "Lab launch command sent." });
  });
});

// ==============================================================================
// SECTION 3: STOP LAB
// ==============================================================================
// POST /api/labs/stop
// Stop a lab using Docker Compose
router.post("/stop", (req, res) => {
  const { labPath } = req.body;
  if (!labPath) return res.status(400).json({ success: false, message: "labPath is required." });
  const labDirectory = path.join(PUBLIC_MOUNT_PATH, labPath);
  if (!fs.existsSync(path.join(labDirectory, "docker-compose.yml")))
    return res.status(404).json({ success: false, message: "Lab definition file not found." });

  // Update lab status
  labStatuses[labPath] = { status: "stopping", message: "Initiating lab stop..." };

  // Execute Docker Compose down command
  const command = `docker compose -f "${path.join(labDirectory, "docker-compose.yml")}" down`;
  exec(command, { cwd: labDirectory }, (error) => {
    if (error) {
      labStatuses[labPath] = { status: "failed", message: `Stop failed: ${error.message}` };
      return res.status(500).json({ success: false, message: `Failed to stop lab: ${error.message}` });
    }
    labStatuses[labPath] = { status: "stopped", message: "Lab stopped." };
    res.json({ success: true, message: "Lab stopped successfully." });
  });
});

// ==============================================================================
// SECTION 4: CHECK LAB STATUS
// ==============================================================================
// GET /api/labs/status-by-path
// Retrieve status for a specific lab
router.get("/status-by-path", async (req, res) => {
  const { labPath } = req.query;
  if (!labPath) return res.status(400).json({ success: false, message: "labPath is required." });
  const status = await getDockerComposeStatus(labPath);
  labStatuses[labPath] = status;
  res.json(status);
});

// GET /api/labs/all-statuses
// Retrieve statuses for all labs
router.get("/all-statuses", async (req, res) => {
  const allLabPaths = ["routing/ospf-single-area"]; // Hardcoded for now; consider dynamic discovery
  const statuses = {};
  for (const labPath of allLabPaths) {
    const status = await getDockerComposeStatus(labPath);
    statuses[labPath] = status;
    labStatuses[labPath] = status;
  }
  res.json(statuses);
});

// ==============================================================================
// SECTION 5: EXPORTS
// ==============================================================================
module.exports = router;
