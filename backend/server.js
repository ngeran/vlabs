// backend/server.js

const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml"); // Import js-yaml for YAML parsing

const app = express();
const port = 3001;

// Use CORS for cross-origin requests from your React frontend
app.use(cors());
app.use(express.json()); // To parse JSON request bodies

// Define the absolute path to your public directory where labs are stored
// This assumes your `vlabs/docker-compose.yml` mounts `./public` to `/public`
// AND your backend Dockerfile sets `/app/backend` as WORKDIR.
const LABS_BASE_PATH_IN_CONTAINER = "/public"; // Path inside the backend container (for docker-compose paths)

// Store lab statuses in memory (for simplicity)
const labStatuses = {}; // { labPath: { status: 'stopped' | 'running' | 'failed' | 'starting' } }

// --- Paths for Python Scripting Pipeline ---

// The absolute path on the host machine to the python_pipeline directory.
// This is used for the Docker volume mount *source* when launching the python_runner container.
// It leverages the HOST_PROJECT_ROOT environment variable.
const PYTHON_PIPELINE_PATH_ON_HOST = process.env.HOST_PROJECT_ROOT
  ? path.join(process.env.HOST_PROJECT_ROOT, "python_pipeline")
  : path.resolve(__dirname, "../../python_pipeline"); // Fallback for local development outside Docker

// The absolute path *inside the backend container* to the scripts configuration YAML file.
// This path leverages the mount `- ./python_pipeline:/python_pipeline` in docker-compose.yml
// so the backend can read `scripts.yaml` directly using fs.readFileSync.
const SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER = "/python_pipeline/scripts.yaml";

// The internal path inside the Python runner Docker container where scripts will be mounted.
// This is used in the `docker run -v` command as the *destination* path.
const SCRIPT_MOUNT_POINT_IN_CONTAINER = "/app/python-scripts";
// --- END Python Paths ---

// --- Path for Navigation Configuration ---

// Assuming navigation.yaml is in the 'public' directory, which is mounted to `/public`
// inside the backend container. This path is used for fs.readFileSync.
const NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER = "/public/navigation.yaml";
// --- END Navigation Paths ---

// Store script statuses and outputs in memory (for tracking runs, though not fully utilized yet)
const scriptRuns = {}; // { runId: { status: 'running' | 'completed' | 'failed', output: '', error: '' } }

// Helper function to get Docker Compose status for a specific lab
const getDockerComposeStatus = (labPath) => {
  return new Promise((resolve) => {
    // Construct the full path to the lab's directory inside the container
    // This path is relative to the backend's mount of the public folder
    // NOTE: This assumes your 'public' folder is mounted directly as '/public' in the backend container.
    const labDirectory = path.join(LABS_BASE_PATH_IN_CONTAINER, labPath);
    const dockerComposeFilePath = path.join(labDirectory, "docker-compose.yml");

    console.log(
      `[BACKEND] Checking real status for lab: ${labPath} in directory: ${labDirectory}`,
    );

    // IMPORTANT: fs.existsSync works on the *backend container's filesystem*.
    // If /public is mounted correctly, this check is valid.
    if (!fs.existsSync(dockerComposeFilePath)) {
      console.warn(
        `[BACKEND] docker-compose.yml not found at: ${dockerComposeFilePath}`,
      );
      return resolve({
        status: "stopped",
        message: "Lab definition file not found.",
      });
    }

    const command = `docker compose -f "${dockerComposeFilePath}" ps --format json`;
    console.log(`[BACKEND] Executing status check command: ${command}`);

    exec(command, { cwd: labDirectory }, (error, stdout, stderr) => {
      if (error) {
        console.error(
          `[BACKEND] Docker Compose status check error for ${labPath}:`,
          error.message,
        );
        console.error(`[BACKEND] Stderr:`, stderr);
        return resolve({
          status: "stopped",
          message: `Docker Compose command failed: ${error.message}`,
        });
      }

      if (!stdout.trim()) {
        console.log(
          `[BACKEND] Docker Compose ps output is empty for ${labPath}.`,
        );
        return resolve({
          status: "stopped",
          message: "No active containers found for this lab.",
        });
      }

      let services = [];
      try {
        services = stdout
          .trim()
          .split("\n")
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch (parseError) {
              console.error(
                `[BACKEND] Failed to parse a line of Docker Compose ps output:`,
                parseError,
              );
              console.error(`[BACKEND] Faulty line:`, line);
              return null;
            }
          })
          .filter(Boolean);

        if (services.length === 0) {
          console.log(
            `[BACKEND] No valid services found after parsing for ${labPath}. Raw stdout:`,
            stdout,
          );
          return resolve({
            status: "stopped",
            message: "No valid service information found.",
          });
        }
      } catch (parseError) {
        console.error(
          `[BACKEND] Failed to process Docker Compose ps output unexpectedly for ${labPath}:`,
          parseError,
        );
        console.error(`[BACKEND] Raw stdout:`, stdout);
        return resolve({
          status: "failed",
          message: "Failed to parse Docker status output.",
        });
      }

      const allRunning = services.every(
        (service) => service.State === "running",
      );
      const anyExited = services.some((service) => service.State === "exited");
      const anyStarting = services.some(
        (service) => service.State === "starting",
      );
      const anyDegraded = services.some(
        (service) => service.State === "degraded",
      );

      if (allRunning) {
        return resolve({
          status: "running",
          message: "All lab containers are running.",
        });
      } else if (anyExited || anyDegraded) {
        return resolve({
          status: "failed",
          message: "Some lab containers have exited or are unhealthy.",
        });
      } else if (anyStarting) {
        return resolve({
          status: "starting",
          message: "Lab containers are still starting.",
        });
      } else {
        return resolve({
          status: "unknown",
          message: "Lab status is indeterminate.",
        });
      }
    });
  });
};

