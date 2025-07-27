// src/hooks/useHistoryUpdates.js
import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE_URL = "http://localhost:3001";

export function useHistoryUpdates({ websocketService }) {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  // Fetch initial history from API
  const fetchHistory = useCallback(async () => {
    console.log("[DIAG][useHistoryUpdates] Fetching initial history");
    try {
      const response = await fetch(`${API_BASE_URL}/api/history/list`);
      const data = await response.json();
      if (data.success && mountedRef.current) {
        setHistory(data.history);
        console.log("[DIAG][useHistoryUpdates] Initial history fetched:", data.history);
      } else if (!data.success) {
        console.error("[DIAG][useHistoryUpdates] Failed to fetch history:", data.message);
      }
    } catch (error) {
      console.error("[DIAG][useHistoryUpdates] Error fetching history:", error);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        console.log("[DIAG][useHistoryUpdates] Initial fetch complete, isLoading: false");
      }
    }
  }, []);

  // Handle script_end events from WebSocket
  const handleScriptEnd = useCallback(
    (data) => {
      console.log("[DIAG][useHistoryUpdates] Received script_end event:", data);
      if (!mountedRef.current) {
        console.log("[DIAG][useHistoryUpdates] Ignoring script_end - component unmounted");
        return;
      }

      const historyRecord = {
        runId: data.runId,
        scriptId: data.scriptId,
        timestamp: data.timestamp || new Date().toISOString(),
        parameters: data.parameters || {},
        isSuccess: data.exitCode === 0,
        output: data.output || "",
        error: data.error || "",
      };

      setHistory((prev) => {
        const newHistory = [historyRecord, ...prev];
        console.log("[DIAG][useHistoryUpdates] Updated history:", newHistory);
        return newHistory.slice(0, 50); // Match server's MAX_HISTORY_ITEMS
      });
    },
    []
  );

  // Set up WebSocket listener and initial fetch
  useEffect(() => {
    console.log("[DIAG][useHistoryUpdates] Setting up history updates, wsService:", {
      hasWebSocketService: !!websocketService,
      wsServiceMethods: websocketService ? Object.keys(websocketService) : [],
    });

    // Fetch initial history
    fetchHistory();

    // Subscribe to script_end events
    let unsubscribe;
    if (websocketService) {
      console.log("[DIAG][useHistoryUpdates] Subscribing to script_end event");
      unsubscribe = websocketService.on("script_end", handleScriptEnd);
    } else {
      console.warn(
        "[DIAG][useHistoryUpdates] No WebSocket service provided, real-time updates disabled"
      );
    }

    // Cleanup
    return () => {
      mountedRef.current = false;
      if (unsubscribe) {
        console.log("[DIAG][useHistoryUpdates] Unsubscribing from script_end event");
        try {
          unsubscribe();
        } catch (err) {
          console.warn("[DIAG][useHistoryUpdates] Error unsubscribing:", err);
        }
      }
    };
  }, [websocketService, fetchHistory, handleScriptEnd]);

  return { history, isLoading };
}
