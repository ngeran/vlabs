// backend/server.js

/**
 * @file Enhanced Express.js server for the vLabs backend.
 * @description This server manages Docker-based labs, dynamic script listing,
 *              metadata-driven script execution, and advanced test discovery for capable scripts.
 * @author nikos-geranios_vgi
 * @date 2025-06-27 12:55:09 UTC
 */

const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");

const app = express();
const port = 3001;

// --- Middleware Setup ---
app.use(cors());
app.use(express.json());

// --- Configuration Constants ---
const LABS_BASE_PATH_IN_CONTAINER = "/public";
const PYTHON_PIPELINE_PATH_ON_HOST = process.env.HOST_PROJECT_ROOT
  ? path.join(process.env.HOST_PROJECT_ROOT, "python_pipeline")
  : path.resolve(__dirname, "../../python_pipeline");
const SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER = "/python_pipeline/scripts.yaml";
const PYTHON_PIPELINE_BASE_PATH_IN_CONTAINER = "/python_pipeline";
const SCRIPT_MOUNT_POINT_IN_CONTAINER = "/app/python-scripts";
const NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER = "/public/navigation.yaml";

// --- In-Memory State ---
const labStatuses = {};
const scriptRuns = {};
const testDiscoveryCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

// ====================================================================================
// === HELPER FUNCTIONS ===============================================================
// ====================================================================================

/**
 * @description Gets the real-time status of a Docker Compose lab by executing `docker compose ps`.
 * @param {string} labPath - The relative path to the lab directory (e.g., "routing/ospf-single-area").
 * @returns {Promise<object>} A promise that resolves with a status object.
 */
const getDockerComposeStatus = (labPath) => {
  return new Promise((resolve) => {
    const labDirectory = path.join(LABS_BASE_PATH_IN_CONTAINER, labPath);
    const dockerComposeFilePath = path.join(labDirectory, "docker-compose.yml");

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
    exec(command, { cwd: labDirectory }, (error, stdout, stderr) => {
      if (error) {
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
        return resolve({
          status: "stopped",
          message: "No active containers found for this lab.",
        });
      }
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
        .filter(Boolean);
      const allRunning = services.every((s) => s.State === "running");
      if (allRunning)
        return resolve({
          status: "running",
          message: "All lab containers are running.",
        });
      if (services.some((s) => s.State === "exited" || s.State === "degraded"))
        return resolve({
          status: "failed",
          message: "Some lab containers have exited or are unhealthy.",
        });
      if (services.some((s) => s.State === "starting"))
        return resolve({
          status: "starting",
          message: "Lab containers are still starting.",
        });
      resolve({ status: "unknown", message: "Lab status is indeterminate." });
    });
  });
};

/**
 * @description Loads and parses the individual metadata.yml file for a single script.
 * @param {string} scriptId - The ID of the script (used as the directory name).
 * @param {string} metadataFileName - The name of the metadata file (e.g., "metadata.yml").
 * @returns {object | null} The parsed metadata object, or null if an error occurs.
 */
const getScriptIndividualMetadata = (scriptId, metadataFileName) => {
  if (!scriptId || !metadataFileName) return null;
  let metadataPathInContainer;
  try {
    metadataPathInContainer = path.join(
      PYTHON_PIPELINE_BASE_PATH_IN_CONTAINER,
      scriptId,
      metadataFileName,
    );
    const fileContents = fs.readFileSync(metadataPathInContainer, "utf8");
    return yaml.load(fileContents);
  } catch (e) {
    console.error(
      `[BACKEND] Error processing metadata for script "${scriptId}". Path: ${metadataPathInContainer}. Error: ${e.message}`,
    );
    return null;
  }
};

/**
 * @description Executes a Python script in a Docker container to discover its available tests.
 * @param {string} scriptId - The ID of the script to run discovery for.
 * @param {string} [environment='development'] - The target environment for discovery.
 * @returns {Promise<object>} A promise that resolves with the test discovery results.
 */