// API endpoint to launch a lab
app.post("/api/labs/launch", async (req, res) => {
  const { labPath } = req.body;
  console.log(`[BACKEND] Received launch request for: ${labPath}`);

  if (!labPath) {
    return res
      .status(400)
      .json({ success: false, message: "labPath is required." });
  }

  const labDirectory = path.join(LABS_BASE_PATH_IN_CONTAINER, labPath);
  const dockerComposeFilePath = path.join(labDirectory, "docker-compose.yml");

  if (!fs.existsSync(dockerComposeFilePath)) {
    console.error(
      `[BACKEND] Launch failed: docker-compose.yml not found at ${dockerComposeFilePath}`,
    );
    labStatuses[labPath] = {
      status: "failed",
      message: "Lab definition file not found.",
    };
    return res
      .status(404)
      .json({ success: false, message: "Lab definition file not found." });
  }

  // Set initial status to starting
  labStatuses[labPath] = {
    status: "starting",
    message: "Initiating lab launch...",
  };

  const command = `docker compose -f "${dockerComposeFilePath}" up -d`;
  exec(command, { cwd: labDirectory }, (error, stdout, stderr) => {
    if (error) {
      console.error(
        `[BACKEND] Docker Compose up error for ${labPath}:`,
        error.message,
      );
      console.error(`[BACKEND] Stderr:`, stderr);
      labStatuses[labPath] = {
        status: "failed",
        message: `Launch failed: ${error.message}`,
      };
      return res.status(500).json({
        success: false,
        message: `Failed to launch lab: ${error.message}`,
      });
    }
    console.log(`[BACKEND] Docker Compose stdout for ${labPath}:\n${stdout}`);
    if (stderr) {
      console.warn(
        `[BACKEND] Docker Compose stderr for ${labPath}:\n${stderr}`,
      );
    }
    console.log(
      `[BACKEND] Lab launch command initiated successfully for: ${labPath}`,
    );
    // At this point, the command was sent. The actual status will be determined by polling.
    labStatuses[labPath] = {
      status: "starting",
      message: "Lab launch command sent. Polling for status...",
    };
    res.json({
      success: true,
      message: "Lab launch command sent. Polling for status...",
    });
  });
});

// API endpoint to stop a lab
app.post("/api/labs/stop", (req, res) => {
  const { labPath } = req.body;
  console.log(`[BACKEND] Received stop request for: ${labPath}`);

  if (!labPath) {
    return res
      .status(400)
      .json({ success: false, message: "labPath is required." });
  }

  const labDirectory = path.join(LABS_BASE_PATH_IN_CONTAINER, labPath);
  const dockerComposeFilePath = path.join(labDirectory, "docker-compose.yml");

  if (!fs.existsSync(dockerComposeFilePath)) {
    console.error(
      `[BACKEND] Stop failed: docker-compose.yml not found at ${dockerComposeFilePath}`,
    );
    labStatuses[labPath] = {
      status: "stopped",
      message: "Lab definition file not found for stopping.",
    };
    return res
      .status(404)
      .json({ success: false, message: "Lab definition file not found." });
  }

  // Set status to stopping immediately
  labStatuses[labPath] = {
    status: "stopping",
    message: "Initiating lab stop...",
  };

  const command = `docker compose -f "${dockerComposeFilePath}" down`;
  exec(command, { cwd: labDirectory }, (error, stdout, stderr) => {
    if (error) {
      console.error(
        `[BACKEND] Docker Compose down error for ${labPath}:`,
        error.message,
      );
      console.error(`[BACKEND] Stderr:`, stderr);
      labStatuses[labPath] = {
        status: "failed",
        message: `Stop failed: ${error.message}`,
      };
      return res.status(500).json({
        success: false,
        message: `Failed to stop lab: ${error.message}`,
      });
    }
    console.log(
      `[BACKEND] Docker Compose stop stdout for ${labPath}:\n${stdout}`,
    );
    if (stderr) {
      console.warn(
        `[BACKEND] Docker Compose stop stderr for ${labPath}:\n${stderr}`,
      );
    }
    console.log(`[BACKEND] Lab stopped successfully for: ${labPath}`);
    labStatuses[labPath] = { status: "stopped", message: "Lab stopped." };
    res.json({ success: true, message: "Lab stopped successfully." });
  });
});

