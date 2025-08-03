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

import { useState, useEffect, useCallback } from "react";
// The singleton service handles the raw connection; it requires no changes.
import websocketService from "../services/websocketServices";

// ================================================================================
// SECTION 1: CORE HOOK - useWebSocket
// This hook manages the application's single, persistent WebSocket connection.
// ================================================================================

/**
 * Manages the global WebSocket connection state and provides the service instance.
 * @param {object} options - Configuration options.
 * @returns {object} A context object with `isConnected`, `clientId`, and the `websocketService` instance.
 */
export const useWebSocket = (options = {}) => {
  const config = { autoConnect: true, wsUrl: "ws://localhost:3001", ...options };

  const [connectionState, setConnectionState] = useState({
    isConnected: websocketService.isConnected,
    clientId: websocketService.clientId,
    connectionError: null,
  });

  // These handlers update the hook's state when the service emits events.
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

  // This effect subscribes to the service and is StrictMode-safe.
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

  // Provide the reactive state and the service instance as a single context object.
  return { ...connectionState, websocketService };
};


// ================================================================================
// SECTION 2: SPECIALIZED HOOK - useScriptRunnerStream
// This hook manages the full lifecycle of a single script execution.
// ================================================================================

/**
 * Manages the state for a script run that streams real-time updates.
 * @param {object} wsContext - The context object from the `useWebSocket` hook.
 * @returns {object} The complete state of the script run and a `resetState` function.
 */
export const useScriptRunnerStream = (wsContext) => {
  // -----------------------------------------------------------------------------------------------
  // Subsection 2.1: State Management
  // -----------------------------------------------------------------------------------------------
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [progressEvents, setProgressEvents] = useState([]);
  const [finalResult, setFinalResult] = useState(null);
  const [error, setError] = useState(null);

  // -----------------------------------------------------------------------------------------------
  // Subsection 2.2: State Reset Function
  // -----------------------------------------------------------------------------------------------
  const resetState = useCallback(() => {
    setIsRunning(false);
    setIsComplete(false);
    setProgressEvents([]);
    setFinalResult(null);
    setError(null);
  }, []);

  // -----------------------------------------------------------------------------------------------
  // Subsection 2.3: Effect Hook for Handling WebSocket Messages
  // -----------------------------------------------------------------------------------------------
  useEffect(() => {
    // --- FIX: The 'data' parameter is now a pre-parsed JavaScript object ---
    const handleMessage = (data) => {
      try {
        // --- FIX: REMOVE the redundant JSON.parse() call ---
        // const data = JSON.parse(event.data); // This is no longer needed.

        // The rest of the logic works perfectly now.
        switch (data.type) {
          case 'script_start':
            resetState();
            setIsRunning(true);
            break;
          case 'progress':
            setProgressEvents(prev => [...prev, data]);
            break;
          case 'result':
            console.log("[DEBUG] Final Result View received:", data.data);
            setFinalResult(data.data);
            break;
          case 'script_end':
            setIsRunning(false);
            setIsComplete(true);
            if (data.exitCode !== 0 && !error) {
              setError({ message: `Script finished with a non-zero exit code: ${data.exitCode}` });
            }
            break;
          case 'error':
            setError(data);
            setIsRunning(false);
            setIsComplete(true);
            break;
          default:
            break;
        }
      } catch (e) {
        // This catch block is now just a safety net for unexpected errors.
        console.error("Error processing WebSocket message object:", data, e);
      }
    };
    // This part is now correct. It listens for the 'message' event and gets the parsed object.
    if (wsContext && wsContext.websocketService) {
      const unsubscribe = wsContext.websocketService.on('message', handleMessage);
      return () => unsubscribe();
    }
  }, [wsContext, resetState, error]);
  // -----------------------------------------------------------------------------------------------
  // Subsection 2.4: Return API
  // -----------------------------------------------------------------------------------------------
  // Expose all state and control functions to the consuming component.
  return { isRunning, isComplete, progressEvents, finalResult, error, resetState };
};