const executeTestDiscovery = (scriptId, environment = "development") => {
  return new Promise((resolve, reject) => {
    const cacheKey = `${scriptId}-${environment}`;
    const cached = testDiscoveryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[BACKEND] Using cached test discovery for ${cacheKey}`);
      return resolve(cached.data);
    }

    const allScriptsConfig = yaml.load(
      fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"),
    );
    const scriptDefinition = allScriptsConfig.scripts.find(
      (s) => s.id === scriptId,
    );
    if (!scriptDefinition)
      return reject(
        new Error(`Script definition not found for ID: ${scriptId}`),
      );

    const scriptInternalPath = path.join(
      SCRIPT_MOUNT_POINT_IN_CONTAINER,
      scriptDefinition.id,
      scriptDefinition.scriptFile,
    );
    const dockerCommandArgs = [
      "run",
      "--rm",
      "--network",
      "host",
      "-v",
      `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`,
      "vlabs-python-runner",
      "python",
      scriptInternalPath,
      "--hostname",
      "discovery-mode",
      "--username",
      "discovery-mode",
      "--password",
      "discovery-mode",
      "--environment",
      environment,
      "--list_tests",
    ];
    const command = `docker ${dockerCommandArgs.join(" ")}`;
    console.log(`[BACKEND] Executing test discovery command: ${command}`);

    exec(command, { timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        console.error(
          `[BACKEND] Test discovery error for ${scriptId}:`,
          error.message,
        );
        console.error(`[BACKEND] Discovery stderr:`, stderr);
        return reject(
          new Error(`Test discovery failed: ${stderr || error.message}`),
        );
      }
      try {
        const discoveryResult = JSON.parse(stdout);
        const enhancedResult = {
          ...discoveryResult,
          backend_metadata: {
            discovery_time: new Date().toISOString(),
            cache_key: cacheKey,
            script_id: scriptId,
            target_environment: environment,
            discovered_by: "nikos-geranios_vgi",
          },
        };
        testDiscoveryCache.set(cacheKey, {
          data: enhancedResult,
          timestamp: Date.now(),
        });
        console.log(
          `[BACKEND] Test discovery successful for ${scriptId}. Found ${Object.keys(discoveryResult.discovered_tests || {}).length} tests`,
        );
        resolve(enhancedResult);
      } catch (parseError) {
        console.error(
          `[BACKEND] Failed to parse test discovery output:`,
          parseError.message,
        );
        console.error(`[BACKEND] Raw output:`, stdout);
        reject(
          new Error(
            `Failed to parse test discovery output: ${parseError.message}`,
          ),
        );
      }
    });
  });
};

// ====================================================================================
// === API ENDPOINTS ==================================================================
// ====================================================================================

// In server.js, add this somewhere in the API ENDPOINTS section

/**
 * @description Creates a dedicated directory for script outputs if it doesn't exist.
 * @returns {string} The absolute path to the output directory.
 */
function ensureOutputDirectory() {
  // Note: This path is relative to the *host* machine, not the container,
  // because that's where the python_pipeline is mounted from.
  const outputDir = path.join(PYTHON_PIPELINE_PATH_ON_HOST, "output");
  if (!fs.existsSync(outputDir)) {
    console.log(`[BACKEND] Creating output directory at: ${outputDir}`);
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

/**
 * @description API endpoint to save text content to a file in the output directory.
 * @route POST /api/output/save
 * @body {{filename: string, content: string}} The desired filename and the text content to save.
 */
app.post("/api/output/save", async (req, res) => {
  const { filename, content } = req.body;

  if (!filename || !content) {
    return res
      .status(400)
      .json({ success: false, message: "Filename and content are required." });
  }

  // --- Security Check ---
  // Sanitize filename to prevent directory traversal attacks (e.g., '..', '/')
  const safeFilename = path.basename(filename);
  if (safeFilename !== filename) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid filename." });
  }

  try {
    const outputDir = ensureOutputDirectory();
    const filePath = path.join(outputDir, safeFilename);

    await fs.promises.writeFile(filePath, content, "utf8");

    console.log(`[BACKEND] Successfully saved output to ${filePath}`);
    res.json({
      success: true,
      message: `Output saved successfully to ${safeFilename}`,
    });
  } catch (error) {
    console.error(`[BACKEND] Error saving output file:`, error);
    res
      .status(500)
      .json({ success: false, message: "Failed to save output file." });
  }
});

/**
 * @description API endpoint to dynamically discover tests for a script.
 * @route POST /api/scripts/discover-tests
 * @body {{scriptId: string, environment?: string}} The request body.
 */
app.post("/api/scripts/discover-tests", async (req, res) => {
  try {
    const { scriptId, environment = "development" } = req.body;
    console.log(
      `[BACKEND] Test discovery request received for script: ${scriptId}`,
    );

    if (!scriptId) {
      return res
        .status(400)
        .json({ success: false, message: "scriptId is required" });
    }

    const allScriptsConfig = yaml.load(
      fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"),
    );
    const scriptEntry = allScriptsConfig.scripts.find((s) => s.id === scriptId);
    if (!scriptEntry) {
      return res.status(404).json({
        success: false,
        message: `Script with ID "${scriptId}" not found.`,
      });
    }

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
    res.json({
      success: true,
      ...discoveryResult,
      api_metadata: {
        endpoint: "/api/scripts/discover-tests",
        request_time: new Date().toISOString(),
        script_id: scriptId,
        environment: environment,
        cache_used: testDiscoveryCache.has(`${scriptId}-${environment}`),
      },
    });
  } catch (error) {
    console.error(`[BACKEND] Test discovery API error:`, error.message);
    res.status(500).json({
      success: false,
      message: `Test discovery failed: ${error.message}`,
    });
  }
});

/**
 * @description API endpoint to clear the test discovery cache, either for a specific script or entirely.
 * @route POST /api/scripts/clear-discovery-cache
 * @body {{scriptId?: string}} Optional scriptId to clear a specific cache.
 */
app.post("/api/scripts/clear-discovery-cache", (req, res) => {
  try {
    const { scriptId } = req.body;
    if (scriptId) {
      const keysToDelete = [];
      for (const key of testDiscoveryCache.keys()) {
        if (key.startsWith(`${scriptId}-`)) keysToDelete.push(key);
      }
      keysToDelete.forEach((key) => testDiscoveryCache.delete(key));
      console.log(
        `[BACKEND] Cleared test discovery cache for script: ${scriptId}`,
      );
      res.json({
        success: true,
        message: `Cache cleared for script: ${scriptId}`,
        cleared_entries: keysToDelete.length,
        timestamp: new Date().toISOString(),
      });
    } else {
      const cacheSize = testDiscoveryCache.size;
      testDiscoveryCache.clear();
      console.log(`[BACKEND] Cleared entire test discovery cache`);
      res.json({
        success: true,
        message: "Entire test discovery cache cleared",
        cleared_entries: cacheSize,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error(`[BACKEND] Cache clear error:`, error.message);
    res.status(500).json({
      success: false,
      message: `Failed to clear cache: ${error.message}`,
    });
  }
});

/**
 * @description API endpoint to get statistics about the test discovery cache.
 * @route GET /api/scripts/discovery-cache-stats
 */
app.get("/api/scripts/discovery-cache-stats", (req, res) => {
  try {
    const stats = {
      total_entries: testDiscoveryCache.size,
      entries: [],
      cache_duration_minutes: CACHE_DURATION / 60000,
      current_time: new Date().toISOString(),
    };
    for (const [key, value] of testDiscoveryCache.entries()) {
      const age = Date.now() - value.timestamp;
      stats.entries.push({
        cache_key: key,
        age_seconds: Math.round(age / 1000),
        is_expired: age > CACHE_DURATION,
        test_count: Object.keys(value.data.discovered_tests || {}).length,
        cached_at: new Date(value.timestamp).toISOString(),
      });
    }
    res.json({ success: true, cache_statistics: stats });
  } catch (error) {
    console.error(`[BACKEND] Cache stats error:`, error.message);
    res.status(500).json({
      success: false,
      message: `Failed to get cache stats: ${error.message}`,
    });
  }
});

/**
 * @description API endpoint to launch a Docker Compose lab.
 * @route POST /api/labs/launch
 * @body {{labPath: string}} The path to the lab to launch.
 */
app.post("/api/labs/launch", async (req, res) => {
  const { labPath } = req.body;
  if (!labPath)
    return res
      .status(400)
      .json({ success: false, message: "labPath is required." });

  const labDirectory = path.join(LABS_BASE_PATH_IN_CONTAINER, labPath);
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
    res.json({
      success: true,
      message: "Lab launch command sent. Polling for status...",
    });
  });
});

/**
 * @description API endpoint to stop a Docker Compose lab.
 * @route POST /api/labs/stop
 * @body {{labPath: string}} The path to the lab to stop.
 */
app.post("/api/labs/stop", (req, res) => {
  const { labPath } = req.body;
  if (!labPath)
    return res
      .status(400)
      .json({ success: false, message: "labPath is required." });

  const labDirectory = path.join(LABS_BASE_PATH_IN_CONTAINER, labPath);
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
 * @query {string} labPath - The path to the lab.
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
      const realStatus = await getDockerComposeStatus(labPath);
      currentStatus = realStatus;
      labStatuses[labPath] = realStatus;
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
  console.log("[BACKEND] Received request for all lab statuses.");
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
 * @description API endpoint to list all available Python scripts with their full metadata.
 * @route GET /api/scripts/list
 */
app.get("/api/scripts/list", (req, res) => {
  console.log(`[BACKEND] Reading main scripts config`);
  try {
    const fileContents = fs.readFileSync(
      SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER,
      "utf8",
    );
    const config = yaml.load(fileContents);
    if (config && Array.isArray(config.scripts)) {
      const scriptsWithFullMetadata = config.scripts.map((scriptEntry) => {
        const individualMetadata = getScriptIndividualMetadata(
          scriptEntry.id,
          scriptEntry.metadataFile,
        );
        return { ...scriptEntry, ...individualMetadata };
      });
      res.json({ success: true, scripts: scriptsWithFullMetadata });
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

/**
 * @description API endpoint to list available inventory files from the data directory.
 * @route GET /api/inventories/list
 */
app.get("/api/inventories/list", async (req, res) => {
  const dataDir = path.join(__dirname, "..", "python_pipeline", "data");
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
 * @description API endpoint to execute a Python script.
 * @route POST /api/scripts/run
 * @body {{scriptId: string, parameters: object}} The script to run and its parameters.
 */
app.post("/api/scripts/run", (req, res) => {
  const { scriptId, parameters } = req.body;
  const runId =
    Date.now().toString() + Math.random().toString(36).substring(2, 9);
  console.log(
    `[BACKEND] Running script: ${scriptId} (ID: ${runId}) with params:`,
    JSON.stringify(parameters),
  );

  if (!scriptId)
    return res
      .status(400)
      .json({ success: false, message: "scriptId is required." });

  const allScriptsConfig = yaml.load(
    fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"),
  );
  const scriptDefinition = allScriptsConfig.scripts.find(
    (s) => s.id === scriptId,
  );
  if (!scriptDefinition)
    return res
      .status(404)
      .json({ success: false, message: "Script definition not found." });

  const scriptInternalPath = path.join(
    SCRIPT_MOUNT_POINT_IN_CONTAINER,
    scriptDefinition.id,
    scriptDefinition.scriptFile,
  );
  scriptRuns[runId] = { status: "running", output: "", error: "" };
  const dockerCommandArgs = [
    "run",
    "--rm",
    "--network",
    "host",
    "-v",
    `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`,
    "vlabs-python-runner",
    "python",
    scriptInternalPath,
  ];
  if (parameters) {
    for (const key in parameters) {
      if (Object.prototype.hasOwnProperty.call(parameters, key)) {
        const value = parameters[key];
        dockerCommandArgs.push(`--${key}`);
        if (value !== undefined && value !== null && value !== "") {
          dockerCommandArgs.push(String(value));
        }
      }
    }
  }
  const command = `docker ${dockerCommandArgs.join(" ")}`;
  console.log(`[BACKEND] Executing Docker command: ${command}`);

  const timeout = parameters?.list_tests ? 60000 : 30000;
  exec(command, { timeout }, (error, stdout, stderr) => {
    if (error) {
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
    }
    scriptRuns[runId] = { status: "completed", output: stdout, error: stderr };
    const response = {
      success: true,
      output: stdout,
      error: stderr,
      run_id: runId,
      script_id: scriptId,
    };
    if (parameters?.list_tests) {
      try {
        const discoveryData = JSON.parse(stdout);
        response.discovery_metadata = {
          test_count: Object.keys(discoveryData.discovered_tests || {}).length,
          environment: parameters.environment || "development",
        };
      } catch (parseError) {
        console.warn(`[BACKEND] Could not parse discovery output as JSON`);
      }
    }
    res.json(response);
  });
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
    version: "Enhanced with Test Discovery API",
    enhanced_by: "nikos-geranios_vgi",
    enhanced_at: "2025-06-27 12:55:09",
    features: {
      test_discovery: true,
      environment_awareness: true,
      cache_enabled: true,
      cache_entries: testDiscoveryCache.size,
    },
  });
});

// --- DEPRECATED ENDPOINT ---
// The /api/jsnapy/tests endpoint is no longer needed because /api/scripts/discover-tests
// is more powerful and generic. It is safe to remove this block.
/*
app.get("/api/jsnapy/tests", (req, res) => {
  const testsDir = path.join(PYTHON_PIPELINE_BASE_PATH_IN_CONTAINER, "run_jsnapy_tests", "tests");
  try {
    const testFiles = fs.readdirSync(testsDir);
    const testNames = testFiles
      .filter((file) => /\.(ya?ml)$/i.test(file))
      .map((file) => path.basename(file, path.extname(file)));
    res.json({ success: true, tests: testNames });
  } catch (error) {
    res.status(500).json({ success: false, message: "Unable to list JSNAPy test files", error: error.message });
  }
});
*/

// --- Server Start ---
app.listen(port, () => {
  console.log(
    `[BACKEND] Enhanced Server listening at http://localhost:${port}`,
  );
  console.log(
    `[BACKEND] Enhanced by: nikos-geranios_vgi at 2025-06-27 12:55:09`,
  );
  console.log(
    `[BACKEND] Features: Test Discovery, Environment Awareness, Caching`,
  );
  console.log(
    `[BACKEND] Scripts config: ${SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER}`,
  );
  console.log(
    `[BACKEND] Python pipeline host path: ${PYTHON_PIPELINE_PATH_ON_HOST}`,
  );
  console.log(
    `[BACKEND] Navigation config: ${NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER}`,
  );
  console.log(
    `[BACKEND] New API Endpoints: POST /api/scripts/discover-tests, POST /api/scripts/clear-discovery-cache, GET /api/scripts/discovery-cache-stats, GET /api/health`,
  );
});
