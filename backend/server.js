const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
const port = 3001;

// Use CORS for cross-origin requests from your React frontend
app.use(cors());
app.use(express.json()); // To parse JSON request bodies

// Define the absolute path to your public directory where labs are stored
// This assumes your `vlabs/docker-compose.yml` mounts `./public` to `/public`
// AND your backend Dockerfile sets `/app/backend` as WORKDIR.
const LABS_BASE_PATH_IN_CONTAINER = "/public"; // Path inside the backend container

// Store lab statuses in memory (for simplicity)
const labStatuses = {}; // { labPath: { status: 'stopped' | 'running' | 'failed' | 'starting' } }

// Helper function to get Docker Compose status for a specific lab
const getDockerComposeStatus = (labPath) => {
  return new Promise((resolve) => {
    // Construct the full path to the lab's directory inside the container
    const labDirectory = path.join(LABS_BASE_PATH_IN_CONTAINER, labPath);
    const dockerComposeFilePath = path.join(labDirectory, "docker-compose.yml");

    console.log(
      `[BACKEND] Checking real status for lab: ${labPath} in directory: ${labDirectory}`,
    );

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
        // If there's an error, it often means no containers are running or the project doesn't exist.
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
        // Parse each line as a separate JSON object
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
              return null; // Return null for lines that can't be parsed
            }
          })
          .filter(Boolean); // Filter out any nulls from failed parsing

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

      // Determine overall status based on parsed services
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

// Serve static files from the build directory of your React app (if integrated)
// This assumes your frontend build output (e.g., `build` folder) is mounted
// into the root of the backend container, or that the backend serves it
// if the frontend and backend are deployed together.
// For development, this is often handled by the frontend's dev server.
// If you are serving your frontend from this backend, uncomment and adjust:
/*
app.use(express.static(path.join(__dirname, '..', 'build'))); // Assumes 'build' is parallel to 'backend'
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'build', 'index.html'));
});
*/

app.listen(port, () => {
  console.log(`[BACKEND] Backend server listening at http://localhost:${port}`);
  // Log the project root for debugging paths in container
  console.log(`[BACKEND] Project root is: ${process.cwd()}`);
});
