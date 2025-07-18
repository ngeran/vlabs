// src/hooks/useJsnapyWorkflow.jsx
import { useReducer, useCallback, useEffect, useState } from 'react';

// The reducer function is correct. No changes needed here.
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
      return { ...state, isRunning: false, isComplete: true, result: action.payload.data, progressPercentage: 100 };
    case 'PROCESS_ERROR':
      return { ...state, isRunning: false, isComplete: true, hasError: true, error: { message: action.payload.message, details: action.payload.error } };
    case 'RESET_STATE':
      return { ...state, isRunning: false, isComplete: false, hasError: false, progress: [], result: null, error: null, totalSteps: 0, completedSteps: 0, progressPercentage: 0, latestMessage: null };
    default:
      return state;
  }
};

const API_BASE_URL = "http://localhost:3001";

export function useJsnapyWorkflow(wsContext) {
  const [executionState, dispatch] = useReducer(progressReducer, {
    isRunning: false, isComplete: false, hasError: false, progress: [], result: null, error: null, totalSteps: 0, completedSteps: 0, progressPercentage: 0, latestMessage: null,
  });

  const [categorizedTests, setCategorizedTests] = useState({});
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState(null);
  const [parameters, setParameters] = useState({ environment: 'development', tests: [] });

  useEffect(() => {
    // This discovery logic is fine, no changes needed.
    const discoverTests = async () => {
      setIsDiscovering(true);
      setDiscoveryError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/scripts/discover-tests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scriptId: "run_jsnapy_tests", environment: parameters.environment }),
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message || "Failed to discover tests.");
        setCategorizedTests(data.discovered_tests || {});
      } catch (err) {
        setDiscoveryError(err.message);
        setCategorizedTests({});
      } finally {
        setIsDiscovering(false);
      }
    };
    discoverTests();
  }, [parameters.environment]);

  // +++ THIS IS THE CRITICAL DEBUGGING SECTION +++
  useEffect(() => {
    console.log('[DEBUG][useJsnapyWorkflow] Mount/Update: The useEffect for the listener is running.');

    if (!wsContext || !wsContext.websocketService) {
      console.warn('[DEBUG][useJsnapyWorkflow] WARNING: wsContext or websocketService is not available. Cannot attach listener.');
      return;
    }

    console.log('[DEBUG][useJsnapyWorkflow] SUCCESS: Attaching WebSocket message listener...');

    const handleMessage = (event) => {
      // THIS IS THE MOST IMPORTANT LOG. If you see the low-level logs but not this one,
      // the listener is "deaf".
      console.log('%c[DEBUG][useJsnapyWorkflow] >>> HOOK HEARD A MESSAGE:', 'color: lightgreen; font-weight: bold;', event.data);

      try {
        const message = JSON.parse(event.data);
        switch (message.type) {
          case 'progress':
            console.log('[DEBUG][useJsnapyWorkflow] Dispatching PROCESS_PROGRESS');
            dispatch({ type: 'PROCESS_PROGRESS', payload: message });
            break;
          case 'result':
            console.log('[DEBUG][useJsnapyWorkflow] Dispatching PROCESS_RESULT');
            dispatch({ type: 'PROCESS_RESULT', payload: message });
            break;
          case 'error':
            console.log('[DEBUG][useJsnapyWorkflow] Dispatching PROCESS_ERROR');
            dispatch({ type: 'PROCESS_ERROR', payload: message });
            break;
          default:
            break;
        }
      } catch (e) {
        console.error("[DEBUG][useJsnapyWorkflow] Failed to parse WebSocket message:", e);
      }
    };

    wsContext.websocketService.on('message', handleMessage);

    // This "cleanup" function is also critical for debugging.
    return () => {
      console.log('%c[DEBUG][useJsnapyWorkflow] Cleanup: Detaching listener. If this happens unexpectedly, the parent component may be re-rendering.', 'color: orange;');
      wsContext.websocketService.off('message', handleMessage);
    };
  }, [wsContext]); // This dependency is crucial.

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
          scriptId: 'run_jsnapy_tests',
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

  const resetExecution = useCallback(() => dispatch({ type: 'RESET_STATE' }), []);

  return {
    executionState, runJsnapyScript, resetExecution,
    categorizedTests, isDiscovering, discoveryError,
    parameters, setParameters,
  };
}
