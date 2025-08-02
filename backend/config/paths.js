// ==============================================================================
// FILE: config/paths.js
// ==============================================================================
// Overview:
// This module exports path constants and in-memory state for the Vlabs backend.
// It centralizes configuration for file paths used across the application, ensuring
// consistent access to Docker-mounted directories and in-memory state like lab statuses.
//
// Key Features:
// - Defines paths for Python pipeline, public mounts, scripts, templates, and backups.
// - Provides in-memory state for lab statuses and test discovery cache.
// - Ensures compatibility with Docker volume mounts for file access.
//
// How to Use:
// 1. Place this file in /vlabs/backend/config/.
// 2. Import in other modules: `const { PYTHON_PIPELINE_MOUNT_PATH } = require('../config/paths');`.
// 3. Use exported constants to access file paths or manage state.
// 4. Ensure Docker volume mounts match the defined paths in docker-compose.yml.
// 5. Set HOST_PROJECT_ROOT environment variable to the project root directory.

// ==============================================================================
// SECTION 1: IMPORTS
// ==============================================================================
const path = require("path");

// ==============================================================================
// SECTION 2: PATH CONSTANTS
// ==============================================================================
const PYTHON_PIPELINE_PATH_ON_HOST = path.join(process.env.HOST_PROJECT_ROOT, "python_pipeline");
const PYTHON_PIPELINE_MOUNT_PATH = "/python_pipeline";
const PUBLIC_MOUNT_PATH = "/public";
const SCRIPT_MOUNT_POINT_IN_CONTAINER = "/app/python-scripts";
const TEMPLATES_CONFIG_FILE_PATH_IN_CONTAINER = path.join(PYTHON_PIPELINE_MOUNT_PATH, "tools/configuration", "templates.yml");
const TEMPLATES_DIRECTORY_PATH = path.join(PYTHON_PIPELINE_MOUNT_PATH, "tools/configuration/templates");
const SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER = path.join(PYTHON_PIPELINE_MOUNT_PATH, "scripts.yaml");
const NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER = path.join(PUBLIC_MOUNT_PATH, "navigation.yaml");
const UPLOAD_TEMP_DIR = path.join(PYTHON_PIPELINE_MOUNT_PATH, "temp_uploads");
const UPLOAD_DIRECTORY_IN_CONTAINER = "/uploads";

// ==============================================================================
// SECTION 3: IN-MEMORY STATE
// ==============================================================================
const labStatuses = {};
const testDiscoveryCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// ==============================================================================
// SECTION 4: EXPORTS
// ==============================================================================
module.exports = {
  PYTHON_PIPELINE_PATH_ON_HOST,
  PYTHON_PIPELINE_MOUNT_PATH,
  PUBLIC_MOUNT_PATH,
  SCRIPT_MOUNT_POINT_IN_CONTAINER,
  TEMPLATES_CONFIG_FILE_PATH_IN_CONTAINER,
  TEMPLATES_DIRECTORY_PATH,
  SCRIPTS_CONFIG_FILE_PATH_IN_CONTAINER,
  NAVIGATION_CONFIG_FILE_PATH_IN_CONTAINER,
  UPLOAD_TEMP_DIR,
  UPLOAD_DIRECTORY_IN_CONTAINER,
  labStatuses,
  testDiscoveryCache,
  CACHE_DURATION,
};
