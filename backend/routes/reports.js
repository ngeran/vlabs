// ==============================================================================
// FILE: routes/reports.js
// ==============================================================================
// Overview:
// This module defines an API route for generating and saving reports in the Vlabs
// backend. It accepts JSON data and saves it as a report file in a specified output
// directory, creating directories as needed and naming files with hostnames and
// timestamps for uniqueness.
//
// Key Features:
// - Saves JSON report data to a file in the Docker-mounted output directory.
// - Generates unique filenames using hostname and timestamp.
// - Ensures output directory exists before saving.
// - Includes error handling for file operations and validation.
//
// Dependencies:
// - express: Web framework for defining API routes.
// - fs: Node.js module for file system operations.
// - path: Node.js module for path manipulation.
// - ../config/paths: Path constants for output directory.
// - ../utils/fileUtils: Utility for ensuring directory existence.
//
// How to Use:
// 1. Mount in server.js: `app.use('/api/report', require('./routes/reports'));`.
// 2. Ensure the output directory (`PYTHON_PIPELINE_MOUNT_PATH/output`) is correctly mounted in Docker.
// 3. Test the endpoint with a POST request containing `savePath` and `jsonData`.
//    Example: `curl -X POST http://localhost:3001/api/report/generate -d '{"savePath":"reports","jsonData":{"results_by_host":[{"hostname":"router1"}]}}'`.
// 4. Verify saved report files in the output directory.
// 5. Monitor console logs for file operation errors.
// 6. To modify report format, update the JSON structure expected by the endpoint.
//
// API Endpoints:
// - POST /api/report/generate: Saves JSON report data to a file with a unique name.

// ==============================================================================
// SECTION 1: IMPORTS
// ==============================================================================
const express = require("express"); // Web framework for routing
const router = express.Router(); // Express router instance
const fs = require("fs"); // File system operations for saving reports
const path = require("path"); // Path manipulation for file paths
const { PYTHON_PIPELINE_MOUNT_PATH } = require("../config/paths"); // Path constants
const { ensureDirectoryExists } = require("../utils/fileUtils"); // Directory creation utility

// ==============================================================================
// SECTION 2: GENERATE REPORT
// ==============================================================================
// POST /api/report/generate
// Save JSON report data to a file in the specified directory
router.post("/generate", (req, res) => {
  const { savePath, jsonData } = req.body;

  // Validate request body
  if (!jsonData || !savePath) {
    return res.status(400).json({ success: false, message: "jsonData and savePath are required." });
  }

  try {
    // Construct output directory and ensure it exists
    const destinationDir = path.join(PYTHON_PIPELINE_MOUNT_PATH, savePath);
    ensureDirectoryExists(destinationDir);

    // Generate unique filename using hostname and timestamp
    const hostname = jsonData.results_by_host?.[0]?.hostname || "generic-report";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${hostname}_${timestamp}.json`;
    const filepath = path.join(destinationDir, filename);

    // Save JSON data to file
    fs.writeFileSync(filepath, JSON.stringify(jsonData, null, 2), "utf8");
    console.log(`[BACKEND] Saved report to: ${filepath}`);

    res.json({ success: true, message: `Results saved to ${filename}` });
  } catch (error) {
    // Handle file writing errors
    console.error(`[BACKEND] Error saving report: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "An internal error occurred while saving the report.",
      error: error.message
    });
  }
});

// ==============================================================================
// SECTION 3: EXPORTS
// ==============================================================================
module.exports = router;
