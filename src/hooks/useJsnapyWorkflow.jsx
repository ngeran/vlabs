// =============================================================================
// FILE:               src/hooks/useJsnapyWorkflow.jsx
//
// DESCRIPTION:
//   Custom React hook for managing the JSNAPy Runner workflow, including parameter
//   state, test discovery, and script execution.
//
// OVERVIEW:
//   This hook encapsulates the state and logic for the JSNAPy Runner, including
//   WebSocket communication, test discovery, and script execution. It uses
//   JsnapyApiService for API calls and provides a clean interface for components.
//
// KEY FEATURES:
//   - Manages execution state with a reducer that handles progress, results, and errors.
//   - Correctly handles the entire WebSocket event stream. The 'result' message is
//     treated as a completion event to ensure state is updated atomically.
//   - Fetches discoverable tests using JsnapyApiService.
//   - Provides parameter management and script execution logic.
//   - Maps progress events to a format expected by the RealTimeDisplay component.
//
// DEPENDENCIES:
//   - react: For hooks (useReducer, useCallback, useEffect, useState).
//   - JsnapyApiService: For API calls.
// =============================================================================


// =============================================================================
// SECTION 1: IMPORTS
// =============================================================================
import { useReducer, useCallback, useEffect, useState } from "react";
import JsnapyApiService from "../services/JsnapyApiService.js";

// =============================================================================
// SECTION 2: CONSTANTS
// =============================================================================
const JSNAPY_SCRIPT_ID = "jsnapy_runner";

// =============================================================================
// SECTION 3: REDUCER (FINAL CORRECTED VERSION)
// =============================================================================
/**
 * Reducer for managing execution state.
 * @param {Object} state - Current state.
 * @param {Object} action - Action to process.
 * @returns {Object} New state.
 */
const progressReducer = (state, action) => {
  switch (action.type) {
    case "START_EXECUTION":
      return {
        ...state,
        isRunning: true,
        isComplete: false,
        hasError: false,
        progress: [],
        result: null,
        error: null,
        completedSteps: 0,
        progressPercentage: 0,
        latestMessage: null,
      };
    case "PROCESS_PROGRESS": {
      const newPayload = {
        message: action.payload.message,
        level: action.payload.event_type === "STEP_COMPLETE" ? "success" :
               action.payload.event_type === "ERROR" ? "error" : "info",
        timestamp: new Date().toISOString(),
        step: action.payload.data?.step,
        id: Date.now() + Math.random(),
      };
      const newProgress = [...state.progress, newPayload];
      let { totalSteps } = state;

      if (action.payload.event_type === "OPERATION_START") {
        totalSteps = action.payload.data?.total_steps || 0;
      }

      const completedSteps = newProgress.reduce((max, p) => {
        return p.level === "success" && p.step > max ? p.step : max;
      }, 0);

      const progressPercentage = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : state.progressPercentage;

      return {
        ...state,
        progress: newProgress,
        latestMessage: action.payload,
        totalSteps,
        completedSteps,
        progressPercentage,
      };
    }
    // =========================================================================
    // THE CRITICAL FIX IS HERE
    // The 'result' message now marks the execution as complete AND sets the result
    // data in a single, atomic update. This ensures the UI has all the information
    // it needs to render the final state correctly in one render cycle.
    // =========================================================================
    case "PROCESS_RESULT":
      return {
        ...state,
        isRunning: false,
        isComplete: true,
        hasError: false,
        result: action.payload.data?.data || action.payload.data || action.payload,
        progressPercentage: 100,      // Mark progress as 100%
      };
    case "PROCESS_ERROR":
      return {
        ...state,
        isRunning: false,
        isComplete: true,
        hasError: true,
        error: { message: action.payload.message, details: action.payload.error },
      };
    // This case now acts as a fallback for scripts that might end without sending
    // a result message. It finalizes the state without overwriting any result
    // data that might have already been received.
    case "FINALIZE_EXECUTION":
      return {
        ...state,
        isRunning: false,
        isComplete: true,
        progressPercentage: 100,
      };
    case "RESET_STATE":
      return {
        ...state,
        isRunning: false,
        isComplete: false,
        hasError: false,
        progress: [],
        result: null,
        error: null,
        totalSteps: 0,
        completedSteps: 0,
        progressPercentage: 0,
        latestMessage: null,
      };
    default:
      return state;
  }
};

// =============================================================================
// SECTION 4: HOOK DEFINITION
// =============================================================================
/**
 * Manages the JSNAPy Runner workflow.
 * @param {Object} wsContext - WebSocket context.
 * @returns {Object} Hook values and functions.
 */
