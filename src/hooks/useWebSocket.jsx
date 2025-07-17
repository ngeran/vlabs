// =================================================================================================
//
//  COMPREHENSIVE WEBSOCKET INTEGRATION HOOKS FOR REACT
//  FILE: useWebSocket.jsx
//
// =================================================================================================
//
//  DESCRIPTION:
//  This file provides a complete WebSocket integration solution for React applications. It includes
//  multiple custom hooks designed to handle different real-time communication scenarios:
//
//  - `useWebSocket`: The core hook for managing the WebSocket connection lifecycle, including
//    auto-reconnection, message handling, and connection health diagnostics.
//
//  - `useScriptRunnerStream`: A specialized hook built on top of `useWebSocket`. It handles the
//    execution of backend scripts with real-time streaming of `stdout` and `stderr`, and is
//    specifically designed to parse structured progress updates from the stream.
//
//  - `useTemplateApplication`: Another specialized hook for applying device configurations from
//    templates, providing detailed, step-by-step progress tracking.
//
//  KEY FIXES IN THIS VERSION:
//  - Implemented a robust stream buffering and parsing mechanism in `useScriptRunnerStream` to
//    correctly handle real-time data chunks, ensuring that progress updates are displayed
//    as they arrive, not all at the end.
//
// =================================================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import websocketService from "../services/websocketServices";

// ================================================================================
// SECTION 1: CONSTANTS AND CONFIGURATION
// ================================================================================

/**
 * Default configuration for the main WebSocket connection hook.
 */
const DEFAULT_WS_CONFIG = {
  autoConnect: true,
  wsUrl: "ws://localhost:3001",
  reconnectInterval: 5000,
  maxReconnectAttempts: 10,
};

/**
 * Defines standardized event types for WebSocket communication to ensure
 * consistency and prevent typos.
 */
const WS_EVENTS = {
  // Connection lifecycle events
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  CLIENT_ID: "client_id",
  ERROR: "error",
  MESSAGE: "message",

  // Generic script execution events
  SCRIPT_ERROR: "script_error",
  SCRIPT_OUTPUT: "script_output",
  SCRIPT_END: "script_end",

  // Specialized template application events
  STATUS: "status",
  PROGRESS: "progress",
  COMMIT_PROGRESS: "commit_progress",
  INFO: "info",
  RESULT: "result",
};

/**
 * Defines the possible states for a script execution lifecycle.
 */
const SCRIPT_STATES = {
  IDLE: "idle",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
};

// ================================================================================
// SECTION 2: UTILITY FUNCTIONS
// ================================================================================

/**
 * Safely parses a JSON string, returning null if parsing fails.
 * This prevents the application from crashing due to malformed JSON.
 * @param {string} jsonString - The JSON string to parse.
 * @returns {Object|null} - The parsed JavaScript object or null on error.
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
 * Extracts one or more JSON objects from a single line of text.
 * This is useful for parsing stream data where a line might have a prefix
 * (e.g., "JSON_PROGRESS: {...}").
 * @param {string} line - The line of text to parse.
 * @returns {Array} - An array of all successfully parsed JSON objects found in the line.
 */
const extractJsonFromLine = (line) => {
  const results = [];
  const trimmedLine = line.trim();
  if (!trimmedLine) return results;

  const firstBraceIndex = trimmedLine.indexOf("{");
  if (firstBraceIndex === -1) return results;

  const jsonPortion = trimmedLine.substring(firstBraceIndex);
  const parsed = safeJsonParse(jsonPortion);
  if (parsed) {
    results.push(parsed);
  }

  return results;
};

/**
 * Generates a simple unique identifier for tracking runs or events.
 * @returns {string} - A unique identifier string.
 */
const generateUniqueId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};


