// src/services/ConfigurationWebSocket.js

const API_BASE_URL = "http://localhost:3001";
const WEBSOCKET_URL = "ws://localhost:3001";

/**
 * A reusable class to manage the WebSocket connection and communication
 * for the configuration apply process.
 */
export class ConfigurationWebSocket {
  /**
   * @param {function} onProgress - Callback function to handle incoming progress messages.
   * @param {function} onComplete - Callback function to handle the final successful result.
   * @param {function} onError - Callback function to handle any errors.
   */
  constructor(onProgress, onComplete, onError) {
    this.ws = null;
    this.clientId = null;
    this.isConnected = false;

    // Store the callback functions provided by the component that uses this class.
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.onError = onError;
  }

  /**
   * Establishes a connection to the WebSocket server.
   * @returns {Promise<string>} A promise that resolves with the assigned client ID upon successful connection.
   */
  connect() {
    return new Promise((resolve, reject) => {
      // Prevent multiple connections
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        return resolve(this.clientId);
      }

      this.ws = new WebSocket(WEBSOCKET_URL);

      this.ws.onopen = () => {
        console.log("[ConfigWebSocket] Connection established.");
        this.isConnected = true;
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          // The first message should be 'welcome'. We use it to resolve the promise.
          if (message.type === "welcome") {
            this.clientId = message.clientId;
            console.log(
              `[ConfigWebSocket] Assigned Client ID: ${this.clientId}`,
            );
            resolve(this.clientId); // Fulfill the promise
          } else {
            // Handle all other message types
            this.handleMessage(message);
          }
        } catch (error) {
          console.error("[ConfigWebSocket] Failed to parse message:", error);
          this.onError("Received an invalid message from the server.");
        }
      };

      this.ws.onclose = () => {
        console.log("[ConfigWebSocket] Disconnected.");
        this.isConnected = false;
        this.clientId = null;
      };

      this.ws.onerror = (error) => {
        console.error("[ConfigWebSocket] Connection error:", error);
        this.isConnected = false;
        reject(error); // Reject the promise on connection error
      };
    });
  }

  /**
   * Central message handler to route incoming messages to the correct callback.
   * @param {object} message - The parsed message object from the server.
   */
  handleMessage(message) {
    switch (message.type) {
      case "progress":
        // A real-time update from the Python script.
        this.onProgress(message.data);
        break;
      case "completed": // Your new, more descriptive message type
      case "result": // Keep 'result' for backward compatibility
        // The final, successful result of the entire operation.
        this.onComplete(message.data);
        break;
      case "error":
        // An error occurred during the process.
        this.onError(message.message);
        break;
      default:
        console.warn(
          `[ConfigWebSocket] Received unknown message type: ${message.type}`,
        );
    }
  }

  /**
   * Initiates the configuration apply process by sending an HTTP request.
   * The results will be delivered via the WebSocket connection.
   * @param {object} templateData - The data required for the apply process.
   * @returns {Promise<object>} A promise that resolves with the initial HTTP response from the server.
   */
  async applyTemplate(templateData) {
    if (!this.isConnected || !this.clientId) {
      throw new Error("WebSocket is not connected or has no Client ID.");
    }

    // Send the HTTP request to start the long-running job.
    // Include our unique clientId so the backend knows who to send updates to.
    const response = await fetch(`${API_BASE_URL}/api/templates/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wsClientId: this.clientId,
        ...templateData,
      }),
    });

    // Return the initial response, which should be a 202 "Accepted".
    return response.json();
  }

  /**
   * Cleanly closes the WebSocket connection.
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}
