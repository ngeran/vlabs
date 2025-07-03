// backend/server.js

/**
 * @file Enhanced Express.js server for the vLabs backend.
 * @description This server uses robust process management (`spawn`) to interact with
 *              child Python scripts, preventing connection reset errors during I/O operations.
 *              It manages labs, scripts, and report generation.
 * @author nikos-geranios_vgi
 * @date 2025-06-27 12:55:09 UTC
 */

const express = require("express");
const cors = require("cors");
const { exec, spawn } = require("child_process"); // Import both exec and spawn
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");

const app = express();
const port = 3001;

// --- ✨ NEW: GLOBAL EXCEPTION HANDLER (SAFETY NET) ✨ ---
// This will catch any error that isn't handled elsewhere and would crash the server.
process.on("uncaughtException", (err, origin) => {
  console.error("============================================");
  console.error("====== UNCAUGHT EXCEPTION! SHUTTING DOWN =====");
  console.error("============================================");
  console.error("Error:", err.stack || err);
  console.error("Origin:", origin);
  console.error("============================================");
  // In a real production app, you might try a graceful shutdown, but for debugging,
  // just exiting is fine after logging the error.
  process.exit(1);
});

// --- Middleware Setup ---
app.use(cors());
app.use(express.json());

// --- Configuration Constants ---
const PYTHON_PIPELINE_MOUNT_PATH = "/python_pipeline";
const PUBLIC_MOUNT_PATH = "/public";
const SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER = path.join(
  PYTHON_PIPELINE_MOUNT_PATH,
  "scripts.yaml",
);
const NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER = path.join(
  PUBLIC_MOUNT_PATH,
  "navigation.yaml",
);
const PYTHON_PIPELINE_PATH_ON_HOST = path.join(
  process.env.HOST_PROJECT_ROOT,
  "python_pipeline",
);
const SCRIPT_MOUNT_POINT_IN_CONTAINER = "/app/python-scripts";

// --- In-Memory State ---
const labStatuses = {};
const scriptRuns = {};
const testDiscoveryCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;

// ====================================================================================
// === HELPER FUNCTIONS ===============================================================
// ====================================================================================

/**
 * @description Gets the real-time status of a Docker Compose lab.
 * @param {string} labPath - The relative path to the lab directory.
 * @returns {Promise<object>} A promise that resolves with a status object.
 */
