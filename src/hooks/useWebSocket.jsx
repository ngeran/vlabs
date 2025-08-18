// =================================================================================================
//
//  COMPREHENSIVE WEBSOCKET INTEGRATION HOOKS FOR REACT
//  FILE: useWebSocket.jsx (DEFINITIVELY FIXED)
//
// =================================================================================================
//
//  DESCRIPTION:
//  This file provides a complete and stable WebSocket integration solution. It includes a
//  core hook (`useWebSocket`) for managing the connection and a specialized hook
//  (`useScriptRunnerStream`) for handling the state of long-running script executions.
//
//  KEY FIXES IMPLEMENTED:
//  - `useScriptRunnerStream` now uses the correct `websocketService.on('message', ...)`
//    event listener, resolving the `TypeError: .subscribe is not a function` crash.
//  - It now correctly handles the `result` and `script_end` WebSocket events to properly
//    terminate the UI's "running" state and display the final results.
//
//  HOW TO USE:
//  1. Import `useWebSocket` in a top-level component (like App.jsx) to initialize the connection.
//  2. Pass the `wsContext` object (the return value of `useWebSocket`) down to child components.
//  3. Child components that run scripts (like `FileUploaderRunner.jsx`) should use the
//     `useScriptRunnerStream` hook, passing in the `wsContext` from the parent.
//
// =================================================================================================
// =================================================================================================
//
//  FIXED WEBSOCKET INTEGRATION HOOKS FOR REACT
//  FILE: useWebSocket.jsx (ERROR-PROOF VERSION)
//
// =================================================================================================

import { useState, useEffect, useCallback } from "react";
import websocketService from "../services/websocketServices";

// ================================================================================
// SECTION 1: CORE HOOK - useWebSocket (No changes needed here)
// ================================================================================

