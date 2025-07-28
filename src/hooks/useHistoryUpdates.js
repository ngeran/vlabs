// =================================================================================================
//
//  HOOK: useHistoryUpdates.js (CORRECTED & SIMPLIFIED)
//  PATH: src/hooks/useHistoryUpdates.js
//
// =================================================================================================
//
//  DESCRIPTION:
//  This is the definitive, corrected version of the history hook. It follows a robust,
//  server-authoritative pattern.
//
//  LOGIC:
//  1. INITIAL FETCH: On first mount, it makes a standard API call to `/api/history/list` to
//     get the current history. This handles the initial page load.
//  2. LIVE UPDATES: It subscribes to a single WebSocket event: `history_updated`. It does NOT
//     try to build the history itself from `script_end` events.
//  3. STATE MANAGEMENT: When it receives a `history_updated` event, it replaces its entire
//     local history state with the new, complete list sent from the server.
//
// =================================================================================================

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";

const API_BASE_URL = "http://localhost:3001";

export function useHistoryUpdates({ websocketService }) {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // This effect runs ONCE on mount to get the initial state of the history.
  useEffect(() => {
    const fetchInitialHistory = async () => {
      setIsLoading(true);
      console.log("[useHistoryUpdates] Fetching initial history via API...");
      try {
        const response = await fetch(`${API_BASE_URL}/api/history/list`);
        const data = await response.json();
        if (data.success) {
          setHistory(data.history || []);
          console.log(
            `[useHistoryUpdates] Initial history loaded. Count: ${data.history?.length || 0}`,
          );
        } else {
          throw new Error(data.message);
        }
      } catch (error) {
        console.error(
          "[useHistoryUpdates] Error fetching initial history:",
          error,
        );
        toast.error("Could not load run history.");
      } finally {
        // This is crucial to stop the "loading..." message in the drawer.
        setIsLoading(false);
      }
    };

    fetchInitialHistory();
  }, []); // Empty array ensures this runs only once.

  // This effect sets up the WebSocket listener for LIVE updates.
  useEffect(() => {
    if (!websocketService) {
      return;
    }

    // This is the handler for our new, server-authoritative event.
    const handleHistoryBroadcast = (data) => {
      console.log(
        "[useHistoryUpdates] Received 'history_updated' broadcast from server.",
      );
      // The payload (`data.history`) is the complete, new history list.
      // We simply replace our state with it. No client-side logic needed.
      setHistory(data.history || []);
    };

    // Subscribe to the broadcast event.
    console.log("[useHistoryUpdates] Subscribing to 'history_updated' events.");
    const unsubscribe = websocketService.on(
      "history_updated",
      handleHistoryBroadcast,
    );

    // Cleanup function to prevent memory leaks.
    return () => {
      console.log("[useHistoryUpdates] Unsubscribing from history updates.");
      unsubscribe();
    };
  }, [websocketService]); // Reruns if the service instance changes.

  return { history, isLoading };
}
