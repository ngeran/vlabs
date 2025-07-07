// src/hooks/useWebSocket.js

import { useState, useEffect, useCallback, useRef } from "react";
import websocketService from "../services/websocketServices";

/**
 * Hook specifically for running generic scripts with real-time output streaming.
 * Connects to the `/api/scripts/run-stream` endpoint.
 */
// Enhanced useWebSocket with debugging
export const useScriptRunnerStream = (wsContext = {}, options = {}) => {
  const { onStart, onOutput, onError, onEnd } = options;

  const [runnerState, setRunnerState] = useState({
    isRunning: false,
    output: "",
    error: "",
    isComplete: false,
    exitCode: null,
    runId: null,
  });

  // ✨ REFACTORED: Use the passed-in context
  const { isConnected, clientId, websocketService } = wsContext;

  const resetState = useCallback(() => {
    setRunnerState({
      isRunning: false,
      output: "",
      error: "",
      isComplete: false,
      exitCode: null,
      runId: null,
    });
  }, []);

  const runScript = useCallback(
    async (scriptData) => {
      console.log("🔍 [DEBUG] runScript called with state:", {
        isConnected,
        clientId,
        hasWebSocketService: !!websocketService,
        connectionStatus: websocketService?.getStatus(),
      });

      if (!isConnected) {
        console.error("❌ [ERROR] WebSocket not connected");
        throw new Error("WebSocket not connected");
      }

      if (!clientId) {
        console.error("❌ [ERROR] No client ID available");
        throw new Error("No WebSocket client ID available");
      }

      // Verify the connection is actually valid
      const status = websocketService.getStatus();
      console.log("🔍 [DEBUG] WebSocket service status:", status);

      if (!status.isConnected) {
        console.error("❌ [ERROR] WebSocket service reports disconnected");
        throw new Error("WebSocket connection lost");
      }

      // Additional debugging: Test if the client is known to the server
      console.log("🔍 [DEBUG] Testing client registration with server...");
      try {
        const testResponse = await fetch(
          `http://localhost:3001/api/websocket/clients/${clientId}/status`,
          {
            method: "GET",
          },
        );
        console.log(
          "🔍 [DEBUG] Client status check response:",
          testResponse.status,
        );
        if (!testResponse.ok) {
          console.warn(
            "⚠️ [WARNING] Client not recognized by server, attempting reconnection...",
          );
          await websocketService.disconnect();
          await websocketService.connect();
          // Wait a bit for reconnection
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.warn(
          "⚠️ [WARNING] Could not verify client status:",
          error.message,
        );
      }

      resetState();
      setRunnerState((prev) => ({ ...prev, isRunning: true }));

      console.log(
        "🚀 [DEBUG] Making POST request to run-stream with clientId:",
        clientId,
      );

      try {
        const response = await fetch(
          "http://localhost:3001/api/scripts/run-stream",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...scriptData, wsClientId: clientId }),
          },
        );

        console.log("📡 [DEBUG] Response status:", response.status);

        const result = await response.json();
        console.log("📡 [DEBUG] Response data:", result);

        if (!response.ok) {
          console.error("❌ [ERROR] Server response error:", result);
          setRunnerState({
            isRunning: false,
            error: result.message,
            isComplete: true,
          });
          throw new Error(result.message || "Failed to start script stream");
        }

        console.log("✅ [SUCCESS] Script started, runId:", result.runId);
        setRunnerState((prev) => ({ ...prev, runId: result.runId }));
        return result;
      } catch (error) {
        console.error("❌ [ERROR] Exception in runScript:", error);
        setRunnerState((prev) => ({
          ...prev,
          isRunning: false,
          error: error.message,
          isComplete: true,
        }));
        throw error;
      }
    },
    // ✨ REFACTORED: Dependencies now correctly reflect the shared context
    [isConnected, clientId, websocketService, resetState],
  );

  useEffect(() => {
    if (!websocketService) return; // Guard against initial render before context is ready

    const unsubscribers = [];

    unsubscribers.push(
      websocketService.on("script_start", (data) => {
        onStart?.(data);
      }),
    );
    unsubscribers.push(
      websocketService.on("script_output", (data) => {
        if (data.runId === runnerState.runId) {
          setRunnerState((prev) => ({
            ...prev,
            output: prev.output + data.output,
          }));
          onOutput?.(data);
        }
      }),
    );
    unsubscribers.push(
      websocketService.on("script_error", (data) => {
        if (data.runId === runnerState.runId) {
          setRunnerState((prev) => ({
            ...prev,
            error: prev.error + data.error,
          }));
          onError?.(data);
        }
      }),
    );
    unsubscribers.push(
      websocketService.on("script_end", (data) => {
        if (data.runId === runnerState.runId) {
          setRunnerState((prev) => ({
            ...prev,
            isRunning: false,
            isComplete: true,
            exitCode: data.exitCode,
          }));
          onEnd?.(data);
        }
      }),
    );

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [websocketService, runnerState.runId, onStart, onOutput, onError, onEnd]);

  return { ...runnerState, runScript, resetState };
};

/**
 * Custom hook for WebSocket integration with real-time updates
 */