export const useWebSocket = (options = {}) => {
  const config = { autoConnect: true, wsUrl: "ws://localhost:3001", ...options };

  const [connectionState, setConnectionState] = useState({
    isConnected: websocketService.isConnected,
    clientId: websocketService.clientId,
    connectionError: null,
  });

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
    setConnectionState(prev => ({ ...prev, isConnected: false, connectionError: data.error || 'Unknown Error' }));
  }, []);

  useEffect(() => {
    console.log("🔔 [HOOK] Setting up WebSocket listeners...");
    const unsubscribers = [
      websocketService.on('connected', handleConnected),
      websocketService.on('disconnected', handleDisconnected),
      websocketService.on('client_id', handleClientId),
      websocketService.on('error', handleError),
    ];

    if (config.autoConnect) {
      websocketService.connect(config.wsUrl);
    }

    return () => {
      console.log("🧹 [HOOK] Cleaning up WebSocket listeners ONLY. Connection persists.");
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [config.autoConnect, config.wsUrl, handleConnected, handleDisconnected, handleClientId, handleError]);

  return { ...connectionState, websocketService };
};

// ================================================================================
// SECTION 2: FIXED SCRIPT RUNNER HOOK - useScriptRunnerStream
// ================================================================================

export const useScriptRunnerStream = (wsContext) => {
  // State Management
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [progressEvents, setProgressEvents] = useState([]);
  const [finalResult, setFinalResult] = useState(null);
  const [error, setError] = useState(null);

  // State Reset Function
  const resetState = useCallback(() => {
    console.log("🔄 [HOOK] Resetting script runner state");
    setIsRunning(false);
    setIsComplete(false);
    setProgressEvents([]);
    setFinalResult(null);
    setError(null);
  }, []);

  // CRITICAL FIX: Enhanced message handling with comprehensive error handling
  useEffect(() => {
    const handleMessage = (data) => {
      try {
        // Validate the data structure first
        if (!data || typeof data !== 'object') {
          console.warn("📥 [HOOK] Received invalid message data:", data);
          return;
        }

        console.log("📥 [HOOK] Processing message type:", data.type, data);

        switch (data.type) {
          case 'script_start':
            console.log("🚀 [HOOK] Script starting...");
            try {
              resetState();
              setIsRunning(true);
            } catch (scriptStartError) {
              console.error("❌ [HOOK] Error handling script_start:", scriptStartError);
              setError({ message: `Failed to start script: ${scriptStartError.message}` });
            }
            break;

          case 'progress':
            console.log("📈 [HOOK] Progress event:", data.event_type);
            try {
              setProgressEvents(prev => {
                // Validate progress data before adding
                if (data.event_type && typeof data.event_type === 'string') {
                  return [...prev, data];
                } else {
                  console.warn("📈 [HOOK] Invalid progress event:", data);
                  return prev;
                }
              });
            } catch (progressError) {
              console.error("❌ [HOOK] Error handling progress:", progressError);
              // Don't crash - just log the error
            }
            break;

          case 'result':
            console.log("🎯 [HOOK] Processing result data...");
            try {
              // CRITICAL FIX: Comprehensive result validation
              if (!data.data) {
                console.error("❌ [HOOK] Result message missing data field:", data);
                setError({ message: "Received result message without data" });
                setIsRunning(false);
                setIsComplete(true);
                return;
              }

              // Validate result structure
              if (typeof data.data !== 'object') {
                console.error("❌ [HOOK] Result data is not an object:", data.data);
                setError({ message: "Invalid result data format" });
                setIsRunning(false);
                setIsComplete(true);
                return;
              }

              // CRITICAL FIX: Deep validation for BGP-like data
              try {
                // Test if the data can be safely stringified (this will catch problematic content)
                JSON.stringify(data.data);

                // Validate expected structure
                if (data.data.results && Array.isArray(data.data.results)) {
                  console.log("✅ [HOOK] Result data validated successfully");
                  setFinalResult(data.data);

                  // Don't set complete here - wait for script_end
                  console.log("📊 [HOOK] Final result set, waiting for script_end...");
                } else {
                  console.warn("⚠️ [HOOK] Result data missing expected structure:", data.data);
                  // Still set the result, but with a warning
                  setFinalResult({
                    ...data.data,
                    _warning: "Result data structure may be incomplete"
                  });
                }
              } catch (stringifyError) {
                console.error("❌ [HOOK] Result data contains non-serializable content:", stringifyError);
                setError({
                  message: `Result data processing failed: ${stringifyError.message}`,
                  originalData: "Result contained problematic content"
                });
                setIsRunning(false);
                setIsComplete(true);
                return;
              }

            } catch (resultError) {
              console.error("❌ [HOOK] Critical error processing result:", resultError);
              console.error("❌ [HOOK] Problematic result data:", data);
              setError({
                message: `Failed to process test results: ${resultError.message}`,
                details: "The result data could not be processed safely"
              });
              setIsRunning(false);
              setIsComplete(true);
            }
            break;

          case 'script_end':
            console.log("🏁 [HOOK] Script ended with exit code:", data.exitCode);
            try {
              setIsRunning(false);
              setIsComplete(true);

              if (data.exitCode !== 0 && !error && !finalResult) {
                setError({ message: `Script finished with exit code ${data.exitCode} and no results` });
              }

              // If we have results but no script_end was processed properly before
              if (finalResult && !error) {
                console.log("✅ [HOOK] Script completed successfully with results");
              }
            } catch (scriptEndError) {
              console.error("❌ [HOOK] Error handling script_end:", scriptEndError);
              setError({ message: `Script end processing failed: ${scriptEndError.message}` });
              setIsComplete(true);
            }
            break;

          case 'error':
            console.error("❌ [HOOK] Received error message:", data);
            try {
              setError(data);
              setIsRunning(false);
              setIsComplete(true);
            } catch (errorHandlingError) {
              console.error("❌ [HOOK] Error handling error message:", errorHandlingError);
              setError({ message: "Multiple errors occurred during script execution" });
              setIsRunning(false);
              setIsComplete(true);
            }
            break;

          default:
            console.log("📝 [HOOK] Unhandled message type:", data.type);
            break;
        }

      } catch (outerError) {
        console.error("💥 [HOOK] Critical error in message handler:", outerError);
        console.error("💥 [HOOK] Message that caused error:", data);

        // Fail gracefully - don't let the error crash the component
        setError({
          message: `Message processing failed: ${outerError.message}`,
          critical: true
        });
        setIsRunning(false);
        setIsComplete(true);
      }
    };

    // Set up the WebSocket listener
    if (wsContext && wsContext.websocketService) {
      console.log("🔗 [HOOK] Setting up message listener");
      const unsubscribe = wsContext.websocketService.on('message', handleMessage);

      return () => {
        console.log("🔌 [HOOK] Cleaning up message listener");
        unsubscribe();
      };
    }
  }, [wsContext, resetState, error, finalResult]);

  // Return the complete state
  return {
    isRunning,
    isComplete,
    progressEvents,
    finalResult,
    error,
    resetState
  };
};
