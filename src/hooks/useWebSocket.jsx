// =================================================================================================
//
//  COMPREHENSIVE WEBSOCKET INTEGRATION HOOKS FOR REACT
//  FILE: useWebSocket.jsx (FIXED & FULLY COMMENTED)
//
// =================================================================================================
//
//  DESCRIPTION:
//  This file provides a complete and stable WebSocket integration solution. It has been
//  refactored to be fully compatible with React's StrictMode, eliminating the common
//  "1006" connection errors seen during development.
//
//  KEY FIX IMPLEMENTED:
//  - The core `useWebSocket` hook has been redesigned. Its `useEffect` cleanup function
//    now intelligently detaches its own event listeners from the singleton service WITHOUT
//    terminating the persistent, app-wide WebSocket connection. This makes the hook
//    "StrictMode-proof" and ensures a stable connection throughout development and production.
//
//  HOW TO USE:
//  1. Import `useWebSocket` in a top-level component (like App.jsx) to initialize the connection.
//  2. Pass the `websocketService` instance from the hook's return value down to child components.
//  3. Child components can then use the specialized hooks (`useScriptRunnerStream`,
//     `useTemplateApplication`) by passing in the context from the parent.
//
// =================================================================================================

import { useState, useEffect, useCallback, useRef } from "react";
// Your excellent, feature-rich singleton service. It requires no changes.
import websocketService from "../services/websocketServices";

// ================================================================================
// SECTION 1: CONSTANTS AND CONFIGURATION
// This section defines shared constants, preventing "magic strings" and ensuring
// consistency across the application.
// ================================================================================

/**
 * Default configuration for the main WebSocket connection hook.
 */
const DEFAULT_WS_CONFIG = {
  autoConnect: true,
  wsUrl: "ws://localhost:3001",
};

/**
 * Defines standardized event types for WebSocket communication.
 * This is a best practice to avoid typos and centralize event names.
 */
