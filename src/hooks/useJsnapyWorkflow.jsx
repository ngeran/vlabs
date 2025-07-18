// src/hooks/useJsnapyWorkflow.jsx
import { useReducer, useCallback, useEffect, useState } from 'react';

const API_BASE_URL = "http://localhost:3001";
// FIX: Define the correct script ID as a constant to prevent future typos.
// This ID must match the 'id' field in your python_pipeline/scripts.yaml
const JSNAPY_SCRIPT_ID = "jsnapy_runner";

// ====================================================================================
// SECTION 1: STATE MANAGEMENT (REDUCER)
// ====================================================================================
// This reducer manages the complex state of a script's execution lifecycle.
// It is a robust pattern that ensures predictable state updates.

const progressReducer = (state, action) => {
  switch (action.type) {
    case 'START_EXECUTION':
      return { ...state, isRunning: true, isComplete: false, hasError: false, progress: [], result: null, error: null, completedSteps: 0, progressPercentage: 0 };
    case 'PROCESS_PROGRESS': {
      const newProgress = [...state.progress, action.payload];
      let { totalSteps, completedSteps } = state;
      if (action.payload.event_type === 'OPERATION_START') totalSteps = action.payload.data?.total_steps || 0;
      if (action.payload.event_type === 'STEP_COMPLETE') completedSteps = Math.min((state.completedSteps || 0) + 1, totalSteps);
      const progressPercentage = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : state.progressPercentage;
      return { ...state, progress: newProgress, latestMessage: action.payload, totalSteps, completedSteps, progressPercentage };
    }
    case 'PROCESS_RESULT':
      return { ...state, isRunning: false, isComplete: true, hasError: false, result: action.payload.data, progressPercentage: 100 };
    case 'PROCESS_ERROR':
      return { ...state, isRunning: false, isComplete: true, hasError: true, error: { message: action.payload.message, details: action.payload.error } };
    case 'RESET_STATE':
      return { ...state, isRunning: false, isComplete: false, hasError: false, progress: [], result: null, error: null, totalSteps: 0, completedSteps: 0, progressPercentage: 0, latestMessage: null };
    default:
      return state;
  }
};


// ====================================================================================
// SECTION 2: THE MAIN HOOK DEFINITION
// ====================================================================================

export function useJsnapyWorkflow(wsContext) {
  // --- STATE AND HOOKS ---
  const [executionState, dispatch] = useReducer(progressReducer, {
    isRunning: false, isComplete: false, hasError: false, progress: [], result: null, error: null, totalSteps: 0, completedSteps: 0, progressPercentage: 0, latestMessage: null,
  });
  const [categorizedTests, setCategorizedTests] = useState({});
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState(null);
  const [parameters, setParameters] = useState({
    hostname: '', username: 'root', password: '', environment: 'development', tests: [],
  });

  // --- SIDE EFFECTS (useEffect) ---
  // This effect discovers tests whenever the selected environment changes.
  useEffect(() => {
    const discoverTests = async () => {
      setIsDiscovering(true);
      setDiscoveryError(null);
      setCategorizedTests({});
      try {
        const response = await fetch(`${API_BASE_URL}/api/scripts/discover-tests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // FIX: Use the correct script ID constant. This was the source of the "Script definition not found" error.
          body: JSON.stringify({ scriptId: JSNAPY_SCRIPT_ID, environment: parameters.environment }),
        });
        const data = await response.json();
        if (!data.success) {
            // Prepend the error source for easier debugging
            throw new Error(`Test discovery failed: ${data.message || "Unknown API error."}`);
        }
        setCategorizedTests(data.discovered_tests || {});
      } catch (err) {
        setDiscoveryError(err.message);
      } finally {
        setIsDiscovering(false);
      }
    };
    discoverTests();
  }, [parameters.environment]);

  // This effect attaches the WebSocket listener. It is correct and does not need changes.
  useEffect(() => {
    if (!wsContext || !wsContext.websocketService) return;
    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        switch (message.type) {
          case 'progress': dispatch({ type: 'PROCESS_PROGRESS', payload: message }); break;
          case 'result': dispatch({ type: 'PROCESS_RESULT', payload: message }); break;
          case 'error': dispatch({ type: 'PROCESS_ERROR', payload: message }); break;
          default: break;
        }
      } catch (e) { console.error("useJsnapyWorkflow: Failed to parse WebSocket message:", e); }
    };
    wsContext.websocketService.on('message', handleMessage);
    return () => wsContext.websocketService.off('message', handleMessage);
  }, [wsContext]);


  // --- CONTROL FUNCTIONS (CALLBACKS) ---
  // This function is called by the UI to start the script execution.
  const runJsnapyScript = useCallback(async (allParams) => {
    if (!wsContext || !wsContext.clientId) {
      dispatch({ type: 'PROCESS_ERROR', payload: { message: "WebSocket is not connected." } });
      return;
    }
    dispatch({ type: 'START_EXECUTION' });
    const paramsToSend = { ...allParams, tests: allParams.tests.join(',') };
    try {
      const response = await fetch(`${API_BASE_URL}/api/scripts/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // FIX: Use the correct script ID constant here as well.
          scriptId: JSNAPY_SCRIPT_ID,
          parameters: paramsToSend,
          wsClientId: wsContext.clientId,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to start script on server.');
      }
    } catch (err) {
      dispatch({ type: 'PROCESS_ERROR', payload: { message: err.message } });
    }
  }, [wsContext]);

  // Function to clear the real-time display.
  const resetExecution = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
  }, []);

  // Expose all necessary state and functions to the component.
  return {
    executionState, runJsnapyScript, resetExecution,
    categorizedTests, isDiscovering, discoveryError,
    parameters, setParameters,
  };
}
