// backend/server.js

/**
 * @file This is the main Express.js server for the vLabs backend.
 * It serves as an API gateway for the React frontend, handling various tasks
 * like managing Docker Compose labs, running Python scripts in dedicated containers,
 * and serving configuration data from YAML files.
 *
 * It uses the 'child_process' module to execute shell commands like `docker` and
 * `docker compose` to interact with the Docker daemon.
 */

const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml"); // Import js-yaml for YAML parsing

const app = express();
const port = 3001;

// --- Middleware Setup ---
// Use CORS for cross-origin requests from your React frontend.
app.use(cors());
// Use express.json() to parse JSON request bodies. This is essential for receiving
// data from the frontend, such as lab paths and script parameters.
app.use(express.json());

// --- Docker Container Paths and Configuration ---
// These constants define the file system paths that are relevant to the Docker setup.
// They are crucial for ensuring the backend can find and interact with lab configurations
// and script files, which are volume-mounted from the host machine into the container.

/**
 * The base path inside the backend container where all lab directories are mounted.
 * This should match the volume mount destination defined in the backend's docker-compose service.
 * E.g., a lab at 'routing/ospf-single-area' on the host would be at '/public/routing/ospf-single-area' here.
 */
const LABS_BASE_PATH_IN_CONTAINER = "/public";

/**
 * The absolute path on the host machine to the `python_pipeline` directory.
 * This path is used as the *source* for the Docker volume mount when launching
 * the `python-runner` container, allowing the container to access your scripts.
 * It reads from a HOST_PROJECT_ROOT environment variable (set in docker-compose.yml),
 * and falls back to a relative path for local development.
 */
const PYTHON_PIPELINE_PATH_ON_HOST = process.env.HOST_PROJECT_ROOT
  ? path.join(process.env.HOST_PROJECT_ROOT, "python_pipeline")
  : path.resolve(__dirname, "../../python_pipeline");

/**
 * The absolute path *inside the backend container* to the `scripts.yaml` configuration file.
 * This is where the backend reads the list of available scripts and their metadata.
 */
const SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER = "/python_pipeline/scripts.yaml";

/**
 * The base path *inside the backend container* to the `python_pipeline` directory itself.
 * This is used to construct full paths to individual script subdirectories (e.g., 'run_jsnapy_tests').
 */
const PYTHON_PIPELINE_BASE_PATH_IN_CONTAINER = "/python_pipeline";

/**
 * The internal path *inside the `python-runner` Docker container* where the scripts will be mounted.
 * This path is used as the *destination* in the `docker run -v` command.
 */
const SCRIPT_MOUNT_POINT_IN_CONTAINER = "/app/python-scripts";

/**
 * The absolute path *inside the backend container* to the `navigation.yaml` file.
 * This file defines the frontend's navigation menu structure.
 */
const NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER = "/public/navigation.yaml";

// --- In-Memory State for Lab and Script Tracking ---
// For simplicity, lab statuses and script run outputs are stored in memory.
// In a production environment, this would be a database or a persistent store.
const labStatuses = {}; // { labPath: { status: 'stopped' | 'running' | 'failed' | 'starting' } }
const scriptRuns = {}; // { runId: { status: 'running' | 'completed' | 'failed', output: '', error: '' } }

/**
 * Helper function to get the real-time status of a Docker Compose lab by
 * executing `docker compose ps`.
 * @param {string} labPath - The path to the lab directory (e.g., 'routing/ospf-single-area').
 * @returns {Promise<object>} A promise that resolves with the lab's status and a message.
 */