const getDockerComposeStatus = (labPath) => {
  return new Promise((resolve) => {
    const labDirectory = path.join(PUBLIC_MOUNT_PATH, labPath);
    const dockerComposeFilePath = path.join(labDirectory, "docker-compose.yml");
    if (!fs.existsSync(dockerComposeFilePath)) {
      return resolve({
        status: "stopped",
        message: "Lab definition file not found.",
      });
    }
    const command = `docker compose -f "${dockerComposeFilePath}" ps --format json`;
    exec(command, { cwd: labDirectory }, (error, stdout) => {
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
};

/**
 * @description Loads and parses the individual metadata.yml file for a single script.
 * @param {string} scriptId - The ID of the script.
 * @param {string} metadataFileName - The name of the metadata file.
 * @returns {object | null} The parsed metadata object, or null if an error occurs.
 */
const getScriptIndividualMetadata = (scriptId, metadataFileName) => {
  if (!scriptId || !metadataFileName) return null;
  let p;
  try {
    p = path.join(PYTHON_PIPELINE_MOUNT_PATH, scriptId, metadataFileName);
    return yaml.load(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.error(
      `[BACKEND] Error processing metadata for script "${scriptId}". Path: ${p}. Error: ${e.message}`,
    );
    return null;
  }
};

/**
 * @description Executes a Python script in a Docker container for test discovery.
 * @param {string} scriptId - The ID of the script.
 * @param {string} [environment='development'] - The target environment.
 * @returns {Promise<object>} A promise resolving with test discovery results.
 */
const executeTestDiscovery = (scriptId, environment = "development") => {
  return new Promise((resolve, reject) => {
    const cacheKey = `${scriptId}-${environment}`;
    const cached = testDiscoveryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION)
      return resolve(cached.data);
    const scriptsCfg = yaml.load(
      fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"),
    );
    const scriptDef = scriptsCfg.scripts.find((s) => s.id === scriptId);
    if (!scriptDef)
      return reject(
        new Error(`Script definition not found for ID: ${scriptId}`),
      );
    const scriptPath = path.join(
      SCRIPT_MOUNT_POINT_IN_CONTAINER,
      scriptDef.id,
      scriptDef.scriptFile,
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
      "--environment",
      environment,
    ];
    exec(`docker ${args.join(" ")}`, { timeout: 60000 }, (err, stdout) => {
      if (err)
        return reject(new Error(`Test discovery failed: ${err.message}`));
      try {
        const result = {
          ...JSON.parse(stdout),
          backend_metadata: { discovery_time: new Date().toISOString() },
        };
        testDiscoveryCache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
        });
        resolve(result);
      } catch (pErr) {
        reject(
          new Error(`Failed to parse test discovery output: ${pErr.message}`),
        );
      }
    });
  });
};

/**
 * @description Creates a dedicated directory for script outputs if it doesn't exist.
 * @returns {string} The absolute path to the output directory inside the container.
 */
function ensureOutputDirectory() {
  const outputDir = path.join(PYTHON_PIPELINE_MOUNT_PATH, "output");
  if (!fs.existsSync(outputDir)) {
    console.log(
      `[BACKEND] Creating output directory at (inside container): ${outputDir}`,
    );
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

/**
 * @description API endpoint to dynamically discover tests for a script.
 * @route POST /api/scripts/discover-tests
 */
app.post("/api/scripts/discover-tests", async (req, res) => {
  try {
    const { scriptId, environment = "development" } = req.body;
    if (!scriptId)
      return res
        .status(400)
        .json({ success: false, message: "scriptId is required" });

    const allScriptsConfig = yaml.load(
      fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"),
    );
    const scriptEntry = allScriptsConfig.scripts.find((s) => s.id === scriptId);
    if (!scriptEntry)
      return res.status(404).json({
        success: false,
        message: `Script with ID "${scriptId}" not found.`,
      });

    const individualMetadata = getScriptIndividualMetadata(
      scriptEntry.id,
      scriptEntry.metadataFile,
    );
    const scriptDefinition = { ...scriptEntry, ...individualMetadata };

    if (!scriptDefinition.capabilities?.dynamicDiscovery) {
      return res.status(400).json({
        success: false,
        message: `Test discovery not supported for script: ${scriptId}.`,
      });
    }

    const validEnvironments = ["development", "lab", "staging", "production"];
    if (!validEnvironments.includes(environment)) {
      return res.status(400).json({
        success: false,
        message: `Invalid environment: ${environment}`,
      });
    }

    const discoveryResult = await executeTestDiscovery(scriptId, environment);
    res.json({ success: true, ...discoveryResult });
  } catch (error) {
    console.error(`[BACKEND] Test discovery API error:`, error.message);
    res.status(500).json({
      success: false,
      message: `Test discovery failed: ${error.message}`,
    });
  }
});

// ====================================================================================
// === API ENDPOINTS ==================================================================
// ====================================================================================

/**
 * @description API endpoint to generate a formatted text report and save it to a file.
 *              This version has enhanced error handling to prevent double-sending responses.
 * @route POST /api/report/generate
 */
app.post("/api/report/generate", (req, res) => {
  const { filename, jsonData } = req.body;
  if (!filename || !jsonData)
    return res
      .status(400)
      .json({ success: false, message: "Filename and jsonData are required." });

  const safeFilename = path.basename(filename);
  if (safeFilename !== filename)
    return res
      .status(400)
      .json({ success: false, message: "Invalid filename." });

  const reportScriptPath = path.join(
    PYTHON_PIPELINE_MOUNT_PATH,
    "utils",
    "generate_report.py",
  );

  try {
    const child = spawn("python3", [reportScriptPath]);
    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    // --- HARDENED ERROR HANDLING ---
    // This flag ensures we only send one response.
    let responseSent = false;

    child.on("error", (spawnError) => {
      if (responseSent) return;
      responseSent = true;
      console.error(
        `[BACKEND] Failed to start report generation script: ${spawnError.message}`,
      );
      res
        .status(500)
        .json({
          success: false,
          message: "Failed to start the report generation process.",
        });
    });

    child.on("close", (code) => {
      if (responseSent) return;
      responseSent = true;

      if (code !== 0) {
        console.error(
          `[BACKEND] Report generation script exited with code ${code}: ${stderrData}`,
        );
        return res
          .status(500)
          .json({
            success: false,
            message: `Report generator failed: ${stderrData}`,
          });
      }

      const outputDir = ensureOutputDirectory();
      const filePath = path.join(outputDir, safeFilename);

      fs.writeFile(filePath, stdoutData, "utf8", (writeErr) => {
        if (writeErr) {
          console.error(`[BACKEND] Error saving report file:`, writeErr);
          return res
            .status(500)
            .json({
              success: false,
              message: "Failed to save the report file.",
            });
        }
        res.json({ success: true, message: `Report saved to ${safeFilename}` });
      });
    });

    child.stdin.write(JSON.stringify(jsonData));
    child.stdin.end();
  } catch (e) {
    console.error(`[BACKEND] Unhandled error in /api/report/generate:`, e);
    if (!res.headersSent) {
      res
        .status(500)
        .json({
          success: false,
          message: "An unexpected server error occurred.",
        });
    }
  }
});

/**
 * @description API endpoint to list all available Python scripts with their full metadata.
 * @route GET /api/scripts/list
 */
app.get("/api/scripts/list", (req, res) => {
  try {
    const config = yaml.load(
      fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"),
    );
    if (config && Array.isArray(config.scripts)) {
      const scripts = config.scripts.map((s) => ({
        ...s,
        ...getScriptIndividualMetadata(s.id, s.metadataFile),
      }));
      res.json({ success: true, scripts: scripts });
    } else {
      res
        .status(500)
        .json({ success: false, message: "Scripts configuration malformed." });
    }
  } catch (e) {
    res.status(500).json({
      success: false,
      message: `Failed to load script list: ${e.message}`,
    });
  }
});

// ====================================================================================
// === RUN THE SCRIPT =================================================================
// ====================================================================================

/**
 * @description API endpoint to execute a Python script using the robust `spawn` method.
 * @route POST /api/scripts/run
 * @body {{scriptId: string, parameters: object}} The script to run and its parameters.
 */
app.post("/api/scripts/run", (req, res) => {
  const { scriptId, parameters } = req.body;
  if (!scriptId)
    return res
      .status(400)
      .json({ success: false, message: "scriptId is required." });

  const config = yaml.load(
    fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"),
  );
  const scriptDef = config.scripts.find((s) => s.id === scriptId);
  if (!scriptDef)
    return res
      .status(404)
      .json({ success: false, message: "Script definition not found." });

  const scriptPath = path.join(
    SCRIPT_MOUNT_POINT_IN_CONTAINER,
    scriptDef.id,
    scriptDef.scriptFile,
  );

  // --- ✨ THE ELEGANT AND CORRECT FIX IS HERE ✨ ---
  // We are replacing 'exec' with 'spawn'.

  // 1. Prepare the arguments for the 'docker' command as an array.
  const dockerArgs = [
    "run",
    "--rm",
    "-v",
    `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`,
    "vlabs-python-runner",
    "python",
    scriptPath,
  ];
  if (parameters) {
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined && value !== null && value !== "") {
        dockerArgs.push(`--${key}`);
        dockerArgs.push(String(value));
      }
    }
  }

  console.log(
    `[BACKEND] Spawning Docker command: docker ${dockerArgs.join(" ")}`,
  );

  try {
    // 2. Use spawn to execute the command.
    const child = spawn("docker", dockerArgs);

    let stdout = "";
    let stderr = "";

    // 3. Listen for data on the stdout and stderr streams.
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    // 4. Listen for errors during the spawn process itself.
    child.on("error", (err) => {
      console.error(
        `[BACKEND] Failed to start script execution process: ${err.message}`,
      );
      return res
        .status(500)
        .json({ success: false, message: "Failed to start script container." });
    });

    // 5. When the process closes, send the final response.
    child.on("close", (code) => {
      // The Python script is designed to always exit with code 0.
      // A non-zero code indicates a Docker-level failure.
      if (code !== 0) {
        console.error(
          `[BACKEND] Script execution process exited with code ${code}: ${stderr}`,
        );
        return res.status(500).json({
          success: false,
          message: `Script execution failed: ${stderr}`,
          output: stdout,
          error: stderr,
        });
      }

      // Success case
      console.log(`[BACKEND] Script execution completed successfully.`);
      res.json({ success: true, output: stdout, error: stderr });
    });
  } catch (e) {
    console.error(`[BACKEND] Unhandled error in /api/scripts/run:`, e);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred while running the script.",
    });
  }
});

