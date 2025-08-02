// ==============================================================================
// FILE: middleware/setup.js
// ==============================================================================
// Overview:
// This module configures Express middleware for the Vlabs backend, including CORS,
// JSON parsing, and file upload handling with multer. It ensures the server can
// handle cross-origin requests, parse JSON bodies, and store uploaded files in a
// designated Docker volume.
//
// Key Features:
// - Enables CORS for frontend communication (e.g., http://localhost:3000).
// - Parses incoming JSON requests.
// - Configures multer for file uploads with unique filenames.
// - Ensures the upload directory exists on startup.
//
// Dependencies:
// - cors: Middleware for enabling CORS.
// - express: Web framework for middleware setup.
// - multer: Middleware for handling file uploads.
// - path: Node.js module for path manipulation.
// - fs: Node.js module for file system operations.
// - ../config/paths: Path constants for upload directories.
//
// How to Use:
// 1. Import and call in server.js: `const { upload } = require('./middleware/setup')(app);`.
// 2. Ensure `UPLOAD_TEMP_DIR` and `UPLOAD_DIRECTORY_IN_CONTAINER` are correctly mapped in Docker.
// 3. Use the `upload` middleware for routes handling file uploads (e.g., `/api/files/upload`).
// 4. Verify upload directory permissions in the container.
//
// API Endpoints:
// None directly; provides middleware for routes like `/api/files/upload`.

// ==============================================================================
// SECTION 1: IMPORTS
// ==============================================================================
const cors = require("cors"); // Middleware for cross-origin requests
const express = require("express"); // Web framework for middleware
const multer = require("multer"); // Middleware for file uploads
const path = require("path"); // Node.js module for path manipulation
const fs = require("fs"); // Node.js module for file system operations
const { UPLOAD_DIRECTORY_IN_CONTAINER, UPLOAD_TEMP_DIR } = require("../config/paths"); // Path constants

// ==============================================================================
// SECTION 2: UTILITY FUNCTION
// ==============================================================================
// Ensure a directory exists, creating it recursively if needed
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`[BACKEND] Created directory: ${dirPath}`);
  }
}

// Create upload directory on startup
ensureDirectoryExists(UPLOAD_TEMP_DIR);

// ==============================================================================
// SECTION 3: MULTER CONFIGURATION
// ==============================================================================
// Configure multer storage for file uploads
const storage = multer.diskStorage({
  // Set destination to container's upload directory
  destination: (req, file, cb) => cb(null, UPLOAD_DIRECTORY_IN_CONTAINER),
  // Generate unique filename with timestamp and random string
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.random().toString(36).substring(2, 9);
    cb(null, `file-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

// Initialize multer with storage configuration
const upload = multer({ storage });

// ==============================================================================
// SECTION 4: MIDDLEWARE SETUP
// ==============================================================================
// Configure Express app with CORS and JSON middleware
module.exports = (app) => {
  app.use(cors()); // Enable CORS for all routes
  app.use(express.json()); // Parse JSON request bodies
  return { upload }; // Export multer middleware for file upload routes
};
