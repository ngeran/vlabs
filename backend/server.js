// backend/server.js

/**
 * @file Enhanced Express.js server with WebSocket support for real-time communication.
 * @description This server provides REST APIs for script and template management,
 *              and uses WebSockets for live updates during script execution.
 * @author nikos-geranios_vgi
 * @date 2025-07-06 15:45:00 UTC
 */

// ====================================================================================
// SECTION 1: IMPORTS & INITIAL SETUP
// ====================================================================================
const express = require("express");
const cors = require("cors");
const http = require("http"); // Required to share the server between Express and WS
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
const SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER = path.join(
  PYTHON_PIPELINE_MOUNT_PATH,
  "scripts.yaml",
);
const PYTHON_PIPELINE_PATH_ON_HOST = path.join(
  process.env.HOST_PROJECT_ROOT,
  "python_pipeline",
);
const SCRIPT_MOUNT_POINT_IN_CONTAINER = "/app/python-scripts";
const TEMPLATES_CONFIG_FILE_PATH_IN_CONTAINER = path.join(
  PYTHON_PIPELINE_MOUNT_PATH,
  "tools",
  "configuration",
  "templates.yml",
);
const TEMPLATES_DIRECTORY_PATH = path.join(
  PYTHON_PIPELINE_MOUNT_PATH,
  "tools",
  "configuration",
  "templates",
);
const NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER = path.join(
  PUBLIC_MOUNT_PATH,
  "navigation.yaml",
);
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
});

