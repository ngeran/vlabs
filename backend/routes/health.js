// ==============================================================================
// FILE: routes/health.js
// ==============================================================================
// Overview:
// This module defines a simple API route for health checking in the Vlabs backend.
// It provides a basic endpoint to verify the server is running, returning a status
// and timestamp for monitoring purposes.
//
// Key Features:
// - Returns a simple JSON response with server status and current timestamp.
// - Serves as a lightweight health check for load balancers or monitoring tools.
// - Requires no external dependencies beyond Express.
//
// Dependencies:
// - express: Web framework for defining API routes.
//
// How to Use:
// 1. Mount in server.js: `app.use('/api/health', require('./routes/health'));`.
// 2. Test the endpoint with a GET request: `curl http://localhost:3001/api/health`.
// 3. Verify the response contains `{ status: "healthy", timestamp: <ISO_DATE> }`.
// 4. Use for monitoring server availability in production.
// 5. No additional configuration or Docker setup required.
//
// API Endpoints:
// - GET /api/health: Returns server health status and timestamp.

// ==============================================================================
// SECTION 1: IMPORTS
// ==============================================================================
const express = require("express"); // Web framework for routing
const router = express.Router(); // Express router instance

// ==============================================================================
// SECTION 2: HEALTH CHECK
// ==============================================================================
// GET /api/health
// Return server health status and current timestamp
router.get("/", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

// ==============================================================================
// SECTION 3: EXPORTS
// ==============================================================================
module.exports = router;
