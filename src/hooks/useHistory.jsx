// =================================================================================================
// FILE:               /src/hooks/useHistory.jsx
//
// DESCRIPTION:
//   A custom React hook that manages all history-related state and interactions. It fetches
//   the initial history log from the server and then listens for real-time updates via
//   WebSockets, providing a live data source to UI components.
// =================================================================================================

// SECTION 1: IMPORTS & CONFIGURATION
// -------------------------------------------------------------------------------------------------
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

const API_BASE_URL = "http://localhost:3001";

// SECTION 2: HOOK DEFINITION
// -------------------------------------------------------------------------------------------------
export const useHistory = (wsContext) => {
  // Destructure the WebSocket service from the context provided by the parent component.
  const { websocketService } = wsContext;

  // --- State Management ---
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Fetches the entire history log from the backend API.
   * Memoized with useCallback to prevent re-creation on every render.
   */
  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/history`);
      if (!response.ok) {
        throw new Error('Server responded with an error.');
      }
      const data = await response.json();
      if (data.success) {
        setHistory(data.history || []);
      } else {
        throw new Error(data.message || 'Failed to parse history data.');
      }
    } catch (error) {
      toast.error(`Could not load history: ${error.message}`);
      setHistory([]); // Clear history on error to prevent displaying stale data.
    } finally {
      setIsLoading(false);
    }
  }, []);

  // --- Effect for Initial Data Load ---
  // Runs once when the hook is first used to populate the initial history list.
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  /**
   * Handles incoming 'history_update' events from the WebSocket.
   * This function is triggered by the broadcast from our historyService on the backend.
   */
  const handleHistoryUpdate = useCallback((data) => {
    const newHistoryItem = data.payload;
    if (!newHistoryItem) return;

    console.log('[useHistory] Received real-time history update:', newHistoryItem);

    // Use functional state update to prepend the new item to the list.
    setHistory(prevHistory => [newHistoryItem, ...prevHistory]);

    // Provide a subtle notification to the user.
    toast.success(`New run recorded: ${newHistoryItem.displayName || newHistoryItem.scriptId}`);
  }, []);

  // --- Effect for WebSocket Subscription ---
  // Sets up and tears down the listener for real-time updates.
  useEffect(() => {
    // Do nothing if the WebSocket service isn't available yet.
    if (!websocketService) return;

    // Subscribe to the event. The .on() method returns an unsubscribe function.
    const unsubscribe = websocketService.on('history_update', handleHistoryUpdate);

    // The returned function is the "cleanup" function. React runs this when the
    // component unmounts, preventing memory leaks.
    return () => {
      unsubscribe();
    };
  }, [websocketService, handleHistoryUpdate]);

  // --- Return Value ---
  // Expose the state and the fetch function to the consuming component.
  return { history, isLoading, fetchHistory };
};
