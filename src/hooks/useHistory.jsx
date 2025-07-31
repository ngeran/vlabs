// =================================================================================================
//
// HOOK:                 useHistory.jsx
// FILE:                 /src/hooks/useHistory.jsx
//
// OVERVIEW:
//   A custom React hook that manages all history-related state and interactions. It
//   fetches the initial history log and listens for real-time updates via WebSockets.
//   It is designed to be robust, persisting the history log to sessionStorage to
//   survive page refreshes.
//
// KEY FEATURES:
//   - Real-Time Updates: Subscribes to WebSocket 'history_update' events to append
//     new run logs in real-time.
//   - State Persistence: Initializes its state from sessionStorage and uses a
//     `useEffect` hook to persist any changes back, ensuring data is not lost.
//   - Clean Side Effects: Follows React best practices by separating pure state
//     updates from side effects (like writing to sessionStorage), which prevents
//     race conditions and ensures stable re-renders.
//   - Initial Data Fetch: Fetches the complete history log on initial load.
//
// DEPENDENCIES:
//   - React Core Hooks: (useState, useEffect, useCallback).
//   - Libraries: `react-hot-toast` for user notifications.
//
// =================================================================================================


// SECTION 1: IMPORTS & CONFIGURATION
// -------------------------------------------------------------------------------------------------
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

const API_BASE_URL = "http://localhost:3001";

// SECTION 2: HOOK DEFINITION
// -------------------------------------------------------------------------------------------------
export const useHistory = (wsContext) => {
  const { websocketService } = wsContext;

  // --- State Management ---
  const [history, setHistory] = useState(() => {
    // Initialize state directly from sessionStorage for persistence.
    const savedHistory = sessionStorage.getItem('history');
    return savedHistory ? JSON.parse(savedHistory) : [];
  });
  const [isLoading, setIsLoading] = useState(true);

  // Helper for logging debug info to sessionStorage.
  const logToSessionStorage = (message, data) => {
    const logs = JSON.parse(sessionStorage.getItem('historyDebugLogs') || '[]');
    logs.push({ timestamp: new Date().toISOString(), message, data });
    sessionStorage.setItem('historyDebugLogs', JSON.stringify(logs));
  };


  // SECTION 3: DATA FETCHING & REAL-TIME UPDATES
  // -------------------------------------------------------------------------------------------------
  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/history`);
      if (!response.ok) throw new Error('Server responded with an error.');

      const data = await response.json();
      if (data.success) {
        setHistory(data.history || []);
      } else {
        throw new Error(data.message || 'Failed to parse history data.');
      }
    } catch (error) {
      toast.error(`Could not load history: ${error.message}`);
      setHistory([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleHistoryUpdate = useCallback((data) => {
    const newHistoryItem = data.payload;
    if (!newHistoryItem) return;

    logToSessionStorage('Received real-time history update', { newHistoryItem });

    // The state update is now "pure" - its only job is to compute the new state.
    setHistory((prevHistory) => [newHistoryItem, ...prevHistory]);

    toast.success(`New run recorded: ${newHistoryItem.displayName || newHistoryItem.scriptId}`);
  }, []); // Empty dependency array ensures this function is stable.


  // SECTION 4: LIFECYCLE EFFECTS
  // -------------------------------------------------------------------------------------------------
  // Effect for Initial Data Load
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ========== START OF FIX ==========
  /**
   * Effect to handle side-effects whenever the history state changes.
   * This is the recommended React pattern for synchronizing state with an external
   * system like sessionStorage. It runs *after* React has updated the state and
   * re-rendered, preventing race conditions.
   */
  useEffect(() => {
    sessionStorage.setItem('history', JSON.stringify(history));
    logToSessionStorage('Persisted history state to sessionStorage', { historyLength: history.length });
  }, [history]); // This effect runs whenever the `history` object changes.
  // ========== END OF FIX ==========

  // Effect for WebSocket Subscription
  useEffect(() => {
    if (!websocketService) return;

    logToSessionStorage('Subscribing to history_update', {});
    const unsubscribe = websocketService.on('history_update', handleHistoryUpdate);

    // Cleanup function to unsubscribe when the component unmounts.
    return () => {
      unsubscribe();
      logToSessionStorage('Unsubscribed from history_update', {});
    };
  }, [websocketService, handleHistoryUpdate]);


  // SECTION 5: RETURN VALUE
  // -------------------------------------------------------------------------------------------------
  return { history, isLoading, fetchHistory };
};
