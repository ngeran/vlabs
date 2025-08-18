/**
 * =============================================================================
 * FILE:               src/hooks/useValidationWorkflow.jsx
 *
 * DESCRIPTION:
 *   A custom React hook to manage the entire workflow for the JSNAPy Validation
 *   Runner. It encapsulates state management, test discovery, and script
 *   execution logic, acting as the bridge between the UI and the backend service.
 *
 * OVERVIEW:
 *   This hook centralizes the logic for the ValidationRunner component. It uses
 *   a reducer for predictable state management of the execution lifecycle, handles
 *   real-time updates via WebSockets, and interacts with the backend through the
 *   ValidationApiService. By taking a `scriptId` as an argument, it becomes a
 *   reusable piece of logic for any script-based validation.
 *
 * KEY FEATURES:
 *   - Manages execution state (running, complete, error) with a robust reducer.
 *   - Handles the full stream of WebSocket events for real-time UI updates.
 *   - Fetches available JSNAPy tests from the backend using ValidationApiService.
 *   - Provides a clean, reusable, and fully documented interface for the parent component.
 *
 * MODIFICATIONS:
 *   - The `PROCESS_RESULT` action in the reducer has been significantly improved
 *     to be more robust. It now correctly unwraps the final result object
 *     regardless of whether it's nested inside a `data` property or sent as the
 *     top-level payload. This fixes a critical bug where the application would
 *     crash on successful test runs due to an inconsistent state shape.
 * =============================================================================
 */

// =============================================================================
// SECTION 1: IMPORTS
// =============================================================================
import { useReducer, useCallback, useEffect, useState } from "react";
import ValidationApiService from "../services/ValidationApiService";

// =============================================================================
// SECTION 2: REDUCER FOR STATE MANAGEMENT
//
// DESCRIPTION:
//   Manages the complex state transitions of a validation run. Using a reducer
//   ensures that state changes are predictable and easy to debug. Each action
//   corresponds to a specific event in the validation lifecycle.
// =============================================================================
const progressReducer = (state, action) => {
  switch (action.type) {
    // Action: START_EXECUTION
    // Resets the state to its initial values for a new run.
    case "START_EXECUTION":
      return {
        ...state,
        isRunning: true,
        isComplete: false,
        hasError: false,
        progress: [],
        result: null,
        error: null,
        latestMessage: null
      };

    // Action: PROCESS_PROGRESS
    // Appends a new progress message from the WebSocket to the progress array.
    case "PROCESS_PROGRESS": {
      const newProgress = [...state.progress, { id: Date.now() + Math.random(), ...action.payload }];
      return { ...state, progress: newProgress, latestMessage: action.payload };
    }

    // =======================================================================
    // ACTION: PROCESS_RESULT (CRITICAL FIX IMPLEMENTED HERE)
    //
    // This action handles the final result payload from the backend. The logic
    // is designed to be robust and defensive, ensuring that the `state.result`
    // is always a clean, consistent object, which prevents downstream components
    // from crashing due to unexpected data structures.
    // =======================================================================
    case "PROCESS_RESULT": {
      // Start with the raw payload from the WebSocket message.
      let finalResult = action.payload;

      // STEP 1: Unwrap the data if it's nested.
      // Backends sometimes wrap the final result in a `data` key, like:
      // { "type": "result", "data": { "results_by_host": [...] } }
      // This checks for that `data` key and, if it exists, uses its content
      // as the actual result.
      if (finalResult.data && typeof finalResult.data === 'object') {
        finalResult = finalResult.data;
      }

      // STEP 2: Clean the final result object.
      // The payload might still contain the WebSocket message `type` property,
      // which is not part of the actual result data. We remove it to ensure
      // `state.result` contains only the pure validation results.
      if ('type' in finalResult) {
          const { type, ...rest } = finalResult; // Use object destructuring to omit 'type'
          finalResult = rest;
      }

      // STEP 3: Update the state with the cleaned, consistent result.
      return {
        ...state,
        isRunning: false,
        isComplete: true,
        hasError: false,
        // `result` is now guaranteed to be the clean object, e.g., { results_by_host: [...] }
        result: finalResult
      };
    }

    // Action: PROCESS_ERROR
    // Handles any error messages sent from the backend via WebSocket.
    case "PROCESS_ERROR":
      return {
        ...state,
        isRunning: false,
        isComplete: true,
        hasError: true,
        error: action.payload.message
      };

    // Action: RESET_STATE
    // Clears all execution data, allowing the user to start a new run.
    case "RESET_STATE":
      return {
        isRunning: false,
        isComplete: false,
        hasError: false,
        progress: [],
        result: null,
        error: null,
        latestMessage: null
      };

    // Default case to prevent state from becoming undefined if an unknown action is dispatched.
    default:
      return state;
  }
};

