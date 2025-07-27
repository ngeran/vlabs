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

  // --- START OF FIX: Add new event types ---
  SCRIPT_START: "script_start",
  PROGRESS_UPDATE: "progress_update",
  FINAL_RESULT: "final_result",
  // --- END OF FIX ---

  // Generic script execution events from your service
  SCRIPT_ERROR: "script_error",
  SCRIPT_OUTPUT: "script_output",
  SCRIPT_END: "script_end",

  // Specialized template application events from your service
  STATUS: "status",
  PROGRESS: "progress", // <-- MAKE SURE THIS IS "progress"
  COMMIT_PROGRESS: "commit_progress",
  INFO: "info",
  RESULT: "result", // <-- MAKE SURE THIS IS "result"
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
// =================================================================================================
//
// HOOK: useScriptRunnerStream (REVISED FOR USER-FRIENDLY MESSAGE HANDLING)
//
// =================================================================================================
//
// OVERVIEW:
//   This hook is the central state machine for managing script executions. It has been updated
//   to solve the problem of verbose and unfriendly log messages cluttering the UI.
//
// KEY FIX IMPLEMENTED (ISSUE #2):
//   - A revised `handleProgress` event handler now intelligently categorizes all incoming
//     data from the WebSocket stream.
//   - Structured JSON messages (created by our Python script's `send_event` function) are
//     parsed and treated as first-class, user-facing events.
//   - All other text-based output (like the noisy `[PY-DEBUG]` logs from PyEZ) is
//     captured and wrapped into a standard object with a special type: `LOG_MESSAGE`.
//   - This categorization allows the frontend UI components to easily filter the stream,
//     showing only the clean, important milestones to the user by default, while retaining
//     the full, verbose output for an optional debug view.
//
// =================================================================================================
export const useScriptRunnerStream = (wsContext = {}, options = {}) => {
  const { websocketService, isConnected, clientId } = wsContext;

  // -----------------------------------------------------------------------------------------------
  // SECTION 1: STATE MANAGEMENT
  // -----------------------------------------------------------------------------------------------
  // Manages the complete lifecycle of a script run, including its current state (idle, running,
  // etc.), all received events, and the final result or error.
  const [state, setState] = useState({
    runId: null,
    currentState: SCRIPT_STATES.IDLE,
    isRunning: false,
    isComplete: false,
    progressEvents: [],
    finalResult: null,
    error: null,
    startTime: null,
    endTime: null,
    exitCode: null,
  });

  // -----------------------------------------------------------------------------------------------
  // SECTION 2: CORE CONTROL FUNCTIONS
  // -----------------------------------------------------------------------------------------------
  // These functions provide the public API for components to interact with the hook,
  // allowing them to start a new run or reset the state.
  const resetState = useCallback(() => {
    setState({
      runId: null,
      currentState: SCRIPT_STATES.IDLE,
      isRunning: false,
      isComplete: false,
      progressEvents: [],
      finalResult: null,
      error: null,
      startTime: null,
      endTime: null,
      exitCode: null,
    });
  }, []);

  const runScript = useCallback(async (scriptData) => {
    if (!isConnected || !clientId) {
      const errorMsg = "WebSocket is not connected.";
      setState(prev => ({
        ...prev,
        error: errorMsg,
        isComplete: true,
        currentState: SCRIPT_STATES.FAILED
      }));
      throw new Error(errorMsg);
    }
    const runId = generateUniqueId();
    resetState();
    setState(prev => ({
      ...prev,
      isRunning: true,
      currentState: SCRIPT_STATES.RUNNING,
      runId,
      startTime: new Date().toISOString()
    }));
    try {
      return await websocketService.runScript({ ...scriptData, runId });
    } catch (error) {
      setState(prev => ({
        ...prev,
        isRunning: false,
        isComplete: true,
        currentState: SCRIPT_STATES.FAILED,
        error: error.message,
        endTime: new Date().toISOString()
      }));
      throw error;
    }
  }, [isConnected, clientId, websocketService, resetState]);

  // -----------------------------------------------------------------------------------------------
  // SECTION 3: UNIFIED EVENT HANDLERS (WITH MESSAGE CATEGORIZATION)
  // -----------------------------------------------------------------------------------------------
  // These handlers are the heart of the hook, listening to WebSocket messages and updating
  // the state accordingly.
  const handleScriptStart = useCallback((data) => {
    // Reset the state from any previous run.
    resetState();
    // Set the core state to "running" and capture the runId and start time.
    setState(prev => ({
      ...prev,
      isRunning: true,
      currentState: SCRIPT_STATES.RUNNING,
      runId: data.runId,
      startTime: new Date().toISOString(),
      // We start with an empty progressEvents array now.
      progressEvents: [],
    }));
  }, [resetState]); // The dependency is correct.
  // ===============================================================================================
  // =============================================================================================
//
//  DEFINITIVE & FINAL HANDLER: handleProgress
//
//  OVERVIEW:
//    This is the final, correct implementation, validated by the debug logs. It works
//    by establishing a clear order of operations that handles both script runner types.
//
//  THE LOGIC:
//    1. IT CHECKS FOR "DIRECT EVENTS" FIRST: It immediately inspects the parent `data`
//       object for an `event_type`. This correctly processes all messages from the
//       Backup/Restore runner without any unnecessary parsing.
//
//    2. IT FALLS BACK TO "WRAPPED EVENTS": Only if the message is not a direct event does
//       it look inside `data.message` to find JSON. This correctly handles the
//       File Uploader and any other generic log output.
//
// =============================================================================================
const handleProgress = useCallback((data) => {
  setState(prevState => {
    // Section 1: Run Validation (No changes)
    if (!prevState.runId || data.runId !== prevState.runId) {
      return prevState;
    }

    let eventsToAdd = [];

    // ---------------------------------------------------------------------------------
    // SECTION 2: THE CORRECT LOGIC
    // ---------------------------------------------------------------------------------

    // --- PRIORITY #1: Check for a "Direct Event" (for Backup/Restore) ---
    // If the top-level data object itself has an event_type, we know it's a clean,
    // pre-parsed event. We trust it completely and add it.
    if (data.event_type) {
      eventsToAdd.push(data);
    }
    // --- PRIORITY #2: Fallback for "Wrapped Events" or Logs (for File Uploader) ---
    // If it's not a direct event, we then check inside the `message` property.
    else if (data.message) {
      const lines = data.message.trim().split('\n');
      for (const line of lines) {
        if (!line) continue; // Skip empty lines

        // We use the robust parsing logic that handles prefixes.
        const firstBraceIndex = line.indexOf('{');
        let parsedJson = null;

        if (firstBraceIndex !== -1) {
          parsedJson = safeJsonParse(line.substring(firstBraceIndex));
        }

        // Case 2a: The line contained a valid, wrapped event.
        if (parsedJson && parsedJson.event_type) {
          eventsToAdd.push({ ...parsedJson, runId: data.runId });
        }
        // Case 2b: The line is a generic log or a final result object.
        else {
          eventsToAdd.push({
            type: 'progress',
            level: data.level || 'INFO',
            message: line,
            timestamp: new Date().toISOString(),
            event_type: 'LOG_MESSAGE', // Classify for the debug view.
            runId: data.runId,
          });
        }
      }
    }

    if (eventsToAdd.length === 0) {
      return prevState;
    }

    // Section 3: Immutable State Update (No changes)
    return {
      ...prevState,
      progressEvents: [...prevState.progressEvents, ...eventsToAdd],
    };
  });
}, []);
  // ===============================================================================================
  //                               HANDLE RESULTS
  // ===============================================================================================
  const handleResult = useCallback((data) => {
    setState(prevState => (prevState.runId && data.runId === prevState.runId)
      ? { ...prevState, finalResult: data.output }
      : prevState
    );
  }, []);

  const handleScriptEnd = useCallback((data) => {
    setState(prevState => {
      if (prevState.runId && data.runId === prevState.runId) {
        const finalResultEvent = prevState.progressEvents.find(e => e.success === true || e.success === false);
        return {
          ...prevState,
          isRunning: false,
          isComplete: true,
          finalResult: prevState.finalResult || finalResultEvent,
          exitCode: data.exitCode,
          currentState: (data.exitCode === 0 && !prevState.error) ? SCRIPT_STATES.COMPLETED : SCRIPT_STATES.FAILED,
          endTime: new Date().toISOString(),
        };
      }
      return prevState;
    });
  }, []);

  // -----------------------------------------------------------------------------------------------
  // SECTION 4: EFFECT HOOK FOR EVENT SUBSCRIPTION
  // -----------------------------------------------------------------------------------------------
  // This effect hook connects the event handlers to the WebSocket service when the component mounts
  // and cleans up the subscriptions when it unmounts.
  useEffect(() => {
    if (!websocketService) return;

    // Map WebSocket event names to their corresponding handlers.
    const eventMap = {
      [WS_EVENTS.SCRIPT_START]: handleScriptStart,
      [WS_EVENTS.PROGRESS]: handleProgress, // Uses the new, smarter handler
      [WS_EVENTS.RESULT]: handleResult,
      [WS_EVENTS.SCRIPT_END]: handleScriptEnd,
      // You could add error handling here as well
    };

    // Subscribe to each event and store the returned unsubscribe function.
    const unsubscribers = Object.entries(eventMap).map(([eventName, handler]) => {
      return websocketService.on(eventName, handler);
    });

    // Return a cleanup function that runs on unmount.
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [websocketService, handleScriptStart, handleProgress, handleResult, handleScriptEnd]);

  // -----------------------------------------------------------------------------------------------
  // SECTION 5: RETURNED API
  // -----------------------------------------------------------------------------------------------
  // Exposes the complete state and control functions to the consuming component.
  return { ...state, runScript, resetState };
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
    setConnectionState({
      isConnected: true,
      connectionError: null,
      clientId: websocketService.clientId
    });
  }, []);

  const handleDisconnected = useCallback(() => {
    console.log("🔴 [HOOK] Service reported: Disconnected");
    setConnectionState({
      isConnected: false,
      connectionError: 'Disconnected',
      clientId: null
    });
  }, []);

  const handleClientId = useCallback(({ clientId }) => {
    console.log(`🆔 [HOOK] Service reported: Client ID assigned (${clientId})`);
    setConnectionState(prev => ({ ...prev, clientId }));
  }, []);

  const handleError = useCallback((data) => {
    console.error("❌ [HOOK] Service reported: Error", data);
    setConnectionState(prev => ({
      ...prev,
      isConnected: false,
      connectionError: data.error
    }));
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
    setApplicationState({
      isApplying: false,
      isComplete: false,
      progress: null,
      result: null,
      error: null,
      duration: null
    });
  }, []);

  const applyTemplate = useCallback(async (templateData) => {
    if (!isConnected || !websocketService) {
      throw new Error("WebSocket connection not available.");
    }
    resetState();
    setApplicationState(prev => ({
      ...prev,
      isApplying: true,
      startTime: performance.now()
    }));
    try {
      return await websocketService.applyTemplate({
        ...templateData,
        wsClientId: clientId
      });
    } catch (error) {
      setApplicationState(prev => ({
        ...prev,
        isApplying: false,
        isComplete: true,
        error: error.message
      }));
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