export function useJsnapyWorkflow(wsContext) {
  // Execution state
  const [executionState, dispatch] = useReducer(progressReducer, {
    isRunning: false,
    isComplete: false,
    hasError: false,
    progress: [],
    result: null,
    error: null,
    totalSteps: 0,
    completedSteps: 0,
    progressPercentage: 0,
    latestMessage: null,
  });

  // Test discovery and parameter state
  const [categorizedTests, setCategorizedTests] = useState({});
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState(null);
  const [parameters, setParameters] = useState({
    hostname: "",
    inventory_file: "",
    username: "root",
    password: "",
    environment: "development",
    tests: [],
  });
  const [wsConnectionStatus, setWsConnectionStatus] = useState("unknown");

  // =============================================================================
  // SECTION 5: TEST DISCOVERY
  // =============================================================================
  useEffect(() => {
    const discoverTests = async () => {
      setIsDiscovering(true);
      setDiscoveryError(null);
      setCategorizedTests({});
      try {
        const tests = await JsnapyApiService.discoverTests(JSNAPY_SCRIPT_ID, parameters.environment);
        setCategorizedTests(tests);
      } catch (err) {
        setDiscoveryError(err.message);
      } finally {
        setIsDiscovering(false);
      }
    };
    discoverTests();
  }, [parameters.environment]);

  // =============================================================================
  // SECTION 6: WEBSOCKET LISTENER (CORRECTED)
  // =============================================================================
  useEffect(() => {
    if (!wsContext || !wsContext.websocketService) {
      setWsConnectionStatus("no-context");
      return;
    }

    const service = wsContext.websocketService;
    setWsConnectionStatus(service.isConnected ? "connected" : "disconnected");

    const handleMessage = (message) => {
      if (!message || !message.type) return;

      switch (message.type.toLowerCase()) {
        case "progress":
          dispatch({ type: "PROCESS_PROGRESS", payload: message });
          break;
        // The 'result' message dispatches the action that now marks the run as complete.
        case "result":
          dispatch({ type: "PROCESS_RESULT", payload: message });
          break;
        case "error":
          dispatch({ type: "PROCESS_ERROR", payload: message });
          break;
        // The 'script_end' message provides a fallback to finalize the state.
        case "script_end":
          dispatch({ type: "FINALIZE_EXECUTION" });
          break;
        default:
          console.log(`[useJsnapyWorkflow] Unknown message type: ${message.type}`);
      }
    };

    const handleOpen = () => {
      setWsConnectionStatus("connected");
    };
    const handleClose = () => {
      setWsConnectionStatus("closed");
    };

    service.on("progress", handleMessage);
    service.on("result", handleMessage);
    service.on("error", handleMessage);
    service.on("script_end", handleMessage);
    service.on("open", handleOpen);
    service.on("close", handleClose);

    return () => {
      service.off("progress", handleMessage);
      service.off("result", handleMessage);
      service.off("error", handleMessage);
      service.off("script_end", handleMessage);
      service.off("open", handleOpen);
      service.off("close", handleClose);
    };
  }, [wsContext]);

  // =============================================================================
  // SECTION 7: EXECUTION LOGIC
  // =============================================================================
  /**
   * Executes the JSNAPy script.
   * @param {Object} allParams - Script parameters.
   */
  const runJsnapyScript = useCallback(
    async (allParams) => {
      if (!wsContext || !wsContext.clientId) {
        dispatch({ type: "PROCESS_ERROR", payload: { message: "WebSocket is not connected or clientId is missing" } });
        return;
      }

      dispatch({ type: "START_EXECUTION" });

      try {
        await JsnapyApiService.runScript(JSNAPY_SCRIPT_ID, allParams, wsContext.clientId);
      } catch (err) {
        dispatch({ type: "PROCESS_ERROR", payload: { message: err.message } });
      }
    },
    [wsContext]
  );

  /**
   * Resets execution state.
   */
  const resetExecution = useCallback(() => {
    dispatch({ type: "RESET_STATE" });
  }, []);

  // =============================================================================
  // SECTION 8: RETURN VALUES
  // =============================================================================
  return {
    executionState,
    runJsnapyScript,
    resetExecution,
    categorizedTests,
    isDiscovering,
    discoveryError,
    parameters,
    setParameters,
    wsConnectionStatus,
    isWsConnected: wsConnectionStatus === "connected",
  };
}