// =============================================================================
// SECTION 3: HOOK DEFINITION
// =============================================================================
/**
 * A custom hook to manage the JSNAPy validation workflow.
 *
 * @param {object} wsContext - The context object from the useWebSocket hook, providing the websocketService and clientId.
 * @param {string} scriptId - The unique identifier for the script being run (e.g., 'jsnapy_validation').
 * @returns {object} An object containing the execution state and functions to control the workflow.
 */
export function useValidationWorkflow(wsContext, scriptId) {
  // State for the execution lifecycle, managed by the reducer defined above.
  const [executionState, dispatch] = useReducer(progressReducer, {
    isRunning: false,
    isComplete: false,
    hasError: false,
    progress: [],
    result: null,
    error: null,
    latestMessage: null,
  });

  // State specifically for the test discovery process.
  const [categorizedTests, setCategorizedTests] = useState({});
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState(null);

  /**
   * Effect to discover available JSNAPy tests when the component mounts or scriptId changes.
   * This calls the backend API to fetch the list of tests.
   */
  useEffect(() => {
    // Do not proceed if the scriptId is not yet available, preventing unnecessary API calls.
    if (!scriptId) return;

    const discoverTests = async () => {
      setIsDiscovering(true);
      setDiscoveryError(null);
      try {
        // Fetch the categorized list of tests from the backend API.
        const tests = await ValidationApiService.discoverTests(scriptId);
        setCategorizedTests(tests);
      } catch (err) {
        console.error("Failed to discover tests:", err);
        setDiscoveryError(err.message);
      } finally {
        setIsDiscovering(false);
      }
    };
    discoverTests();
  }, [scriptId]); // This effect re-runs if the scriptId prop changes.

  /**
   * Effect to set up the WebSocket listener for real-time updates from the backend.
   * This is the core of the real-time feedback mechanism.
   */
  useEffect(() => {
    // Ensure the WebSocket service is available before subscribing.
    if (!wsContext?.websocketService) return;

    const service = wsContext.websocketService;

    // The handler function that processes incoming WebSocket messages.
    const handleMessage = (message) => {
      if (!message || !message.type) return; // Ignore malformed messages.

      // Dispatch different actions to the reducer based on the message type.
      switch (message.type.toLowerCase()) {
        case "progress":
          dispatch({ type: "PROCESS_PROGRESS", payload: message });
          break;
        case "result":
          dispatch({ type: "PROCESS_RESULT", payload: message });
          break;
        case "error":
          dispatch({ type: "PROCESS_ERROR", payload: message });
          break;
        default:
          // Ignore any unknown message types.
          break;
      }
    };

    // Subscribe to the 'message' event on the WebSocket service.
    service.on("message", handleMessage);

    // Cleanup function: Unsubscribe from the event when the component unmounts
    // or when the wsContext changes. This is crucial to prevent memory leaks.
    return () => service.off("message", handleMessage);
  }, [wsContext]); // This effect re-runs if the wsContext object changes.

  /**
   * A memoized function to initiate the JSNAPy validation script execution.
   * This is exposed to the UI component to be called when the user clicks "Run".
   * @param {object} params - The parameters for the script (hostname, credentials, tests, etc.).
   */
  const runValidationScript = useCallback(async (params) => {
    // Pre-flight check: ensure the WebSocket is connected and has a client ID.
    if (!wsContext?.clientId) {
      dispatch({ type: "PROCESS_ERROR", payload: { message: "WebSocket is not connected." } });
      return;
    }

    // Reset state and signal the start of execution.
    dispatch({ type: "START_EXECUTION" });

    try {
      // Call the backend API to start the script, passing the parameters and client ID.
      await ValidationApiService.runScript(scriptId, params, wsContext.clientId);
    } catch (err) {
      // If the initial API call fails (e.g., network error), dispatch an error.
      console.error("Failed to start validation script:", err);
      dispatch({ type: "PROCESS_ERROR", payload: { message: err.message } });
    }
  }, [wsContext, scriptId]); // Memoized with dependencies to avoid re-creation on every render.

  /**
   * A memoized function to reset the execution state, allowing the user to run again.
   */
  const resetExecution = useCallback(() => {
    dispatch({ type: "RESET_STATE" });
  }, []); // No dependencies, so this function is created only once.

  // Expose all state and functions needed by the UI component.
  return {
    executionState,
    runValidationScript,
    resetExecution,
    categorizedTests,
    isDiscovering,
    discoveryError,
  };
}
