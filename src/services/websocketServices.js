// =================================================================================================
//
//  Singleton WebSocket Management Service
//  FILE: src/services/websocketServices.js
//
// =================================================================================================
//
//  DESCRIPTION:
//  This script provides a robust, application-wide singleton service for managing a persistent
//  WebSocket connection. It is designed to be imported and used by various React hooks and
//  components without causing connection conflicts, especially in React's StrictMode.
//
//  CORE FEATURES:
//  - Establishes and maintains a single WebSocket connection.
//  - Handles automatic reconnection with exponential backoff.
//  - Manages a unique client ID assigned by the server.
//  - Provides a simple event system (`on`, `off`, `emit`) for decoupled communication.
//  - Includes a heartbeat (ping/pong) to keep the connection alive.
//  - Contains dedicated methods for making API calls that initiate backend processes.
//
//  DEPENDENCIES:
//  - This script is self-contained and has no external npm dependencies. It relies on the
//    standard browser WebSocket API.
//
// =================================================================================================

class WebSocketService {
  // ================================================================================
  //  SECTION 1: CONSTRUCTOR & INITIAL STATE
  //  Initializes the service's state and binds method contexts.
  // ================================================================================
  constructor() {
    // --- Connection State ---
    this.ws = null; // Holds the WebSocket object instance.
    this.isConnected = false; // Tracks if the connection is currently open.
    this.connectionPromise = null; // Prevents multiple connection attempts while one is in progress.

    // --- Client & Session State ---
    this.clientId = null; // The unique ID assigned by the server upon connection.
    this.clientIdPromise = null; // Used to queue calls that need a client ID before it's been assigned.

    // --- Reconnection Logic ---
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Initial delay in ms
    this.maxReconnectDelay = 30000; // Maximum delay in ms

    // --- Communication & Event Handling ---
    this.listeners = new Map(); // Stores event listeners, e.g., listeners['progress'] = Set(callback1, callback2).
    this.messageQueue = []; // Temporarily holds messages sent while the socket is disconnected.

    // --- Keep-Alive Mechanism ---
    this.heartbeatInterval = null; // Holds the interval ID for the ping timer.
    this.heartbeatTimeout = null; // Holds the timeout ID for waiting for a pong.

    // Bind all class methods to 'this' to ensure their context is always correct,
    // even when they are passed as callbacks to other functions.
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.send = this.send.bind(this);
    this.on = this.on.bind(this);
    this.off = this.off.bind(this);
    this.handleMessage = this.handleMessage.bind(this);
    this.handleOpen = this.handleOpen.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  // ================================================================================
  //  SECTION 2: CORE CONNECTION MANAGEMENT
  //  Handles connecting, disconnecting, and reconnection logic.
  // ================================================================================

  /**
   * Establishes a connection to the WebSocket server.
   * This method is idempotent: if a connection exists or is pending, it won't create a new one.
   * @param {string} wsUrl - The WebSocket server URL.
   */
  async connect(wsUrl = "ws://localhost:3001") {
    // If we are already connected or trying to connect, return the existing promise.
    if (this.isConnected || this.connectionPromise) {
      return this.connectionPromise;
    }

    console.log(`[WebSocket] Attempting to connect to ${wsUrl}...`);

    // Create a new promise to represent the connection attempt.
    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);
        // Assign our handler methods to the WebSocket event properties.
        this.ws.onopen = (event) => {
          this.handleOpen(event);
          resolve(this); // Resolve the promise on successful connection.
        };
        this.ws.onmessage = this.handleMessage;
        this.ws.onclose = this.handleClose;
        this.ws.onerror = (error) => {
          this.handleError(error);
          reject(error); // Reject the promise on a connection error.
        };
      } catch (error) {
        console.error("[WebSocket] Connection failed to initiate:", error);
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  /**
   * Gracefully disconnects from the server.
   */
  disconnect() {
    console.log("[WebSocket] Disconnecting gracefully...");
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevents automatic reconnection.
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, "Client initiated disconnect."); // 1000 is the code for a normal closure.
      this.ws = null;
    }

