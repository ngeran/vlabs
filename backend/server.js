// backend/server.js

/**
 * @file Enhanced Express.js server for the vLabs backend with Test Discovery API.
 * Enhanced by: nikos-geranios_vgi
 * Date: 2025-06-27 12:55:09 UTC
 *
 * New Features:
 * - Dynamic test discovery API for JSNAPy tests
 * - Environment-aware test filtering
 * - Safety validation for production environments
 * - Interactive test selection support
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
app.use(cors());
app.use(express.json());

// --- Docker Container Paths and Configuration ---
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

// ✨ NEW: Test discovery cache to improve performance
const testDiscoveryCache = new Map(); // Cache test discovery results
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

/**
 * Helper function to get the real-time status of a Docker Compose lab
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
    }

    const command = `docker compose -f "${dockerComposeFilePath}" ps --format json`;
    console.log(`[BACKEND] Executing status check command: ${command}`);

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
        resolve({ status: "unknown", message: "Lab status is indeterminate." });
      }
    });
  });
};

/**
 * Helper function to load metadata for a single script from its YAML file.
 */
const getScriptIndividualMetadata = (scriptId, metadataFileName) => {
  const metadataPathInContainer = path.join(
    PYTHON_PIPELINE_BASE_PATH_IN_CONTAINER,
    scriptId,
    metadataFileName,
  );
  try {
    const fileContents = fs.readFileSync(metadataPathInContainer, "utf8");
    return yaml.load(fileContents);
  } catch (e) {
    console.error(
      `[BACKEND] Error reading or parsing script metadata file at ${metadataPathInContainer}:`,
      e.message,
    );
    return null;
  }
};

