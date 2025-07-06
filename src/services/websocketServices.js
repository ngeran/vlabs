// src/services/websocketService.js
class WebSocketService {
  constructor() {
    this.ws = null;
    this.clientId = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.listeners = new Map();
    this.messageQueue = [];
    this.heartbeatInterval = null;
    this.heartbeatTimeout = null;
    this.connectionPromise = null;
    this.clientIdPromise = null; // Add promise for client ID

    // Bind methods to preserve context
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

  /**
   * Generate UUID format to match backend
   */
  generateClientId() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      },
    );
  }

  /**
   * Wait for client ID to be assigned
   */
  async waitForClientId(timeout = 10000) {
    if (this.clientId) {
      return this.clientId;
    }

    if (this.clientIdPromise) {
      return this.clientIdPromise;
    }

    this.clientIdPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Client ID assignment timeout"));
      }, timeout);

      // If we already have a client ID, resolve immediately
      if (this.clientId) {
        clearTimeout(timeoutId);
        resolve(this.clientId);
        return;
      }

      // Listen for client ID assignment
      const unsubscribe = this.on("client_id", ({ clientId }) => {
        clearTimeout(timeoutId);
        unsubscribe();
        resolve(clientId);
      });

      // If connection fails, reject
      const unsubscribeError = this.on("error", (error) => {
        clearTimeout(timeoutId);
        unsubscribe();
        unsubscribeError();
        reject(new Error("Connection failed while waiting for client ID"));
      });
    });

    return this.clientIdPromise;
  }

  /**
   * Connect to WebSocket server and wait for client ID
   */
  async connect(wsUrl = "ws://localhost:3001") {
    if (this.isConnected || this.connectionPromise) {
      return this.connectionPromise;
    }

    console.log(`[WebSocket] Connecting to ${wsUrl}`);

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);
        this.ws.onopen = (event) => {
          this.handleOpen(event);
          resolve(this);
        };
        this.ws.onmessage = this.handleMessage;
        this.ws.onclose = this.handleClose;
        this.ws.onerror = (error) => {
          this.handleError(error);
          reject(error);
        };

        // Set connection timeout
        setTimeout(() => {
          if (!this.isConnected) {
            this.ws?.close();
            reject(new Error("Connection timeout"));
          }
        }, 10000);
      } catch (error) {
        console.error("[WebSocket] Connection failed:", error);
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  /**
   * Connect and wait for client ID to be ready
   */
  async connectAndWaitForClientId(wsUrl = "ws://localhost:3001") {
    try {
      await this.connect(wsUrl);
      await this.waitForClientId();
      return this;
    } catch (error) {
      console.error("[WebSocket] Failed to connect and get client ID:", error);
      throw error;
    }
  }

  /**
   * Handle WebSocket connection open
   */
  handleOpen(event) {
    console.log("[WebSocket] Connection established");
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    this.connectionPromise = null;

    // Start heartbeat
    this.startHeartbeat();

    // Process queued messages
    this.processMessageQueue();

    // Emit connection event
    this.emit("connected", { clientId: this.clientId });
  }

  /**
   * Handle WebSocket message
   */
  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      console.log("[WebSocket] Received message:", message);

      // Handle different message types
      switch (message.type) {
        case "welcome":
        case "client_id":
          console.log(
            "[WebSocket] Received client ID from server:",
            message.clientId,
          );
          this.clientId = message.clientId;
          this.clientIdPromise = null; // Clear the promise
          this.emit("client_id", { clientId: message.clientId });
          break;
        case "pong":
          this.handlePong();
          break;
        case "status":
          this.emit("status", message);
          break;
        case "progress":
          this.emit("progress", message);
          break;
        case "commit_progress":
          this.emit("commit_progress", message);
          break;
        case "info":
          this.emit("info", message);
          break;
        case "result":
          this.emit("result", message);
          break;
        case "error":
          this.emit("error", message);
          break;
        case "test":
          this.emit("test", message);
          break;
        case "script_start":
          this.emit("script_start", message);
          break;
        case "script_output":
          this.emit("script_output", message);
          break;
        case "script_error":
          this.emit("script_error", message);
          break;
        case "script_end":
          this.emit("script_end", message);
          break;
        default:
          this.emit("message", message);
      }
    } catch (error) {
      console.error("[WebSocket] Failed to parse message:", error);
      this.emit("parse_error", { error: error.message, raw: event.data });
    }
  }

  /**
   * Handle WebSocket connection close
   */
  handleClose(event) {
    console.log("[WebSocket] Connection closed:", event.code, event.reason);
    this.isConnected = false;
    this.connectionPromise = null;
    this.clientIdPromise = null; // Clear client ID promise
    this.stopHeartbeat();

    this.emit("disconnected", {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    });

    // Attempt reconnection if not a clean close
    if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle WebSocket error
   */
  handleError(error) {
    console.error("[WebSocket] Error:", error);
    this.emit("error", { error: error.message || "WebSocket error" });
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay,
    );

    console.log(
      `[WebSocket] Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`,
    );

    setTimeout(() => {
      if (!this.isConnected) {
        console.log(
          `[WebSocket] Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`,
        );
        this.connect();
      }
    }, delay);
  }

  /**
   * Start heartbeat mechanism
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.send({ type: "ping", timestamp: new Date().toISOString() });
        this.heartbeatTimeout = setTimeout(() => {
          console.log("[WebSocket] Heartbeat timeout, closing connection");
          this.ws?.close();
        }, 5000);
      }
    }, 30000);
  }

  /**
   * Stop heartbeat mechanism
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  /**
   * Handle pong response
   */
  handlePong() {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  /**
   * Send message to WebSocket server
   */
  send(message) {
    if (!this.isConnected) {
      console.log("[WebSocket] Not connected, queuing message:", message);
      this.messageQueue.push(message);
      return false;
    }

    try {
      const messageStr =
        typeof message === "string" ? message : JSON.stringify(message);
      this.ws.send(messageStr);
      return true;
    } catch (error) {
      console.error("[WebSocket] Failed to send message:", error);
      return false;
    }
  }

  /**
   * Process queued messages
   */
  processMessageQueue() {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      this.send(message);
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    console.log("[WebSocket] Disconnecting...");
    this.reconnectAttempts = this.maxReconnectAttempts;
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, "Client disconnecting");
      this.ws = null;
    }

    this.isConnected = false;
    this.connectionPromise = null;
    this.clientIdPromise = null;
    this.messageQueue = [];
    this.clientId = null;
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * Emit event to all listeners
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(
            `[WebSocket] Error in event listener for ${event}:`,
            error,
          );
        }
      });
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      clientId: this.clientId,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
      readyState: this.ws?.readyState || WebSocket.CLOSED,
    };
  }

  /**
   * Check if WebSocket is ready for communication
   */
  isReady() {
    return (
      this.isConnected &&
      this.ws?.readyState === WebSocket.OPEN &&
      this.clientId !== null
    );
  }

  /**
   * Apply template configuration with real-time updates
   */
  async applyTemplate(templateData) {
    // Ensure we have a client ID before proceeding
    if (!this.clientId) {
      try {
        await this.waitForClientId();
      } catch (error) {
        throw new Error(
          "Could not obtain WebSocket client ID: " + error.message,
        );
      }
    }

    if (!this.isReady()) {
      throw new Error("WebSocket not ready for communication");
    }

    const payload = {
      wsClientId: this.clientId,
      ...templateData,
    };

    try {
      const response = await fetch(
        "http://localhost:3001/api/templates/apply",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Failed to apply template");
      }

      return result;
    } catch (error) {
      console.error("[WebSocket] Failed to apply template:", error);
      throw error;
    }
  }

  /**
   * Run a script with proper client ID handling
   */
  async runScript(scriptData) {
    // Ensure we have a client ID before proceeding
    if (!this.clientId) {
      try {
        await this.waitForClientId();
      } catch (error) {
        throw new Error(
          "Could not run script: No WebSocket client ID available",
        );
      }
    }

    if (!this.isReady()) {
      throw new Error("WebSocket not ready for communication");
    }

    const payload = {
      wsClientId: this.clientId,
      ...scriptData,
    };

    try {
      const response = await fetch("http://localhost:3001/api/scripts/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Failed to run script");
      }

      return result;
    } catch (error) {
      console.error("[WebSocket] Failed to run script:", error);
      throw error;
    }
  }

  /**
   * Test WebSocket connection
   */
  async testConnection(message = "Test message") {
    if (!this.clientId) {
      try {
        await this.waitForClientId();
      } catch (error) {
        throw new Error("Client ID not available for testing");
      }
    }

    try {
      const response = await fetch(
        `http://localhost:3001/api/websocket/test/${this.clientId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message }),
        },
      );
      return await response.json();
    } catch (error) {
      console.error("[WebSocket] Test connection failed:", error);
      throw error;
    }
  }

  /**
   * Get WebSocket connection status from server
   */
  async getServerStatus() {
    if (!this.clientId) {
      try {
        await this.waitForClientId();
      } catch (error) {
        throw new Error("Client ID not available for server status check");
      }
    }

    try {
      const response = await fetch(
        `http://localhost:3001/api/websocket/status/${this.clientId}`,
      );
      return await response.json();
    } catch (error) {
      console.error("[WebSocket] Failed to get server status:", error);
      throw error;
    }
  }
}

// Create and export singleton instance
const websocketService = new WebSocketService();
export default websocketService;
