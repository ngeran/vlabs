// vlabs/backend/server.js

// ====================================================================================
// SECTION 1: IMPORTS & INITIAL SETUP
// ====================================================================================
// Description: Imports required Node.js modules and sets up the Express app and WebSocket server.
// Purpose: Initializes the backend environment for API and real-time communication.
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


const { executeWithRealTimeUpdates } = require('./utils/executeWithRealTimeUpdates');

// ====================================================================================
// SECTION 2: GLOBAL EXCEPTION HANDLER
// ====================================================================================
// Description: Catches uncaught exceptions to prevent server crashes and ensure graceful shutdown.
// Purpose: Provides a safety net for unexpected errors with detailed logging.
process.on("uncaughtException", (err, origin) => {
  console.error("====== UNCAUGHT EXCEPTION! SHUTTING DOWN ======");
  console.error("Error:", err.stack || err);
  console.error("Origin:", origin);
  process.exit(1);
});

// ====================================================================================
// SECTION 3: EXPRESS MIDDLEWARE CONFIGURATION
// ====================================================================================
// Description: Configures Express middleware for handling CORS and JSON requests.
// Purpose: Enables communication with the frontend (http://localhost:3000) and parses incoming JSON.
app.use(cors());
app.use(express.json());

// ====================================================================================
// SECTION 4: PATH CONSTANTS & IN-MEMORY STATE
// ====================================================================================
// Description: Defines file paths and state for Docker mounts, scripts, templates, and lab statuses.
// Purpose: Centralizes configuration for consistent access across endpoints.
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
// SECTION 5: WEBSOCKET SERVER SETUP
// ====================================================================================
// Description: Initializes WebSocket server for real-time script output streaming.
// Purpose: Manages client connections with unique IDs and handles ping/pong for keep-alive.
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Map();

wss.on("connection", (ws) => {
  const clientId = uuidv4();
  clients.set(clientId, ws);
  console.log(`[WebSocket] Client connected with ID: ${clientId}`);
  ws.send(JSON.stringify({ type: "welcome", clientId }));

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }
    } catch (e) {
      // Ignore non-JSON messages
    }
  });

  ws.on("close", () => {
    clients.delete(clientId);
    console.log(`[WebSocket] Client disconnected: ${clientId}`);
  });

  ws.on("error", (error) => {
    console.error(`[WebSocket] Error for client ${clientId}:`, error);
    clients.delete(clientId);
  });
});

// ====================================================================================
// SECTION 6: HELPER FUNCTIONS
// ====================================================================================
// Description: Utility functions for file operations, template handling, and Docker interactions.
// Purpose: Abstracts common operations to simplify endpoint logic and improve maintainability.

