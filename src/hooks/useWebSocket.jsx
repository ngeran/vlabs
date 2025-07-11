// ================================================================================
// WEBSOCKET HOOKS - COMPREHENSIVE WEBSOCKET INTEGRATION FOR REACT
// ================================================================================
// This file provides a complete WebSocket integration solution for React applications
// with support for real-time script execution, template application, and progress tracking.
//
// Key Features:
// - Real-time WebSocket connection management with auto-reconnection
// - Script execution with streaming output and progress tracking
// - Template application with detailed progress monitoring
// - Robust error handling and state management
// - Event-driven architecture with proper cleanup
// ================================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import websocketService from "../services/websocketServices";

// ================================================================================
// CONSTANTS AND CONFIGURATION
// ================================================================================

/**
 * Default WebSocket configuration
 */
const DEFAULT_WS_CONFIG = {
  autoConnect: true,
  wsUrl: "ws://localhost:3001",
  reconnectInterval: 5000,
  maxReconnectAttempts: 10,
};

/**
 * WebSocket event types for type safety and consistency
 */
const WS_EVENTS = {
  // Connection events
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  CLIENT_ID: "client_id",
  ERROR: "error",
  MESSAGE: "message",

  // Script execution events
  SCRIPT_ERROR: "script_error",
  SCRIPT_OUTPUT: "script_output",
  SCRIPT_END: "script_end",

  // Template application events
  STATUS: "status",
  PROGRESS: "progress",
  COMMIT_PROGRESS: "commit_progress",
  INFO: "info",
  RESULT: "result",
};

/**
 * Script execution states
 */
const SCRIPT_STATES = {
  IDLE: "idle",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
};

// ================================================================================
// UTILITY FUNCTIONS
// ================================================================================

/**
 * Safely parses JSON with robust error handling
 * @param {string} jsonString - The JSON string to parse
 * @returns {Object|null} - Parsed object or null if parsing fails
 */
const safeJsonParse = (jsonString) => {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn("Failed to parse JSON:", jsonString, error);
    return null;
  }
};

/**
 * Extracts and parses JSON from a line that may contain multiple JSON objects
 * or trailing text after valid JSON. Handles lines with prefixes like "JSON_PROGRESS:"
 * @param {string} line - The line to parse
 * @returns {Array} - Array of successfully parsed JSON objects
 */
const extractJsonFromLine = (line) => {
  const results = [];
  const trimmedLine = line.trim();

  if (!trimmedLine) return results;

  // Handle multiple JSON objects on the same line
  const jsonLines = trimmedLine.split("\n").filter((l) => l.trim());

  for (const jsonLine of jsonLines) {
    let cleanLine = jsonLine.trim();
    if (!cleanLine) continue;

    // Check if line has a prefix (like "JSON_PROGRESS:")
    // Look for the first opening brace to find where JSON actually starts
    const firstBraceIndex = cleanLine.indexOf("{");
    if (firstBraceIndex === -1) {
      // No JSON object found in this line
      continue;
    }

    // Extract the portion starting from the first brace
    const jsonPortion = cleanLine.substring(firstBraceIndex);

    try {
      // Use brace counting to find the end of complete JSON objects
      let braceCount = 0;
      let jsonEnd = -1;
      let inString = false;
      let escapeNext = false;

      for (let i = 0; i < jsonPortion.length; i++) {
        const char = jsonPortion[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === "\\" && inString) {
          escapeNext = true;
          continue;
        }

        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === "{") {
            braceCount++;
          } else if (char === "}") {
            braceCount--;
            if (braceCount === 0) {
              jsonEnd = i + 1;
              break;
            }
          }
        }
      }

      const validJson =
        jsonEnd > 0 ? jsonPortion.substring(0, jsonEnd) : jsonPortion;
      const parsed = safeJsonParse(validJson);

      if (parsed) {
        results.push(parsed);
      }
    } catch (error) {
      console.warn("Failed to extract JSON from line:", cleanLine, error);
    }
  }

  return results;
};

/**
 * Generates a unique identifier for tracking purposes
 * @returns {string} - Unique identifier
 */
const generateUniqueId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// ================================================================================
// SCRIPT RUNNER HOOK - REAL-TIME SCRIPT EXECUTION WITH PROGRESS TRACKING
// ================================================================================

/**
 * Hook for executing scripts with real-time output streaming and progress tracking.
 * Connects to the `/api/scripts/run-stream` endpoint and provides detailed
 * progress monitoring capabilities.
 *
 * @param {Object} wsContext - WebSocket context containing connection details
 * @param {Object} options - Configuration options
 * @returns {Object} - Script execution state and control functions
 */
