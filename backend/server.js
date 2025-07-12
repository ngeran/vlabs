// ====================================================================================
//
// FILE: backend/server.js (FINAL & COMPLETE)
//
// ROLE: The application's main backend server.
//
// DESCRIPTION: This server provides a complete set of REST APIs for script and template
//              management and uses a WebSocket hub for real-time communication. This
//              final version is a complete restoration of the original, working server,
//              with the pathing bug in the metadata helper function corrected, ensuring
//              all required helper functions and API endpoints are present and functional.
//
// ====================================================================================


// ====================================================================================
// SECTION 1: IMPORTS & INITIAL SETUP
// ====================================================================================
const express = require("express");
const cors = require("cors");
const http = require("http");
const { WebSocketServer } = require("ws");
const { v4: uuidv4 } = require("uuid");
const { exec, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");

const app = express();
const port = 3001;
const runHistory = [];
const MAX_HISTORY_ITEMS = 50;


// ====================================================================================
// SECTION 2: GLOBAL EXCEPTION HANDLER (SAFETY NET)
// ====================================================================================
process.on("uncaughtException", (err, origin) => {
  console.error("====== UNCAUGHT EXCEPTION! SHUTTING DOWN ======");
  console.error("Error:", err.stack || err);
  console.error("Origin:", origin);
  process.exit(1);
});


// ====================================================================================
// SECTION 3: EXPRESS MIDDLEWARE
// ====================================================================================
app.use(cors());
app.use(express.json());


// ====================================================================================
// SECTION 4: CONFIGURATION CONSTANTS & IN-MEMORY STATE
// ====================================================================================
const PYTHON_PIPELINE_MOUNT_PATH = "/python_pipeline";
const PUBLIC_MOUNT_PATH = "/public";
const SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER = path.join(PYTHON_PIPELINE_MOUNT_PATH, "scripts.yaml");
const PYTHON_PIPELINE_PATH_ON_HOST = path.join(process.env.HOST_PROJECT_ROOT, "python_pipeline");
const SCRIPT_MOUNT_POINT_IN_CONTAINER = "/app/python-scripts";
const TEMPLATES_CONFIG_FILE_PATH_IN_CONTAINER = path.join(PYTHON_PIPELINE_MOUNT_PATH, "tools", "configuration", "templates.yml");
const TEMPLATES_DIRECTORY_PATH = path.join(PYTHON_PIPELINE_MOUNT_PATH, "tools", "configuration", "templates");
const NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER = path.join(PUBLIC_MOUNT_PATH, "navigation.yaml");
const labStatuses = {};
const testDiscoveryCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;


// ====================================================================================
// SECTION 5: WEBSOCKET SERVER SETUP & LOGIC
// ====================================================================================
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Map();

wss.on("connection", (ws) => {
  const clientId = uuidv4();
  clients.set(clientId, ws);
  console.log(`[WebSocket] Client connected with ID: ${clientId}`);
  ws.send(JSON.stringify({ type: "welcome", clientId }));

  ws.on("close", () => {
    clients.delete(clientId);
    console.log(`[WebSocket] Client disconnected: ${clientId}`);
  });

  ws.on("error", (error) => {
    console.error(`[WebSocket] Error for client ${clientId}:`, error);
    clients.delete(clientId);
  });
    // --- ADD THIS BLOCK ---
  // This is the missing piece. It handles messages coming FROM the client.
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      // Respond to heartbeat pings to keep the connection alive
      if (data.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return; // Don't process pings any further
      }

      // You can add other server-side message handlers here in the future
      // For example: if (data.type === 'register') { ... }
    } catch (e) {
      // Don't log errors for non-JSON messages if you don't expect them
      // console.error('[WebSocket] Error parsing message:', message.toString(), e);
    }
  });
  // --- END OF ADDED BLOCK ---
  });


// ====================================================================================
// SECTION 6: HELPER FUNCTIONS
// ====================================================================================

/**
 * @description Loads and parses the main templates.yml configuration file.
 * @returns {object|null} The parsed YAML content or null on error.
 */