// ✨ NEW: Helper function to execute test discovery
const executeTestDiscovery = (scriptId, environment = "development") => {
  return new Promise((resolve, reject) => {
    // Check cache first
    const cacheKey = `${scriptId}-${environment}`;
    const cached = testDiscoveryCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[BACKEND] Using cached test discovery for ${cacheKey}`);
      return resolve(cached.data);
    }

    console.log(
      `[BACKEND] Executing test discovery for script: ${scriptId}, environment: ${environment}`,
    );

    // Look up the script definition
    const allScriptsConfig = yaml.load(
      fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"),
    );
    const scriptDefinition = allScriptsConfig.scripts.find(
      (s) => s.id === scriptId,
    );

    if (!scriptDefinition) {
      return reject(
        new Error(`Script definition not found for ID: ${scriptId}`),
      );
    }

    // Construct the script path
    const scriptInternalPath = path.join(
      SCRIPT_MOUNT_POINT_IN_CONTAINER,
      scriptDefinition.id,
      scriptDefinition.scriptFile,
    );

    // Build Docker command for test discovery
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
      "discovery-mode", // Dummy hostname for discovery
      "--username",
      "discovery-mode", // Dummy username for discovery
      "--password",
      "discovery-mode", // Dummy password for discovery
      "--environment",
      environment,
      "--list_tests",
    ];

    const command = `docker ${dockerCommandArgs.join(" ")}`;
    console.log(`[BACKEND] Executing test discovery command: ${command}`);

    // Execute with longer timeout for discovery
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
        // Parse the JSON output from the script
        const discoveryResult = JSON.parse(stdout);

        // Add backend metadata
        const enhancedResult = {
          ...discoveryResult,
          backend_metadata: {
            discovery_time: new Date().toISOString(),
            cache_key: cacheKey,
            script_id: scriptId,
            target_environment: environment,
            discovered_by: "nikos-geranios_vgi",
            backend_version: "2025-06-27 12:55:09",
          },
        };

        // Cache the result
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

// ✨ NEW: API endpoint for dynamic test discovery
app.post("/api/scripts/discover-tests", async (req, res) => {
  try {
    const {
      scriptId,
      environment = "development",
      listTests = true,
    } = req.body;

    console.log(
      `[BACKEND] Test discovery request received for script: ${scriptId}, environment: ${environment}`,
    );

    // Validate request
    if (!scriptId) {
      return res.status(400).json({
        success: false,
        message: "scriptId is required for test discovery",
        timestamp: new Date().toISOString(),
        requested_by: "nikos-geranios_vgi",
      });
    }

    // Only support discovery for JSNAPy tests script
    if (scriptId !== "run_jsnapy_tests") {
      return res.status(400).json({
        success: false,
        message: `Test discovery not supported for script: ${scriptId}`,
        supported_scripts: ["run_jsnapy_tests"],
        timestamp: new Date().toISOString(),
      });
    }

    if (!listTests) {
      return res.status(400).json({
        success: false,
        message: "listTests parameter must be true for discovery",
        timestamp: new Date().toISOString(),
      });
    }

    // Validate environment
    const validEnvironments = ["development", "lab", "staging", "production"];
    if (!validEnvironments.includes(environment)) {
      return res.status(400).json({
        success: false,
        message: `Invalid environment: ${environment}. Valid options: ${validEnvironments.join(", ")}`,
        timestamp: new Date().toISOString(),
      });
    }

    // Execute test discovery
    const discoveryResult = await executeTestDiscovery(scriptId, environment);

    // Return enhanced discovery result
    res.json({
      success: true,
      ...discoveryResult,
      api_metadata: {
        endpoint: "/api/scripts/discover-tests",
        request_time: new Date().toISOString(),
        script_id: scriptId,
        environment: environment,
        cache_used: testDiscoveryCache.has(`${scriptId}-${environment}`),
        enhanced_by: "nikos-geranios_vgi",
      },
    });
  } catch (error) {
    console.error(`[BACKEND] Test discovery API error:`, error.message);

    res.status(500).json({
      success: false,
      message: `Test discovery failed: ${error.message}`,
      error_details: {
        error_type: error.constructor.name,
        timestamp: new Date().toISOString(),
        endpoint: "/api/scripts/discover-tests",
      },
    });
  }
});

// ✨ NEW: API endpoint to clear test discovery cache
app.post("/api/scripts/clear-discovery-cache", (req, res) => {
  try {
    const { scriptId } = req.body;

    if (scriptId) {
      // Clear cache for specific script
      const keysToDelete = [];
      for (const key of testDiscoveryCache.keys()) {
        if (key.startsWith(`${scriptId}-`)) {
          keysToDelete.push(key);
        }
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
      // Clear entire cache
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
      timestamp: new Date().toISOString(),
    });
  }
});

// ✨ NEW: API endpoint to get cache statistics
app.get("/api/scripts/discovery-cache-stats", (req, res) => {
  try {
    const stats = {
      total_entries: testDiscoveryCache.size,
      entries: [],
      cache_duration_minutes: CACHE_DURATION / (60 * 1000),
      current_time: new Date().toISOString(),
    };

    // Get details for each cache entry
    for (const [key, value] of testDiscoveryCache.entries()) {
      const age = Date.now() - value.timestamp;
      const isExpired = age > CACHE_DURATION;

      stats.entries.push({
        cache_key: key,
        age_seconds: Math.round(age / 1000),
        is_expired: isExpired,
        test_count: Object.keys(value.data.discovered_tests || {}).length,
        cached_at: new Date(value.timestamp).toISOString(),
      });
    }

    res.json({
      success: true,
      cache_statistics: stats,
      enhanced_by: "nikos-geranios_vgi",
    });
  } catch (error) {
    console.error(`[BACKEND] Cache stats error:`, error.message);
    res.status(500).json({
      success: false,
      message: `Failed to get cache stats: ${error.message}`,
      timestamp: new Date().toISOString(),
    });
  }
});

// --- Existing API Endpoints (unchanged) ---

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
    labStatuses[labPath] = {
      status: "failed",
      message: "Lab definition file not found.",
    };
    return res
      .status(404)
      .json({ success: false, message: "Lab definition file not found." });
  }

  labStatuses[labPath] = {
    status: "starting",
    message: "Initiating lab launch...",
  };

  const command = `docker compose -f "${dockerComposeFilePath}" up -d`;
  exec(command, { cwd: labDirectory }, (error, stdout, stderr) => {
    if (error) {
      console.error(`[BACKEND] Docker Compose up error:`, error.message);
      labStatuses[labPath] = {
        status: "failed",
        message: `Launch failed: ${error.message}`,
      };
      return res.status(500).json({
        success: false,
        message: `Failed to launch lab: ${error.message}`,
      });
    }

    console.log(
      `[BACKEND] Lab launch command initiated successfully for: ${labPath}`,
    );
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
  };

  const command = `docker compose -f "${dockerComposeFilePath}" down`;
  exec(command, { cwd: labDirectory }, (error) => {
    if (error) {
      console.error(`[BACKEND] Docker Compose down error:`, error.message);
      labStatuses[labPath] = {
        status: "failed",
        message: `Stop failed: ${error.message}`,
      };
      return res.status(500).json({
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
  }

  let currentStatus = labStatuses[labPath] || {
    status: "stopped",
    message: "Not launched yet.",
  };

  if (
    currentStatus.status === "starting" ||
    currentStatus.status === "running" ||
    currentStatus.status === "unknown"
  ) {
    try {
      const realStatus = await getDockerComposeStatus(labPath);
      currentStatus = realStatus;
      labStatuses[labPath] = realStatus;
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
  const allLabPaths = ["routing/ospf-single-area"];

  const statuses = {};
  for (const labPath of allLabPaths) {
    const status = await getDockerComposeStatus(labPath);
    statuses[labPath] = status;
    labStatuses[labPath] = status;
  }
  res.json(statuses);
});

// GET endpoint to load the navigation menu from a YAML file.
app.get("/api/navigation/menu", (req, res) => {
  console.log(
    `[BACKEND] Attempting to read navigation config from: ${NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER}`,
  );
  try {
    const fileContents = fs.readFileSync(
      NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER,
      "utf8",
    );
    const config = yaml.load(fileContents);

    if (config && Array.isArray(config.menu)) {
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
      `[BACKEND] Error reading or parsing navigation.yaml:`,
      e.message,
    );
    res.status(500).json({
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
    const fileContents = fs.readFileSync(
      SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER,
      "utf8",
    );
    const config = yaml.load(fileContents);

    if (config && Array.isArray(config.scripts)) {
      const scriptsWithFullMetadata = config.scripts.map((scriptEntry) => {
        let individualMetadata = { parameters: [], resources: [] };
        if (scriptEntry.id && scriptEntry.metadataFile) {
          individualMetadata = getScriptIndividualMetadata(
            scriptEntry.id,
            scriptEntry.metadataFile,
          );
        }
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
    res.status(500).json({
      success: false,
      message: `Failed to load script list: ${e.message}`,
    });
  }
});

// GET endpoint to list available inventory files from the 'data' directory.
app.get("/api/inventories/list", async (req, res) => {
  const dataDir = path.join(__dirname, "..", "python_pipeline", "data");
  try {
    if (!fs.existsSync(dataDir)) {
      console.warn(`Inventory data directory not found: ${dataDir}`);
      return res.status(200).json({
        success: true,
        inventories: [],
        message: "Inventory directory not found.",
      });
    }

    const files = await fs.promises.readdir(dataDir);
    const inventoryFiles = files.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return ext === ".yml" || ext === ".yaml" || ext === ".ini";
    });
    res.json({ success: true, inventories: inventoryFiles });
  } catch (error) {
    console.error("Error listing inventory files:", error);
    res.status(500).json({
      success: false,
      message: "Failed to list inventory files",
      error: error.message,
    });
  }
});

// ✨ ENHANCED: Script execution endpoint with test discovery support
app.post("/api/scripts/run", (req, res) => {
  const { scriptId, parameters } = req.body;
  const runId =
    Date.now().toString() + Math.random().toString(36).substring(2, 9);

  console.log(
    `[BACKEND] Received request to run script: ${scriptId} (ID: ${runId}) with parameters:`,
    JSON.stringify(parameters),
  );

  // ✨ NEW: Special handling for test discovery requests
  if (parameters && parameters.list_tests) {
    console.log(
      `[BACKEND] Detected test discovery request for script: ${scriptId}`,
    );
    // For discovery, we'll still use the normal execution path but with special logging
  }

  if (!scriptId) {
    return res
      .status(400)
      .json({ success: false, message: "scriptId is required." });
  }

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
  }

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

  // ✨ ENHANCED: Longer timeout for test discovery operations
  const timeout = parameters && parameters.list_tests ? 60000 : 30000;

  exec(command, { timeout }, (error, stdout, stderr) => {
    if (error) {
      console.error(
        `[BACKEND] Error running script ${scriptId}:`,
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
    }

    console.log(`[BACKEND] Script ${scriptId} completed successfully`);
    if (stderr) {
      console.warn(`[BACKEND] Script ${scriptId} stderr:\n${stderr}`);
    }

    scriptRuns[runId] = { status: "completed", output: stdout, error: stderr };

    // ✨ NEW: Enhanced response for test discovery
    const response = {
      success: true,
      output: stdout,
      error: stderr,
      run_id: runId,
      script_id: scriptId,
    };

    // Add special metadata for test discovery requests
    if (parameters && parameters.list_tests) {
      try {
        const discoveryData = JSON.parse(stdout);
        response.discovery_metadata = {
          test_count: Object.keys(discoveryData.discovered_tests || {}).length,
          environment: parameters.environment || "development",
          discovery_successful: true,
          enhanced_by: "nikos-geranios_vgi",
        };
      } catch (parseError) {
        console.warn(`[BACKEND] Could not parse discovery output as JSON`);
      }
    }

    res.json(response);
  });
});

// ✨ NEW: Health check endpoint for the enhanced API
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
// API TO READ THE JSNAPY TESTS
app.get("/api/jsnapy/tests", (req, res) => {
  const testsDir = path.join(
    PYTHON_PIPELINE_BASE_PATH_IN_CONTAINER,
    "run_jsnapy_tests",
    "tests",
  );

  try {
    console.log(`[BACKEND] Checking if tests directory exists: ${testsDir}`);
    console.log(`[BACKEND] Directory exists?`, fs.existsSync(testsDir));
    const testFiles = fs.readdirSync(testsDir);
    const testNames = testFiles
      .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
      .map((file) => path.basename(file, path.extname(file))); // strip extension

    res.json({
      success: true,
      tests: testNames, // e.g., ['test_bgp', 'test_interfaces']
    });
  } catch (error) {
    console.error("[BACKEND] Failed to list JSNAPy tests:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to list JSNAPy test files",
      error: error.message,
    });
  }
});
// Start the Express server
app.listen(port, () => {
  console.log(
    `[BACKEND] Enhanced Server listening at http://localhost:${port}`,
  );
  console.log(
    `[BACKEND] Enhanced by: nikos-geranios_vgi at 2025-06-27 12:55:09`,
  );
  console.log(
    `[BACKEND] New Features: Test Discovery API, Environment Awareness, Caching`,
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

  // ✨ NEW: Log new API endpoints
  console.log(`[BACKEND] New API Endpoints:`);
  console.log(
    `[BACKEND]   POST /api/scripts/discover-tests - Dynamic test discovery`,
  );
  console.log(
    `[BACKEND]   POST /api/scripts/clear-discovery-cache - Clear test cache`,
  );
  console.log(
    `[BACKEND]   GET  /api/scripts/discovery-cache-stats - Cache statistics`,
  );
  console.log(`[BACKEND]   GET  /api/health - Enhanced health check`);
});