export const useScriptRunnerStream = (wsContext = {}, options = {}) => {
  // ================================================================================
  // STATE MANAGEMENT
  // ================================================================================

  /**
   * Comprehensive state for script execution tracking
   */
  const [state, setState] = useState({
    // Execution status
    isRunning: false,
    isComplete: false,
    currentState: SCRIPT_STATES.IDLE,

    // Progress tracking
    progressEvents: [], // Array of structured progress events
    finalResult: null, // Final JSON result from stdout
    error: null, // Script execution errors

    // Logging
    fullLog: "", // Complete raw stderr log
    logLines: [], // Parsed log lines with timestamps

    // Execution metadata
    runId: null, // Unique identifier for this execution
    startTime: null, // Execution start timestamp
    endTime: null, // Execution end timestamp
    exitCode: null, // Process exit code

    // Statistics
    totalProgressEvents: 0, // Total number of progress events received
    lastProgressTime: null, // Timestamp of last progress update
  });

  // Extract WebSocket context
  const { isConnected, clientId, websocketService } = wsContext;

  // Configuration with defaults
  const config = {
    apiEndpoint: "http://localhost:3001/api/scripts/run-stream",
    enableDebugLogging: false,
    maxLogLines: 1000,
    ...options,
  };

  // ================================================================================
  // STATE MANAGEMENT FUNCTIONS
  // ================================================================================

  /**
   * Resets the script execution state to initial values
   */
  const resetState = useCallback(() => {
    setState({
      isRunning: false,
      isComplete: false,
      currentState: SCRIPT_STATES.IDLE,
      progressEvents: [],
      finalResult: null,
      error: null,
      fullLog: "",
      logLines: [],
      runId: null,
      startTime: null,
      endTime: null,
      exitCode: null,
      totalProgressEvents: 0,
      lastProgressTime: null,
    });
  }, []);

  /**
   * Updates the script state with new information
   * @param {Object} updates - Partial state updates
   */
  const updateState = useCallback((updates) => {
    setState((prev) => ({
      ...prev,
      ...updates,
      lastProgressTime: new Date().toISOString(),
    }));
  }, []);

  // ================================================================================
  // SCRIPT EXECUTION FUNCTIONS
  // ================================================================================

  /**
   * Executes a script with real-time output streaming
   * @param {Object} scriptData - Script execution parameters
   * @returns {Promise} - Promise that resolves with the initial response
   */
  const runScript = useCallback(
    async (scriptData) => {
      // Validate WebSocket connection
      if (
        !isConnected ||
        !clientId ||
        !websocketService?.getStatus().isConnected
      ) {
        const errorMsg =
          "WebSocket is not connected or ready. Please ensure the connection is established before running scripts.";
        console.error(
          "❌ [SCRIPT_RUNNER] Connection validation failed:",
          errorMsg,
        );

        updateState({
          isRunning: false,
          currentState: SCRIPT_STATES.FAILED,
          error: errorMsg,
          isComplete: true,
          endTime: new Date().toISOString(),
        });

        throw new Error(errorMsg);
      }

      // Validate script data
      if (!scriptData || typeof scriptData !== "object") {
        const errorMsg =
          "Invalid script data provided. Expected an object with script parameters.";
        console.error(
          "❌ [SCRIPT_RUNNER] Script data validation failed:",
          errorMsg,
        );

        updateState({
          error: errorMsg,
          currentState: SCRIPT_STATES.FAILED,
          isComplete: true,
        });

        throw new Error(errorMsg);
      }

      // Initialize execution state
      const runId = generateUniqueId();
      const startTime = new Date().toISOString();

      resetState();
      updateState({
        isRunning: true,
        currentState: SCRIPT_STATES.RUNNING,
        runId,
        startTime,
      });

      if (config.enableDebugLogging) {
        console.log("🚀 [SCRIPT_RUNNER] Starting script execution:", {
          runId,
          clientId,
          scriptData,
          startTime,
        });
      }

      try {
        // Send script execution request to backend
        const response = await fetch(config.apiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Client-ID": clientId, // Additional header for tracking
          },
          body: JSON.stringify({
            ...scriptData,
            wsClientId: clientId,
            runId,
            timestamp: startTime,
          }),
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ message: "Unknown error" }));
          throw new Error(
            errorData.message ||
              `HTTP ${response.status}: ${response.statusText}`,
          );
        }

        const result = await response.json();

        if (config.enableDebugLogging) {
          console.log("✅ [SCRIPT_RUNNER] Script execution initiated:", result);
        }

        // Update state with initial response
        updateState({
          runId: result.runId || runId,
        });

        return result;
      } catch (error) {
        console.error("❌ [SCRIPT_RUNNER] Script execution failed:", error);

        updateState({
          isRunning: false,
          currentState: SCRIPT_STATES.FAILED,
          error: error.message,
          isComplete: true,
          endTime: new Date().toISOString(),
        });

        throw error;
      }
    },
    [isConnected, clientId, websocketService, resetState, updateState, config],
  );

  /**
   * Cancels the currently running script (if supported by backend)
   */
  const cancelScript = useCallback(async () => {
    if (!state.isRunning || !state.runId) {
      console.warn(
        "⚠️ [SCRIPT_RUNNER] No script is currently running to cancel",
      );
      return;
    }

    try {
      // Send cancellation request to backend
      const response = await fetch(`${config.apiEndpoint}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: state.runId,
          wsClientId: clientId,
        }),
      });

      if (response.ok) {
        updateState({
          isRunning: false,
          currentState: SCRIPT_STATES.FAILED,
          error: "Script execution cancelled by user",
          isComplete: true,
          endTime: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("❌ [SCRIPT_RUNNER] Failed to cancel script:", error);
    }
  }, [state.isRunning, state.runId, clientId, config.apiEndpoint, updateState]);

  // ================================================================================
  // WEBSOCKET EVENT HANDLERS
  // ================================================================================

  /**
   * Handles incoming stderr data from the script execution
   * @param {Object} data - WebSocket message data
   */
  const handleScriptError = useCallback(
    (data) => {
      // --- ADD THIS LINE FOR DEBUGGING ---
      console.log("WebSocket SCRIPT_ERROR event received:", data);
      // ------------------------------------
      // Validate message is for current run
      if (data.runId !== state.runId) {
        if (config.enableDebugLogging) {
          console.log(
            "🔍 [SCRIPT_RUNNER] Ignoring stderr for different run:",
            data.runId,
          );
        }
        return;
      }

      const line = data.error || data.message || "";
      const timestamp = new Date().toISOString();

      // Always append to full log
      setState((prev) => ({
        ...prev,
        fullLog: prev.fullLog + line + "\n",
        logLines: [
          ...prev.logLines.slice(-(config.maxLogLines - 1)),
          { timestamp, line, type: "stderr" },
        ],
      }));

      // Process structured progress messages
      if (line.startsWith("JSON_PROGRESS:")) {
        const jsonContent = line.substring("JSON_PROGRESS:".length);
        const progressObjects = extractJsonFromLine(jsonContent);

        if (progressObjects.length > 0) {
          setState((prev) => ({
            ...prev,
            progressEvents: [...prev.progressEvents, ...progressObjects],
            totalProgressEvents:
              prev.totalProgressEvents + progressObjects.length,
            lastProgressTime: timestamp,
          }));

          if (config.enableDebugLogging) {
            console.log("📊 [SCRIPT_RUNNER] Progress update:", progressObjects);
          }
        }
      }
    },
    [state.runId, config.enableDebugLogging, config.maxLogLines],
  );

  /**
   * Handles final stdout output from the script
   * @param {Object} data - WebSocket message data
   */
  const handleScriptOutput = useCallback(
    (data) => {
      if (data.runId !== state.runId) return;

      try {
        const result =
          typeof data.output === "string"
            ? safeJsonParse(data.output)
            : data.output;

        setState((prev) => ({
          ...prev,
          finalResult: result,
          lastProgressTime: new Date().toISOString(),
        }));

        if (config.enableDebugLogging) {
          console.log("📋 [SCRIPT_RUNNER] Final result received:", result);
        }
      } catch (error) {
        console.error(
          "❌ [SCRIPT_RUNNER] Failed to process script output:",
          error,
        );
      }
    },
    [state.runId, config.enableDebugLogging],
  );

  /**
   * Handles script execution completion
   * @param {Object} data - WebSocket message data
   */
  const handleScriptEnd = useCallback(
    (data) => {
      if (data.runId !== state.runId) return;

      const endTime = new Date().toISOString();
      const exitCode = data.exitCode || 0;

      setState((prev) => {
        const newState = {
          ...prev,
          isRunning: false,
          isComplete: true,
          endTime,
          exitCode,
          lastProgressTime: endTime,
        };

        // Determine final state based on execution results
        if (exitCode !== 0) {
          newState.currentState = SCRIPT_STATES.FAILED;
          if (!newState.error) {
            newState.error = `Script exited with code ${exitCode}. Check logs for details.`;
          }
        } else if (!newState.finalResult) {
          newState.currentState = SCRIPT_STATES.FAILED;
          newState.error = "Script completed but produced no result.";
        } else if (newState.finalResult?.success === false) {
          newState.currentState = SCRIPT_STATES.FAILED;
          newState.error =
            newState.finalResult.message || "Script reported failure.";
        } else {
          newState.currentState = SCRIPT_STATES.COMPLETED;
        }

        return newState;
      });

      if (config.enableDebugLogging) {
        console.log("🏁 [SCRIPT_RUNNER] Script execution completed:", {
          runId: data.runId,
          exitCode,
          endTime,
        });
      }
    },
    [state.runId, config.enableDebugLogging],
  );

  // ================================================================================
  // WEBSOCKET EVENT SUBSCRIPTIONS
  // ================================================================================

  useEffect(() => {
    if (!websocketService || !state.runId) return;

    if (config.enableDebugLogging) {
      console.log(
        "🔔 [SCRIPT_RUNNER] Setting up WebSocket listeners for run:",
        state.runId,
      );
    }

    // Subscribe to WebSocket events
    const unsubscribers = [
      websocketService.on(WS_EVENTS.SCRIPT_ERROR, handleScriptError),
      websocketService.on(WS_EVENTS.SCRIPT_OUTPUT, handleScriptOutput),
      websocketService.on(WS_EVENTS.SCRIPT_END, handleScriptEnd),
    ];

    // Cleanup function
    return () => {
      if (config.enableDebugLogging) {
        console.log("🧹 [SCRIPT_RUNNER] Cleaning up WebSocket listeners");
      }
      unsubscribers.forEach((unsubscriber) => unsubscriber());
    };
  }, [
    websocketService,
    state.runId,
    handleScriptError,
    handleScriptOutput,
    handleScriptEnd,
    config.enableDebugLogging,
  ]);

  // ================================================================================
  // COMPUTED PROPERTIES
  // ================================================================================

  const computedProperties = {
    // Execution timing
    duration:
      state.startTime && state.endTime
        ? new Date(state.endTime).getTime() -
          new Date(state.startTime).getTime()
        : null,

    // Status checks
    hasError: !!state.error,
    hasResult: !!state.finalResult,
    isSuccessful:
      state.currentState === SCRIPT_STATES.COMPLETED && !state.error,

    // Progress statistics
    latestProgressEvent:
      state.progressEvents[state.progressEvents.length - 1] || null,
    progressSummary: {
      total: state.totalProgressEvents,
      latest: state.lastProgressTime,
      hasProgress: state.progressEvents.length > 0,
    },

    // Log management
    recentLogs: state.logLines.slice(-10), // Last 10 log entries
    hasLogs: state.logLines.length > 0,
  };

  // ================================================================================
  // RETURN INTERFACE
  // ================================================================================

  return {
    // Core state
    ...state,

    // Computed properties
    ...computedProperties,

    // Actions
    runScript,
    cancelScript,
    resetState,

    // Utilities
    clearLogs: () =>
      setState((prev) => ({
        ...prev,
        fullLog: "",
        logLines: [],
      })),

    // Configuration
    config,
  };
};

// ================================================================================
// MAIN WEBSOCKET HOOK - COMPREHENSIVE WEBSOCKET CONNECTION MANAGEMENT
// ================================================================================

/**
 * Main WebSocket hook providing comprehensive connection management,
 * message handling, and integration with various WebSocket-based services.
 *
 * @param {Object} options - Configuration options
 * @returns {Object} - WebSocket connection state and control functions
 */
export const useWebSocket = (options = {}) => {
  // ================================================================================
  // CONFIGURATION AND SETUP
  // ================================================================================

  const config = {
    ...DEFAULT_WS_CONFIG,
    ...options,
  };

  // ================================================================================
  // STATE MANAGEMENT
  // ================================================================================

  /**
   * Core WebSocket connection state
   */
  const [connectionState, setConnectionState] = useState({
    isConnected: false,
    connectionError: null,
    clientId: null,
    reconnectAttempts: 0,
    connectionStartTime: null,
    lastConnectedTime: null,
    connectionHistory: [],
  });

  /**
   * Message handling state
   */
  const [messageState, setMessageState] = useState({
    messages: [],
    messageHistory: [],
    totalMessagesReceived: 0,
    lastMessageTime: null,
  });

  /**
   * Performance and diagnostic state
   */
  const [diagnosticState, setDiagnosticState] = useState({
    latency: null,
    connectionQuality: "unknown", // 'excellent', 'good', 'poor', 'unknown'
    lastPingTime: null,
    eventCounts: {},
  });

  // ================================================================================
  // REFS FOR CALLBACK MANAGEMENT
  // ================================================================================

  const callbackRefs = {
    onConnect: useRef(config.onConnect),
    onDisconnect: useRef(config.onDisconnect),
    onError: useRef(config.onError),
    onMessage: useRef(config.onMessage),
  };

  // Update callback refs when options change
  useEffect(() => {
    callbackRefs.onConnect.current = config.onConnect;
    callbackRefs.onDisconnect.current = config.onDisconnect;
    callbackRefs.onError.current = config.onError;
    callbackRefs.onMessage.current = config.onMessage;
  }, [config.onConnect, config.onDisconnect, config.onError, config.onMessage]);

  // ================================================================================
  // CONNECTION MANAGEMENT FUNCTIONS
  // ================================================================================

  /**
   * Establishes WebSocket connection with comprehensive error handling
   */
  const connect = useCallback(async () => {
    try {
      const startTime = new Date().toISOString();
      console.log("🔌 [WEBSOCKET] Initiating connection to:", config.wsUrl);

      setConnectionState((prev) => ({
        ...prev,
        connectionError: null,
        connectionStartTime: startTime,
      }));

      await websocketService.connect(config.wsUrl);

      console.log("✅ [WEBSOCKET] Connection request sent successfully");
    } catch (error) {
      console.error("❌ [WEBSOCKET] Connection failed:", error);

      setConnectionState((prev) => ({
        ...prev,
        connectionError: error.message,
        connectionHistory: [
          ...prev.connectionHistory,
          {
            timestamp: new Date().toISOString(),
            event: "connection_failed",
            error: error.message,
          },
        ],
      }));
    }
  }, [config.wsUrl]);

  /**
   * Gracefully disconnects from WebSocket
   */
  const disconnect = useCallback(() => {
    console.log("🔌 [WEBSOCKET] Initiating disconnection");

    websocketService.disconnect();

    setConnectionState((prev) => ({
      ...prev,
      connectionHistory: [
        ...prev.connectionHistory,
        { timestamp: new Date().toISOString(), event: "manual_disconnect" },
      ],
    }));
  }, []);

  /**
   * Forces reconnection by disconnecting and reconnecting
   */
  const forceReconnect = useCallback(async () => {
    console.log("🔄 [WEBSOCKET] Forcing reconnection");
    disconnect();
    setTimeout(connect, 1000); // Wait 1 second before reconnecting
  }, [disconnect, connect]);

  // ================================================================================
  // MESSAGE HANDLING FUNCTIONS
  // ================================================================================

  /**
   * Sends a message through the WebSocket connection
   * @param {*} message - Message to send
   * @returns {Promise} - Promise that resolves when message is sent
   */
  const sendMessage = useCallback(
    async (message) => {
      if (!connectionState.isConnected) {
        throw new Error("Cannot send message: WebSocket is not connected");
      }

      try {
        const result = await websocketService.send(message);

        // Update message history
        setMessageState((prev) => ({
          ...prev,
          messageHistory: [
            ...prev.messageHistory.slice(-99), // Keep last 100 messages
            {
              timestamp: new Date().toISOString(),
              direction: "outbound",
              message,
              success: true,
            },
          ],
        }));

        return result;
      } catch (error) {
        // Log failed message
        setMessageState((prev) => ({
          ...prev,
          messageHistory: [
            ...prev.messageHistory.slice(-99),
            {
              timestamp: new Date().toISOString(),
              direction: "outbound",
              message,
              success: false,
              error: error.message,
            },
          ],
        }));

        throw error;
      }
    },
    [connectionState.isConnected],
  );

  /**
   * Clears all stored messages
   */
  const clearMessages = useCallback(() => {
    setMessageState((prev) => ({
      ...prev,
      messages: [],
      messageHistory: [],
    }));
  }, []);

  // ================================================================================
  // SERVICE INTEGRATION FUNCTIONS
  // ================================================================================

  /**
   * Applies a template with real-time progress tracking
   * @param {Object} templateData - Template data to apply
   * @returns {Promise} - Promise that resolves with the result
   */
  const applyTemplate = useCallback(
    async (templateData) => {
      if (!connectionState.isConnected) {
        throw new Error("Cannot apply template: WebSocket is not connected");
      }

      try {
        console.log("🎨 [WEBSOCKET] Applying template:", templateData);
        return await websocketService.applyTemplate(templateData);
      } catch (error) {
        console.error("❌ [WEBSOCKET] Template application failed:", error);
        throw error;
      }
    },
    [connectionState.isConnected],
  );

  /**
   * Tests the WebSocket connection
   * @param {*} testMessage - Optional test message
   * @returns {Promise} - Promise that resolves with test result
   */
  const testConnection = useCallback(
    async (testMessage = { test: true, timestamp: Date.now() }) => {
      if (!connectionState.isConnected) {
        throw new Error("Cannot test connection: WebSocket is not connected");
      }

      const pingStart = performance.now();

      try {
        console.log("🏓 [WEBSOCKET] Testing connection");
        const result = await websocketService.testConnection(testMessage);

        const pingEnd = performance.now();
        const latency = pingEnd - pingStart;

        // Update diagnostic state
        setDiagnosticState((prev) => ({
          ...prev,
          latency,
          lastPingTime: new Date().toISOString(),
          connectionQuality:
            latency < 100 ? "excellent" : latency < 300 ? "good" : "poor",
        }));

        console.log(
          `✅ [WEBSOCKET] Connection test successful (${latency.toFixed(2)}ms)`,
        );
        return result;
      } catch (error) {
        console.error("❌ [WEBSOCKET] Connection test failed:", error);
        throw error;
      }
    },
    [connectionState.isConnected],
  );

  /**
   * Gets current connection status and diagnostics
   * @returns {Object} - Comprehensive status information
   */
  const getStatus = useCallback(() => {
    const serviceStatus = websocketService.getStatus();

    return {
      ...serviceStatus,
      ...connectionState,
      ...diagnosticState,
      uptime: connectionState.lastConnectedTime
        ? Date.now() - new Date(connectionState.lastConnectedTime).getTime()
        : 0,
      messageStats: {
        total: messageState.totalMessagesReceived,
        recent: messageState.messages.length,
        lastMessageTime: messageState.lastMessageTime,
      },
    };
  }, [connectionState, diagnosticState, messageState]);

  // ================================================================================
  // WEBSOCKET EVENT HANDLERS
  // ================================================================================

  /**
   * Handles successful WebSocket connection
   * @param {Object} data - Connection data
   */
  const handleConnected = useCallback((data) => {
    const connectedTime = new Date().toISOString();

    console.log("🟢 [WEBSOCKET] Connection established:", data);

    setConnectionState((prev) => ({
      ...prev,
      isConnected: true,
      connectionError: null,
      reconnectAttempts: 0,
      lastConnectedTime: connectedTime,
      connectionHistory: [
        ...prev.connectionHistory,
        { timestamp: connectedTime, event: "connected", data },
      ],
    }));

    // Set client ID if provided
    if (data.clientId) {
      setConnectionState((prev) => ({
        ...prev,
        clientId: data.clientId,
      }));
    }

    // Call user callback
    callbackRefs.onConnect.current?.(data);
  }, []);

  /**
   * Handles client ID assignment
   * @param {Object} data - Client ID data
   */
  const handleClientId = useCallback((data) => {
    console.log("🆔 [WEBSOCKET] Client ID assigned:", data);

    setConnectionState((prev) => ({
      ...prev,
      clientId: data.clientId,
      connectionHistory: [
        ...prev.connectionHistory,
        {
          timestamp: new Date().toISOString(),
          event: "client_id_assigned",
          clientId: data.clientId,
        },
      ],
    }));
  }, []);

  /**
   * Handles WebSocket disconnection
   * @param {Object} data - Disconnection data
   */
  const handleDisconnected = useCallback((data) => {
    console.log("🔴 [WEBSOCKET] Connection lost:", data);

    setConnectionState((prev) => ({
      ...prev,
      isConnected: false,
      connectionHistory: [
        ...prev.connectionHistory,
        { timestamp: new Date().toISOString(), event: "disconnected", data },
      ],
    }));

    // Call user callback
    callbackRefs.onDisconnect.current?.(data);
  }, []);

  /**
   * Handles WebSocket errors
   * @param {Object} data - Error data
   */
  const handleError = useCallback((data) => {
    console.error("❌ [WEBSOCKET] Connection error:", data);

    setConnectionState((prev) => ({
      ...prev,
      connectionError: data.error,
      connectionHistory: [
        ...prev.connectionHistory,
        {
          timestamp: new Date().toISOString(),
          event: "error",
          error: data.error,
        },
      ],
    }));

    // Call user callback
    callbackRefs.onError.current?.(data);
  }, []);

  /**
   * Handles incoming WebSocket messages
   * @param {Object} data - Message data
   */
  const handleMessage = useCallback((data) => {
    const timestamp = new Date().toISOString();

    console.log("📨 [WEBSOCKET] Message received:", data);

    // Update message state
    setMessageState((prev) => ({
      ...prev,
      messages: [
        ...prev.messages,
        { ...data, id: `${Date.now()}-${Math.random()}`, timestamp },
      ],
      totalMessagesReceived: prev.totalMessagesReceived + 1,
      lastMessageTime: timestamp,
      messageHistory: [
        ...prev.messageHistory.slice(-99),
        {
          timestamp,
          direction: "inbound",
          message: data,
          success: true,
        },
      ],
    }));

    // Update event counts for diagnostics
    setDiagnosticState((prev) => ({
      ...prev,
      eventCounts: {
        ...prev.eventCounts,
        [data.type || "unknown"]:
          (prev.eventCounts[data.type || "unknown"] || 0) + 1,
      },
    }));

    // Call user callback
    callbackRefs.onMessage.current?.(data);
  }, []);

  // ================================================================================
  // WEBSOCKET EVENT SUBSCRIPTIONS
  // ================================================================================

  useEffect(() => {
    console.log("🔔 [WEBSOCKET] Setting up event listeners");

    // Subscribe to all WebSocket events
    const unsubscribers = [
      websocketService.on(WS_EVENTS.CONNECTED, handleConnected),
      websocketService.on(WS_EVENTS.CLIENT_ID, handleClientId),
      websocketService.on(WS_EVENTS.DISCONNECTED, handleDisconnected),
      websocketService.on(WS_EVENTS.ERROR, handleError),
      websocketService.on(WS_EVENTS.MESSAGE, handleMessage),
    ];

    // Cleanup function
    return () => {
      console.log("🧹 [WEBSOCKET] Cleaning up event listeners");
      unsubscribers.forEach((unsubscriber) => unsubscriber());
    };
  }, [
    handleConnected,
    handleClientId,
    handleDisconnected,
    handleError,
    handleMessage,
  ]);

  // ================================================================================
  // CONNECTION LIFECYCLE MANAGEMENT
  // ================================================================================

  /**
   * Auto-connect and cleanup management
   */
  useEffect(() => {
    if (config.autoConnect) {
      console.log("🔄 [WEBSOCKET] Auto-connecting on mount");
      connect();
    }

    // Cleanup on unmount
    return () => {
      if (config.autoConnect) {
        console.log("🔄 [WEBSOCKET] Disconnecting on unmount");
        disconnect();
      }
    };
  }, [config.autoConnect, connect, disconnect]);

  /**
   * Reconnection attempt tracking
   */
  useEffect(() => {
    let interval;

    if (!connectionState.isConnected) {
      interval = setInterval(() => {
        const status = websocketService.getStatus();
        setConnectionState((prev) => ({
          ...prev,
          reconnectAttempts: status.reconnectAttempts || 0,
        }));
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [connectionState.isConnected]);

  // ================================================================================
  // COMPUTED PROPERTIES AND UTILITIES
  // ================================================================================

  const computedProperties = {
    // Connection health
    isHealthy: connectionState.isConnected && !connectionState.connectionError,
    connectionAge: connectionState.lastConnectedTime
      ? Date.now() - new Date(connectionState.lastConnectedTime).getTime()
      : 0,

    // Message statistics
    messageRate:
      messageState.totalMessagesReceived > 0 &&
      connectionState.lastConnectedTime
        ? (messageState.totalMessagesReceived /
            (Date.now() -
              new Date(connectionState.lastConnectedTime).getTime())) *
          1000
        : 0,

    // Diagnostic information
    diagnosticSummary: {
      latency: diagnosticState.latency,
      quality: diagnosticState.connectionQuality,
      eventCounts: diagnosticState.eventCounts,
      totalEvents: Object.values(diagnosticState.eventCounts).reduce(
        (a, b) => a + b,
        0,
      ),
    },

    // Recent activity
    recentMessages: messageState.messages.slice(-10),
    recentHistory: connectionState.connectionHistory.slice(-10),
  };

  // ================================================================================
  // RETURN INTERFACE
  // ================================================================================

  return {
    // Connection state
    ...connectionState,

    // Message state
    ...messageState,

    // Diagnostic state
    ...diagnosticState,

    // Computed properties
    ...computedProperties,

    // Core actions
    connect,
    disconnect,
    forceReconnect,
    sendMessage,
    clearMessages,

    // Service integration
    applyTemplate,
    testConnection,
    getStatus,

    // Utilities
    clearHistory: () =>
      setConnectionState((prev) => ({ ...prev, connectionHistory: [] })),
    clearDiagnostics: () =>
      setDiagnosticState({
        latency: null,
        connectionQuality: "unknown",
        lastPingTime: null,
        eventCounts: {},
      }),

    // Service instance (for advanced usage)
    websocketService,

    // Configuration
    config,
  };
};

// ================================================================================
// TEMPLATE APPLICATION HOOK - ADVANCED TEMPLATE PROCESSING WITH PROGRESS TRACKING
// ================================================================================

/**
 * Specialized hook for template application with comprehensive progress tracking,
 * commit monitoring, and detailed status reporting. This hook provides a complete
 * interface for managing complex template application workflows.
 *
 * @param {Object} wsContext - Shared WebSocket context
 * @param {Object} options - Configuration options and callbacks
 * @returns {Object} - Template application state and control functions
 */
export const useTemplateApplication = (wsContext = {}, options = {}) => {
  // ================================================================================
  // CONFIGURATION AND SETUP
  // ================================================================================

  const {
    onStatusUpdate,
    onProgressUpdate,
    onCommitProgress,
    onInfoUpdate,
    onResult,
    onError,
    enableDebugLogging = false,
    maxInfoItems = 100,
    progressUpdateThreshold = 100, // Minimum ms between progress updates
  } = options;

  // ================================================================================
  // STATE MANAGEMENT
  // ================================================================================

  /**
   * Comprehensive template application state
   */
  const [applicationState, setApplicationState] = useState({
    // Execution status
    isApplying: false,
    isComplete: false,
    isPaused: false,

    // Progress tracking
    currentStatus: null,
    progress: {
      steps: [],
      totalSteps: 0,
      completedSteps: 0,
      currentStep: null,
      percentage: 0,
    },

    // Commit tracking
    commitProgress: null,
    commitHistory: [],

    // Information and logging
    info: [],
    infoSummary: {
      total: 0,
      warnings: 0,
      errors: 0,
      info: 0,
    },

    // Results and errors
    result: null,
    error: null,

    // Timing and metadata
    startTime: null,
    endTime: null,
    applicationId: null,

    // Performance metrics
    progressUpdateCount: 0,
    lastProgressUpdate: null,
    averageStepDuration: 0,
  });

  // Extract WebSocket context
  const { isConnected, clientId, websocketService } = wsContext;

  // ================================================================================
  // STATE MANAGEMENT FUNCTIONS
  // ================================================================================

  /**
   * Resets the template application state
   */
  const resetState = useCallback(() => {
    setApplicationState({
      isApplying: false,
      isComplete: false,
      isPaused: false,
      currentStatus: null,
      progress: {
        steps: [],
        totalSteps: 0,
        completedSteps: 0,
        currentStep: null,
        percentage: 0,
      },
      commitProgress: null,
      commitHistory: [],
      info: [],
      infoSummary: {
        total: 0,
        warnings: 0,
        errors: 0,
        info: 0,
      },
      result: null,
      error: null,
      startTime: null,
      endTime: null,
      applicationId: null,
      progressUpdateCount: 0,
      lastProgressUpdate: null,
      averageStepDuration: 0,
    });
  }, []);

  /**
   * Updates progress statistics and computed values
   */
  const updateProgressStats = useCallback((steps) => {
    const completedSteps = steps.filter(
      (step) => step.status === "COMPLETED",
    ).length;
    const totalSteps = steps.length;
    const percentage =
      totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    // Calculate average step duration
    const completedStepsWithDuration = steps.filter(
      (step) => step.status === "COMPLETED" && step.startTime && step.endTime,
    );

    let averageStepDuration = 0;
    if (completedStepsWithDuration.length > 0) {
      const totalDuration = completedStepsWithDuration.reduce((sum, step) => {
        return sum + (new Date(step.endTime) - new Date(step.startTime));
      }, 0);
      averageStepDuration = totalDuration / completedStepsWithDuration.length;
    }

    return {
      totalSteps,
      completedSteps,
      percentage,
      currentStep: steps.find((step) => step.status === "IN_PROGRESS") || null,
      averageStepDuration,
    };
  }, []);

  // ================================================================================
  // TEMPLATE APPLICATION FUNCTIONS
  // ================================================================================

  /**
   * Applies a template with comprehensive progress tracking
   * @param {Object} templateData - Template data to apply
   * @returns {Promise} - Promise that resolves with the result
   */
  const applyTemplate = useCallback(
    async (templateData) => {
      // Validate connection
      if (!isConnected || !websocketService) {
        const errorMsg =
          "WebSocket connection not available for template application";
        console.error("❌ [TEMPLATE] Connection validation failed:", errorMsg);
        throw new Error(errorMsg);
      }

      // Validate template data
      if (!templateData || typeof templateData !== "object") {
        const errorMsg = "Invalid template data provided";
        console.error(
          "❌ [TEMPLATE] Template data validation failed:",
          errorMsg,
        );
        throw new Error(errorMsg);
      }

      // Initialize application
      const applicationId = generateUniqueId();
      const startTime = new Date().toISOString();

      resetState();
      setApplicationState((prev) => ({
        ...prev,
        isApplying: true,
        startTime,
        applicationId,
      }));

      if (enableDebugLogging) {
        console.log("🎨 [TEMPLATE] Starting template application:", {
          applicationId,
          templateData,
          startTime,
        });
      }

      try {
        // Delegate to WebSocket service
        const result = await websocketService.applyTemplate({
          ...templateData,
          applicationId,
          clientId,
          startTime,
        });

        if (enableDebugLogging) {
          console.log("✅ [TEMPLATE] Template application initiated:", result);
        }

        return result;
      } catch (error) {
        console.error("❌ [TEMPLATE] Template application failed:", error);

        setApplicationState((prev) => ({
          ...prev,
          isApplying: false,
          isComplete: true,
          error: error.message,
          endTime: new Date().toISOString(),
        }));

        throw error;
      }
    },
    [isConnected, clientId, websocketService, resetState, enableDebugLogging],
  );

  /**
   * Pauses the current template application (if supported)
   */
  const pauseApplication = useCallback(async () => {
    if (!applicationState.isApplying || !applicationState.applicationId) {
      console.warn("⚠️ [TEMPLATE] No active application to pause");
      return;
    }

    try {
      // Send pause signal through WebSocket
      await websocketService.send({
        type: "template_control",
        action: "pause",
        applicationId: applicationState.applicationId,
      });

      setApplicationState((prev) => ({
        ...prev,
        isPaused: true,
      }));

      if (enableDebugLogging) {
        console.log(
          "⏸️ [TEMPLATE] Application paused:",
          applicationState.applicationId,
        );
      }
    } catch (error) {
      console.error("❌ [TEMPLATE] Failed to pause application:", error);
    }
  }, [
    applicationState.isApplying,
    applicationState.applicationId,
    websocketService,
    enableDebugLogging,
  ]);

  /**
   * Resumes a paused template application
   */
  const resumeApplication = useCallback(async () => {
    if (!applicationState.isPaused || !applicationState.applicationId) {
      console.warn("⚠️ [TEMPLATE] No paused application to resume");
      return;
    }

    try {
      // Send resume signal through WebSocket
      await websocketService.send({
        type: "template_control",
        action: "resume",
        applicationId: applicationState.applicationId,
      });

      setApplicationState((prev) => ({
        ...prev,
        isPaused: false,
      }));

      if (enableDebugLogging) {
        console.log(
          "▶️ [TEMPLATE] Application resumed:",
          applicationState.applicationId,
        );
      }
    } catch (error) {
      console.error("❌ [TEMPLATE] Failed to resume application:", error);
    }
  }, [
    applicationState.isPaused,
    applicationState.applicationId,
    websocketService,
    enableDebugLogging,
  ]);

  /**
   * Cancels the current template application
   */
  const cancelApplication = useCallback(async () => {
    if (!applicationState.isApplying || !applicationState.applicationId) {
      console.warn("⚠️ [TEMPLATE] No active application to cancel");
      return;
    }

    try {
      // Send cancel signal through WebSocket
      await websocketService.send({
        type: "template_control",
        action: "cancel",
        applicationId: applicationState.applicationId,
      });

      setApplicationState((prev) => ({
        ...prev,
        isApplying: false,
        isComplete: true,
        error: "Application cancelled by user",
        endTime: new Date().toISOString(),
      }));

      if (enableDebugLogging) {
        console.log(
          "🛑 [TEMPLATE] Application cancelled:",
          applicationState.applicationId,
        );
      }
    } catch (error) {
      console.error("❌ [TEMPLATE] Failed to cancel application:", error);
    }
  }, [
    applicationState.isApplying,
    applicationState.applicationId,
    websocketService,
    enableDebugLogging,
  ]);

  // ================================================================================
  // WEBSOCKET EVENT HANDLERS
  // ================================================================================

  /**
   * Handles status updates from the template application
   * @param {Object} data - Status update data
   */
  const handleStatusUpdate = useCallback(
    (data) => {
      setApplicationState((prev) => ({
        ...prev,
        currentStatus: data.message,
      }));

      if (enableDebugLogging) {
        console.log("📊 [TEMPLATE] Status update:", data.message);
      }

      onStatusUpdate?.(data);
    },
    [enableDebugLogging, onStatusUpdate],
  );

  /**
   * Handles progress updates with advanced step tracking
   * @param {Object} data - Progress update data
   */
  const handleProgressUpdate = useCallback(
    (data) => {
      const now = new Date().toISOString();

      // Throttle progress updates if configured
      if (progressUpdateThreshold > 0 && applicationState.lastProgressUpdate) {
        const timeSinceLastUpdate =
          Date.now() - new Date(applicationState.lastProgressUpdate).getTime();
        if (timeSinceLastUpdate < progressUpdateThreshold) {
          return; // Skip this update
        }
      }

      // Extract progress data
      const pythonPayload = data.data;
      if (!pythonPayload || typeof pythonPayload.data?.step === "undefined") {
        console.warn("⚠️ [TEMPLATE] Malformed progress update:", data);
        return;
      }

      const stepData = pythonPayload.data;

      setApplicationState((prev) => {
        // Create updated steps array
        const newSteps = [...(prev.progress?.steps || [])];
        const stepIndex = newSteps.findIndex((s) => s.step === stepData.step);

        if (stepIndex > -1) {
          // Update existing step
          newSteps[stepIndex] = {
            ...newSteps[stepIndex],
            ...stepData,
            lastUpdated: now,
          };
        } else {
          // Add new step
          newSteps.push({
            ...stepData,
            firstSeen: now,
            lastUpdated: now,
          });
        }

        // Sort steps by step number
        newSteps.sort((a, b) => a.step - b.step);

        // Calculate progress statistics
        const progressStats = updateProgressStats(newSteps);

        return {
          ...prev,
          currentStatus: pythonPayload.message,
          progress: {
            ...prev.progress,
            steps: newSteps,
            ...progressStats,
          },
          progressUpdateCount: prev.progressUpdateCount + 1,
          lastProgressUpdate: now,
        };
      });

      if (enableDebugLogging) {
        console.log("📈 [TEMPLATE] Progress update:", stepData);
      }

      onProgressUpdate?.(data);
    },
    [
      enableDebugLogging,
      onProgressUpdate,
      progressUpdateThreshold,
      applicationState.lastProgressUpdate,
      updateProgressStats,
    ],
  );

  /**
   * Handles commit progress updates
   * @param {Object} data - Commit progress data
   */
  const handleCommitProgress = useCallback(
    (data) => {
      const timestamp = new Date().toISOString();

      setApplicationState((prev) => ({
        ...prev,
        commitProgress: data.message,
        commitHistory: [
          ...prev.commitHistory,
          {
            timestamp,
            message: data.message,
            data: data.data,
          },
        ],
      }));

      if (enableDebugLogging) {
        console.log("💾 [TEMPLATE] Commit progress:", data.message);
      }

      onCommitProgress?.(data);
    },
    [enableDebugLogging, onCommitProgress],
  );

  /**
   * Handles informational updates
   * @param {Object} data - Information data
   */
  const handleInfoUpdate = useCallback(
    (data) => {
      const timestamp = new Date().toISOString();
      const infoItem = {
        ...data,
        timestamp,
        id: generateUniqueId(),
      };

      setApplicationState((prev) => {
        const newInfo = [...prev.info, infoItem].slice(-maxInfoItems);

        // Update info summary
        const infoSummary = newInfo.reduce(
          (summary, item) => {
            const level = item.level || "info";
            return {
              ...summary,
              total: summary.total + 1,
              [level]: (summary[level] || 0) + 1,
            };
          },
          { total: 0, warnings: 0, errors: 0, info: 0 },
        );

        return {
          ...prev,
          info: newInfo,
          infoSummary,
        };
      });

      if (enableDebugLogging) {
        console.log("ℹ️ [TEMPLATE] Info update:", data);
      }

      onInfoUpdate?.(data);
    },
    [enableDebugLogging, onInfoUpdate, maxInfoItems],
  );

  /**
   * Handles final results
   * @param {Object} data - Result data
   */
  const handleResult = useCallback(
    (data) => {
      const endTime = new Date().toISOString();

      setApplicationState((prev) => ({
        ...prev,
        isApplying: false,
        isComplete: true,
        result: data.data,
        endTime,
      }));

      if (enableDebugLogging) {
        console.log("🎉 [TEMPLATE] Application completed:", data.data);
      }

      onResult?.(data);
    },
    [enableDebugLogging, onResult],
  );

  /**
   * Handles errors
   * @param {Object} data - Error data
   */
  const handleError = useCallback(
    (data) => {
      const endTime = new Date().toISOString();

      setApplicationState((prev) => ({
        ...prev,
        isApplying: false,
        isComplete: true,
        error: data.message,
        endTime,
      }));

      if (enableDebugLogging) {
        console.error("❌ [TEMPLATE] Application error:", data.message);
      }

      onError?.(data);
    },
    [enableDebugLogging, onError],
  );

  // ================================================================================
  // WEBSOCKET EVENT SUBSCRIPTIONS
  // ================================================================================

  useEffect(() => {
    if (!websocketService) return;

    if (enableDebugLogging) {
      console.log("🔔 [TEMPLATE] Setting up WebSocket event listeners");
    }

    // Subscribe to template application events
    const unsubscribers = [
      websocketService.on(WS_EVENTS.STATUS, handleStatusUpdate),
      websocketService.on(WS_EVENTS.PROGRESS, handleProgressUpdate),
      websocketService.on(WS_EVENTS.COMMIT_PROGRESS, handleCommitProgress),
      websocketService.on(WS_EVENTS.INFO, handleInfoUpdate),
      websocketService.on(WS_EVENTS.RESULT, handleResult),
      websocketService.on(WS_EVENTS.ERROR, handleError),
    ];

    // Cleanup function
    return () => {
      if (enableDebugLogging) {
        console.log("🧹 [TEMPLATE] Cleaning up WebSocket event listeners");
      }
      unsubscribers.forEach((unsubscriber) => unsubscriber());
    };
  }, [
    websocketService,
    handleStatusUpdate,
    handleProgressUpdate,
    handleCommitProgress,
    handleInfoUpdate,
    handleResult,
    handleError,
    enableDebugLogging,
  ]);

  // ================================================================================
  // COMPUTED PROPERTIES
  // ================================================================================

  const computedProperties = {
    // Timing calculations
    duration:
      applicationState.startTime && applicationState.endTime
        ? new Date(applicationState.endTime).getTime() -
          new Date(applicationState.startTime).getTime()
        : null,

    // Status checks
    hasError: !!applicationState.error,
    hasResult: !!applicationState.result,
    isSuccessful:
      applicationState.isComplete &&
      !applicationState.error &&
      !!applicationState.result,

    // Progress analysis
    progressSummary: {
      percentage: applicationState.progress.percentage,
      currentStep: applicationState.progress.currentStep,
      remainingSteps:
        applicationState.progress.totalSteps -
        applicationState.progress.completedSteps,
      estimatedTimeRemaining:
        applicationState.averageStepDuration > 0 &&
        applicationState.progress.totalSteps > 0
          ? (applicationState.progress.totalSteps -
              applicationState.progress.completedSteps) *
            applicationState.averageStepDuration
          : null,
    },

    // Information analysis
    recentInfo: applicationState.info.slice(-10),
    hasWarnings: applicationState.infoSummary.warnings > 0,
    hasErrors: applicationState.infoSummary.errors > 0,

    // Performance metrics
    performanceMetrics: {
      progressUpdateRate:
        applicationState.progressUpdateCount > 0 && applicationState.startTime
          ? (applicationState.progressUpdateCount /
              (Date.now() - new Date(applicationState.startTime).getTime())) *
            1000
          : 0,
      averageStepDuration: applicationState.averageStepDuration,
    },
  };

  // ================================================================================
  // RETURN INTERFACE
  // ================================================================================

  return {
    // Connection state
    isConnected,
    clientId,

    // Application state
    ...applicationState,

    // Computed properties
    ...computedProperties,

    // Core actions
    applyTemplate,
    pauseApplication,
    resumeApplication,
    cancelApplication,
    resetState,

    // Utilities
    clearInfo: () =>
      setApplicationState((prev) => ({
        ...prev,
        info: [],
        infoSummary: { total: 0, warnings: 0, errors: 0, info: 0 },
      })),

    clearCommitHistory: () =>
      setApplicationState((prev) => ({
        ...prev,
        commitHistory: [],
      })),

    // Configuration
    config: {
      enableDebugLogging,
      maxInfoItems,
      progressUpdateThreshold,
    },
  };
};

// ================================================================================
// EXPORTS AND MODULE DOCUMENTATION
// ================================================================================

/**
 * Module exports:
 *
 * - useScriptRunnerStream: Hook for real-time script execution with progress tracking
 * - useWebSocket: Main WebSocket connection management hook
 * - useTemplateApplication: Specialized hook for template application workflows
 *
 * Each hook provides comprehensive state management, error handling, and
 * real-time updates through WebSocket connections.
 */