const getTemplatesConfig = () => {
  // Loads and parses templates.yml for configuration management.
  try {
    const p = TEMPLATES_CONFIG_FILE_PATH_IN_CONTAINER;
    if (!fs.existsSync(p)) {
      console.error(`[BACKEND] Templates config file not found: ${p}`);
      return null;
    }
    return yaml.load(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.error(`[BACKEND] Error loading templates config: ${e.message}`);
    return null;
  }
};

const getTemplateContent = (file) => {
  // Reads content of a Jinja2 template file.
  try {
    const p = path.join(TEMPLATES_DIRECTORY_PATH, file);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf8");
  } catch (e) {
    console.error(`[BACKEND] Error reading template file ${file}: ${e.message}`);
    return null;
  }
};

const getScriptIndividualMetadata = (scriptDefinition) => {
  // Retrieves metadata for a specific script from its metadata.yml.
  if (!scriptDefinition || !scriptDefinition.path || !scriptDefinition.metadataFile) {
    console.error("[BACKEND] Invalid script definition:", scriptDefinition);
    return null;
  }
  try {
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

const executeTestDiscovery = (scriptId, environment = "development") => {
  // Executes test discovery for a script using Docker.
  return new Promise((resolve, reject) => {
    const cacheKey = `${scriptId}-${environment}`;
    const cached = testDiscoveryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) return resolve(cached.data);
    const scriptsCfg = yaml.load(fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"));
    const scriptDef = scriptsCfg.scripts.find((s) => s.id === scriptId);
    if (!scriptDef) return reject(new Error(`Script definition not found for ID: ${scriptId}`));

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

function ensureOutputDirectory() {
  // Ensures the output directory exists for report saving.
  const outputDir = path.join(PYTHON_PIPELINE_MOUNT_PATH, "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

function ensureDirectoryExists(dirPath) {
  // Creates a directory if it doesn’t exist.
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`[BACKEND] Created directory: ${dirPath}`);
  }
}

const getDockerComposeStatus = (labPath) => {
  // Checks the status of a lab’s Docker Compose services.
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

const scanDirectory = (directoryPath) => {
  const stats = fs.statSync(directoryPath);
  const name = path.basename(directoryPath);
  if (stats.isDirectory()) {
    const children = fs.readdirSync(directoryPath).map(child =>
      scanDirectory(path.join(directoryPath, child))
    );
    return { name, type: 'folder', children };
  } else {
    return { name, type: 'file' };
  }
};

// ====================================================================================
// SECTION 7: API ENDPOINTS
// ====================================================================================
// Description: Defines REST API endpoints for script, template, and lab management.
// Purpose: Handles HTTP requests from the frontend for various operations.
// =======TEST API curl http://localhost:3001/api/inventory-tree ======================

app.get('/api/inventory-tree', (req, res) => {
  const basePath = '/python_pipeline/tools/code_upgrade';
  const upgradePath = path.join(basePath, 'upgrade_path', 'vendor');

  console.log(`[INFO] API call to /api/inventory-tree received.`);
  console.log(`[DEBUG] Attempting to scan directory at absolute container path: ${upgradePath}`);

  try {
    if (fs.existsSync(upgradePath)) {
      console.log(`[SUCCESS] Directory found. Scanning...`);
      const directoryTree = scanDirectory(upgradePath);
      res.json(directoryTree);
    } else {
      console.error(`[ERROR] Directory NOT FOUND at path: ${upgradePath}`);
      // Enhanced debugging
      const debugInfo = {
        path_searched: upgradePath,
        base_mount_exists: fs.existsSync(basePath),
        base_mount_contents: fs.existsSync(basePath) ? fs.readdirSync(basePath) : [],
        upgrade_path_exists: fs.existsSync(path.join(basePath, 'upgrade_path')),
        upgrade_path_contents: fs.existsSync(path.join(basePath, 'upgrade_path')) ?
          fs.readdirSync(path.join(basePath, 'upgrade_path')) : []
      };
      console.error(`[DEBUG] Debug info:`, debugInfo);
      res.status(404).json({
        error: 'Directory not found on server.',
        debug: debugInfo
      });
    }
  } catch (error) {
    console.error(`[FATAL] An error occurred during the scan: ${error.message}`);
    res.status(500).json({ error: 'Failed to scan directory', details: error.message });
  }
});

//=====================================================================================
app.get("/api/scripts/list", (req, res) => {
  // Lists all scripts with their metadata for the script runner UI.
  try {
    const config = yaml.load(fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"));
    if (!config || !Array.isArray(config.scripts)) {
      console.error(`[BACKEND] Scripts configuration malformed or missing at: ${SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER}`);
      return res.status(500).json({ success: false, message: "Scripts configuration malformed." });
    }
    const scripts = config.scripts.map((scriptDef) => {
      const metadata = getScriptIndividualMetadata(scriptDef);
      return metadata ? { ...scriptDef, ...metadata } : null;
    }).filter(Boolean);
    console.log(`[BACKEND] Found scripts: ${scripts.map(s => s.id).join(', ')}`);
    res.json({ success: true, scripts });
  } catch (e) {
    console.error(`[BACKEND] Failed to load script list: ${e.message}`);
    res.status(500).json({ success: false, message: `Failed to load script list: ${e.message}` });
  }
});

app.post("/api/scripts/discover-tests", async (req, res) => {
  // Discovers JSNAPy tests for a script.
  try {
    const { scriptId, environment = "development" } = req.body;
    if (!scriptId) return res.status(400).json({ success: false, message: "scriptId is required" });
    const discoveryResult = await executeTestDiscovery(scriptId, environment);
    res.json({ success: true, ...discoveryResult });
  } catch (error) {
    console.error(`[BACKEND] Test discovery failed: ${error.message}`);
    res.status(500).json({ success: false, message: `Test discovery failed: ${error.message}` });
  }
});

app.post("/api/templates/discover", (req, res) => {
  // Discovers configuration templates, optionally by category.
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

app.get("/api/templates/:templateId", (req, res) => {
  // Retrieves details and content for a specific template.
  const { templateId } = req.params;
  const templatesConfig = getTemplatesConfig();
  const templateDef = templatesConfig?.templates[templateId];
  if (!templateDef) return res.status(404).json({ success: false, message: `Template with ID "${templateId}" not found.` });
  const templateContent = getTemplateContent(templateDef.template_file);
  if (!templateContent) return res.status(500).json({ success: false, message: "Failed to read template file." });
  res.json({ success: true, template: { id: templateId, ...templateDef, template_content: templateContent } });
});

app.get("/api/inventories/list", (req, res) => {
  // Lists inventory files from /python_pipeline/data.
  const dataDir = path.join(PYTHON_PIPELINE_MOUNT_PATH, "data");
  try {
    if (!fs.existsSync(dataDir)) return res.status(200).json({ success: true, inventories: [], message: "Inventory directory not found." });
    const files = fs.readdirSync(dataDir);
    const inventoryFiles = files.filter(file => /\.(ya?ml|ini)$/i.test(file)).map(file => ({
      value: path.join(PYTHON_PIPELINE_MOUNT_PATH, "data", file),
      label: file
    }));
    console.log(`[BACKEND] Found inventories: ${inventoryFiles.map(f => f.label).join(', ')}`);
    res.json({ success: true, inventories: inventoryFiles });
  } catch (error) {
    console.error(`[BACKEND] Failed to list inventory files: ${error.message}`);
    res.status(500).json({ success: false, message: "Failed to list inventory files", error: error.message });
  }
});

app.get("/api/history/list", (req, res) => {
  // Returns the history of script runs.
  res.json({ success: true, history: runHistory });
});

app.get("/api/navigation/menu", (req, res) => {
  // Retrieves the navigation menu structure.
  try {
    if (!fs.existsSync(NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER)) {
      console.error(`[BACKEND] Navigation config file not found: ${NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER}`);
      return res.status(500).json({ success: false, message: "Navigation configuration file not found." });
    }
    const config = yaml.load(fs.readFileSync(NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"));
    if (config && Array.isArray(config.menu)) {
      res.json({ success: true, menu: config.menu });
    } else {
      console.error(`[BACKEND] Navigation configuration malformed at: ${NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER}`);
      res.status(500).json({ success: false, message: "Navigation configuration malformed." });
    }
  } catch (e) {
    console.error(`[BACKEND] Failed to load navigation menu: ${e.message}`);
    res.status(500).json({ success: false, message: `Failed to load navigation menu: ${e.message}` });
  }
});
// =============================================================================================
// ==================== FETCH THE HOSTS INSIDE THE BUCKUP DIRECTORY ============================
// =============================================================================================
app.get("/api/backups/devices", (req, res) => {
  // Lists devices and their backup files, strictly using /app/backups.
  try {
    const backupBasePath = "/backups";
    console.log(`[BACKEND] Using backup base path: ${backupBasePath}`);

    // Check if /app/backups exists
    if (!fs.existsSync(backupBasePath)) {
      console.error(`[BACKEND] Backups directory does not exist: ${backupBasePath}`);
      return res.json({ success: true, devices: [], message: `Backups directory not found in container: ${backupBasePath}. Ensure the volume mount is correctly configured in docker-compose.yml.` });
    }

    // Check directory permissions
    try {
      fs.accessSync(backupBasePath, fs.constants.R_OK);
      console.log(`[BACKEND] Backups directory is readable: ${backupBasePath}`);
    } catch (error) {
      console.error(`[BACKEND] Backups directory is not readable: ${backupBasePath}, Error: ${error.message}`);
      return res.status(500).json({ success: false, message: `Backups directory not readable: ${error.message}` });
    }

    // Log directory contents
    let deviceFolders = [];
    try {
      deviceFolders = fs.readdirSync(backupBasePath);
      console.log(`[BACKEND] Device folders found: ${deviceFolders.join(', ') || 'none'}`);
    } catch (error) {
      console.error(`[BACKEND] Error reading backups directory ${backupBasePath}: ${error.message}`);
      return res.json({ success: true, devices: [], message: `Error reading backups directory: ${error.message}` });
    }

    const devices = [];
    for (const deviceIp of deviceFolders) {
      const deviceDir = path.join(backupBasePath, deviceIp);
      try {
        const stat = fs.statSync(deviceDir);
        if (stat.isDirectory()) {
          const backups = fs.readdirSync(deviceDir)
            .filter(file => file.endsWith('.conf'))
            .map(file => {
              const filePath = path.join(backupBasePath, deviceIp, file);
              console.log(`[BACKEND] Found backup file: ${filePath}`);
              return {
                value: filePath,
                label: file
              };
            });
          console.log(`[BACKEND] Backups for ${deviceIp}: ${backups.map(b => b.label).join(', ') || 'none'}`);
          if (backups.length > 0) {
            devices.push({ deviceIp, backups });
          }
        }
      } catch (error) {
        console.error(`[BACKEND] Error processing device directory ${deviceDir}: ${error.message}`);
      }
    }

    console.log(`[BACKEND] Found devices: ${JSON.stringify(devices)}`);
    return res.json({ success: true, devices, message: devices.length === 0 ? "No devices with valid backups found." : undefined });
  } catch (error) {
    console.error(`[BACKEND] Error fetching backups: ${error.message}`);
    return res.status(500).json({ success: false, message: `Error fetching backups: ${error.message}` });
  }
});

// =============================================================================================
// ==================== FETCH THE HOSTS INSIDE THE BUCKUP DIRECTORY ============================
// =============================================================================================
//
app.get("/api/backups/host/:hostname", (req, res) => {
  const { hostname } = req.params;
  try {
    const backupBasePath = "/backups";
    const deviceDir = path.join(backupBasePath, hostname);

    // Check if the device directory exists
    if (!fs.existsSync(deviceDir)) {
      console.error(`[BACKEND] Device directory not found: ${deviceDir}`);
      return res.json({ success: true, backups: [], message: `No backups found for host ${hostname}.` });
    }

    // Check directory permissions
    try {
      fs.accessSync(deviceDir, fs.constants.R_OK);
      console.log(`[BACKEND] Device directory is readable: ${deviceDir}`);
    } catch (error) {
      console.error(`[BACKEND] Device directory is not readable: ${deviceDir}, Error: ${error.message}`);
      return res.status(500).json({ success: false, message: `Device directory not readable: ${error.message}` });
    }

    // Read backup files
    let backups = [];
    try {
      backups = fs.readdirSync(deviceDir)
        .filter(file => file.endsWith('.conf'))
        .map(file => ({
          value: path.join(backupBasePath, hostname, file),
          label: file
        }));
      console.log(`[BACKEND] Backups for ${hostname}: ${backups.map(b => b.label).join(', ') || 'none'}`);
    } catch (error) {
      console.error(`[BACKEND] Error reading backups for ${hostname}: ${error.message}`);
      return res.status(500).json({ success: false, message: `Error reading backups: ${error.message}` });
    }

    return res.json({ success: true, backups });
  } catch (error) {
    console.error(`[BACKEND] Error fetching backups for ${hostname}: ${error.message}`);
    return res.status(500).json({ success: false, message: `Error fetching backups: ${error.message}` });
  }
});




app.get("/api/health", (req, res) => {
  // Health check endpoint for server status.
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

app.post("/api/labs/launch", async (req, res) => {
  // Launches a lab using Docker Compose.
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
  // Stops a lab using Docker Compose.
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
  // Retrieves status for a specific lab.
  const { labPath } = req.query;
  if (!labPath) return res.status(400).json({ success: false, message: "labPath is required." });
  const status = await getDockerComposeStatus(labPath);
  labStatuses[labPath] = status;
  res.json(status);
});

app.get("/api/labs/all-statuses", async (req, res) => {
  // Retrieves statuses for all labs.
  const allLabPaths = ["routing/ospf-single-area"];
  const statuses = {};
  for (const labPath of allLabPaths) {
    const status = await getDockerComposeStatus(labPath);
    statuses[labPath] = status;
    labStatuses[labPath] = status;
  }
  res.json(statuses);
});
//  ===========================================================================
//  ========================  JSNAPy TEST RUNNER  =============================
//  ===========================================================================
app.post("/api/scripts/run", async (req, res) => {
  const { scriptId, parameters, wsClientId } = req.body;

  console.log(`[DEBUG][API] /api/scripts/run called for scriptId: ${scriptId} with wsClientId: ${wsClientId}`);
  console.log(`[DEBUG][API] Original parameters:`, parameters);

  // 1. Validate WebSocket Client ID
  if (!wsClientId) {
    return res.status(400).json({ success: false, message: "WebSocket Client ID is required for real-time updates." });
  }
  const clientWs = clients.get(wsClientId);
  if (!clientWs || clientWs.readyState !== 1) {
    return res.status(404).json({ success: false, message: "WebSocket client not found or is not open." });
  }

  // 2. Validate Script ID and find script definition
  if (!scriptId) {
    return res.status(400).json({ success: false, message: "scriptId is required." });
  }
  const config = yaml.load(fs.readFileSync(SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"));
  const scriptDef = config.scripts.find((s) => s.id === scriptId);
  if (!scriptDef) {
    return res.status(404).json({ success: false, message: "Script definition not found." });
  }

  // 3. Process parameters - RESOLVE INVENTORY FILE TO HOSTNAMES
  let processedParameters = { ...parameters };

  if (parameters && parameters.inventory_file) {
    try {
      // Read the inventory file from the host filesystem
        // Extract just the filename from the parameters (remove any path prefixes)
      const filename = path.basename(parameters.inventory_file);
      const inventoryFilePath = path.join('/python_pipeline/data', filename);
      console.log(`[DEBUG][API] Reading inventory file from: ${inventoryFilePath}`);

      if (!fs.existsSync(inventoryFilePath)) {
        throw new Error(`Inventory file not found: ${inventoryFilePath}`);
      }

      const inventoryContent = fs.readFileSync(inventoryFilePath, 'utf8');
      const inventoryData = yaml.load(inventoryContent);

      // Extract hostnames from your specific inventory format
      let hostnames = [];

      // Your format: array of locations with routers
      if (Array.isArray(inventoryData)) {
        for (const location of inventoryData) {
          if (location.routers && Array.isArray(location.routers)) {
            for (const router of location.routers) {
              // You can use either ip_address or host_name - adjust as needed
              if (router.ip_address) {
                hostnames.push(router.ip_address);
              } else if (router.host_name) {
                hostnames.push(router.host_name);
              }
            }
          }
        }
      }

      if (hostnames.length === 0) {
        throw new Error(`No hosts found in inventory file: ${parameters.inventory_file}`);
      }

      // Convert hostnames array to comma-separated string
      const hostnameString = hostnames.join(',');
      console.log(`[DEBUG][API] Resolved hostnames from inventory: ${hostnameString}`);

      // Replace inventory_file parameter with hostname parameter
      processedParameters = {
        ...parameters,
        hostname: hostnameString
      };
      delete processedParameters.inventory_file;

    } catch (error) {
      console.error(`[DEBUG][API] Error processing inventory file:`, error.message);
      return res.status(400).json({
        success: false,
        message: `Error processing inventory file: ${error.message}`
      });
    }
  }

  console.log(`[DEBUG][API] Processed parameters:`, processedParameters);

  // 4. Immediately respond to the client to indicate the process has started
  res.status(202).json({ success: true, message: `Script '${scriptId}' execution started.` });

  // 5. Construct Docker arguments
  const scriptPath = path.join(SCRIPT_MOUNT_POINT_IN_CONTAINER, scriptDef.path, "run.py");
  const dockerArgs = [
    "run", "--rm", "--network=host",
    "-v", `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`,
    "vlabs-python-runner",
    "stdbuf", "-oL", "-eL", "python", "-u",
    scriptPath
  ];

  // Add processed parameters to Docker command
  if (processedParameters) {
    for (const [key, value] of Object.entries(processedParameters)) {
      if (value !== undefined && value !== null && value !== "") {
        dockerArgs.push(`--${key}`);
        dockerArgs.push(String(value));
      }
    }
  }

  console.log('[DEBUG][API] Final Docker command:', dockerArgs.join(' '));

  // 6. Execute the script
  executeWithRealTimeUpdates('docker', dockerArgs, clientWs);
});
//  ===========================================================================================
//  ================================= GENERATE REPORT  ========================================
//  ===========================================================================================
//
app.post("/api/report/generate", (req, res) => {
  // Generates and saves a report from script results.
  const { savePath, jsonData } = req.body;
  if (!jsonData || !savePath) {
    return res.status(400).json({ success: false, message: "jsonData and savePath are required." });
  }
  try {
    const destinationDir = path.join(PYTHON_PIPELINE_MOUNT_PATH, savePath);
    ensureDirectoryExists(destinationDir);
    const hostname = jsonData.results_by_host?.[0]?.hostname || 'generic-report';
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${hostname}_${timestamp}.json`;
    const filepath = path.join(destinationDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(jsonData, null, 2), "utf8");
    console.log(`[BACKEND] Saved report to: ${filepath}`);
    return res.json({ success: true, message: `Results saved to ${filename}` });
  } catch (error) {
    console.error(`[BACKEND] Error saving report: ${error.message}`);
    return res.status(500).json({ success: false, message: "An internal error occurred while saving the report.", error: error.message });
  }
});

app.post("/api/templates/generate", (req, res) => {
  // Renders a Jinja2 template with provided parameters.
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
//  =========================================================================
//  ============== APPLY RENDRED TEMPLATE TO TARGET HOST ====================
//  =========================================================================
app.post("/api/templates/apply", async (req, res) => {
  const { wsClientId, templateId, renderedConfig, targetHostname, username, password } = req.body;
  if (!wsClientId) return res.status(400).json({ success: false, message: "WebSocket Client ID is required." });

  const clientWs = clients.get(wsClientId);
  if (!clientWs || clientWs.readyState !== 1) return res.status(404).json({ success: false, message: "WebSocket client not found or not open." });

  res.status(202).json({ success: true, message: "Apply process started." });

  const runScriptPath = path.join(SCRIPT_MOUNT_POINT_IN_CONTAINER, "tools", "configuration", "run.py");
  const dockerArgs = [
    "run", "--rm", "--network=host", "-v", `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`,
    "vlabs-python-runner", "stdbuf", "-oL", "-eL", "python", "-u", runScriptPath,
    '--template_id', templateId, '--rendered_config', renderedConfig, '--target_host', targetHostname,
    '--username', username, '--password', password,
  ];

  executeWithRealTimeUpdates('docker', dockerArgs, clientWs);
});

//  =========================================================================
//  ==============   EXECUTE WITH REAL TIME STREAMING     ===================
//  =========================================================================

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

  const dockerArgs = [
    "run", "--rm", "--network=host",
    "-v", `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`,
    "-v", `${path.join(PYTHON_PIPELINE_PATH_ON_HOST, "tools", "backup_and_restore", "backups")}:/backups`,
    "-v", `${path.join(PYTHON_PIPELINE_PATH_ON_HOST, "data")}:/data`,
    "vlabs-python-runner", "stdbuf", "-oL", "-eL", "python", "-u", scriptPath
  ];

  if (parameters) {
    for (const [key, value] of Object.entries(parameters)) {
      if (value === null || value === undefined || value === "") continue;
      if (value === true) {
        dockerArgs.push(`--${key}`);
      } else if (value !== false) {
        dockerArgs.push(`--${key}`);
        dockerArgs.push(String(value));
      }
    }
  }

  console.log(`[BACKEND] Executing docker command: docker ${dockerArgs.join(" ")}`);

  // Send start notification
  if (clientWs.readyState === 1) {
    clientWs.send(JSON.stringify({ type: "script_start", runId, scriptId }));
  }

  // =======================================================================
  // [DEBUG ENHANCEMENT 1] - Log the raw arguments array
  // =======================================================================
  console.log('[DEBUG][API] Final Docker command being constructed:');
  console.log(`[DEBUG][API] Command: docker`);
  console.log('[DEBUG][API] Arguments Array:', dockerArgs);
  // =======================================================================

  executeWithRealTimeUpdates('docker', dockerArgs, clientWs, {
    onStdout: (data) => {
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({ type: "script_output", runId, scriptId, output: data }));
      }
    },
    onStderr: (data) => {
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({ type: "script_error", runId, scriptId, error: data }));
      }
    },
    onClose: (code, fullStdout, fullStderr) => {
      let finalResult = null;
      try { finalResult = JSON.parse(fullStdout); } catch(e) { /* Ignore */ }

      if (finalResult && clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({ type: "script_output", runId, scriptId, output: finalResult }));
      }

      const historyRecord = {
        runId, timestamp: new Date().toISOString(), scriptId, parameters,
        isSuccess: code === 0, output: fullStdout, error: fullStderr
      };
      runHistory.unshift(historyRecord);
      if (runHistory.length > MAX_HISTORY_ITEMS) runHistory.pop();

      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({ type: "script_end", runId, scriptId, exitCode: code }));
      }
    }
  });
});

// ====================================================================================
// SECTION 8: SERVER STARTUP
// ====================================================================================
// Description: Starts the Express and WebSocket server and logs configuration details.
// Purpose: Initializes the backend service for operation.
server.listen(port, () => {
  console.log(`[BACKEND] Express & WebSocket Server listening at http://localhost:${port}`);
  console.log(`[BACKEND] Python pipeline host path: ${PYTHON_PIPELINE_PATH_ON_HOST}`);
  console.log(`[BACKEND] Python pipeline container mount: ${PYTHON_PIPELINE_MOUNT_PATH}`);
  console.log(`[BACKEND] Public container mount: ${PUBLIC_MOUNT_PATH}`);
  console.log(`[BACKEND] Backup directory mount: /app/backups`);
});