// API endpoint to get status for a single lab
app.get("/api/labs/status-by-path", async (req, res) => {
  const { labPath } = req.query;
  if (!labPath) {
    return res
      .status(400)
      .json({ success: false, message: "labPath is required." });
  }

  // First, check in-memory status
  let currentStatus = labStatuses[labPath] || {
    status: "stopped",
    message: "Not launched yet.",
  };

  // Then, perform a real-time Docker check if it's not already in a terminal state
  // Or if the frontend is actively polling for updates
  if (
    currentStatus.status === "starting" ||
    currentStatus.status === "running" ||
    currentStatus.status === "unknown"
  ) {
    try {
      const realStatus = await getDockerComposeStatus(labPath);
      currentStatus = realStatus; // Update in-memory status with real-time status
      labStatuses[labPath] = realStatus; // Persist the latest status
    } catch (error) {
      console.error(
        `[BACKEND] Error getting real-time status for ${labPath}:`,
        error,
      );
      currentStatus = {
        status: "failed",
        message: "Error checking real-time status.",
      };
      labStatuses[labPath] = currentStatus; // Update status in case of error
    }
  }
  console.log(`[BACKEND] Real status for ${labPath}:`, currentStatus.status);
  res.json(currentStatus);
});

// API endpoint to get statuses for all labs (useful for initial load)
app.get("/api/labs/all-statuses", async (req, res) => {
  console.log("[BACKEND] Received request for all lab statuses.");
  const allLabPaths = [
    "routing/ospf-single-area", // Example lab path
    // Add all your lab paths here, dynamically if possible
    // (You might read these from a lab definition YAML if you had one)
  ];

  const statuses = {};
  for (const labPath of allLabPaths) {
    try {
      const status = await getDockerComposeStatus(labPath);
      statuses[labPath] = status;
      labStatuses[labPath] = status; // Keep in-memory cache updated
    } catch (error) {
      console.error(`[BACKEND] Error fetching status for ${labPath}:`, error);
      statuses[labPath] = {
        status: "failed",
        message: "Error fetching status.",
      };
      labStatuses[labPath] = {
        status: "failed",
        message: "Error fetching status.",
      };
    }
  }
  res.json(statuses);
});

// --- API endpoint to get the navigation menu from YAML ---
app.get("/api/navigation/menu", (req, res) => {
  console.log(`[BACKEND] Received request for navigation menu.`);
  console.log(
    `[BACKEND] Attempting to read navigation config from: ${NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER}`,
  );
  try {
    // Read the YAML file from its resolved container location
    const fileContents = fs.readFileSync(
      NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER, // Use the CONTAINER path for fs.readFileSync
      "utf8",
    );
    // Parse the YAML content
    const config = yaml.load(fileContents);

    if (config && Array.isArray(config.menu)) {
      // Assuming 'menu' is the top-level array key in navigation.yaml
      console.log(
        `[BACKEND] Successfully loaded ${config.menu.length} navigation items.`,
      );
      res.json({ success: true, menu: config.menu });
    } else {
      console.warn(
        `[BACKEND] navigation.yaml found but 'menu' array is missing or malformed.`,
      );
      res.status(500).json({
        success: false,
        message: "Navigation configuration malformed.",
      });
    }
  } catch (e) {
    console.error(
      `[BACKEND] Error reading or parsing navigation.yaml at ${NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER}:`,
      e.message,
    );
    res.status(500).json({
      success: false,
      message: `Failed to load navigation menu: ${e.message}`,
    });
  }
});
// --- END API endpoint for navigation ---