// ====================================================================================
// SECTION 6: HELPER FUNCTIONS
// ====================================================================================
const getTemplatesConfig = () => {
  try {
    const p = TEMPLATES_CONFIG_FILE_PATH_IN_CONTAINER;
    if (!fs.existsSync(p)) {
      console.error(`Templates config file not found: ${p}`);
      return null;
    }
    return yaml.load(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.error(`[BACKEND] Error loading templates config: ${e.message}`);
    return null;
  }
};
const templateFileExists = (file) =>
  fs.existsSync(path.join(TEMPLATES_DIRECTORY_PATH, file));
const getTemplateContent = (file) => {
  try {
    const p = path.join(TEMPLATES_DIRECTORY_PATH, file);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf8");
  } catch (e) {
    console.error(
      `[BACKEND] Error reading template file ${file}: ${e.message}`,
    );
    return null;
  }
};
const getDockerComposeStatus = (labPath) => {
  return new Promise((resolve) => {
    const labDirectory = path.join(PUBLIC_MOUNT_PATH, labPath);
    const dockerComposeFilePath = path.join(labDirectory, "docker-compose.yml");
    if (!fs.existsSync(dockerComposeFilePath))
      return resolve({
        status: "stopped",
        message: "Lab definition file not found.",
      });
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
const getScriptIndividualMetadata = (scriptId, metadataFileName) => {
  if (!scriptId || !metadataFileName) return null;
  try {
    const p = path.join(PYTHON_PIPELINE_MOUNT_PATH, scriptId, metadataFileName);
    return yaml.load(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.error(
      `[BACKEND] Error processing metadata for script "${scriptId}": ${e.message}`,
    );
    return null;
  }
};
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
function ensureOutputDirectory() {
  const outputDir = path.join(PYTHON_PIPELINE_MOUNT_PATH, "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

// ====================================================================================
// SECTION 7: API ENDPOINTS (HTTP REST API)
// ====================================================================================

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
    if (!scriptDefinition.capabilities?.dynamicDiscovery)
      return res.status(400).json({
        success: false,
        message: `Test discovery not supported for script: ${scriptId}.`,
      });
    const validEnvironments = ["development", "lab", "staging", "production"];
    if (!validEnvironments.includes(environment))
      return res.status(400).json({
        success: false,
        message: `Invalid environment: ${environment}`,
      });
    const discoveryResult = await executeTestDiscovery(scriptId, environment);
    res.json({ success: true, ...discoveryResult });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Test discovery failed: ${error.message}`,
    });
  }
});

app.post("/api/templates/discover", async (req, res) => {
  try {
    const { category, environment = "development" } = req.body;
    const templatesConfig = getTemplatesConfig();
    if (!templatesConfig || !templatesConfig.templates)
      return res.status(500).json({
        success: false,
        message: "Templates configuration not found or malformed.",
      });
    const templates = templatesConfig.templates;
    const categorizedTemplates = {};
    const availableTemplates = [];
    for (const [templateId, templateDef] of Object.entries(templates)) {
      if (!templateFileExists(templateDef.template_file)) {
        console.warn(
          `[BACKEND] Template file not found: ${templateDef.template_file}`,
        );
        continue;
      }
      if (category && templateDef.category !== category) continue;
      const templateCategory = templateDef.category || "General";
      if (!categorizedTemplates[templateCategory])
        categorizedTemplates[templateCategory] = [];
      const templateInfo = {
        id: templateId,
        name: templateDef.name,
        description: templateDef.description,
        category: templateCategory,
        parameters: templateDef.parameters || [],
        template_file: templateDef.template_file,
      };
      categorizedTemplates[templateCategory].push(templateInfo);
      availableTemplates.push(templateInfo);
    }
    res.json({
      success: true,
      discovered_templates: categorizedTemplates,
      available_templates: availableTemplates,
      total_count: availableTemplates.length,
      backend_metadata: {
        discovery_time: new Date().toISOString(),
        environment: environment,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Template discovery failed: ${error.message}`,
    });
  }
});

app.get("/api/templates/:templateId", async (req, res) => {
  try {
    const { templateId } = req.params;
    const templatesConfig = getTemplatesConfig();
    if (!templatesConfig || !templatesConfig.templates)
      return res.status(500).json({
        success: false,
        message: "Templates configuration not found or malformed.",
      });
    const templateDef = templatesConfig.templates[templateId];
    if (!templateDef)
      return res.status(404).json({
        success: false,
        message: `Template with ID "${templateId}" not found.`,
      });
    if (!templateFileExists(templateDef.template_file))
      return res.status(404).json({
        success: false,
        message: `Template file "${templateDef.template_file}" not found.`,
      });
    const templateContent = getTemplateContent(templateDef.template_file);
    if (!templateContent)
      return res.status(500).json({
        success: false,
        message: `Failed to read template file "${templateDef.template_file}".`,
      });
    res.json({
      success: true,
      template: {
        id: templateId,
        name: templateDef.name,
        description: templateDef.description,
        category: templateDef.category || "General",
        parameters: templateDef.parameters || [],
        template_file: templateDef.template_file,
        template_content: templateContent,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Template detail retrieval failed: ${error.message}`,
    });
  }
});

app.post("/api/templates/generate", async (req, res) => {
  try {
    const { templateId, parameters } = req.body;
    if (!templateId)
      return res
        .status(400)
        .json({ success: false, message: "templateId is required" });
    const templatesConfig = getTemplatesConfig();
    if (!templatesConfig || !templatesConfig.templates)
      return res.status(500).json({
        success: false,
        message: "Templates configuration not found or malformed.",
      });
    const templateDef = templatesConfig.templates[templateId];
    if (!templateDef)
      return res.status(404).json({
        success: false,
        message: `Template with ID "${templateId}" not found.`,
      });
    const templateContent = getTemplateContent(templateDef.template_file);
    if (!templateContent)
      return res.status(500).json({
        success: false,
        message: `Failed to read template file "${templateDef.template_file}".`,
      });
    const renderScriptPath = path.join(
      SCRIPT_MOUNT_POINT_IN_CONTAINER,
      "tools",
      "configuration",
      "utils",
      "render_template.py",
    );
    const renderData = {
      template_content: templateContent,
      parameters: parameters || {},
      template_id: templateId,
    };
    const dockerArgs = [
      "run",
      "--rm",
      "-i",
      "-v",
      `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`,
      "vlabs-python-runner",
      "python",
      renderScriptPath,
    ];
    const child = spawn("docker", dockerArgs);
    let stdoutData = "",
      stderrData = "";
    child.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderrData += data.toString();
    });
    child.on("close", (code) => {
      if (code !== 0)
        return res.status(500).json({
          success: false,
          message: `Template rendering failed: ${stderrData}`,
        });
      try {
        const result = JSON.parse(stdoutData);
        res.json({
          success: true,
          generated_config: result.rendered_config,
          template_id: templateId,
          parameters_used: parameters,
          generation_time: new Date().toISOString(),
          debug_info: {
            template_file: templateDef.template_file,
            template_content_length: templateContent.length,
            output_length: result.rendered_config?.length || 0,
          },
        });
      } catch (parseError) {
        res.status(500).json({
          success: false,
          message: "Failed to parse template rendering output.",
        });
      }
    });
    child.stdin.write(JSON.stringify(renderData));
    child.stdin.end();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Template generation failed: ${error.message}`,
    });
  }
});

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
    let stdoutData = "",
      stderrData = "";
    child.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderrData += data.toString();
    });
    child.on("close", (code) => {
      if (code !== 0)
        return res.status(500).json({
          success: false,
          message: `Report generator failed: ${stderrData}`,
        });
      const outputDir = ensureOutputDirectory();
      const filePath = path.join(outputDir, safeFilename);
      fs.writeFile(filePath, stdoutData, "utf8", (writeErr) => {
        if (writeErr)
          return res.status(500).json({
            success: false,
            message: "Failed to save the report file.",
          });
        res.json({ success: true, message: `Report saved to ${safeFilename}` });
      });
    });
    child.stdin.write(JSON.stringify(jsonData));
    child.stdin.end();
  } catch (e) {
    if (!res.headersSent)
      res.status(500).json({
        success: false,
        message: "An unexpected server error occurred.",
      });
  }
});

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