// ====================================================================================
// === INVENTORY LIST =================================================================
// ====================================================================================

/**
 * @description API endpoint to list available inventory files from the data directory.
 * @route GET /api/inventories/list
 */
app.get("/api/inventories/list", async (req, res) => {
  const dataDir = path.join(PYTHON_PIPELINE_MOUNT_PATH, "data");
  try {
    if (!fs.existsSync(dataDir)) {
      return res.status(200).json({
        success: true,
        inventories: [],
        message: "Inventory directory not found.",
      });
    }
    const files = await fs.promises.readdir(dataDir);
    const inventoryFiles = files.filter((file) => /\.(ya?ml|ini)$/i.test(file));
    res.json({ success: true, inventories: inventoryFiles });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to list inventory files",
      error: error.message,
    });
  }
});

/**
 * @description API endpoint to launch a Docker Compose lab.
 * @route POST /api/labs/launch
 */
app.post("/api/labs/launch", async (req, res) => {
  const { labPath } = req.body;
  if (!labPath)
    return res
      .status(400)
      .json({ success: false, message: "labPath is required." });
  const labDirectory = path.join(PUBLIC_MOUNT_PATH, labPath);
  if (!fs.existsSync(path.join(labDirectory, "docker-compose.yml"))) {
    return res
      .status(404)
      .json({ success: false, message: "Lab definition file not found." });
  }
  labStatuses[labPath] = {
    status: "starting",
    message: "Initiating lab launch...",
  };
  const command = `docker compose -f "${path.join(labDirectory, "docker-compose.yml")}" up -d`;
  exec(command, { cwd: labDirectory }, (error) => {
    if (error) {
      labStatuses[labPath] = {
        status: "failed",
        message: `Launch failed: ${error.message}`,
      };
      return res.status(500).json({
        success: false,
        message: `Failed to launch lab: ${error.message}`,
      });
    }
    res.json({ success: true, message: "Lab launch command sent." });
  });
});