const getDockerComposeStatus = (labPath) => {
  return new Promise((resolve) => {
    const labDirectory = path.join(LABS_BASE_PATH_IN_CONTAINER, labPath);
    const dockerComposeFilePath = path.join(labDirectory, "docker-compose.yml");

    console.log(
      `[BACKEND] Checking status for lab: ${labPath} in directory: ${labDirectory}`,
    );

    if (!fs.existsSync(dockerComposeFilePath)) {
      console.warn(
        `[BACKEND] docker-compose.yml not found at: ${dockerComposeFilePath}`,
      );
      return resolve({
        status: "stopped",
        message: "Lab definition file not found.",
      });
    } // Execute the Docker Compose command to get container status in JSON format.

    const command = `docker compose -f "${dockerComposeFilePath}" ps --format json`;
    console.log(`[BACKEND] Executing status check command: ${command}`);

    exec(command, { cwd: labDirectory }, (error, stdout, stderr) => {
      if (error) {
        // If the command fails (e.g., no containers found, command error), assume stopped.
        console.error(
          `[BACKEND] Docker Compose status check error for ${labPath}:`,
          error.message,
        );
        return resolve({
          status: "stopped",
          message: `Docker Compose command failed: ${error.message}`,
        });
      }

      if (!stdout.trim()) {
        // If there is no output, no containers are running.
        return resolve({
          status: "stopped",
          message: "No active containers found for this lab.",
        });
      } // Parse the JSON output line by line.

      let services = stdout
        .trim()
        .split("\n")
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch (parseError) {
            console.error(`[BACKEND] Failed to parse JSON line:`, line);
            return null;
          }
        })
        .filter(Boolean); // Filter out any null entries from parsing errors.
      // Check the state of all services to determine the overall lab status.

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
        resolve({
          status: "running",
          message: "All lab containers are running.",
        });
      } else if (anyExited || anyDegraded) {
        resolve({
          status: "failed",
          message: "Some lab containers have exited or are unhealthy.",
        });
      } else if (anyStarting) {
        resolve({
          status: "starting",
          message: "Lab containers are still starting.",
        });
      } else {
        // This could happen if states are unknown or `ps` returns something unexpected.
        resolve({ status: "unknown", message: "Lab status is indeterminate." });
      }
    });
  });
};

/**
 * Helper function to load metadata for a single script from its YAML file.
 * @param {string} scriptId - The ID of the script (e.g., 'run_jsnapy_tests').
 * @param {string} metadataFileName - The name of the metadata file (e.g., 'metadata.yml').
 * @returns {object|null} The parsed YAML object or null if an error occurs.
 */
const getScriptIndividualMetadata = (scriptId, metadataFileName) => {
  // Construct the full path to the metadata file inside the container.
  const metadataPathInContainer = path.join(
    PYTHON_PIPELINE_BASE_PATH_IN_CONTAINER, // /python_pipeline
    scriptId, // e.g., /run_jsnapy_tests
    metadataFileName, // e.g., /metadata.yml
  );
  try {
    const fileContents = fs.readFileSync(metadataPathInContainer, "utf8");
    return yaml.load(fileContents);
  } catch (e) {
    console.error(
      `[BACKEND] Error reading or parsing script metadata file at ${metadataPathInContainer}:`,
      e.message,
    );
    return null; // Return null to indicate failure.
  }
};

// --- API Endpoints ---

// POST endpoint to launch a Docker Compose lab.
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
    // If the docker-compose file doesn't exist, the lab can't be launched.
    labStatuses[labPath] = {
      status: "failed",
      message: "Lab definition file not found.",
    };
    return res
      .status(404)
      .json({ success: false, message: "Lab definition file not found." });
  } // Set an in-memory status to 'starting' immediately before sending the command.

  labStatuses[labPath] = {
    status: "starting",
    message: "Initiating lab launch...",
  }; // Execute the `docker compose up -d` command to start containers in the background.

  const command = `docker compose -f "${dockerComposeFilePath}" up -d`;
  exec(command, { cwd: labDirectory }, (error, stdout, stderr) => {
    if (error) {
      // If the command fails, update the status to 'failed'.
      console.error(`[BACKEND] Docker Compose up error:`, error.message);
      labStatuses[labPath] = {
        status: "failed",
        message: `Launch failed: ${error.message}`,
      };
      return res
        .status(500)
        .json({
          success: false,
          message: `Failed to launch lab: ${error.message}`,
        });
    }

    console.log(
      `[BACKEND] Lab launch command initiated successfully for: ${labPath}`,
    ); // Respond to the frontend, but the actual status will be determined by subsequent status checks.
    res.json({
      success: true,
      message: "Lab launch command sent. Polling for status...",
    });
  });
});