app.post("/api/scripts/run", (req, res) => {
  const { scriptId, parameters } = req.body;
  const runId =
    Date.now().toString() + Math.random().toString(36).substring(2, 9);
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
  const dockerArgs = [
    "run",
    "--rm",
    "--network=host",
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
  try {
    const child = spawn("docker", dockerArgs);
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("close", (code) => {
      const result = {
        runId,
        timestamp: new Date().toISOString(),
        scriptId,
        parameters,
        isSuccess: code === 0,
        output: stdout,
        error: stderr,
      };
      runHistory.unshift(result);
      if (runHistory.length > MAX_HISTORY_ITEMS) runHistory.pop();
      if (code !== 0)
        return res.status(500).json({
          success: false,
          message: `Script execution failed: ${stderr}`,
          output: stdout,
          error: stderr,
        });
      res.json({ success: true, output: stdout, error: stderr });
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred while running the script.",
    });
  }
});

app.get("/api/history/list", (req, res) => {
  res.json({ success: true, history: runHistory });
});

app.post("/api/labs/launch", async (req, res) => {
  const { labPath } = req.body;
  if (!labPath)
    return res
      .status(400)
      .json({ success: false, message: "labPath is required." });
  const labDirectory = path.join(PUBLIC_MOUNT_PATH, labPath);
  if (!fs.existsSync(path.join(labDirectory, "docker-compose.yml")))
    return res
      .status(404)
      .json({ success: false, message: "Lab definition file not found." });
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

app.post("/api/labs/stop", (req, res) => {
  const { labPath } = req.body;
  if (!labPath)
    return res
      .status(400)
      .json({ success: false, message: "labPath is required." });
  const labDirectory = path.join(PUBLIC_MOUNT_PATH, labPath);
  if (!fs.existsSync(path.join(labDirectory, "docker-compose.yml")))
    return res
      .status(404)
      .json({ success: false, message: "Lab definition file not found." });
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

app.get("/api/labs/all-statuses", async (req, res) => {
  const allLabPaths = ["routing/ospf-single-area"];
  const statuses = {};
  for (const labPath of allLabPaths) {
    const status = await getDockerComposeStatus(labPath);
    statuses[labPath] = status;
    labStatuses[labPath] = status;
  }
  res.json(statuses);
});

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

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

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

// --- ✨ WEBSOCKET-ENABLED API TEMPLATE APPLY ENDPOINT ---
app.post("/api/templates/apply", async (req, res) => {
  const {
    wsClientId,
    templateId,
    renderedConfig,
    targetHostname,
    inventoryFile,
    username,
    password,
    commitCheck,
  } = req.body;
  if (!wsClientId)
    return res
      .status(400)
      .json({ success: false, message: "WebSocket Client ID is required." });
  if (!renderedConfig || !targetHostname || !username || !password)
    return res
      .status(400)
      .json({ success: false, message: "Missing required parameters." });
  const clientWs = clients.get(wsClientId);
  if (!clientWs)
    return res.status(404).json({
      success: false,
      message: "WebSocket client not found or disconnected.",
    });
  try {
    const runScriptPath = path.join(
      SCRIPT_MOUNT_POINT_IN_CONTAINER,
      "tools",
      "configuration",
      "run.py",
    );
    const dockerArgs = [
      "run",
      "--rm",
      "--network=host",
      "-v",
      `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`,
      "vlabs-python-runner",
      "python",
      runScriptPath,
      "--template_id",
      templateId,
      "--rendered_config",
      renderedConfig,
      "--target_host",
      targetHostname,
      "--username",
      username,
      "--password",
      password,
      "--simple_output",
    ];
    if (inventoryFile)
      dockerArgs.push(
        "--inventory_file",
        path.join(SCRIPT_MOUNT_POINT_IN_CONTAINER, "data", inventoryFile),
      );
    if (commitCheck) dockerArgs.push("--commit_check");

    console.log(
      `[BACKEND] Spawning Docker command: docker ${dockerArgs.join(" ")}`,
    );
    res.status(202).json({
      success: true,
      message: "Apply process started. See WebSocket for progress.",
    });

    const child = spawn("docker", dockerArgs);
    let finalJsonOutput = null;

    child.stderr.on("data", (data) => {
      const lines = data
        .toString()
        .split("\n")
        .filter((line) => line.startsWith("JSON_PROGRESS:"));
      for (const line of lines) {
        try {
          const progressData = JSON.parse(line.substring(14).trim());
          console.log(
            `[WebSocket] Forwarding to ${wsClientId}: ${progressData.message}`,
          );
          if (clientWs.readyState === 1)
            clientWs.send(
              JSON.stringify({ type: "progress", data: progressData }),
            );
        } catch (e) {
          console.error("[BACKEND] Failed to parse progress JSON:", line);
        }
      }
    });

    child.stdout.on("data", (data) => {
      finalJsonOutput = data.toString();
    });

    child.on("close", (code) => {
      console.log(`[BACKEND] Apply script finished with code ${code}.`);
      if (code !== 0) {
        if (clientWs.readyState === 1)
          clientWs.send(
            JSON.stringify({
              type: "error",
              message: `Script exited with error code ${code}.`,
            }),
          );
        return;
      }
      try {
        const finalResult = JSON.parse(finalJsonOutput);
        if (clientWs.readyState === 1)
          clientWs.send(JSON.stringify({ type: "result", data: finalResult }));
      } catch (e) {
        if (clientWs.readyState === 1)
          clientWs.send(
            JSON.stringify({
              type: "error",
              message: "Failed to parse final script output.",
            }),
          );
      }
    });
  } catch (error) {
    console.error(`[BACKEND] Apply process failed to start: ${error.message}`);
    const clientWs = clients.get(wsClientId);
    if (clientWs && clientWs.readyState === 1) {
      clientWs.send(
        JSON.stringify({
          type: "error",
          message: `Failed to start apply process: ${error.message}`,
        }),
      );
    }
  }
});

// ====================================================================================
// SECTION 8: SERVER STARTUP
// ====================================================================================
server.listen(port, () => {
  console.log(
    `[BACKEND] Express & WebSocket Server listening at http://localhost:${port}`,
  );
  console.log(
    `[BACKEND] Python pipeline host path: ${PYTHON_PIPELINE_PATH_ON_HOST}`,
  );
  console.log(
    `[BACKEND] Python pipeline container mount: ${PYTHON_PIPELINE_MOUNT_PATH}`,
  );
  console.log(`[BACKEND] Public container mount: ${PUBLIC_MOUNT_PATH}`);
});