    // Reset all state variables.
    this.isConnected = false;
    this.connectionPromise = null;
    this.clientIdPromise = null;
    this.messageQueue = [];
    this.clientId = null;
  }

  /**
   * Schedules a reconnection attempt with exponential backoff.
   */
  scheduleReconnect() {
    this.reconnectAttempts++;
    // Calculate delay: it doubles with each attempt, up to a max limit.
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay,
    );

    console.log(`[WebSocket] Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms...`);

    setTimeout(() => {
      if (!this.isConnected) {
        console.log(`[WebSocket] Attempting reconnection #${this.reconnectAttempts}...`);
        this.connect(); // Attempt to connect again.
      }
    }, delay);
  }

  // ================================================================================
  //  SECTION 3: EVENT HANDLERS (Private)
  //  These methods are called internally by the WebSocket object.
  // ================================================================================

  /**
   * Called when the WebSocket connection is successfully opened.
   */
  handleOpen(event) {
    console.log("[WebSocket] Connection established successfully.");
    this.isConnected = true;
    this.reconnectAttempts = 0; // Reset reconnect counter on success.
    this.connectionPromise = null; // Clear the connection promise.

    this.startHeartbeat();
    this.processMessageQueue(); // Send any messages that were queued while disconnected.
    this.emit("connected", {}); // Notify listeners that we are connected.
  }

  /**
   * Called when a message is received from the server. It parses the message
   * and emits a specific event based on the message `type`.
   */
  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      console.log("[WebSocket] Received message:", message);

      // Handle server-assigned client ID.
      if (message.type === "welcome" || message.type === "client_id") {
        console.log(`[WebSocket] Client ID assigned: ${message.clientId}`);
        this.clientId = message.clientId;
        this.clientIdPromise = null; // Clear the promise now that we have an ID.
        this.emit("client_id", { clientId: message.clientId });
      }
      // Handle heartbeat pong response.
      else if (message.type === "pong") {
        this.handlePong();
      }
      // For all other types, emit the event by its type name.
      else if (this.listeners.has(message.type)) {
        this.emit(message.type, message);
      }
      // Fallback for any other message type.
      else {
        this.emit("message", message);
      }
    } catch (error) {
      console.error("[WebSocket] Failed to parse incoming message:", error);
      this.emit("parse_error", { error: error.message, raw: event.data });
    }
  }

  /**
   * Called when the WebSocket connection is closed, either intentionally or due to an error.
   */
  handleClose(event) {
    console.log(`[WebSocket] Connection closed. Code: ${event.code}, Reason: "${event.reason}"`);
    this.isConnected = false;
    this.connectionPromise = null;
    this.clientIdPromise = null;
    this.stopHeartbeat();

    this.emit("disconnected", { code: event.code, reason: event.reason, wasClean: event.wasClean });

    // If the close was not clean (e.g., server crash, network loss), attempt to reconnect.
    if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  /**
   * Called when a WebSocket error occurs.
   */
  handleError(error) {
    console.error("[WebSocket] An error occurred:", error);
    this.emit("error", { error: error.message || "A WebSocket error occurred." });
  }

  // ================================================================================
  //  SECTION 4: HEARTBEAT (KEEP-ALIVE)
  //  Manages the ping/pong mechanism to prevent idle connection timeouts.
  // ================================================================================

  startHeartbeat() {
    // Clear any existing heartbeat to prevent duplicates.
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.send({ type: "ping" });
        // Set a timeout. If a 'pong' isn't received in 5 seconds, assume the connection is dead.
        this.heartbeatTimeout = setTimeout(() => {
          console.warn("[WebSocket] Heartbeat timeout. Connection is likely lost.");
          this.ws?.close(); // This will trigger the handleClose and reconnection logic.
        }, 5000);
      }
    }, 30000); // Send a ping every 30 seconds.
  }

  stopHeartbeat() {
    clearInterval(this.heartbeatInterval);
    clearTimeout(this.heartbeatTimeout);
    this.heartbeatInterval = null;
    this.heartbeatTimeout = null;
  }

  /**
   * Called when a 'pong' message is received, clearing the heartbeat timeout.
   */
  handlePong() {
    clearTimeout(this.heartbeatTimeout);
  }

  // ================================================================================
  //  SECTION 5: EVENT EMITTER & MESSAGING
  //  Provides a pub/sub system for components to listen for WebSocket events.
  // ================================================================================

  /**
   * Sends a message to the server, queueing it if not connected.
   * @param {Object} message - The JSON object to send.
   */
  send(message) {
    if (!this.isConnected) {
      console.log("[WebSocket] Not connected. Queuing message:", message);
      this.messageQueue.push(message);
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Sends all messages that were queued while disconnected.
   */
  processMessageQueue() {
    while (this.messageQueue.length > 0 && this.isConnected) {
      this.send(this.messageQueue.shift());
    }
  }

  /**
   * Registers a callback for a specific event.
   * @param {string} event - The name of the event to listen for (e.g., 'progress').
   * @param {function} callback - The function to call when the event is emitted.
   * @returns {function} An `unsubscribe` function to remove the listener.
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    // Return a function that allows easy unsubscription.
    return () => this.off(event, callback);
  }

  /**
   * Removes a callback for a specific event.
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * Emits an event, calling all registered listeners with the provided data.
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((callback) => callback(data));
    }
  }

  // ================================================================================
  //  SECTION 6: CLIENT-SIDE API METHODS
  //  Public methods that components call to interact with the backend API.
  // ================================================================================

  /**
   * Waits for the client ID to be assigned by the server.
   * This is crucial for API calls that require the wsClientId.
   */
  async waitForClientId(timeout = 10000) {
    if (this.clientId) return this.clientId;
    if (this.clientIdPromise) return this.clientIdPromise;

    this.clientIdPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error("Timeout waiting for client ID.")), timeout);
      const unsubscribe = this.on("client_id", ({ clientId }) => {
        clearTimeout(timeoutId);
        unsubscribe();
        resolve(clientId);
      });
    });
    return this.clientIdPromise;
  }

  /**
   * Initiates a script run on the backend.
   * @param {Object} scriptData - Contains the scriptId and its parameters.
   */
  async runScript(scriptData) {
    // Wait for a client ID if we don't have one yet.
    await this.waitForClientId();

    const payload = {
      scriptId: scriptData.scriptId,
      parameters: scriptData.parameters, // Pass parameters under their own key.
      wsClientId: this.clientId,
    };

    try {
      //
      // ✨✨✨ THE FIX IS APPLIED HERE ✨✨✨
      // The URL is changed from '/api/scripts/run' to the correct '/api/scripts/run-stream' endpoint.
      //
      const response = await fetch("http://localhost:3001/api/scripts/run-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Failed to initiate script run.");
      }
      return result;

    } catch (error) {
      console.error("[API Call] Failed to run script:", error);
      throw error; // Re-throw the error so the calling component can handle it.
    }
  }

  /**
   * Initiates a template application process on the backend.
   * @param {Object} templateData - Data needed to apply the template.
   */
  async applyTemplate(templateData) {
    await this.waitForClientId();

    const payload = { ...templateData, wsClientId: this.clientId };

    try {
      const response = await fetch("http://localhost:3001/api/templates/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Failed to apply template.");
      }
      return result;

    } catch (error) {
      console.error("[API Call] Failed to apply template:", error);
      throw error;
    }
  }
}

// ================================================================================
//  SECTION 7: SINGLETON INSTANCE EXPORT
//  A single instance of the service is created and exported, ensuring all parts
//  of the application share the same WebSocket connection and state.
// ================================================================================
const websocketService = new WebSocketService();
export default websocketService;
