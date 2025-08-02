// ==============================================================================
// FILE: server.js
// ==============================================================================
// Overview:
// This file serves as the entry point for the Vlabs backend server. It initializes
// an Express application and an HTTP server, sets up middleware for handling
// requests, establishes a WebSocket server for real-time communication, and mounts
// modular API routes. The server orchestrates network automation tasks, script
// execution, lab management, and file operations within a Dockerized environment.
//
// Key Features:
// - Initializes Express and HTTP server on port 3001.
// - Configures middleware for CORS, JSON parsing, and file uploads (multer).
// - Sets up WebSocket server for real-time updates to clients.
// - Mounts modular routes for scripts, templates, labs, backups, inventories,
//   navigation, reports, health checks, and file uploads.
// - Handles uncaught exceptions to prevent server crashes and logs startup details.
// - Exposes WebSocket clients to routes via app.locals.clients.
//
// Dependencies:
// - express: Web framework for handling HTTP requests.
// - http: Node.js module for creating the HTTP server.
// - ./middleware/setup: Configures CORS, JSON parsing, and multer middleware.
// - ./websocket/server: Sets up WebSocket server and client management.
// - ./config/paths: Provides path constants and in-memory state.
// - ./routes/*: Modular route handlers for API endpoints.
//
// How to Use:
// 1. Install dependencies: `npm install express cors ws uuid child_process path fs js-yaml multer`.
// 2. Set environment variable `HOST_PROJECT_ROOT` to the project root directory.
// 3. Place this file in the project root and ensure modular files are in their respective directories.
// 4. Run the server: `node server.js`.
// 5. Access API endpoints at `http://localhost:3001/api/*`.
// 6. Connect to WebSocket at `ws://localhost:3001` for real-time updates.
// 7. Monitor console logs for startup details and errors.
// 8. Ensure Docker volume mounts match paths in config/paths.js.
//
// API Endpoints:
// None directly defined here; all endpoints are mounted from ./routes/*.
// See individual route files (e.g., routes/scripts.js, routes/templates.js) for details.

// ==============================================================================
// SECTION 1: IMPORTS
// ==============================================================================
const express = require("express"); // Web framework for HTTP server
const http = require("http"); // Node.js module for HTTP server
const configureMiddleware = require("./middleware/setup"); // Middleware for CORS, JSON, and uploads
const configureWebSocket = require("./websocket/server"); // WebSocket server setup
const {
  PYTHON_PIPELINE_PATH_ON_HOST,
  PYTHON_PIPELINE_MOUNT_PATH,
  PUBLIC_MOUNT_PATH,
} = require("./config/paths"); // Path constants for Docker mounts

// ==============================================================================
// SECTION 2: SERVER INITIALIZATION
// ==============================================================================
// Initialize Express app and HTTP server
const app = express();
const port = 3001; // Default port for HTTP and WebSocket
const server = http.createServer(app);

// ==============================================================================
// SECTION 3: MIDDLEWARE SETUP
// ==============================================================================
// Apply middleware for CORS, JSON parsing, and file uploads
const { upload } = configureMiddleware(app);

// ==============================================================================
// SECTION 4: WEBSOCKET SETUP
// ==============================================================================
// Initialize WebSocket server and make clients accessible to routes
const { clients } = configureWebSocket(server);
app.locals.clients = clients; // Store WebSocket clients for route access

// ==============================================================================
// SECTION 5: GLOBAL EXCEPTION HANDLER
// ==============================================================================
// Handle uncaught exceptions to prevent server crashes
process.on("uncaughtException", (err, origin) => {
  console.error("====== UNCAUGHT EXCEPTION! SHUTTING DOWN ======");
  console.error("Error:", err.stack || err);
  console.error("Origin:", origin);
  process.exit(1); // Exit process to avoid undefined behavior
});

// ==============================================================================
// SECTION 6: ROUTE MOUNTING
// ==============================================================================
// Mount API routes from modular files
app.use("/api/scripts", require("./routes/scripts")); // Script execution and discovery routes
app.use("/api/templates", require("./routes/templates")); // Template management routes
app.use("/api/labs", require("./routes/labs")); // Lab lifecycle management routes
app.use("/api/backups", require("./routes/backups")); // Backup file access routes
app.use("/api/inventories", require("./routes/inventories")); // Inventory and software version routes
app.use("/api/navigation", require("./routes/navigation")); // Navigation menu route
app.use("/api/report", require("./routes/reports")); // Report generation route
app.use("/api/health", require("./routes/health")); // Health check route
app.use("/api/files", require("./routes/files")(upload)); // File upload route with multer

// ==============================================================================
// SECTION 7: SERVER STARTUP
// ==============================================================================
// Start the server and log configuration details
server.listen(port, () => {
  console.log(`[BACKEND] Express & WebSocket Server listening at http://localhost:${port}`);
  console.log(`[BACKEND] Python pipeline host path: ${PYTHON_PIPELINE_PATH_ON_HOST}`);
  console.log(`[BACKEND] Python pipeline container mount: ${PYTHON_PIPELINE_MOUNT_PATH}`);
  console.log(`[BACKEND] Public container mount: ${PUBLIC_MOUNT_PATH}`);
  console.log(`[BACKEND] Backup directory mount: /app/backups`);
});