// POST endpoint to stop a Docker Compose lab.
app.post("/api/labs/stop", (req, res) => {
  const { labPath } = req.body;
  if (!labPath) {
    return res
      .status(400)
      .json({ success: false, message: "labPath is required." });
  }

  const labDirectory = path.join(LABS_BASE_PATH_IN_CONTAINER, labPath);
  const dockerComposeFilePath = path.join(labDirectory, "docker-compose.yml");

  if (!fs.existsSync(dockerComposeFilePath)) {
    labStatuses[labPath] = {
      status: "stopped",
      message: "Lab definition file not found for stopping.",
    };
    return res
      .status(404)
      .json({ success: false, message: "Lab definition file not found." });
  }

  labStatuses[labPath] = {
    status: "stopping",
    message: "Initiating lab stop...",
  }; // Execute the `docker compose down` command to stop and remove containers.
  const command = `docker compose -f "${dockerComposeFilePath}" down`;
  exec(command, { cwd: labDirectory }, (error) => {
    if (error) {
      console.error(`[BACKEND] Docker Compose down error:`, error.message);
      labStatuses[labPath] = {
        status: "failed",
        message: `Stop failed: ${error.message}`,
      };
      return res
        .status(500)
        .json({
          success: false,
          message: `Failed to stop lab: ${error.message}`,
        });
    }

    console.log(`[BACKEND] Lab stopped successfully for: ${labPath}`);
    labStatuses[labPath] = { status: "stopped", message: "Lab stopped." };
    res.json({ success: true, message: "Lab stopped successfully." });
  });
});

// GET endpoint to retrieve the status of a single lab.
app.get("/api/labs/status-by-path", async (req, res) => {
  const { labPath } = req.query;
  if (!labPath) {
    return res
      .status(400)
      .json({ success: false, message: "labPath is required." });
  } // Check in-memory status first, then get real-time status from Docker.

  let currentStatus = labStatuses[labPath] || {
    status: "stopped",
    message: "Not launched yet.",
  }; // If the lab is in a transitional state, perform a real-time check.

  if (
    currentStatus.status === "starting" ||
    currentStatus.status === "running" ||
    currentStatus.status === "unknown"
  ) {
    try {
      const realStatus = await getDockerComposeStatus(labPath);
      currentStatus = realStatus;
      labStatuses[labPath] = realStatus; // Update the in-memory cache.
    } catch (error) {
      console.error(`[BACKEND] Error getting real-time status:`, error);
      currentStatus = {
        status: "failed",
        message: "Error checking real-time status.",
      };
      labStatuses[labPath] = currentStatus;
    }
  }
  res.json(currentStatus);
});

// GET endpoint to retrieve statuses for all defined labs.
app.get("/api/labs/all-statuses", async (req, res) => {
  console.log("[BACKEND] Received request for all lab statuses.");
  const allLabPaths = [
    "routing/ospf-single-area", // Example lab path - you should add all your lab paths here.
  ];

  const statuses = {};
  for (const labPath of allLabPaths) {
    const status = await getDockerComposeStatus(labPath);
    statuses[labPath] = status;
    labStatuses[labPath] = status; // Keep cache updated.
  }
  res.json(statuses);
});

