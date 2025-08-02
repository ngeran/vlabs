// ==============================================================================
// FILE: routes/backups.js
// ==============================================================================
// Overview:
// This module defines API routes for accessing backup files in the Vlabs backend.
// It lists devices and their backup configuration files, and retrieves backups for
// specific hosts, using a Docker-mounted backup directory.
//
// Key Features:
// - Lists all devices and their backup files in /backups.
// - Retrieves backup files for a specific hostname.
// - Includes detailed error handling and logging for file access issues.
//
// Dependencies:
// - express: Web framework for routing.
// - fs: Node.js module for file system operations.
// - path: Node.js module for path manipulation.
//
// How to Use:
// 1. Mount in server.js: `app.use('/api/backups', require('./routes/backups'));`.
// 2. Ensure /backups directory is correctly mounted in Docker.
// 3. Test endpoints with tools like Postman or curl.
// 4. Verify backup files end with `.conf` and are readable in the container.
// 5. Monitor logs for file access issues.
//
// API Endpoints:
// - GET /api/backups/devices: Lists all devices and their backup files.
// - GET /api/backups/host/:hostname: Retrieves backups for a specific host.

// ==============================================================================
// SECTION 1: IMPORTS
// ==============================================================================
const express = require("express"); // Web framework for routing
const router = express.Router(); // Express router instance
const fs = require("fs"); // File system operations
const path = require("path"); // Path manipulation

// ==============================================================================
// SECTION 2: LIST DEVICES AND BACKUPS
// ==============================================================================
// GET /api/backups/devices
// List all devices and their backup files
router.get("/devices", (req, res) => {
  try {
    const backupBasePath = "/backups"; // Docker-mounted backup directory
    console.log(`[BACKEND] Using backup base path: ${backupBasePath}`);

    // Check if backup directory exists
    if (!fs.existsSync(backupBasePath)) {
      console.error(`[BACKEND] Backups directory does not exist: ${backupBasePath}`);
      return res.json({
        success: true,
        devices: [],
        message: `Backups directory not found in container: ${backupBasePath}. Ensure the volume mount is correctly configured in docker-compose.yml.`,
      });
    }

    // Verify directory permissions
    try {
      fs.accessSync(backupBasePath, fs.constants.R_OK);
      console.log(`[BACKEND] Backups directory is readable: ${backupBasePath}`);
    } catch (error) {
      console.error(`[BACKEND] Backups directory is not readable: ${backupBasePath}, Error: ${error.message}`);
      return res.status(500).json({ success: false, message: `Backups directory not readable: ${error.message}` });
    }

    // Read device folders
    let deviceFolders = [];
    try {
      deviceFolders = fs.readdirSync(backupBasePath);
      console.log(`[BACKEND] Device folders found: ${deviceFolders.join(", ") || "none"}`);
    } catch (error) {
      console.error(`[BACKEND] Error reading backups directory ${backupBasePath}: ${error.message}`);
      return res.json({ success: true, devices: [], message: `Error reading backups directory: ${error.message}` });
    }

    // Process each device directory
    const devices = [];
    for (const deviceIp of deviceFolders) {
      const deviceDir = path.join(backupBasePath, deviceIp);
      try {
        const stat = fs.statSync(deviceDir);
        if (stat.isDirectory()) {
          const backups = fs.readdirSync(deviceDir)
            .filter((file) => file.endsWith(".conf"))
            .map((file) => {
              const filePath = path.join(backupBasePath, deviceIp, file);
              console.log(`[BACKEND] Found backup file: ${filePath}`);
              return {
                value: filePath,
                label: file,
              };
            });
          console.log(`[BACKEND] Backups for ${deviceIp}: ${backups.map((b) => b.label).join(", ") || "none"}`);
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

// ==============================================================================
// SECTION 3: GET HOST BACKUPS
// ==============================================================================
// GET /api/backups/host/:hostname
// Retrieve backups for a specific host
router.get("/host/:hostname", (req, res) => {
  const { hostname } = req.params;
  try {
    const backupBasePath = "/backups";
    const deviceDir = path.join(backupBasePath, hostname);

    // Check if device directory exists
    if (!fs.existsSync(deviceDir)) {
      console.error(`[BACKEND] Device directory not found: ${deviceDir}`);
      return res.json({ success: true, backups: [], message: `No backups found for host ${hostname}.` });
    }

    // Verify directory permissions
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
        .filter((file) => file.endsWith(".conf"))
        .map((file) => ({
          value: path.join(backupBasePath, hostname, file),
          label: file,
        }));
      console.log(`[BACKEND] Backups for ${hostname}: ${backups.map((b) => b.label).join(", ") || "none"}`);
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

// ==============================================================================
// SECTION 4: EXPORTS
// ==============================================================================
module.exports = router;