const WS_EVENTS = {
  // Connection lifecycle events
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  CLIENT_ID: "client_id",
  ERROR: "error",
  MESSAGE: "message",

  // Generic script execution events from your service
  SCRIPT_ERROR: "script_error",
  SCRIPT_OUTPUT: "script_output",
  SCRIPT_END: "script_end",

  // Specialized template application events from your service
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
// These helper functions perform common, reusable tasks.
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
 * This is essential for parsing stream data where a line might have a prefix
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
// HOOK: useScriptRunnerStream (UNCHANGED)
//
// ROLE: Your implementation of this hook is excellent and correctly handles the
//       complex logic of stream buffering and parsing. It requires no changes and
//       will work perfectly once the underlying WebSocket connection is stable.
//
// ================================================================================
export const useScriptRunnerStream = (wsContext = {}, options = {}) => {
  //--------------------------------------------------------------------------------
  // Subsection 2.1: State Management
  //--------------------------------------------------------------------------------
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

  //--------------------------------------------------------------------------------
  // Subsection 2.2: Refs for Stream Buffering and Configuration
  //--------------------------------------------------------------------------------
  const stderrBuffer = useRef("");
  const { isConnected, clientId, websocketService } = wsContext;
  const config = {
    apiEndpoint: "http://localhost:3001/api/scripts/run-stream",
    enableDebugLogging: true,
    maxLogLines: 1000,
    ...options,
  };

  //--------------------------------------------------------------------------------
  // Subsection 2.3: State and Execution Control Functions
  //--------------------------------------------------------------------------------
  const resetState = useCallback(() => {
    stderrBuffer.current = "";
    setState({
      isRunning: false, isComplete: false, currentState: SCRIPT_STATES.IDLE,
      progressEvents: [], finalResult: null, error: null, fullLog: "",
      logLines: [], runId: null, startTime: null, endTime: null, exitCode: null,
      totalProgressEvents: 0, lastProgressTime: null,
    });
  }, []);

  const updateState = useCallback((updates) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const runScript = useCallback(
    async (scriptData) => {
      if (!isConnected || !clientId) {
        const errorMsg = "WebSocket is not connected. Cannot run script.";
        updateState({ error: errorMsg, isComplete: true, currentState: SCRIPT_STATES.FAILED });
        throw new Error(errorMsg);
      }
      const runId = generateUniqueId();
      resetState();
      updateState({ isRunning: true, currentState: SCRIPT_STATES.RUNNING, runId, startTime: new Date().toISOString() });
      try {
        await websocketService.runScript({ ...scriptData, runId });
      } catch (error) {
        updateState({ isRunning: false, currentState: SCRIPT_STATES.FAILED, error: error.message, isComplete: true, endTime: new Date().toISOString() });
        throw error;
      }
    },
    [isConnected, clientId, resetState, updateState, websocketService]
  );

  //--------------------------------------------------------------------------------
  // Subsection 2.4: WebSocket Event Handlers
  //--------------------------------------------------------------------------------
  const handleScriptError = useCallback((data) => {
    if (data.runId !== state.runId) return;
    const rawChunk = data.error || data.message || "";
    const timestamp = new Date().toISOString();
    stderrBuffer.current += rawChunk;
    const lines = stderrBuffer.current.split('\n');
    stderrBuffer.current = lines.pop() || "";
    if (lines.length > 0) {
        const newProgressEvents = [];
        const newLogLines = [];
        for (const line of lines) {
            if (!line) continue;
            newLogLines.push({ timestamp, line, type: "stderr" });
            if (line.startsWith("JSON_PROGRESS:")) {
                const jsonContent = line.substring("JSON_PROGRESS:".length);
                const progressObjects = extractJsonFromLine(jsonContent);
                if (progressObjects.length > 0) newProgressEvents.push(...progressObjects);
            }
        }
        if (newProgressEvents.length > 0 || newLogLines.length > 0) {
            setState((prev) => ({
                ...prev,
                fullLog: prev.fullLog + lines.join('\n') + '\n',
                logLines: [...prev.logLines, ...newLogLines].slice(-config.maxLogLines),
                progressEvents: [...prev.progressEvents, ...newProgressEvents],
                totalProgressEvents: prev.totalProgressEvents + newProgressEvents.length,
                lastProgressTime: timestamp,
            }));
        }
    }
  }, [state.runId, config.maxLogLines]);

  const handleScriptOutput = useCallback((data) => {
    if (data.runId !== state.runId) return;
    const result = typeof data.output === "string" ? safeJsonParse(data.output) : data.output;
    setState((prev) => ({ ...prev, finalResult: result }));
  }, [state.runId]);

  const handleScriptEnd = useCallback((data) => {
    if (data.runId !== state.runId) return;
    const endTime = new Date().toISOString();
    const exitCode = data.exitCode || 0;
    setState((prev) => {
      const isSuccess = exitCode === 0 && prev.finalResult?.success !== false;
      let finalError = prev.error;
      if (!isSuccess && !finalError) finalError = prev.finalResult?.message || `Script exited with code ${exitCode}.`;
      return {
        ...prev,
        isRunning: false, isComplete: true, endTime, exitCode, error: finalError,
        currentState: isSuccess ? SCRIPT_STATES.COMPLETED : SCRIPT_STATES.FAILED,
      };
    });
  }, [state.runId]);

  //--------------------------------------------------------------------------------
  // Subsection 2.5: WebSocket Event Subscriptions
  //--------------------------------------------------------------------------------
  useEffect(() => {
    if (!websocketService || !state.runId) return;
    const unsubscribers = [
      websocketService.on(WS_EVENTS.SCRIPT_ERROR, handleScriptError),
      websocketService.on(WS_EVENTS.SCRIPT_OUTPUT, handleScriptOutput),
      websocketService.on(WS_EVENTS.SCRIPT_END, handleScriptEnd),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [websocketService, state.runId, handleScriptError, handleScriptOutput, handleScriptEnd]);

  //--------------------------------------------------------------------------------
  // Subsection 2.6: Computed Properties & Return Interface
  //--------------------------------------------------------------------------------
  const duration = state.startTime && state.endTime ? new Date(state.endTime).getTime() - new Date(state.startTime).getTime() : null;
  return { ...state, duration, runScript, resetState };
};

// ================================================================================
//
// HOOK: useWebSocket (REVISED AND FIXED FOR STRICTMODE)
//
// ROLE: This is the core hook responsible for the application's WebSocket connection.
//       It has been redesigned to be "StrictMode-proof." It initializes the
//       connection once and then acts as a reactive listener to the singleton
//       `websocketService`, providing stable state to the rest of the app.
//
// ================================================================================
export const useWebSocket = (options = {}) => {
  const config = { ...DEFAULT_WS_CONFIG, ...options };

  // --------------------------------------------------------------------------------
  // Subsection 3.1: Reactive State Management
  // --------------------------------------------------------------------------------
  // This state mirrors the singleton service's status, making it available
  // reactively to any component that uses this hook.
  const [connectionState, setConnectionState] = useState({
    isConnected: websocketService.isConnected,
    clientId: websocketService.clientId,
    connectionError: null,
  });

  // --------------------------------------------------------------------------------
  // Subsection 3.2: Event Handlers
  // --------------------------------------------------------------------------------
  // These callback functions are memoized with `useCallback` to ensure they have a
  // stable identity, preventing unnecessary re-renders in child components. They
  // are responsible for updating the hook's state when the service emits an event.

  const handleConnected = useCallback(() => {
    console.log("🟢 [HOOK] Service reported: Connected");
    setConnectionState({ isConnected: true, connectionError: null, clientId: websocketService.clientId });
  }, []);

  const handleDisconnected = useCallback(() => {
    console.log("🔴 [HOOK] Service reported: Disconnected");
    setConnectionState({ isConnected: false, connectionError: 'Disconnected', clientId: null });
  }, []);

  const handleClientId = useCallback(({ clientId }) => {
    console.log(`🆔 [HOOK] Service reported: Client ID assigned (${clientId})`);
    setConnectionState(prev => ({ ...prev, clientId }));
  }, []);

  const handleError = useCallback((data) => {
    console.error("❌ [HOOK] Service reported: Error", data);
    setConnectionState(prev => ({ ...prev, isConnected: false, connectionError: data.error }));
  }, []);

  // --------------------------------------------------------------------------------
  // Subsection 3.3: The StrictMode-Proof `useEffect`
  // --------------------------------------------------------------------------------
  // This is the most critical part of the fix. This effect runs only when necessary
  // and its cleanup function is carefully designed to be safe for StrictMode.
  useEffect(() => {
    console.log("🔔 [HOOK] Setting up WebSocket listeners and connection...");

    // Subscribe to all necessary events from the singleton service.
    // The `on` method returns an `unsubscribe` function, which we store.
    const unsubscribers = [
      websocketService.on(WS_EVENTS.CONNECTED, handleConnected),
      websocketService.on(WS_EVENTS.DISCONNECTED, handleDisconnected),
      websocketService.on(WS_EVENTS.CLIENT_ID, handleClientId),
      websocketService.on(WS_EVENTS.ERROR, handleError),
    ];

    // If auto-connect is enabled, we ensure a connection is attempted.
    // Your service's `connect` method is idempotent (it won't create a new
    // connection if one already exists or is in progress), making this call safe.
    if (config.autoConnect) {
      websocketService.connect(config.wsUrl);
    }

    // ✨ KEY FIX: The Cleanup Function
    // This function is called by React when the component unmounts. In StrictMode,
    // this happens immediately after the first mount.
    // We now ONLY clean up the listeners for this specific hook instance.
    // We DO NOT call `websocketService.disconnect()`, which leaves the underlying
    // connection intact and prevents the 1006 error.
    return () => {
      console.log("🧹 [HOOK] Cleaning up WebSocket listeners ONLY. The connection will persist.");
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [config.autoConnect, config.wsUrl, handleConnected, handleDisconnected, handleClientId, handleError]);

  // --------------------------------------------------------------------------------
  // Subsection 3.4: Return API
  // --------------------------------------------------------------------------------
  // Expose the reactive state and the service instance itself for components to use.
  return {
    ...connectionState,
    // Providing direct access to the service allows components to call methods
    // like `.send()`, `.runScript()`, or `.applyTemplate()` directly.
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