// GET endpoint to load the navigation menu from a YAML file.
app.get("/api/navigation/menu", (req, res) => {
  console.log(
    `[BACKEND] Attempting to read navigation config from: ${NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER}`,
  );
  try {
    // Read and parse the YAML file from its location inside the container.
    const fileContents = fs.readFileSync(
      NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER,
      "utf8",
    );
    const config = yaml.load(fileContents);

    if (config && Array.isArray(config.menu)) {
      // Assuming 'menu' is the top-level array key in navigation.yaml.
      res.json({ success: true, menu: config.menu });
    } else {
      console.warn(
        `[BACKEND] navigation.yaml found but 'menu' array is missing or malformed.`,
      );
      res
        .status(500)
        .json({
          success: false,
          message: "Navigation configuration malformed.",
        });
    }
  } catch (e) {
    console.error(
      `[BACKEND] Error reading or parsing navigation.yaml:`,
      e.message,
    );
    res
      .status(500)
      .json({
        success: false,
        message: `Failed to load navigation menu: ${e.message}`,
      });
  }
});

// GET endpoint to get a list of available Python scripts with full metadata.
app.get("/api/scripts/list", (req, res) => {
  console.log(
    `[BACKEND] Attempting to read main scripts config from: ${SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER}`,
  );
  try {
    // Read the main scripts configuration from `scripts.yaml`.
    const fileContents = fs.readFileSync(
      SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER,
      "utf8",
    );
    const config = yaml.load(fileContents);

    if (config && Array.isArray(config.scripts)) {
      // For each script entry, merge its main metadata with data from its individual metadata file.
      const scriptsWithFullMetadata = config.scripts.map((scriptEntry) => {
        let individualMetadata = { parameters: [], resources: [] };
        if (scriptEntry.id && scriptEntry.metadataFile) {
          // Use the helper function to read the individual metadata file.
          individualMetadata = getScriptIndividualMetadata(
            scriptEntry.id,
            scriptEntry.metadataFile,
          );
        } // Use the spread operator to merge the objects.
        return {
          ...scriptEntry,
          parameters: individualMetadata ? individualMetadata.parameters : [],
          resources: individualMetadata ? individualMetadata.resources : [],
        };
      });
      res.json({ success: true, scripts: scriptsWithFullMetadata });
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
      `[BACKEND] Error reading or parsing main scripts.yaml:`,
      e.message,
    );
    res
      .status(500)
      .json({
        success: false,
        message: `Failed to load script list: ${e.message}`,
      });
  }
});

// GET endpoint to list available inventory files from the 'data' directory.
app.get("/api/inventories/list", async (req, res) => {
  // Construct the path to the inventory directory on the host machine.
  const dataDir = path.join(__dirname, "..", "python_pipeline", "data");
  try {
    if (!fs.existsSync(dataDir)) {
      console.warn(`Inventory data directory not found: ${dataDir}`);
      return res
        .status(200)
        .json({
          success: true,
          inventories: [],
          message: "Inventory directory not found.",
        });
    } // Read the directory and filter for YAML/INI files.

    const files = await fs.promises.readdir(dataDir);
    const inventoryFiles = files.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return ext === ".yml" || ext === ".yaml" || ext === ".ini";
    });
    res.json({ success: true, inventories: inventoryFiles });
  } catch (error) {
    console.error("Error listing inventory files:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to list inventory files",
        error: error.message,
      });
  }
});

/**
 * --- MODIFIED API endpoint to run a Python script in a Docker container ---
 * This is the core endpoint that receives script parameters from the frontend and
 * constructs and executes the `docker run` command to launch the Python script.
 */