export const useWebSocket = (options = {}) => {
  const {
    autoConnect = true,
    wsUrl = "ws://localhost:3001",
    onConnect,
    onDisconnect,
    onError,
    onMessage,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [clientId, setClientId] = useState(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Use refs to store latest callback references
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);
  const onMessageRef = useRef(onMessage);

  // Update refs when callbacks change
  useEffect(() => {
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
    onMessageRef.current = onMessage;
  }, [onConnect, onDisconnect, onError, onMessage]);

  // Connect to WebSocket
  const connect = useCallback(async () => {
    try {
      console.log("🔌 [DEBUG] Attempting to connect to WebSocket:", wsUrl);
      setConnectionError(null);
      await websocketService.connect(wsUrl);
      console.log("✅ [DEBUG] WebSocket connect() call completed");
    } catch (error) {
      console.error("❌ [ERROR] WebSocket connection failed:", error);
      setConnectionError(error.message);
    }
  }, [wsUrl]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    websocketService.disconnect();
  }, []);

  // Send message
  const sendMessage = useCallback((message) => {
    return websocketService.send(message);
  }, []);

  // Apply template with real-time updates
  const applyTemplate = useCallback(async (templateData) => {
    try {
      return await websocketService.applyTemplate(templateData);
    } catch (error) {
      console.error("[useWebSocket] Apply template failed:", error);
      throw error;
    }
  }, []);

  // Test connection
  const testConnection = useCallback(async (message) => {
    try {
      return await websocketService.testConnection(message);
    } catch (error) {
      console.error("[useWebSocket] Test connection failed:", error);
      throw error;
    }
  }, []);

  // Get connection status
  const getStatus = useCallback(() => {
    return websocketService.getStatus();
  }, []);

  // Set up event listeners
  useEffect(() => {
    const unsubscribers = [];

    // Connection events
    unsubscribers.push(
      websocketService.on("connected", (data) => {
        console.log("🟢 [EVENT] WebSocket connected:", data);
        setIsConnected(true);
        // The clientId might be null here, it comes via 'client_id' event
        // But if it exists (on reconnect), we set it.
        if (data.clientId) {
          setClientId(data.clientId);
        }
        setConnectionError(null);
        setReconnectAttempts(0);
        onConnectRef.current?.(data);
      }),
    );

    // ✨ ADDED: Explicitly listen for the client_id event
    unsubscribers.push(
      websocketService.on("client_id", (data) => {
        console.log("🆔 [EVENT] Received client ID:", data);
        setClientId(data.clientId);
      }),
    );
    unsubscribers.push(
      websocketService.on("disconnected", (data) => {
        console.log("🔴 [EVENT] WebSocket disconnected:", data);
        setIsConnected(false);
        // Keep clientId to help with debugging
        onDisconnectRef.current?.(data);
      }),
    );

    unsubscribers.push(
      websocketService.on("error", (data) => {
        console.error("❌ [EVENT] WebSocket error:", data);
        setConnectionError(data.error);
        onErrorRef.current?.(data);
      }),
    );

    // Message events
    unsubscribers.push(
      websocketService.on("message", (data) => {
        console.log("📨 [EVENT] WebSocket message:", data);
        setMessages((prev) => [
          ...prev,
          { ...data, id: Date.now() + Math.random() },
        ]);
        onMessageRef.current?.(data);
      }),
    );

    // Cleanup function
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      console.log("🔄 [DEBUG] Auto-connecting on mount");
      connect();
    }

    // Cleanup on unmount
    return () => {
      if (autoConnect) {
        console.log("🔄 [DEBUG] Disconnecting on unmount");
        disconnect();
      }
    };
  }, [autoConnect, connect, disconnect]);

  // Update reconnect attempts
  useEffect(() => {
    const updateReconnectAttempts = () => {
      const status = websocketService.getStatus();
      setReconnectAttempts(status.reconnectAttempts);
    };

    const interval = setInterval(updateReconnectAttempts, 1000);
    return () => clearInterval(interval);
  }, []);

  return {
    // Connection state
    isConnected,
    connectionError,
    clientId,
    reconnectAttempts,

    // Messages
    messages,
    clearMessages: () => setMessages([]),

    // Actions
    connect,
    disconnect,
    sendMessage,
    applyTemplate,
    testConnection,
    getStatus,

    // Service instance (for advanced usage)
    websocketService,
  };
};

/**
 * Hook specifically for template application with progress tracking
 */
/**
 * ✨ REFACTORED: Hook specifically for template application with progress tracking.
 * It now accepts a shared WebSocket context.
 */
