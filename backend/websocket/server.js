// ==============================================================================
// FILE: websocket/server.js
// ==============================================================================
// Overview:
// This module sets up a WebSocket server for real-time communication in the Vlabs
// backend. It manages client connections, assigns unique IDs, and handles ping/pong
// messages for keep-alive functionality. The server streams script execution updates
// to connected clients.
//
// Key Features:
// - Initializes WebSocket server on the HTTP server.
// - Assigns unique client IDs using UUID.
// - Handles client connections, disconnections, and errors.
// - Supports ping/pong messages for connection health checks.
// - Stores active clients in a Map for route access.
//
// Dependencies:
// - ws: WebSocket library for Node.js.
// - uuid: Generates unique client IDs.
//
// How to Use:
// 1. Import in server.js: `const { clients } = require('./websocket/server')(server);`.
// 2. Pass the HTTP server instance to initialize WebSocket.
// 3. Store `clients` Map in `app.locals.clients` for route access.
// 4. Use `clients.get(wsClientId)` in routes to send messages to specific clients.
// 5. Test WebSocket connections at `ws://localhost:3001`.
//
// API Endpoints:
// None; provides WebSocket functionality for routes like `/api/scripts/run`.

// ==============================================================================
// SECTION 1: IMPORTS
// ==============================================================================
const { WebSocketServer } = require("ws"); // WebSocket server library
const { v4: uuidv4 } = require("uuid"); // UUID generator for client IDs

// ==============================================================================
// SECTION 2: WEBSOCKET SETUP
// ==============================================================================
// Initialize WebSocket server and manage client connections
module.exports = (httpServer) => {
  const wss = new WebSocketServer({ server: httpServer }); // Attach WebSocket to HTTP server
  const clients = new Map(); // Store active WebSocket clients

  // Handle new WebSocket connections
  wss.on("connection", (ws) => {
    const clientId = uuidv4(); // Generate unique client ID
    clients.set(clientId, ws); // Store client in Map
    console.log(`[WebSocket] Client connected with ID: ${clientId}`);
    ws.send(JSON.stringify({ type: "welcome", clientId })); // Send welcome message with ID

    // Handle incoming messages
    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message);
        if (data.type === "ping") {
          // Respond to ping with pong for keep-alive
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
      } catch (e) {
        // Ignore non-JSON messages
      }
    });

    // Handle client disconnection
    ws.on("close", () => {
      clients.delete(clientId);
      console.log(`[WebSocket] Client disconnected: ${clientId}`);
    });

    // Handle WebSocket errors
    ws.on("error", (error) => {
      console.error(`[WebSocket] Error for client ${clientId}:`, error);
      clients.delete(clientId);
    });
  });

  return { wss, clients }; // Export WebSocket server and clients Map
};
