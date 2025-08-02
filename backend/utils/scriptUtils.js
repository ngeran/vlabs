// ==============================================================================
// FILE: utils/scriptUtils.js
// ==============================================================================
// Overview:
// This module provides utility functions for script-related operations in the Vlabs
// backend. It handles script metadata parsing, unique ID generation, and safe JSON
// parsing for script execution results.
//
// Key Features:
// - Loads and parses individual script metadata.yml files.
// - Generates unique IDs for script runs.
// - Safely parses JSON strings with error handling.
//
// Dependencies:
// - fs: Node.js module for file system operations.
// - path: Node.js module for path manipulation.
// - js-yaml: Parses YAML files.
// - ../config/paths: Path constants for script directories.
//
// How to Use:
// 1. Import functions: `const { getScriptIndividualMetadata } = require('./utils/scriptUtils');`.
// 2. Use `getScriptIndividualMetadata` to load script metadata for routes.
// 3. Use `generateUniqueId` for tracking script runs.
// 4. Use `safeJsonParse` for parsing script output safely.
// 5. Ensure script metadata files exist in the correct Docker-mounted paths.
//
// API Endpoints:
// None directly; supports routes like `/api/scripts/*`.

// ==============================================================================
// SECTION 1: IMPORTS
// ==============================================================================
const fs = require("fs"); // File system operations
const path = require("path"); // Path manipulation
const yaml = require("js-yaml"); // YAML parsing
const { PYTHON_PIPELINE_MOUNT_PATH } = require("../config/paths"); // Path constants

// ==============================================================================
// SECTION 2: SCRIPT METADATA
// ==============================================================================
// Load and parse individual metadata.yml for a script
function getScriptIndividualMetadata(scriptDefinition) {
  // Validate script definition
  if (!scriptDefinition || !scriptDefinition.path || !scriptDefinition.metadataFile) {
    console.error("[BACKEND] Invalid script definition provided to getScriptIndividualMetadata:", scriptDefinition);
    return null;
  }
  try {
    // Construct path to metadata file
    const metadataPath = path.join(PYTHON_PIPELINE_MOUNT_PATH, scriptDefinition.path, scriptDefinition.metadataFile);
    if (!fs.existsSync(metadataPath)) {
      console.warn(`[BACKEND] Metadata file not found for script "${scriptDefinition.id}" at: ${metadataPath}`);
      return null;
    }
    // Read and parse YAML file
    return yaml.load(fs.readFileSync(metadataPath, "utf8"));
  } catch (e) {
    console.error(`[BACKEND] CRITICAL: Error processing metadata for script "${scriptDefinition.id}": ${e.message}`);
    return null;
  }
}

// ==============================================================================
// SECTION 3: UTILITY FUNCTIONS
// ==============================================================================
// Generate a unique identifier for script runs
function generateUniqueId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Safely parse a JSON string, returning null on error
function safeJsonParse(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    return null;
  }
}

// ==============================================================================
// SECTION 4: EXPORTS
// ==============================================================================
module.exports = { getScriptIndividualMetadata, generateUniqueId, safeJsonParse };
