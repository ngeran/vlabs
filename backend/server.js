// vlabs/backend/server.js

const express = require("express");
const cors = require("cors"); // Required for cross-origin communication with your frontend
const { exec } = require("child_process"); // For executing shell commands (docker compose)
const path = require("path"); // For resolving file paths

const app = express();

// --- Configuration ---
// Define the port the backend server will listen on.
// Uses environment variable PORT if available (e.g., for deployment), otherwise defaults to 3001.
const PORT = process.env.PORT || 3001;

// Define the root directory of your project.
// This is crucial for correctly locating the 'public' folder and lab directories.
// Assumes server.js is in 'vlabs/backend' and 'public' is in 'vlabs'.
const projectRoot = path.join(__dirname, ".."); // Go up one level from 'backend' to 'vlabs'

// --- Middleware ---
// Enable CORS for all origins. This is essential for your frontend (likely on a different port)
// to be able to make requests to this backend. In a production environment, you might restrict this.
app.use(cors());

// Enable Express to parse JSON formatted request bodies.
app.use(express.json());

// --- API Endpoints ---

/**
 * API Endpoint to Launch a Docker Compose Lab.
 * Expects { labPath: string, config: object, options: object } in the request body.
 * `labPath` should be relative to /public (e.g., "/labs/routing/ospf-single-area").
 */
app.post("/api/labs/launch", (req, res) => {
  const { labPath, config, options } = req.body;
  if (!labPath) {
    console.error("[BACKEND] Launch Error: labPath is required.");
    return res
      .status(400)
      .json({ message: "Error: labPath is required in the request body." });
  }

  // Construct the full path to the lab's directory
  const labDirectory = path.join(projectRoot, "public", labPath);
  const dockerComposeFilePath = path.join(labDirectory, "docker-compose.yml");

  console.log(`\n[BACKEND] Received launch request for: ${labPath}`);
  console.log(
    `[BACKEND] Attempting to launch lab from directory: ${labDirectory}`,
  );
  console.log(`[BACKEND] Using docker-compose file: ${dockerComposeFilePath}`);

  // Ensure the lab directory exists before attempting to run docker compose
  // (Optional but good for robustness)
  if (!require("fs").existsSync(labDirectory)) {
    console.error(`[BACKEND] Lab directory not found: ${labDirectory}`);
    return res
      .status(404)
      .json({ message: `Lab directory not found: ${labDirectory}` });
  }
  if (!require("fs").existsSync(dockerComposeFilePath)) {
    console.error(
      `[BACKEND] docker-compose.yml not found: ${dockerComposeFilePath}`,
    );
    return res
      .status(404)
      .json({ message: `docker-compose.yml not found in ${labDirectory}` });
  }

  // The command to bring up the Docker Compose project in detached mode
  // Using `-f` to explicitly specify the compose file.
  const command = `docker compose -f "${dockerComposeFilePath}" up -d`;

  exec(command, { cwd: labDirectory }, (error, stdout, stderr) => {
    if (error) {
      console.error(
        `[BACKEND] Docker Compose exec error for ${labPath}:`,
        error,
      );
      console.error(`[BACKEND] Docker Compose stderr for ${labPath}:`, stderr);
      return res.status(500).json({
        message: `Failed to launch lab: ${stderr || error.message}`,
        details: stderr,
      });
    }

    console.log(`[BACKEND] Docker Compose stdout for ${labPath}:\n${stdout}`);
    console.log(`[BACKEND] Lab launched successfully for: ${labPath}`);

    // --- IMPORTANT: These are still placeholders ---
    // In a real application, you'd parse `stdout` to get actual container IDs,
    // exposed ports, and generate a dynamic access URL.
    res.json({
      success: true,
      message:
        "Lab launch request sent successfully! Check your Docker containers.",
      containerId: "simulated_container_id_123", // Placeholder
      ports: [80, 443], // Placeholder
      accessUrl: `http://localhost:8080/access/${labPath.split("/").pop()}`, // More realistic placeholder URL
    });
  });
});

/**
 * API Endpoint to Stop a Docker Compose Lab.
 * Expects { labPath: string } in the request body.
 * `labPath` should be relative to /public (e.g., "/labs/routing/ospf-single-area").
 */
app.post("/api/labs/stop", (req, res) => {
  const { labPath } = req.body;
  if (!labPath) {
    console.error("[BACKEND] Stop Error: labPath is required.");
    return res
      .status(400)
      .json({ message: "Error: labPath is required to stop the lab." });
  }

  const labDirectory = path.join(projectRoot, "public", labPath);
  const dockerComposeFilePath = path.join(labDirectory, "docker-compose.yml");

  console.log(`\n[BACKEND] Received stop request for: ${labPath}`);
  console.log(
    `[BACKEND] Attempting to stop lab from directory: ${labDirectory}`,
  );
  console.log(
    `[BACKEND] Using docker-compose file for stop: ${dockerComposeFilePath}`,
  );

  // Command to bring down the Docker Compose project (stops and removes containers)
  const command = `docker compose -f "${dockerComposeFilePath}" down`;

  exec(command, { cwd: labDirectory }, (error, stdout, stderr) => {
    if (error) {
      console.error(
        `[BACKEND] Docker Compose stop error for ${labPath}:`,
        error,
      );
      console.error(
        `[BACKEND] Docker Compose stop stderr for ${labPath}:`,
        stderr,
      );
      return res.status(500).json({
        message: `Failed to stop lab: ${stderr || error.message}`,
        details: stderr,
      });
    }
    console.log(
      `[BACKEND] Docker Compose stop stdout for ${labPath}:\n${stdout}`,
    );
    console.log(`[BACKEND] Lab stopped successfully for: ${labPath}`);
    res.json({ success: true, message: `Lab ${labPath} stopped and removed.` });
  });
});

/**
 * API Endpoint for Lab Status Check (Placeholder).
 * Currently returns simulated data. To make this real, you would need to:
 * 1. Pass the actual Docker container ID or lab project name from frontend.
 * 2. Use `docker ps --filter "name=..."` or `docker compose ps` to check actual status.
 */
app.get("/api/labs/status/:containerId", (req, res) => {
  const { containerId } = req.params;
  console.log(`\n[BACKEND] Checking status for container: ${containerId}`);
  // Simulate a running status for now
  res.json({
    isRunning: true, // Simulate as running
    isComplete: false,
    hasFailed: false,
    message: `Simulated status for ${containerId}`,
    accessUrl: `http://localhost:8080/access/${containerId}`, // Simulate an access URL
    ports: [8080], // Simulate some ports
  });
});

// --- Start the Express backend server ---
app.listen(PORT, () => {
  console.log(`[BACKEND] Backend server listening at http://localhost:${PORT}`);
  console.log(`[BACKEND] Project root is: ${projectRoot}`);
});
