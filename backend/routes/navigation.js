// ==============================================================================
// FILE: routes/navigation.js
// ==============================================================================
// Overview:
// This module defines an API route for retrieving the navigation menu structure in
// the Vlabs backend. It reads and parses the `navigation.yaml` file from a Docker-
// mounted directory to provide a structured menu for the frontend UI, supporting
// dynamic navigation in the application.
//
// Key Features:
// - Loads and validates `navigation.yaml` configuration file.
// - Returns menu structure as JSON for frontend rendering.
// - Includes robust error handling for file access and YAML parsing issues.
// - Logs file access and parsing errors for debugging.
//
// Dependencies:
// - express: Web framework for defining API routes.
// - fs: Node.js module for file system operations.
// - js-yaml: Library for parsing YAML files.
// - ../config/paths: Path constants for navigation file location.
//
// How to Use:
// 1. Mount in server.js: `app.use('/api/navigation', require('./routes/navigation'));`.
// 2. Ensure `navigation.yaml` exists in the `PUBLIC_MOUNT_PATH` directory as defined in config/paths.js.
// 3. Verify Docker volume mounts provide access to `navigation.yaml` in the container.
// 4. Test the endpoint using tools like Postman or curl: `GET http://localhost:3001/api/navigation/menu`.
// 5. Monitor console logs for file access or parsing errors.
// 6. To modify the menu, update `navigation.yaml` and ensure it follows the expected YAML structure.
//
// API Endpoints:
// - GET /api/navigation/menu: Retrieves the navigation menu structure from navigation.yaml.

// ==============================================================================
// SECTION 1: IMPORTS
// ==============================================================================
const express = require("express"); // Web framework for routing
const router = express.Router(); // Express router instance
const fs = require("fs"); // File system operations for reading navigation.yaml
const yaml = require("js-yaml"); // YAML parsing library
const { NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER } = require("../config/paths"); // Path to navigation.yaml

// ==============================================================================
// SECTION 2: GET NAVIGATION MENU
// ==============================================================================
// GET /api/navigation/menu
// Retrieve the navigation menu structure from navigation.yaml
router.get("/menu", (req, res) => {
  try {
    // Check if navigation.yaml exists
    if (!fs.existsSync(NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER)) {
      console.error(`[BACKEND] Navigation config file not found: ${NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER}`);
      return res.status(500).json({ success: false, message: "Navigation configuration file not found." });
    }

    // Read and parse navigation.yaml
    const config = yaml.load(fs.readFileSync(NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"));

    // Validate menu structure
    if (config && Array.isArray(config.menu)) {
      res.json({ success: true, menu: config.menu });
    } else {
      console.error(`[BACKEND] Navigation configuration malformed at: ${NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER}`);
      res.status(500).json({ success: false, message: "Navigation configuration malformed." });
    }
  } catch (e) {
    // Handle file reading or parsing errors
    console.error(`[BACKEND] Failed to load navigation menu: ${e.message}`);
    res.status(500).json({ success: false, message: `Failed to load navigation menu: ${e.message}` });
  }
});

// ==============================================================================
// SECTION 3: EXPORTS
// ==============================================================================
module.exports = router;