export const useTemplateApplication = (wsContext = {}, options = {}) => {
  const {
    onStatusUpdate,
    onProgressUpdate,
    onCommitProgress,
    onInfoUpdate,
    onResult,
    onError,
  } = options;

  const [applicationState, setApplicationState] = useState({
    isApplying: false,
    isComplete: false,
    currentStatus: null,
    progress: { steps: [] },
    commitProgress: null,
    info: [],
    result: null,
    error: null,
    startTime: null,
    endTime: null,
  });

  // ✨ REFACTORED: Use the passed-in context
  const { isConnected, clientId, websocketService } = wsContext;

  // Reset application state
  const resetState = useCallback(() => {
    setApplicationState({
      isApplying: false,
      currentStatus: null,
      progress: { steps: [] },
      commitProgress: null,
      info: [],
      result: null,
      error: null,
      startTime: null,
      endTime: null,
    });
  }, []);

  // Apply template
  const applyTemplate = useCallback(
    async (templateData) => {
      if (!isConnected) {
        throw new Error("WebSocket not connected");
      }

      // Reset state and start application
      resetState();
      setApplicationState((prev) => ({
        ...prev,
        isApplying: true,
        startTime: new Date().toISOString(),
      }));

      try {
        const result = await websocketService.applyTemplate(templateData);
        return result;
      } catch (error) {
        setApplicationState((prev) => ({
          ...prev,
          isApplying: false,
          isComplete: true,
          error: error.message,
          endTime: new Date().toISOString(),
        }));
        throw error;
      }
    },
    [isConnected, websocketService, resetState],
  );

  // Set up event listeners for template application
  useEffect(() => {
    if (!websocketService) return; // Guard

    const unsubscribers = [];

    // Status updates
    unsubscribers.push(
      websocketService.on("status", (data) => {
        setApplicationState((prev) => ({
          ...prev,
          currentStatus: data.message,
        }));
        onStatusUpdate?.(data);
      }),
    );
    // ======================================================================
    // START OF THE FIX
    // ======================================================================
    // Progress updates
    // ✨ FIX 2: This handler now intelligently accumulates step progress.

    unsubscribers.push(
      websocketService.on("progress", (data) => {
        // `data` is the full WS message: { type: 'progress', data: { ...python_object... } }
        const pythonPayload = data.data; // This is the object from the Python script
        const stepData = pythonPayload.data; // This is the ACTUAL step info object we need

        // Guard against malformed progress messages that might not have the nested data
        if (!stepData || typeof stepData.step === "undefined") {
          console.warn(
            "Received malformed progress update, skipping:",
            pythonPayload,
          );
          return;
        }

        setApplicationState((prev) => {
          const newSteps = [...(prev.progress?.steps || [])];

          // Now this findIndex works correctly because `stepData.step` is a valid number
          const stepIndex = newSteps.findIndex((s) => s.step === stepData.step);

          if (stepIndex > -1) {
            // Update an existing step (e.g., from IN_PROGRESS to COMPLETED)
            newSteps[stepIndex] = { ...newSteps[stepIndex], ...stepData };
          } else {
            // Add a new step
            newSteps.push(stepData);
          }

          newSteps.sort((a, b) => a.step - b.step);

          return {
            ...prev,
            currentStatus: pythonPayload.message, // Use the high-level message from Python
            progress: {
              ...prev.progress,
              steps: newSteps,
            },
          };
        });

        onProgressUpdate?.(data);
      }),
    );

    // ======================================================================
    // END OF THE FIX
    // ======================================================================

    // Commit progress
    unsubscribers.push(
      websocketService.on("commit_progress", (data) => {
        setApplicationState((prev) => ({
          ...prev,
          commitProgress: data.message,
        }));
        onCommitProgress?.(data);
      }),
    );

    // Info updates
    unsubscribers.push(
      websocketService.on("info", (data) => {
        setApplicationState((prev) => ({
          ...prev,
          info: [...prev.info, data],
        }));
        onInfoUpdate?.(data);
      }),
    );

    // Results
    unsubscribers.push(
      websocketService.on("result", (data) => {
        setApplicationState((prev) => ({
          ...prev,
          isApplying: false,
          isComplete: true,
          result: data.data,
          endTime: new Date().toISOString(),
        }));
        onResult?.(data);
      }),
    );

    // Errors
    unsubscribers.push(
      websocketService.on("error", (data) => {
        setApplicationState((prev) => ({
          ...prev,
          isApplying: false,
          isComplete: true,
          error: data.message,
          endTime: new Date().toISOString(),
        }));
        onError?.(data);
      }),
    );

    // Cleanup other listeners that are part of the spec but not used in this flow
    const otherListeners = ["status", "commit_progress", "info", "script_end"];
    otherListeners.forEach((event) => {
      const handler =
        options[`on${event.charAt(0).toUpperCase() + event.slice(1)}`];
      if (handler) {
        unsubscribers.push(websocketService.on(event, handler));
      }
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
    // ✨ FIX: Add all the destructured callbacks to the dependency array.
    // This ensures that the listeners are always up-to-date.
  }, [
    websocketService,
    onStatusUpdate,
    onProgressUpdate,
    onCommitProgress,
    onInfoUpdate,
    onResult,
    onError,
  ]);

  return {
    // Connection state
    isConnected,
    clientId,

    // Application state
    ...applicationState,

    // Actions
    applyTemplate,
    resetState,
    // Computed properties
    duration:
      applicationState.startTime && applicationState.endTime
        ? new Date(applicationState.endTime).getTime() -
          new Date(applicationState.startTime).getTime()
        : null,

    hasError: !!applicationState.error,
    hasResult: !!applicationState.result,
  };
};