// ================================================================================
//
// HOOK: useScriptRunnerStream
//
// ROLE: Manages real-time script execution via WebSockets. This hook is responsible
//       for initiating a script run, listening to the `stderr` and `stdout`
//       streams, parsing progress messages, and tracking the overall state
//       from start to completion.
//
// ================================================================================
export const useScriptRunnerStream = (wsContext = {}, options = {}) => {

  // --------------------------------------------------------------------------------
  // Subsection 2.1: State Management
  // --------------------------------------------------------------------------------
  const [state, setState] = useState({
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

  // --------------------------------------------------------------------------------
  // Subsection 2.2: Refs for Stream Buffering and Configuration
  // --------------------------------------------------------------------------------

  // ✨ KEY FIX: A ref to buffer incoming `stderr` data chunks.
  // This is essential for correctly parsing streams, as a single message might be
  // split across multiple WebSocket data events. This ref holds incomplete lines
  // until they can be fully processed.
  const stderrBuffer = useRef("");

  const { isConnected, clientId, websocketService } = wsContext;
  const config = {
    apiEndpoint: "http://localhost:3001/api/scripts/run-stream",
    enableDebugLogging: true, // Enabled for better diagnostics
    maxLogLines: 1000,
    ...options,
  };


  // --------------------------------------------------------------------------------
  // Subsection 2.3: State and Execution Control Functions
  // --------------------------------------------------------------------------------

  /**
   * Resets the hook's state to its initial, idle condition.
   * Called before starting a new script run.
   */
  const resetState = useCallback(() => {
    stderrBuffer.current = ""; // Also reset the buffer
    setState({
      isRunning: false, isComplete: false, currentState: SCRIPT_STATES.IDLE,
      progressEvents: [], finalResult: null, error: null, fullLog: "",
      logLines: [], runId: null, startTime: null, endTime: null, exitCode: null,
      totalProgressEvents: 0, lastProgressTime: null,
    });
  }, []);

  /**
   * Centralized state update function.
   * @param {Object} updates - A partial state object to merge into the current state.
   */
  const updateState = useCallback((updates) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  /**
   * Initiates the execution of a backend script.
   * @param {Object} scriptData - Contains the script ID and its parameters.
   */
  const runScript = useCallback(
    async (scriptData) => {
      if (!isConnected || !clientId) {
        const errorMsg = "WebSocket is not connected. Cannot run script.";
        updateState({ error: errorMsg, isComplete: true, currentState: SCRIPT_STATES.FAILED });
        throw new Error(errorMsg);
      }

      const runId = generateUniqueId();
      const startTime = new Date().toISOString();
      resetState();
      updateState({ isRunning: true, currentState: SCRIPT_STATES.RUNNING, runId, startTime });

      if (config.enableDebugLogging) {
        console.log("🚀 [SCRIPT_RUNNER] Starting script execution:", { runId, scriptData });
      }

      try {
        const response = await fetch(config.apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...scriptData, wsClientId: clientId }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: `HTTP Error: ${response.status}` }));
          throw new Error(errorData.message);
        }

        const result = await response.json();
        updateState({ runId: result.runId || runId });
        return result;

      } catch (error) {
        updateState({ isRunning: false, currentState: SCRIPT_STATES.FAILED, error: error.message, isComplete: true, endTime: new Date().toISOString() });
        throw error;
      }
    },
    [isConnected, clientId, resetState, updateState, config.apiEndpoint, config.enableDebugLogging]
  );

  // --------------------------------------------------------------------------------
  // Subsection 2.4: WebSocket Event Handlers
  // --------------------------------------------------------------------------------

  /**
   * ✨ KEY FIX: Handles incoming `stderr` data chunks from the WebSocket.
   * This function implements a robust buffering mechanism to correctly parse a stream of data.
   * It pieces together fragmented messages and processes each complete line individually.
   * @param {Object} data - The message object from the WebSocket, containing the data chunk.
   */
  const handleScriptError = useCallback(
    (data) => {
      // Ignore messages that are not for the currently active run
      if (data.runId !== state.runId) return;

      const rawChunk = data.error || data.message || "";
      const timestamp = new Date().toISOString();

      // Append the newly received data chunk to our persistent buffer
      stderrBuffer.current += rawChunk;

      // A stream is processed line-by-line. Split the buffer by newlines.
      const lines = stderrBuffer.current.split('\n');

      // The last element in the array might be an incomplete line. We keep it
      // in the buffer for the next data chunk to complete it.
      stderrBuffer.current = lines.pop() || "";

      // If we have one or more complete lines, process them now.
      if (lines.length > 0) {
          const newProgressEvents = [];
          const newLogLines = [];

          for (const line of lines) {
              if (!line) continue; // Skip empty lines

              newLogLines.push({ timestamp, line, type: "stderr" });

              // Check if the line is a structured progress message
              if (line.startsWith("JSON_PROGRESS:")) {
                  const jsonContent = line.substring("JSON_PROGRESS:".length);
                  // Use our utility to safely parse the JSON from the line
                  const progressObjects = extractJsonFromLine(jsonContent);
                  if (progressObjects.length > 0) {
                      newProgressEvents.push(...progressObjects);
                  }
              }
          }

          // Batch state updates for performance
          if (newProgressEvents.length > 0 || newLogLines.length > 0) {
              setState((prev) => ({
                  ...prev,
                  fullLog: prev.fullLog + lines.join('\n') + '\n',
                  logLines: [...prev.logLines, ...newLogLines].slice(-config.maxLogLines),
                  progressEvents: [...prev.progressEvents, ...newProgressEvents],
                  totalProgressEvents: prev.totalProgressEvents + newProgressEvents.length,
                  lastProgressTime: timestamp,
              }));

              if (config.enableDebugLogging && newProgressEvents.length > 0) {
                  console.log("📊 [SCRIPT_RUNNER] Parsed progress update(s):", newProgressEvents);
              }
          }
      }
    },
    [state.runId, config.enableDebugLogging, config.maxLogLines]
  );

  /**
   * Handles the final script output, which typically arrives from `stdout` when the
   * script finishes. This is expected to be a single JSON object.
   * @param {Object} data - The message object containing the final result.
   */
  const handleScriptOutput = useCallback(
    (data) => {
      if (data.runId !== state.runId) return;
      const result = typeof data.output === "string" ? safeJsonParse(data.output) : data.output;
      setState((prev) => ({ ...prev, finalResult: result }));
    },
    [state.runId]
  );

  /**
   * Handles the script end event, which signals the completion of the process.
   * @param {Object} data - The message object containing the exit code.
   */
  const handleScriptEnd = useCallback(
    (data) => {
      if (data.runId !== state.runId) return;
      const endTime = new Date().toISOString();
      const exitCode = data.exitCode || 0;

      setState((prev) => {
        const isSuccess = exitCode === 0 && prev.finalResult?.success !== false;
        let finalError = prev.error;
        if (!isSuccess && !finalError) {
          finalError = prev.finalResult?.message || `Script exited with code ${exitCode}.`;
        }

        return {
          ...prev,
          isRunning: false,
          isComplete: true,
          endTime,
          exitCode,
          error: finalError,
          currentState: isSuccess ? SCRIPT_STATES.COMPLETED : SCRIPT_STATES.FAILED,
        };
      });
    },
    [state.runId]
  );

  // --------------------------------------------------------------------------------
  // Subsection 2.5: WebSocket Event Subscriptions
  // --------------------------------------------------------------------------------

  /**
   * This effect subscribes to WebSocket events when a script run starts and
   * cleans up the subscriptions when the run is over or the component unmounts.
   */
  useEffect(() => {
    if (!websocketService || !state.runId) return;

    if (config.enableDebugLogging) {
      console.log(`🔔 [SCRIPT_RUNNER] Subscribing to events for run: ${state.runId}`);
    }

    const unsubscribers = [
      websocketService.on(WS_EVENTS.SCRIPT_ERROR, handleScriptError),
      websocketService.on(WS_EVENTS.SCRIPT_OUTPUT, handleScriptOutput),
      websocketService.on(WS_EVENTS.SCRIPT_END, handleScriptEnd),
    ];

    return () => {
      if (config.enableDebugLogging) {
        console.log(`🧹 [SCRIPT_RUNNER] Unsubscribing from events for run: ${state.runId}`);
      }
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [websocketService, state.runId, handleScriptError, handleScriptOutput, handleScriptEnd, config.enableDebugLogging]);

  // --------------------------------------------------------------------------------
  // Subsection 2.6: Computed Properties & Return Interface
  // --------------------------------------------------------------------------------
  const duration = state.startTime && state.endTime ? new Date(state.endTime).getTime() - new Date(state.startTime).getTime() : null;

  return {
    ...state,
    duration,
    runScript,
    resetState,
  };
};

// ================================================================================
//
// HOOK: useWebSocket
//
// ROLE: The main, core hook for managing the WebSocket connection itself. It handles
//       connecting, disconnecting, sending messages, and listening for all
//       inbound events, which it then dispatches to any subscribed listeners
//       (like `useScriptRunnerStream`).
//
// ================================================================================
export const useWebSocket = (options = {}) => {
  const config = { ...DEFAULT_WS_CONFIG, ...options };
  const [connectionState, setConnectionState] = useState({ isConnected: false, connectionError: null, clientId: null });
  const [messages, setMessages] = useState([]);

  const connect = useCallback(() => {
    console.log("🔌 [WEBSOCKET] Initiating connection...");
    websocketService.connect(config.wsUrl);
  }, [config.wsUrl]);

  const disconnect = useCallback(() => {
    console.log("🔌 [WEBSOCKET] Disconnecting...");
    websocketService.disconnect();
  }, []);

  const handleConnected = useCallback((data) => {
    console.log("🟢 [WEBSOCKET] Connection established.", data);
    setConnectionState({ isConnected: true, connectionError: null, clientId: data.clientId });
  }, []);

  const handleClientId = useCallback((data) => {
    console.log("🆔 [WEBSOCKET] Client ID assigned:", data.clientId);
    setConnectionState(prev => ({ ...prev, clientId: data.clientId }));
  }, []);

  const handleDisconnected = useCallback((data) => {
    console.log("🔴 [WEBSOCKET] Connection lost.", data);
    setConnectionState({ isConnected: false, connectionError: 'Disconnected', clientId: null });
  }, []);

  const handleError = useCallback((data) => {
    console.error("❌ [WEBSOCKET] Connection error:", data);
    setConnectionState(prev => ({ ...prev, connectionError: data.error }));
  }, []);

  const handleMessage = useCallback((data) => {
    setMessages(prev => [...prev, data]);
  }, []);

  useEffect(() => {
    const unsubscribers = [
      websocketService.on(WS_EVENTS.CONNECTED, handleConnected),
      websocketService.on(WS_EVENTS.CLIENT_ID, handleClientId),
      websocketService.on(WS_EVENTS.DISCONNECTED, handleDisconnected),
      websocketService.on(WS_EVENTS.ERROR, handleError),
      websocketService.on(WS_EVENTS.MESSAGE, handleMessage),
    ];

    if (config.autoConnect) {
      connect();
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      if (config.autoConnect) {
        disconnect();
      }
    };
  }, [config.autoConnect, connect, disconnect, handleConnected, handleClientId, handleDisconnected, handleError, handleMessage]);

  return {
    ...connectionState,
    messages,
    connect,
    disconnect,
    sendMessage: websocketService.send,
    applyTemplate: websocketService.applyTemplate,
    getStatus: websocketService.getStatus,
    websocketService,
  };
};


// ================================================================================
//
// HOOK: useTemplateApplication
//
// ROLE: A specialized hook for handling the "Apply Template" workflow. It listens
//       for a specific set of progress events related to configuration deployment
//       and provides a structured state for rendering the progress UI.
//
// ================================================================================
export const useTemplateApplication = (wsContext = {}, options = {}) => {
  const [applicationState, setApplicationState] = useState({
    isApplying: false,
    isComplete: false,
    progress: null,
    result: null,
    error: null,
    duration: null,
  });

  const { isConnected, clientId, websocketService } = wsContext;
  const { onResult, onError, enableDebugLogging = false } = options;

  const resetState = useCallback(() => {
    setApplicationState({ isApplying: false, isComplete: false, progress: null, result: null, error: null, duration: null });
  }, []);

  const applyTemplate = useCallback(async (templateData) => {
    if (!isConnected || !websocketService) {
      throw new Error("WebSocket connection not available.");
    }
    resetState();
    setApplicationState(prev => ({ ...prev, isApplying: true, startTime: performance.now() }));
    try {
      return await websocketService.applyTemplate({ ...templateData, wsClientId: clientId });
    } catch (error) {
      setApplicationState(prev => ({ ...prev, isApplying: false, isComplete: true, error: error.message }));
      throw error;
    }
  }, [isConnected, clientId, websocketService, resetState]);

  const handleProgressUpdate = useCallback((data) => {
    const pythonPayload = data.data;
    setApplicationState(prev => ({ ...prev, progress: pythonPayload }));
  }, []);

  const handleResult = useCallback((data) => {
    const endTime = performance.now();
    setApplicationState(prev => ({
      ...prev,
      isApplying: false,
      isComplete: true,
      result: data.data,
      duration: endTime - (prev.startTime || endTime),
    }));
    onResult?.(data);
  }, [onResult]);

  const handleError = useCallback((data) => {
    const endTime = performance.now();
    setApplicationState(prev => ({
      ...prev,
      isApplying: false,
      isComplete: true,
      error: data.message,
      duration: endTime - (prev.startTime || endTime),
    }));
    onError?.(data);
  }, [onError]);

  useEffect(() => {
    if (!websocketService) return;

    const unsubscribers = [
      websocketService.on(WS_EVENTS.PROGRESS, handleProgressUpdate),
      websocketService.on(WS_EVENTS.RESULT, handleResult),
      websocketService.on(WS_EVENTS.ERROR, handleError),
    ];

    return () => unsubscribers.forEach(unsubscriber => unsubscriber());
  }, [websocketService, handleProgressUpdate, handleResult, handleError]);

  return {
    ...applicationState,
    applyTemplate,
    resetState,
  };
};
