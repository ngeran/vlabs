// =============================================================================
// FILE: useJsnapyWorkflow.jsx
// DESCRIPTION: Custom React hook for managing state and logic of the JSNAPy Runner.
//              Handles parameter state, test discovery, WebSocket communication,
//              and script execution via API calls.
// DEPENDENCIES:
//   - react: For hooks (useReducer, useCallback, useEffect, useState).
//   - WebSocket: Provided via wsContext for real-time updates.
//   - fetch: For making API calls to the backend.
// =============================================================================

import { useReducer, useCallback, useEffect, useState } from 'react';

// =============================================================================
// SECTION 1: CONSTANTS
// =============================================================================
const API_BASE_URL = "http://localhost:3001"; // Base URL for backend API
const JSNAPY_SCRIPT_ID = "jsnapy_runner"; // Unique identifier for the JSNAPy script

// =============================================================================
// SECTION 2: STATE MANAGEMENT WITH REDUCER
// =============================================================================
// Reducer to manage execution state (progress, results, errors).
const progressReducer = (state, action) => {
  switch (action.type) {
    // Start a new script execution, resetting state.
    case 'START_EXECUTION':
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

    // Process progress updates from WebSocket.
    case 'PROCESS_PROGRESS': {
      const newPayload = {
        ...action.payload,
        id: Date.now() + Math.random(), // Unique ID for progress event
        timestamp: new Date().toISOString(),
      };
      const newProgress = [...state.progress, newPayload];
      let { totalSteps } = state;

      // Update total steps when operation starts.
      if (action.payload.event_type === 'OPERATION_START') {
        totalSteps = action.payload.data?.total_steps || 0;
      }

      // Calculate completed steps.
      const completedSteps = newProgress.reduce((max, p) => {
        return (p.event_type === 'STEP_COMPLETE' && p.data?.step > max) ? p.data.step : max;
      }, 0);

      // Calculate progress percentage.
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

    // Process final script result.
    case 'PROCESS_RESULT':
      return {
        ...state,
        isRunning: false,
        isComplete: true,
        hasError: false,
        result: action.payload.data,
        progressPercentage: 100,
      };

    // Process execution errors.
    case 'PROCESS_ERROR':
      return {
        ...state,
        isRunning: false,
        isComplete: true,
        hasError: true,
        error: { message: action.payload.message, details: action.payload.error },
      };

    // Reset execution state.
    case 'RESET_STATE':
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
// SECTION 3: MAIN HOOK DEFINITION
// =============================================================================
export function useJsnapyWorkflow(wsContext) {
  // Execution state for tracking script progress and results.
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

  // State for test discovery and parameters.
  const [categorizedTests, setCategorizedTests] = useState({}); // Available tests
  const [isDiscovering, setIsDiscovering] = useState(false); // Test discovery loading state
  const [discoveryError, setDiscoveryError] = useState(null); // Test discovery error
  const [parameters, setParameters] = useState({
    hostname: '',
    inventory_file: '', // Supports deviceTargeting capability
    username: 'root',
    password: '',
    environment: 'development',
    tests: [],
  });
  const [wsConnectionStatus, setWsConnectionStatus] = useState('unknown'); // WebSocket status

  // =============================================================================
  // SECTION 4: TEST DISCOVERY EFFECT
  // =============================================================================
  // Fetch available tests based on the selected environment.
  useEffect(() => {
    const discoverTests = async () => {
      setIsDiscovering(true);
      setDiscoveryError(null);
      setCategorizedTests({});
      try {
        const response = await fetch(`${API_BASE_URL}/api/scripts/discover-tests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scriptId: JSNAPY_SCRIPT_ID, environment: parameters.environment }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        const data = await response.json();
        if (!data.success) throw new Error(`API Error: ${data.message}`);
        setCategorizedTests(data.discovered_tests || {});
      } catch (err) {
        setDiscoveryError(err.message);
      } finally {
        setIsDiscovering(false);
      }
    };
    discoverTests();
  }, [parameters.environment]);

  // =============================================================================
  // SECTION 5: WEBSOCKET LISTENER EFFECT
  // =============================================================================
  // Set up WebSocket listeners for real-time updates.
  useEffect(() => {
    const effectId = Date.now();
    console.log(`%c[DEBUG ${effectId}] 🔔 Setting up WebSocket listener effect...`, 'color: blue; font-weight: bold;');

    if (!wsContext || !wsContext.websocketService) {
      console.error(`[DEBUG ${effectId}] ❌ ERROR: wsContext or websocketService is invalid.`, { wsContext });
      setWsConnectionStatus('no-context');
      return;
    }

    const service = wsContext.websocketService;
    console.log(`[DEBUG ${effectId}] ✅ Service object is available. IsConnected: ${service.isConnected}`);
    setWsConnectionStatus(service.isConnected ? 'connected' : 'disconnected');

    // Handle incoming WebSocket messages.
    const handleMessage = (message) => {
      console.log(`%c[DEBUG ${effectId}] 🎯 MESSAGE RECEIVED IN HOOK:`, 'color: lime; font-weight: bold; background: black; padding: 2px;', message);

      if (!message || !message.type) {
        console.warn(`[DEBUG ${effectId}] ❓ Ignoring malformed message.`);
        return;
      }

      switch (message.type?.toLowerCase()) {
        case 'progress':
          console.log(`%c[DEBUG ${effectId}] ⚡ Dispatching PROCESS_PROGRESS`, 'color: yellow;');
          dispatch({ type: 'PROCESS_PROGRESS', payload: message });
          break;
        case 'result':
          console.log(`%c[DEBUG ${effectId}] ✅ Dispatching PROCESS_RESULT`, 'color: green;');
          dispatch({ type: 'PROCESS_RESULT', payload: message });
          break;
        case 'error':
          console.log(`%c[DEBUG ${effectId}] ❌ Dispatching PROCESS_ERROR`, 'color: red;');
          dispatch({ type: 'PROCESS_ERROR', payload: message });
          break;
        default:
          console.log(`[DEBUG ${effectId}] ❓ Ignoring unknown message type: ${message.type}`);
      }
    };

    const handleOpen = () => {
      console.log(`[DEBUG ${effectId}] 🔌 WebSocket connection opened.`);
      setWsConnectionStatus('connected');
    };
    const handleClose = () => {
      console.log(`[DEBUG ${effectId}] 🔌 WebSocket connection closed.`);
      setWsConnectionStatus('closed');
    };

    // Attach event listeners.
    console.log(`[DEBUG ${effectId}] 🎧 Attaching event listeners for: 'progress', 'result', 'error', 'open', 'close'`);
    service.on('progress', handleMessage);
    service.on('result', handleMessage);
    service.on('error', handleMessage);
    service.on('open', handleOpen);
    service.on('close', handleClose);

    // Clean up listeners on unmount.
    return () => {
      console.log(`%c[DEBUG ${effectId}] 🧹 Cleaning up event listeners...`, 'color: orange; font-weight: bold;');
      service.off('progress', handleMessage);
      service.off('result', handleMessage);
      service.off('error', handleMessage);
      service.off('open', handleOpen);
      service.off('close', handleClose);
    };
  }, [wsContext]);

  // =============================================================================
  // SECTION 6: EXECUTION STATE DEBUGGING
  // =============================================================================
  // Log execution state changes for debugging.
  useEffect(() => {
    console.log('[useJsnapyWorkflow] Execution state changed:', {
      isRunning: executionState.isRunning,
      isComplete: executionState.isComplete,
      hasError: executionState.hasError,
      progressCount: executionState.progress.length,
      progressPercentage: executionState.progressPercentage,
      latestMessage: executionState.latestMessage?.event_type,
    });
  }, [executionState]);

  // =============================================================================
  // SECTION 7: SCRIPT EXECUTION LOGIC
  // =============================================================================
  // Execute the JSNAPy script via API call.
  const runJsnapyScript = useCallback(async (allParams) => {
    if (!wsContext || !wsContext.clientId) {
      const errorMsg = "WebSocket is not connected or clientId is missing";
      dispatch({ type: 'PROCESS_ERROR', payload: { message: errorMsg } });
      return;
    }

    dispatch({ type: 'START_EXECUTION' });

    // Prepare parameters, excluding undefined values.
    const paramsToSend = {
      ...allParams,
      tests: Array.isArray(allParams.tests) ? allParams.tests.join(',') : allParams.tests,
      hostname: allParams.hostname || undefined,
      inventory_file: allParams.inventory_file || undefined,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/scripts/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: JSNAPY_SCRIPT_ID,
          parameters: paramsToSend,
          wsClientId: wsContext.clientId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          message: `HTTP ${response.status}: ${response.statusText}`,
        }));
        throw new Error(errorData.message);
      }
      const responseData = await response.json();
      if (!responseData.success) throw new Error(responseData.message || 'Script execution failed to start.');
      console.log('[useJsnapyWorkflow] Script execution started successfully, waiting for WebSocket updates...');
    } catch (err) {
      dispatch({ type: 'PROCESS_ERROR', payload: { message: err.message } });
    }
  }, [wsContext]);

  // =============================================================================
  // SECTION 8: RESET EXECUTION FUNCTION
  // =============================================================================
  // Reset execution state to initial values.
  const resetExecution = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
  }, []);

  // =============================================================================
  // SECTION 9: RETURN HOOK VALUES
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
    isWsConnected: wsConnectionStatus === 'connected',
  };
}
