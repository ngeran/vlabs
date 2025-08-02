// ==============================================================================
// FILE: routes/inventories.js
// ==============================================================================
// Overview:
// This module defines API routes for inventory-related operations in the Vlabs backend.
// It handles listing inventory files, scanning directory trees for code upgrades, and
// retrieving software version data from YAML files.
//
// Key Features:
// - Lists inventory files (.yml, .yaml, .ini) from the data directory.
// - Scans the code upgrade directory to build a tree structure.
// - Retrieves software versions from SoftwareVersions.yml.
//
// Dependencies:
// - express: Web framework for routing.
// - fs: Node.js module for file system operations.
// - path: Node.js module for path manipulation.
// - js-yaml: Parses YAML files.
// - ../config/paths: Path constants for data directory.
// - ../utils/fileUtils: Directory scanning utility.
//
// How to Use:
// 1. Mount in server.js: `app.use('/api/inventories', require('./routes/inventories'));`.
// 2. Ensure data directory and SoftwareVersions.yml are mounted in Docker.
// 3. Test endpoints with tools like Postman or curl.
// 4. Verify file permissions and paths for inventory and upgrade directories.
// 5. Monitor logs for file access errors.
//
// API Endpoints:
// - GET /api/inventories/list: Lists inventory files in /python_pipeline/data.
// - GET /api/inventories/inventory-tree: Scans code upgrade directory for tree structure.
// - GET /api/inventories/software-versions: Retrieves software version data.

// ==============================================================================
// SECTION 1: IMPORTS
// ==============================================================================
const express = require("express"); // Web framework for routing
const router = express.Router(); // Express router instance
const fs = require("fs"); // File system operations
const path = require("path"); // Path manipulation
const yaml = require("js-yaml"); // YAML parsing
const { PYTHON_PIPELINE_MOUNT_PATH } = require("../config/paths"); // Path constants
const { scanDirectory } = require("../utils/fileUtils"); // Directory scanning utility

// ==============================================================================
// SECTION 2: LIST INVENTORIES
// ==============================================================================
// GET /api/inventories/list
// List inventory files from /python_pipeline/data
router.get("/list", (req, res) => {
  const dataDir = path.join(PYTHON_PIPELINE_MOUNT_PATH, "data");
  try {
    if (!fs.existsSync(dataDir))
      return res.status(200).json({ success: true, inventories: [], message: "Inventory directory not found." });
    const files = fs.readdirSync(dataDir);
    const inventoryFiles = files
      .filter((file) => /\.(ya?ml|ini)$/i.test(file))
      .map((file) => ({
        value: path.join(PYTHON_PIPELINE_MOUNT_PATH, "data", file),
        label: file,
      }));
    console.log(`[BACKEND] Found inventories: ${inventoryFiles.map((f) => f.label).join(", ")}`);
    res.json({ success: true, inventories: inventoryFiles });
  } catch (error) {
    console.error(`[BACKEND] Failed to list inventory files: ${error.message}`);
    res.status(500).json({ success: false, message: "Failed to list inventory files", error: error.message });
  }
});

// ==============================================================================
// SECTION 3: INVENTORY TREE
// ==============================================================================
// GET /api/inventories/inventory-tree
// Scan code upgrade directory for tree structure
router.get("/inventory-tree", (req, res) => {
  const basePath = "/python_pipeline/tools/code_upgrade";
  const upgradePath = path.join(basePath, "upgrade_path", "vendor");

  console.log(`[INFO] API call to /api/inventories/inventory-tree received.`);
  console.log(`[DEBUG] Attempting to scan directory at absolute container path: ${upgradePath}`);

  try {
    if (fs.existsSync(upgradePath)) {
      console.log(`[SUCCESS] Directory found. Scanning...`);
      const directoryTree = scanDirectory(upgradePath);
      res.json(directoryTree);
    } else {
      console.error(`[ERROR] Directory NOT FOUND at path: ${upgradePath}`);
      const debugInfo = {
        path_searched: upgradePath,
        base_mount_exists: fs.existsSync(basePath),
        base_mount_contents: fs.existsSync(basePath) ? fs.readdirSync(basePath) : [],
        upgrade_path_exists: fs.existsSync(path.join(basePath, "upgrade_path")),
        upgrade_path_contents: fs.existsSync(path.join(basePath, "upgrade_path")) ? fs.readdirSync(path.join(basePath, "upgrade_path")) : [],
      };
      console.error(`[DEBUG] Debug info:`, debugInfo);
      res.status(404).json({
        error: "Directory not found on server.",
        debug: debugInfo,
      });
    }
  } catch (error) {
    console.error(`[FATAL] An error occurred during the scan: ${error.message}`);
    res.status(500).json({ error: "Failed to scan directory", details: error.message });
  }
});

// ==============================================================================
// SECTION 4: SOFTWARE VERSIONS
// ==============================================================================
// GET /api/inventories/software-versions
// Retrieve software versions from SoftwareVersions.yml
router.get("/software-versions", (req, res) => {
  const filePath = path.join(PYTHON_PIPELINE_MOUNT_PATH, "tools", "code_upgrade", "data", "SoftwareVersions.yml");
  console.log(`[API][software-versions] Attempting to read: ${filePath}`);

  try {
    if (!fs.existsSync(filePath)) {
      console.error(`[API][software-versions] File not found at ${filePath}`);
      return res.status(404).json({ success: false, message: "SoftwareVersions.yml not found on the server." });
    }
    const fileContents = fs.readFileSync(filePath, "utf8");
    const data = yaml.load(fileContents);
    console.log(`[API][software-versions] Successfully parsed SoftwareVersions.yml.`);
    res.json(data);
  } catch (error) {
    console.error(`[API][software-versions] Error processing file: ${error.message}`);
    res.status(500).json({ success: false, message: "Failed to read or parse software versions file.", error: error.message });
  }
});

// ==============================================================================
// SECTION 5: EXPORTS
// ==============================================================================
module.exports = router;