const getTemplatesConfig = () => {
  try {
    const p = TEMPLATES_CONFIG_FILE_PATH_IN_CONTAINER;
    if (!fs.existsSync(p)) { console.error(`Templates config file not found: ${p}`); return null; }
    return yaml.load(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.error(`[BACKEND] Error loading templates config: ${e.message}`);
    return null;
  }
};

/**
 * @description Reads the content of a specific Jinja2 template file.
 * @param {string} file - The name of the template file.
 * @returns {string|null} The content of the file or null on error.
 */
const getTemplateContent = (file) => {
  try {
    const p = path.join(TEMPLATES_DIRECTORY_PATH, file);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf8");
  } catch (e) {
    console.error(`[BACKEND] Error reading template file ${file}: ${e.message}`);
    return null;
  }
};

/**
 * @description Gets the metadata (displayName, category, etc.) for a single script.
 * @param {object} scriptDefinition - The script object from scripts.yaml, containing path and metadataFile.
 * @returns {object|null} The parsed metadata from the script's metadata.yml file.
 */
// ✨ THIS IS THE CORRECTED HELPER FUNCTION ✨
const getScriptIndividualMetadata = (scriptDefinition) => {
  // Validate that the script definition from scripts.yaml is valid.
  if (!scriptDefinition || !scriptDefinition.path || !scriptDefinition.metadataFile) {
    console.error("[BACKEND] Invalid script definition passed to getScriptIndividualMetadata:", scriptDefinition);
    return null;
  }
  try {
    // FIX: It now correctly uses `scriptDefinition.path` (e.g., "tools/jsnapy_runner")
    // to build the full directory path to the metadata file.
    const metadataPath = path.join(PYTHON_PIPELINE_MOUNT_PATH, scriptDefinition.path, scriptDefinition.metadataFile);

    if (!fs.existsSync(metadataPath)) {
      console.warn(`[BACKEND] Metadata file not found for script "${scriptDefinition.id}" at: ${metadataPath}`);
      return null;
    }
    return yaml.load(fs.readFileSync(metadataPath, "utf8"));
  } catch (e) {
    console.error(`[BACKEND] Error processing metadata for script "${scriptDefinition.id}": ${e.message}`);
    return null;
  }
};

/**
 * @description Executes a script's test discovery mechanism.
 * @param {string} scriptId - The ID of the script to run discovery for.
 * @param {string} environment - The target environment (e.g., 'development').
 * @returns {Promise<object>} A promise that resolves with the discovery results.
 */
const executeTestDiscovery = (scriptId, environment = "development") => {
  return new Promise((resolve, reject) => {
    const cacheKey = `${scriptId}-${environment}`;
    const cached = testDiscoveryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) return resolve(cached.data);
    const scriptsCfg = yaml.load(fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"));
    const scriptDef = scriptsCfg.scripts.find((s) => s.id === scriptId);
    if (!scriptDef) return reject(new Error(`Script definition not found for ID: ${scriptId}`));

    // Assumes the executable script is named 'run.py' within the script's path.
    const scriptPath = path.join(SCRIPT_MOUNT_POINT_IN_CONTAINER, scriptDef.path, "run.py");
    const args = ["run", "--rm", "-v", `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`, "vlabs-python-runner", "python", scriptPath, "--list_tests", "--environment", environment];

    exec(`docker ${args.join(" ")}`, { timeout: 60000 }, (err, stdout) => {
      if (err) return reject(new Error(`Test discovery failed: ${err.message}`));
      try {
        const result = { ...JSON.parse(stdout), backend_metadata: { discovery_time: new Date().toISOString() } };
        testDiscoveryCache.set(cacheKey, { data: result, timestamp: Date.now() });
        resolve(result);
      } catch (pErr) {
        reject(new Error(`Failed to parse test discovery output: ${pErr.message}`));
      }
    });
  });
};

/**
 * @description Ensures the 'output' directory exists for saving reports.
 */
function ensureOutputDirectory() {
  const outputDir = path.join(PYTHON_PIPELINE_MOUNT_PATH, "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

// ✨ RESTORED Lab Management Helper
const getDockerComposeStatus = (labPath) => {
  return new Promise((resolve) => {
    const labDirectory = path.join(PUBLIC_MOUNT_PATH, labPath);
    const dockerComposeFilePath = path.join(labDirectory, "docker-compose.yml");
    if (!fs.existsSync(dockerComposeFilePath)) return resolve({ status: "stopped", message: "Lab definition file not found." });

    const command = `docker compose -f "${dockerComposeFilePath}" ps --format json`;
    exec(command, { cwd: labDirectory }, (error, stdout) => {
      if (error) return resolve({ status: "stopped", message: `Docker Compose command failed: ${error.message}` });
      if (!stdout.trim()) return resolve({ status: "stopped", message: "No active containers found." });

      let services = stdout.trim().split("\n").map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

      if (services.every(s => s.State === "running")) return resolve({ status: "running", message: "All lab containers are running." });
      if (services.some(s => s.State === "exited" || s.State === "degraded")) return resolve({ status: "failed", message: "Some lab containers are unhealthy." });
      if (services.some(s => s.State === "starting")) return resolve({ status: "starting", message: "Lab containers are starting." });

      resolve({ status: "unknown", message: "Lab status is indeterminate." });
    });
  });
};
// ====================================================================================
// SECTION 7: API ENDPOINTS (HTTP REST API)
// ====================================================================================

// --- Discovery & Data Retrieval Endpoints ---

/**
 * @description Lists all scripts defined in `scripts.yaml`, merging their metadata.
 * This is the primary endpoint for populating the script runner UI.
 */
app.get("/api/scripts/list", (req, res) => {
  try {
    const config = yaml.load(fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"));
    if (config && Array.isArray(config.scripts)) {
      // FIX: The helper function is now called correctly with the full script definition object.
      const scripts = config.scripts.map((scriptDef) => {
        const metadata = getScriptIndividualMetadata(scriptDef);
        // Only include the script if its metadata was successfully loaded.
        return metadata ? { ...scriptDef, ...metadata } : null;
      }).filter(Boolean); // Filter out any null entries from failed metadata loads.

      res.json({ success: true, scripts: scripts });
    } else {
      res.status(500).json({ success: false, message: "Scripts configuration malformed." });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: `Failed to load script list: ${e.message}` });
  }
});

/**
 * @description Discovers JSNAPy tests for a given script and environment.
 */
app.post("/api/scripts/discover-tests", async (req, res) => {
  try {
    const { scriptId, environment = "development" } = req.body;
    if (!scriptId) return res.status(400).json({ success: false, message: "scriptId is required" });
    const discoveryResult = await executeTestDiscovery(scriptId, environment);
    res.json({ success: true, ...discoveryResult });
  } catch (error) {
    res.status(500).json({ success: false, message: `Test discovery failed: ${error.message}` });
  }
});

/**
 * @description Discovers available configuration templates.
 */
app.post("/api/templates/discover", async (req, res) => {
    const { category } = req.body;
    const templatesConfig = getTemplatesConfig();
    if (!templatesConfig) return res.status(500).json({ success: false, message: "Templates configuration not found." });
    const categorizedTemplates = {};
    for (const [templateId, templateDef] of Object.entries(templatesConfig.templates)) {
        if (category && templateDef.category !== category) continue;
        const cat = templateDef.category || "General";
        if (!categorizedTemplates[cat]) categorizedTemplates[cat] = [];
        categorizedTemplates[cat].push({ id: templateId, ...templateDef });
    }
    res.json({ success: true, discovered_templates: categorizedTemplates });
});

/**
 * @description Gets detailed information and content for a single template.
 */
app.get("/api/templates/:templateId", async (req, res) => {
    const { templateId } = req.params;
    const templatesConfig = getTemplatesConfig();
    const templateDef = templatesConfig?.templates[templateId];
    if (!templateDef) return res.status(404).json({ success: false, message: `Template with ID "${templateId}" not found.` });
    const templateContent = getTemplateContent(templateDef.template_file);
    if (!templateContent) return res.status(500).json({ success: false, message: "Failed to read template file." });
    res.json({ success: true, template: { id: templateId, ...templateDef, template_content: templateContent } });
});

/**
 * @description Retrieves a list of available inventory files.
 */
app.get("/api/inventories/list", async (req, res) => {
  const dataDir = path.join(PYTHON_PIPELINE_MOUNT_PATH, "data");
  try {
    if (!fs.existsSync(dataDir)) return res.status(200).json({ success: true, inventories: [], message: "Inventory directory not found." });
    const files = await fs.promises.readdir(dataDir);
    const inventoryFiles = files.filter(file => /\.(ya?ml|ini)$/i.test(file));
    res.json({ success: true, inventories: inventoryFiles });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to list inventory files", error: error.message });
  }
});

/**
 * @description Retrieves the history of script runs.
 */
app.get("/api/history/list", (req, res) => res.json({ success: true, history: runHistory }));

/**
 * @description Retrieves the main navigation menu structure for the UI.
 */
app.get("/api/navigation/menu", (req, res) => {
  try {
    const config = yaml.load(fs.readFileSync(NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"));
    if (config && Array.isArray(config.menu)) {
      res.json({ success: true, menu: config.menu });
    } else {
      res.status(500).json({ success: false, message: "Navigation configuration malformed." });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: `Failed to load navigation menu: ${e.message}` });
  }
});

/**
 * @description A simple health check endpoint for monitoring.
 */
app.get("/api/health", (req, res) => res.json({ status: "healthy", timestamp: new Date().toISOString() }));

// --- Lab Management Endpoints (Restored from Original) ---

app.post("/api/labs/launch", async (req, res) => {
  const { labPath } = req.body;
  if (!labPath) return res.status(400).json({ success: false, message: "labPath is required." });
  const labDirectory = path.join(PUBLIC_MOUNT_PATH, labPath);
  if (!fs.existsSync(path.join(labDirectory, "docker-compose.yml"))) return res.status(404).json({ success: false, message: "Lab definition file not found." });
  labStatuses[labPath] = { status: "starting", message: "Initiating lab launch..." };
  const command = `docker compose -f "${path.join(labDirectory, "docker-compose.yml")}" up -d`;
  exec(command, { cwd: labDirectory }, (error) => {
    if (error) {
      labStatuses[labPath] = { status: "failed", message: `Launch failed: ${error.message}` };
      return res.status(500).json({ success: false, message: `Failed to launch lab: ${error.message}` });
    }
    res.json({ success: true, message: "Lab launch command sent." });
  });
});

app.post("/api/labs/stop", (req, res) => {
  const { labPath } = req.body;
  if (!labPath) return res.status(400).json({ success: false, message: "labPath is required." });
  const labDirectory = path.join(PUBLIC_MOUNT_PATH, labPath);
  if (!fs.existsSync(path.join(labDirectory, "docker-compose.yml"))) return res.status(404).json({ success: false, message: "Lab definition file not found." });
  labStatuses[labPath] = { status: "stopping", message: "Initiating lab stop..." };
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
app.get("/api/labs/status-by-path", async (req, res) => {
  const { labPath } = req.query;
  if (!labPath) return res.status(400).json({ success: false, message: "labPath is required." });
  const status = await getDockerComposeStatus(labPath);
  labStatuses[labPath] = status;
  res.json(status);
});
app.get("/api/labs/all-statuses", async (req, res) => {
  // Note: This might need to be made dynamic in the future.
  const allLabPaths = ["routing/ospf-single-area"];
  const statuses = {};
  for (const labPath of allLabPaths) {
    const status = await getDockerComposeStatus(labPath);
    statuses[labPath] = status;
    labStatuses[labPath] = status;
  }
  res.json(statuses);
});
// THIS IS THE LEGACY /api/scripts/run ENDPOINT FROM THE ORIGINAL FILE.
// It is included for completeness, although it is not used by the modern UI.
app.post("/api/scripts/run", (req, res) => {
  const { scriptId, parameters } = req.body;
  const runId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
  if (!scriptId) return res.status(400).json({ success: false, message: "scriptId is required." });
  const config = yaml.load(fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"));
  const scriptDef = config.scripts.find((s) => s.id === scriptId);
  if (!scriptDef) return res.status(404).json({ success: false, message: "Script definition not found." });
  const scriptPath = path.join(SCRIPT_MOUNT_POINT_IN_CONTAINER, scriptDef.path, "run.py");
  const dockerArgs = ["run", "--rm", "--network=host", "-v", `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`, "vlabs-python-runner", "python", scriptPath];
  if (parameters) {
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined && value !== null && value !== "") {
        dockerArgs.push(`--${key}`);
        dockerArgs.push(String(value));
      }
    }
  }
  try {
    const child = spawn("docker", dockerArgs);
    let stdout = "", stderr = "";
    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });
    child.on("close", (code) => {
      const result = { runId, timestamp: new Date().toISOString(), scriptId, parameters, isSuccess: code === 0, output: stdout, error: stderr };
      runHistory.unshift(result);
      if (runHistory.length > MAX_HISTORY_ITEMS) runHistory.pop();
      if (code !== 0) return res.status(500).json({ success: false, message: `Script execution failed: ${stderr}`, output: stdout, error: stderr });
      res.json({ success: true, output: stdout, error: stderr });
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "An unexpected error occurred while running the script." });
  }
});

// ====================================================================================
// SECTION 8: EXECUTION ENDPOINTS
// ====================================================================================

/**
 * @description Renders a Jinja2 template based on provided parameters.
 */
app.post("/api/templates/generate", (req, res) => {
    const { templateId, parameters } = req.body;
    if (!templateId) return res.status(400).json({ success: false, message: "templateId is required" });
    const templatesConfig = getTemplatesConfig();
    const templateDef = templatesConfig?.templates[templateId];
    if (!templateDef) return res.status(404).json({ success: false, message: `Template with ID "${templateId}" not found.` });
    const templateContent = getTemplateContent(templateDef.template_file);
    if (!templateContent) return res.status(500).json({ success: false, message: "Failed to read template file." });

    const renderScriptPath = path.join(SCRIPT_MOUNT_POINT_IN_CONTAINER, "tools", "configuration", "utils", "render_template.py");
    const dockerArgs = ["run", "--rm", "-v", `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`, "vlabs-python-runner", "python", renderScriptPath, "--template-content", templateContent, "--parameters", JSON.stringify(parameters || {})];

    const child = spawn("docker", dockerArgs);
    let stdoutData = "", stderrData = "";
    child.stdout.on("data", (data) => { stdoutData += data.toString(); });
    child.stderr.on("data", (data) => { stderrData += data.toString(); });
    child.on("close", (code) => {
        if (code !== 0) return res.status(500).json({ success: false, message: `Template rendering failed: ${stderrData}`, error: stderrData });
        try {
            const result = JSON.parse(stdoutData);
            if (result.success) {
                res.json({ success: true, rendered_config: result.rendered_config });
            } else {
                res.status(500).json({ success: false, message: result.error, error: result.error });
            }
        } catch (parseError) {
            res.status(500).json({ success: false, message: "Failed to parse template rendering output.", error: stdoutData });
        }
    });
});

/**
 * @description Specialized "private path" endpoint for the Template Workflow.
 * This is called by the `useTemplateApplication` hook. Its existence is crucial.
 */
app.post("/api/templates/apply", async (req, res) => {
  const { wsClientId, templateId, renderedConfig, targetHostname, username, password } = req.body;

  if (!wsClientId) return res.status(400).json({ success: false, message: "WebSocket Client ID is required." });
  const clientWs = clients.get(wsClientId);
  if (!clientWs || clientWs.readyState !== 1) return res.status(404).json({ success: false, message: "WebSocket client not found or not open." });

  res.status(202).json({ success: true, message: "Apply process started." });

  try {
    const runScriptPath = path.join(SCRIPT_MOUNT_POINT_IN_CONTAINER, "tools", "configuration", "run.py");
    const dockerArgs = [
      "run", "--rm", "--network=host", "-v", `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`,
      "vlabs-python-runner", "python", "-u", runScriptPath,
      '--template_id', templateId, '--rendered_config', renderedConfig, '--target_host', targetHostname,
      '--username', username, '--password', password,
    ];

    const child = spawn("docker", dockerArgs);

    const sendToClient = (type, data) => { if (clientWs.readyState === 1) clientWs.send(JSON.stringify({ type, ...data })); };

    let stderrBuffer = "";
    child.stderr.on("data", (data) => {
        stderrBuffer += data.toString();
        const lines = stderrBuffer.split('\n');
        stderrBuffer = lines.pop() || '';

        for (const line of lines) {
            if (line.trim().startsWith("JSON_PROGRESS:")) {
                try {
                    // ✨ FIX: Parse the clean JSON object on the backend.
                    const progressData = JSON.parse(line.substring(14).trim());
                    // Send the parsed object, not the raw string, to the frontend.
                    sendToClient('progress', { data: progressData });
                } catch (e) {
                    console.error("[BACKEND] Failed to parse progress JSON:", line);
                }
            }
        }
    });

    let stdoutBuffer = "";
    child.stdout.on("data", (data) => { stdoutBuffer += data.toString(); });

    child.on("close", (code) => {
        if (code !== 0) return sendToClient('error', { message: `Script exited with error code ${code}` });
        try {
            const jsonMatch = stdoutBuffer.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                sendToClient('result', { data: JSON.parse(jsonMatch[0]) });
            } else { throw new Error("No JSON result found"); }
        } catch (e) {
            sendToClient('error', { message: "Failed to parse final script output", error: e.message });
        }
    });

  } catch (error) {
    if (clients.get(wsClientId)?.readyState === 1) {
      clients.get(wsClientId).send(JSON.stringify({ type: "error", message: `Failed to start apply process: ${error.message}` }));
    }
  }
});







/**
 * @description Generic, WebSocket-enabled endpoint for all standard scripts.
 * This is called by the `useScriptRunnerStream` hook.
 */
app.post("/api/scripts/run-stream", (req, res) => {
  const { scriptId, parameters, wsClientId } = req.body;
  const runId = Date.now().toString() + Math.random().toString(36).substring(2, 9);

  if (!scriptId || !wsClientId) return res.status(400).json({ success: false, message: "scriptId and wsClientId are required." });
  const clientWs = clients.get(wsClientId);
  if (!clientWs || clientWs.readyState !== 1) return res.status(404).json({ success: false, message: `WebSocket client not found or not open: ${wsClientId}` });

  const config = yaml.load(fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"));
  const scriptDef = config.scripts.find((s) => s.id === scriptId);
  if (!scriptDef) return res.status(404).json({ success: false, message: `Script definition not found for ID: ${scriptId}` });

  const scriptPath = path.join(SCRIPT_MOUNT_POINT_IN_CONTAINER, scriptDef.path, "run.py");

  res.status(202).json({ success: true, message: "Script execution started.", runId });

  const dockerArgs = ["run", "--rm", "--network=host", "-v", `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`, "vlabs-python-runner", "python", "-u", scriptPath];
  if (parameters) {
    for (const [key, value] of Object.entries(parameters)) {
        if (value === null || value === undefined || value === "") continue;
        if (value === true) { dockerArgs.push(`--${key}`); }
        else if (value !== false) { dockerArgs.push(`--${key}`); dockerArgs.push(String(value)); }
    }
  }

  const child = spawn("docker", dockerArgs);
  let fullStdout = "", fullStderr = "";

  const sendToClient = (type, data) => { if (clientWs.readyState === 1) clientWs.send(JSON.stringify({ type, ...data })); };
  sendToClient("script_start", { runId, scriptId });

  child.stdout.on("data", (data) => { fullStdout += data.toString(); });
  child.stderr.on("data", (data) => {
    fullStderr += data.toString();
    sendToClient("script_error", { runId, scriptId, error: data.toString() });
  });

  child.on("close", (code) => {
    let finalResult = null;
    try { finalResult = JSON.parse(fullStdout); } catch(e) { /* Ignore */ }

    if (finalResult) sendToClient("script_output", { runId, scriptId, output: finalResult });
    const historyRecord = { runId, timestamp: new Date().toISOString(), scriptId, parameters, isSuccess: code === 0, output: fullStdout, error: fullStderr };
    runHistory.unshift(historyRecord);
    if (runHistory.length > MAX_HISTORY_ITEMS) runHistory.pop();

    sendToClient("script_end", { runId, scriptId, exitCode: code });
  });
});


// ====================================================================================
// SECTION 9: SERVER STARTUP
// ====================================================================================
server.listen(port, () => {
  console.log(`[BACKEND] Express & WebSocket Server listening at http://localhost:${port}`);
  console.log(`[BACKEND] Python pipeline host path: ${PYTHON_PIPELINE_PATH_ON_HOST}`);
  console.log(`[BACKEND] Python pipeline container mount: ${PYTHON_PIPELINE_MOUNT_PATH}`);
  console.log(`[BACKEND] Public container mount: ${PUBLIC_MOUNT_PATH}`);
});
