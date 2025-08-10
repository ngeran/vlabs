// =============================================================================
// FILE:               src/hooks/useValidationWorkflow.jsx
//
// DESCRIPTION:
//   A custom React hook that encapsulates the entire business logic and state
//   management for the JSNAPy Validation Runner.
//
// KEY FEATURES:
//   - Manages execution state (running, complete, error) via a predictable reducer.
//   - Handles real-time progress updates received via WebSockets.
//   - Interfaces with ValidationApiService to perform backend operations.
//   - Provides a clean, declarative API for the ValidationRunner component.
//
// DEPENDENCIES:
//   - react: Core hooks (useReducer, useCallback, useEffect, useState).
//   - ValidationApiService: The service for backend communication.
//
// HOW TO USE:
//   Instantiate this hook within the ValidationRunner component to get access to
//   all necessary state and action dispatchers.
//   `const { executionState, runValidationScript, ... } = useValidationWorkflow(wsContext);`
// =============================================================================

// =============================================================================
// SECTION 1: IMPORTS
// =============================================================================
import { useReducer, useCallback, useEffect, useState } from "react";
import ValidationApiService from "../services/ValidationApiService";

// =============================================================================
// SECTION 2: STATE MANAGEMENT REDUCER
// =============================================================================
/**
 * A reducer to manage the complex state of a script execution lifecycle.
 * @param {object} state - The current state.
 * @param {object} action - The dispatched action.
 * @returns The new state.
 */
const progressReducer = (state, action) => {
  switch (action.type) {
    case "START_EXECUTION":
      return { ...state, isRunning: true, isComplete: false, hasError: false, progress: [], result: null, error: null, latestMessage: null };
    case "PROCESS_PROGRESS":
      return { ...state, progress: [...state.progress, action.payload], latestMessage: action.payload };
    case "PROCESS_RESULT":
      return { ...state, isRunning: false, isComplete: true, hasError: false, result: action.payload.data };
    case "PROCESS_ERROR":
      return { ...state, isRunning: false, isComplete: true, hasError: true, error: action.payload.message };
    case "RESET_STATE":
      return { isRunning: false, isComplete: false, hasError: false, progress: [], result: null, error: null, latestMessage: null };
    default:
      return state;
  }
};

const initialState = {
  isRunning: false, isComplete: false, hasError: false, progress: [], result: null, error: null, latestMessage: null
};

// =============================================================================
// SECTION 3: HOOK DEFINITION
// =============================================================================
export function useValidationWorkflow(wsContext) {
  const [executionState, dispatch] = useReducer(progressReducer, initialState);
  const [categorizedTests, setCategorizedTests] = useState({});
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState(null);

  // --- Effect for discovering available tests on mount ---
  useEffect(() => {
    const discover = async () => {
      setIsDiscovering(true);
      setDiscoveryError(null);
      try {
        const tests = await ValidationApiService.discoverTests();
        setCategorizedTests(tests);
      } catch (e) {
        setDiscoveryError(e.message);
        console.error(e);
      }
      setIsDiscovering(false);
    };
    discover();
  }, []);

  // --- Effect for handling incoming WebSocket messages ---
  useEffect(() => {
    if (!wsContext?.websocketService) return;
    const service = wsContext.websocketService;
    const handleMessage = (message) => {
      if (!message || !message.type) return;
      switch (message.type.toLowerCase()) {
        case "progress": dispatch({ type: "PROCESS_PROGRESS", payload: message }); break;
        case "result": dispatch({ type: "PROCESS_RESULT", payload: message }); break;
        case "error": dispatch({ type: "PROCESS_ERROR", payload: message }); break;
      }
    };
    service.on("message", handleMessage);
    return () => service.off("message", handleMessage);
  }, [wsContext]);

  // --- Action to run the validation script ---
  const runValidationScript = useCallback(async (params) => {
    if (!wsContext?.clientId) {
      dispatch({ type: "PROCESS_ERROR", payload: { message: "WebSocket is not connected." }});
      return;
    }
    dispatch({ type: "START_EXECUTION" });
    try {
        await ValidationApiService.runScript(params, wsContext.clientId);
    } catch (err) {
        dispatch({ type: "PROCESS_ERROR", payload: { message: err.message }});
    }
  }, [wsContext]);

  // --- Action to reset the execution state ---
  const resetExecution = useCallback(() => dispatch({ type: "RESET_STATE" }), []);

  // --- Return the public API of the hook ---
  return {
    executionState,
    runValidationScript,
    resetExecution,
    categorizedTests,
    isDiscovering,
    discoveryError,
  };
}
