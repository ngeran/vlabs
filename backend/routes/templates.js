// ==============================================================================
// FILE: routes/templates.js
// ==============================================================================
// Overview:
// This module defines API routes for template-related operations in the Vlabs backend.
// It handles discovering, retrieving, generating, and applying Jinja2 templates for
// network configuration tasks, with real-time updates via WebSocket for apply operations.
//
// Key Features:
// - Discovers templates, optionally filtered by category.
// - Retrieves template details and content.
// - Renders templates with provided parameters.
// - Applies rendered configurations to target hosts via Docker.
//
// Dependencies:
// - express: Web framework for routing.
// - child_process: Node.js module for spawning Docker processes.
// - ../utils/fileUtils: Template file access functions.
// - ../config/paths: Path constants for template directories.
// - ../utils/executeWithRealTimeUpdates: Utility for real-time execution.
//
// How to Use:
// 1. Mount in server.js: `app.use('/api/templates', require('./routes/templates'));`.
// 2. Ensure WebSocket clients are stored in `app.locals.clients` for apply route.
// 3. Test endpoints with tools like Postman or curl.
// 4. Verify Docker image `vlabs-python-runner` and volume mounts are configured.
// 5. Ensure template files and `render_template.py` script are in the correct paths.
//
// API Endpoints:
// - POST /api/templates/discover: Discovers templates by category, returns `discovered_templates`.
// - GET /api/templates/:templateId: Retrieves template details and content.
// - POST /api/templates/generate: Renders a template with parameters.
// - POST /api/templates/apply: Applies a rendered configuration to a target host.

// ==============================================================================
// SECTION 1: IMPORTS
// ==============================================================================
const express = require("express"); // Web framework for routing
const router = express.Router(); // Express router instance
const { spawn } = require("child_process"); // Spawn Docker processes
const {
  getTemplatesConfig,
  getTemplateContent,
} = require("../utils/fileUtils"); // Template utilities
const {
  PYTHON_PIPELINE_PATH_ON_HOST,
  SCRIPT_MOUNT_POINT_IN_CONTAINER,
  PYTHON_PIPELINE_MOUNT_PATH,
} = require("../config/paths"); // Path constants
const { executeWithRealTimeUpdates } = require("../utils/executeWithRealTimeUpdates.js"); // Real-time execution utility

// ==============================================================================
// SECTION 2: DISCOVER TEMPLATES
// ==============================================================================
// POST /api/templates/discover
// Discover templates, optionally filtered by category
router.post("/discover", async (req, res) => {
  const { category } = req.body || {};
  try {
    const discovered_templates = await getTemplatesConfig(category);
    console.log(`[BACKEND] Discovered templates:`, Object.keys(discovered_templates));
    res.json({ success: true, discovered_templates });
  } catch (error) {
    console.error(`[BACKEND] Failed to discover templates: ${error.message}`);
    res.status(500).json({ success: false, message: `Failed to discover templates: ${error.message}` });
  }
});

// ==============================================================================
// SECTION 3: GET TEMPLATE DETAILS
// ==============================================================================
// GET /api/templates/:templateId
// Retrieve template details and content
router.get("/:templateId", async (req, res) => {
  const { templateId } = req.params;
  try {
    const template = await getTemplateContent(templateId);
    if (!template) {
      return res.status(404).json({ success: false, message: `Template '${templateId}' not found.` });
    }
    res.json({ success: true, template });
  } catch (error) {
    console.error(`[BACKEND] Failed to retrieve template ${templateId}: ${error.message}`);
    res.status(500).json({ success: false, message: `Failed to retrieve template: ${error.message}` });
  }
});