app.post("/api/scripts/run", (req, res) => {
  // Extract the script ID and the parameters from the request body.
  const { scriptId, parameters } = req.body;
  const runId =
    Date.now().toString() + Math.random().toString(36).substring(2, 9); // --- IMPORTANT DEBUGGING LOG ---
  // This log statement shows you exactly what the backend received from the frontend.
  // When debugging the "missing arguments" error, check your backend's console output
  // to see if `parameters` contains the expected 'hostname', 'username', and 'password'.

  console.log(
    `[BACKEND] Received request to run Python script: ${scriptId} (ID: ${runId}) with parameters: ${JSON.stringify(parameters)}`,
  );

  if (!scriptId) {
    return res
      .status(400)
      .json({ success: false, message: "scriptId is required." });
  } // Look up the script's definition (including its file name) from the parsed YAML config.

  const allScriptsConfig = yaml.load(
    fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"),
  );
  const scriptDefinition = allScriptsConfig.scripts.find(
    (s) => s.id === scriptId,
  );

  if (!scriptDefinition) {
    console.error(`[BACKEND] Script definition not found for ID: ${scriptId}`);
    return res
      .status(404)
      .json({ success: false, message: "Script definition not found." });
  } // Construct the full path to the Python script as it will be seen *inside the runner container*.

  const scriptInternalPath = path.join(
    SCRIPT_MOUNT_POINT_IN_CONTAINER, // /app/python-scripts
    scriptDefinition.id, // e.g., /run_jsnapy_tests
    scriptDefinition.scriptFile, // e.g., /run_jsnapy_tests.py
  ); // Initialize the run status.

  scriptRuns[runId] = { status: "running", output: "", error: "" }; // --- Build the `docker run` command and its arguments ---

  const dockerCommandArgs = [
    "run",
    "--rm", // Automatically remove the container when it exits.
    "--network",
    "host", // Allows the container to access network services on the host.
    "-v",
    `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`, // Volume mount the script directory.
    "vlabs-python-runner", // The name of the Python Docker image to use.
    "python",
    scriptInternalPath, // The path to the script inside the container.
  ]; /**
   * @bugfix The following logic to add arguments has a potential quoting issue
   * when building the shell command string. It can be fixed by ensuring a space
   * between the key and value arguments.
   */

  if (parameters) {
    // Loop through the parameters received from the frontend.
    for (const key in parameters) {
      if (Object.prototype.hasOwnProperty.call(parameters, key)) {
        const value = parameters[key]; // Add the argument key (e.g., `--hostname`).
        dockerCommandArgs.push(`--${key}`); // Add the argument value.
        // Check if the value is defined and not empty.
        if (value !== undefined && value !== null && value !== "") {
          // Push the value as a separate argument.
          // Use proper shell quoting to handle special characters or spaces in the value.
          dockerCommandArgs.push(String(value)); // A more direct approach to see if it works.
          // The original code had complex quoting. Let's simplify and test this first.
          // Original: dockerCommandArgs.push(`'${String(value).replace(/'/g, "'\\''")}'`);
        }
      }
    }
  } // Join all the arguments with spaces to form the final shell command string.

  const command = `docker ${dockerCommandArgs.join(" ")}`;
  console.log(`[BACKEND] Executing Docker command: ${command}`); // Execute the Docker command with a timeout.

  exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
    // Callback function to handle the command's result.
    if (error) {
      // If there's an error, log it and send a failure response.
      console.error(
        `[BACKEND] Error running Python script ${scriptId}:`,
        error.message,
      );
      console.error(`[BACKEND] Script Stderr:`, stderr);
      scriptRuns[runId] = {
        status: "failed",
        output: stdout,
        error: stderr || error.message,
      };
      return res.status(500).json({
        success: false,
        message: `Script execution failed: ${stderr || error.message}`,
        output: stdout,
        error: stderr || error.message,
      });
    } // If the command succeeds, log the output and send a success response.

    console.log(`[BACKEND] Script ${scriptId} stdout:\n${stdout}`);
    if (stderr) {
      console.warn(`[BACKEND] Script ${scriptId} stderr:\n${stderr}`);
    }

    scriptRuns[runId] = { status: "completed", output: stdout, error: stderr };
    res.json({ success: true, output: stdout, error: stderr });
  });
});

// Start the Express server and log the listening port and key configuration paths.
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