// API endpoint to get the list of available Python scripts from YAML
app.get("/api/scripts/list", (req, res) => {
  console.log(`[BACKEND] Received request for script list.`);
  console.log(
    `[BACKEND] Attempting to read scripts config from: ${SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER}`,
  );
  try {
    // Read the YAML file from its resolved container location
    const fileContents = fs.readFileSync(
      SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, // Use the CONTAINER path for fs.readFileSync
      "utf8",
    );
    // Parse the YAML content
    const config = yaml.load(fileContents);

    if (config && Array.isArray(config.scripts)) {
      console.log(
        `[BACKEND] Successfully loaded ${config.scripts.length} scripts.`,
      );
      res.json({ success: true, scripts: config.scripts });
    } else {
      console.warn(
        `[BACKEND] scripts.yaml found but 'scripts' array is missing or malformed.`,
      );
      res
        .status(500)
        .json({ success: false, message: "Scripts configuration malformed." });
    }
  } catch (e) {
    console.error(
      `[BACKEND] Error reading or parsing scripts.yaml at ${SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER}:`,
      e.message,
    );
    res.status(500).json({
      success: false,
      message: `Failed to load script list: ${e.message}`,
    });
  }
});

// API endpoint to run a Python script
app.post("/api/scripts/run", (req, res) => {
  const { scriptName, args } = req.body; // Expect scriptName and optional arguments
  const runId =
    Date.now().toString() + Math.random().toString(36).substring(2, 9); // Simple unique ID for this run

  console.log(
    `[BACKEND] Received request to run Python script: ${scriptName} (ID: ${runId}) with args: ${JSON.stringify(args)}`,
  );

  if (!scriptName) {
    return res
      .status(400)
      .json({ success: false, message: "scriptName is required." });
  }

  // Initialize script status (for potential future status polling, not used by frontend currently)
  scriptRuns[runId] = { status: "running", output: "", error: "" };

  // Construct the command to run the Python script within a new Docker container
  // The script will be located at this path *inside* the Python runner container.
  const scriptInternalPath = path.join(
    SCRIPT_MOUNT_POINT_IN_CONTAINER,
    scriptName,
  );

  const dockerCommandArgs = [
    "run",
    "--rm", // Remove the container after it exits
    "--network",
    "host", // Allows Python script to access host network (e.g., your Node.js backend if needed)
    // Exercise caution with '--network host' in production.
    // Mount the entire python_pipeline directory from the host into the container
    "-v",
    // This is the critical volume mount: HOST_PATH:CONTAINER_PATH
    `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`,
    "vlabs-python-runner", // The name of your Python Docker image (must be built)
    "python",
    scriptInternalPath, // Path to the script inside the Python container
  ];

  // Add any provided arguments to the command, ensuring they are properly quoted
  // This basic quoting handles spaces but not all complex shell characters.
  const finalArgs = args.map(
    (arg) => `'${String(arg).replace(/'/g, "'\\''")}'`,
  ); // More robust single quote escaping
  dockerCommandArgs.push(...finalArgs);

  const command = `docker ${dockerCommandArgs.join(" ")}`;
  console.log(`[BACKEND] Executing Docker command: ${command}`);

  exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
    // Added 30-second timeout
    if (error) {
      console.error(
        `[BACKEND] Error running Python script ${scriptName}:`,
        error.message,
      );
      console.error(`[BACKEND] Script Stderr:`, stderr);
      scriptRuns[runId] = {
        status: "failed",
        output: stdout, // Still capture stdout for debugging context
        error: stderr || error.message,
      };
      return res.status(500).json({
        success: false,
        message: `Script execution failed: ${stderr || error.message}`,
        output: stdout, // Send stdout even on error, for context
        error: stderr || error.message,
      });
    }

    console.log(`[BACKEND] Script ${scriptName} stdout:\n${stdout}`);
    if (stderr) {
      console.warn(`[BACKEND] Script ${scriptName} stderr:\n${stderr}`);
    }

    scriptRuns[runId] = {
      status: "completed",
      output: stdout,
      error: stderr,
    };
    // Respond with success and the script's output and any stderr
    res.json({ success: true, output: stdout, error: stderr });
  });
});

// Start the Express server
app.listen(port, () => {
  console.log(`[BACKEND] Server listening at http://localhost:${port}`);
  console.log(
    `[BACKEND] Scripts config expected at: ${SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER} (inside container)`,
  );
  console.log(
    `[BACKEND] Python pipeline host path for mounting: ${PYTHON_PIPELINE_PATH_ON_HOST} (on host)`,
  );
  console.log(
    `[BACKEND] Navigation config expected at: ${NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER} (inside container)`,
  );
});
