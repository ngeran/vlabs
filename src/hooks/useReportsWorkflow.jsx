// =============================================================================
// FILE:               src/hooks/useReportsWorkflow.jsx
//
// DESCRIPTION:
//   A custom React hook to manage the entire workflow for the Reports Runner.
//   It encapsulates state management, report discovery, and script execution logic.
//
// OVERVIEW:
//   This hook centralizes the business logic for the ReportsRunner component. It
//   uses a reducer for predictable state management, handles real-time updates
//   via WebSockets, and interacts with the backend through the ReportsApiService.
//
// KEY FEATURES:
//   - Manages execution state (running, complete, error) with a reducer.
//   - Handles the full stream of WebSocket events for real-time UI updates.
//   - Fetches available reports using ReportsApiService.
//   - Provides a clean, reusable interface for the runner component.
//
// =============================================================================

// =============================================================================
// SECTION 1: IMPORTS
// =============================================================================
import { useReducer, useCallback, useEffect, useState } from "react";
import ReportsApiService from "../services/ReportsApiService";

// =============================================================================
// SECTION 2: REDUCER FOR STATE MANAGEMENT
// =============================================================================
// This reducer is identical to the one in useJsnapyWorkflow, ensuring consistent state handling.
const progressReducer = (state, action) => {
  switch (action.type) {
    case "START_EXECUTION":
      return { ...state, isRunning: true, isComplete: false, hasError: false, progress: [], result: null, error: null, latestMessage: null };
    case "PROCESS_PROGRESS": {
        const newProgress = [...state.progress, { id: Date.now() + Math.random(), ...action.payload }];
        return { ...state, progress: newProgress, latestMessage: action.payload };
    }
    case "PROCESS_RESULT":
      return { ...state, isRunning: false, isComplete: true, hasError: false, result: action.payload.data?.data || action.payload.data || action.payload };
    case "PROCESS_ERROR":
      return { ...state, isRunning: false, isComplete: true, hasError: true, error: action.payload.message };
    case "RESET_STATE":
      return { isRunning: false, isComplete: false, hasError: false, progress: [], result: null, error: null, latestMessage: null };
    default:
      return state;
  }
};

// =============================================================================
// SECTION 3: HOOK DEFINITION
// =============================================================================
export function useReportsWorkflow(wsContext) {
  // State for execution lifecycle
  const [executionState, dispatch] = useReducer(progressReducer, {
    isRunning: false,
    isComplete: false,
    hasError: false,
    progress: [],
    result: null,
    error: null,
    latestMessage: null,
  });

  // State for report discovery
  const [categorizedReports, setCategorizedReports] = useState({});
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState(null);

  // Discover available reports when the component mounts
  useEffect(() => {
    const discoverReports = async () => {
      setIsDiscovering(true);
      setDiscoveryError(null);
      try {
        const reports = await ReportsApiService.discoverReports();
        setCategorizedReports(reports);
      } catch (err) {
        setDiscoveryError(err.message);
      } finally {
        setIsDiscovering(false);
      }
    };
    discoverReports();
  }, []);

  // Set up WebSocket listener for real-time updates
  useEffect(() => {
    if (!wsContext?.websocketService) return;
    const service = wsContext.websocketService;

    const handleMessage = (message) => {
      if (!message || !message.type) return;
      switch (message.type.toLowerCase()) {
        case "progress": dispatch({ type: "PROCESS_PROGRESS", payload: message }); break;
        case "result": dispatch({ type: "PROCESS_RESULT", payload: message }); break;
        case "error": dispatch({ type: "PROCESS_ERROR", payload: message }); break;
        default: break;
      }
    };

    service.on("message", handleMessage);
    return () => service.off("message", handleMessage);
  }, [wsContext]);

  // Function to initiate the report generation script
  const runReportScript = useCallback(async (params) => {
    if (!wsContext?.clientId) {
      dispatch({ type: "PROCESS_ERROR", payload: { message: "WebSocket is not connected." } });
      return;
    }
    dispatch({ type: "START_EXECUTION" });
    try {
      await ReportsApiService.runScript(params, wsContext.clientId);
    } catch (err) {
      dispatch({ type: "PROCESS_ERROR", payload: { message: err.message } });
    }
  }, [wsContext]);

  // Function to reset the execution state
  const resetExecution = useCallback(() => {
    dispatch({ type: "RESET_STATE" });
  }, []);

  return {
    executionState,
    runReportScript,
    resetExecution,
    categorizedReports,
    isDiscovering,
    discoveryError,
  };
}