// ==============================================================================
// SECTION 4: GENERATE TEMPLATE
// ==============================================================================
// POST /api/templates/generate
// Render a template with provided parameters
router.post("/generate", async (req, res) => {
  const { templateId, parameters } = req.body;
  if (!templateId || !parameters) {
    return res.status(400).json({ success: false, message: "templateId and parameters are required." });
  }

  try {
    const template = await getTemplateContent(templateId);
    if (!template) {
      return res.status(404).json({ success: false, message: `Template '${templateId}' not found.` });
    }

    // Construct Docker command for rendering
    const templatePath = template.path;
    const dockerArgs = [
      "run",
      "--rm",
      // BEFORE (The broken code):
      // "-v",
      // `${PYTHON_PIPELINE_PATH_ON_HOST}:${SCRIPT_MOUNT_POINT_IN_CONTAINER}`,

      // AFTER (The corrected code):
      // We map the host directory to the SAME path that Node.js uses to construct the templatePath.
      "-v",
      `${PYTHON_PIPELINE_PATH_ON_HOST}:${PYTHON_PIPELINE_MOUNT_PATH}`,

      "vlabs-python-runner",
      "python",
      "-u",
      // The path to the script itself must now be relative to the new mount point.
      `${PYTHON_PIPELINE_MOUNT_PATH}/tools/configuration/utils/render_template.py`,

      "--template_path",
      templatePath, // This path is now correct inside the container
    ];
    // Add parameters as JSON
    dockerArgs.push("--parameters", JSON.stringify(parameters));

    // Execute rendering command
    const child = spawn("docker", dockerArgs);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`[BACKEND] Template rendering failed: ${stderr}`);
        return res.status(500).json({ success: false, message: `Template rendering failed: ${stderr}` });
      }

      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          res.json({ success: true, result });
        } else {
          throw new Error("No JSON output found");
        }
      } catch (error) {
        console.error(`[BACKEND] Failed to parse template output: ${error.message}`);
        res.status(500).json({ success: false, message: `Failed to parse template output: ${error.message}` });
      }
    });
  } catch (error) {
    console.error(`[BACKEND] Failed to generate template: ${error.message}`);
    res.status(500).json({ success: false, message: `Failed to generate template: ${error.message}` });
  }
});

// ==============================================================================
// SECTION 5: APPLY TEMPLATE
// ==============================================================================
// POST /api/templates/apply
// Apply a rendered template configuration to a target host
router.post("/apply", (req, res) => {
  const {
    wsClientId,
    templateId,
    renderedConfig,
    targetHostname,
    username,
    password
  } = req.body;

  const clients = req.app.locals.clients;

  // Validate inputs
  if (!wsClientId || !renderedConfig || !targetHostname) {
    return res.status(400).json({ success: false, message: "wsClientId, renderedConfig, and targetHostname are required." });
  }
  const clientWs = clients.get(wsClientId);
  if (!clientWs || clientWs.readyState !== 1) {
    return res.status(404).json({ success: false, message: `WebSocket client '${wsClientId}' not found.` });
  }

  // Acknowledge request
  res.status(202).json({ success: true, message: `Applying configuration from template '${templateId}' to ${targetHostname}...` });

  // --- FIX: Construct the CORRECT Docker command to call run.py ---

  // 1. Define the path to the correct script for APPLYING config.
  const runScriptPath = `${PYTHON_PIPELINE_MOUNT_PATH}/tools/configuration/run.py`;

  const dockerArgs = [
    "run",
    "--rm",
    "--network=host", // Required for the script to reach the target device
    // 2. Use the CORRECT volume mount, same as the one we fixed for /generate
    "-v",
    `${PYTHON_PIPELINE_PATH_ON_HOST}:${PYTHON_PIPELINE_MOUNT_PATH}`,
    "vlabs-python-runner",
    "stdbuf", "-oL", "-eL", // For real-time streaming
    "python", "-u",
    runScriptPath, // The script to execute

    // 3. Provide the arguments that run.py actually expects
    '--template_id', templateId,
    '--rendered_config', renderedConfig,
    '--target_host', targetHostname,
    '--username', username,
    '--password', password,
  ];

  // Execute with real-time updates
  executeWithRealTimeUpdates("docker", dockerArgs, clientWs);
});
// ==============================================================================
// SECTION 6: EXPORTS
// ==============================================================================
module.exports = router;