/**
 * @description API endpoint to stop a Docker Compose lab.
 * @route POST /api/labs/stop
 */
app.post("/api/labs/stop", (req, res) => {
  const { labPath } = req.body;
  if (!labPath)
    return res
      .status(400)
      .json({ success: false, message: "labPath is required." });
  const labDirectory = path.join(PUBLIC_MOUNT_PATH, labPath);
  if (!fs.existsSync(path.join(labDirectory, "docker-compose.yml"))) {
    return res
      .status(404)
      .json({ success: false, message: "Lab definition file not found." });
  }
  labStatuses[labPath] = {
    status: "stopping",
    message: "Initiating lab stop...",
  };
  const command = `docker compose -f "${path.join(labDirectory, "docker-compose.yml")}" down`;
  exec(command, { cwd: labDirectory }, (error) => {
    if (error) {
      labStatuses[labPath] = {
        status: "failed",
        message: `Stop failed: ${error.message}`,
      };
      return res.status(500).json({
        success: false,
        message: `Failed to stop lab: ${error.message}`,
      });
    }
    labStatuses[labPath] = { status: "stopped", message: "Lab stopped." };
    res.json({ success: true, message: "Lab stopped successfully." });
  });
});

/**
 * @description API endpoint to get the status of a single lab.
 * @route GET /api/labs/status-by-path
 */
app.get("/api/labs/status-by-path", async (req, res) => {
  const { labPath } = req.query;
  if (!labPath)
    return res
      .status(400)
      .json({ success: false, message: "labPath is required." });
  let currentStatus = labStatuses[labPath] || {
    status: "stopped",
    message: "Not launched yet.",
  };
  if (["starting", "running", "unknown"].includes(currentStatus.status)) {
    try {
      currentStatus = await getDockerComposeStatus(labPath);
      labStatuses[labPath] = currentStatus;
    } catch (error) {
      currentStatus = {
        status: "failed",
        message: "Error checking real-time status.",
      };
      labStatuses[labPath] = currentStatus;
    }
  }
  res.json(currentStatus);
});

/**
 * @description API endpoint to retrieve statuses for all defined labs.
 * @route GET /api/labs/all-statuses
 */
app.get("/api/labs/all-statuses", async (req, res) => {
  const allLabPaths = ["routing/ospf-single-area"]; // This could be made dynamic
  const statuses = {};
  for (const labPath of allLabPaths) {
    const status = await getDockerComposeStatus(labPath);
    statuses[labPath] = status;
    labStatuses[labPath] = status;
  }
  res.json(statuses);
});

/**
 * @description API endpoint to load the navigation menu from a YAML file.
 * @route GET /api/navigation/menu
 */
app.get("/api/navigation/menu", (req, res) => {
  try {
    const fileContents = fs.readFileSync(
      NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER,
      "utf8",
    );
    const config = yaml.load(fileContents);
    if (config && Array.isArray(config.menu)) {
      res.json({ success: true, menu: config.menu });
    } else {
      res.status(500).json({
        success: false,
        message: "Navigation configuration malformed.",
      });
    }
  } catch (e) {
    res.status(500).json({
      success: false,
      message: `Failed to load navigation menu: ${e.message}`,
    });
  }
});

/**
 * @description API endpoint for a simple health check of the server.
 * @route GET /api/health
 */
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// --- Server Start ---
app.listen(port, () => {
  console.log(
    `[BACKEND] Enhanced Server listening at http://localhost:${port}`,
  );
  console.log(
    `[BACKEND] Python pipeline host path: ${PYTHON_PIPELINE_PATH_ON_HOST}`,
  );
  console.log(
    `[BACKEND] Python pipeline container mount: ${PYTHON_PIPELINE_MOUNT_PATH}`,
  );
  console.log(`[BACKEND] Public container mount: ${PUBLIC_MOUNT_PATH}`);
});
