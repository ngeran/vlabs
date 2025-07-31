// =================================================================================================
// FILE:               /src/hooks/useHistory.jsx
//
// DESCRIPTION:
//   A custom React hook that manages all history-related state and interactions. It fetches
//   the initial history log from the server and listens for real-time updates via WebSockets.
//   Modified to debounce history updates to prevent rapid re-renders and log state changes to
//   sessionStorage for debugging across page refreshes.
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
  const [history, setHistory] = useState(() => {
    // Initialize from sessionStorage to persist across refreshes
    const savedHistory = sessionStorage.getItem('history');
    return savedHistory ? JSON.parse(savedHistory) : [];
  });
  const [isLoading, setIsLoading] = useState(true);

  // Helper function to log debug messages to sessionStorage
  const logToSessionStorage = (message, data) => {
    const logs = JSON.parse(sessionStorage.getItem('historyDebugLogs') || '[]');
    logs.push({ timestamp: new Date().toISOString(), message, data });
    sessionStorage.setItem('historyDebugLogs', JSON.stringify(logs));
  };

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
        sessionStorage.setItem('history', JSON.stringify(data.history || []));
        logToSessionStorage('Fetched history from API', { historyLength: data.history?.length });
      } else {
        throw new Error(data.message || 'Failed to parse history data.');
      }
    } catch (error) {
      toast.error(`Could not load history: ${error.message}`);
      setHistory([]);
      sessionStorage.setItem('history', JSON.stringify([]));
      logToSessionStorage('Error fetching history', { error: error.message });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // --- Effect for Initial Data Load ---
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  /**
   * Debounced handler for 'history_update' events to prevent rapid state updates.
   * Updates history state and sessionStorage, logging for debugging.
   */
  const handleHistoryUpdate = useCallback((data) => {
    const newHistoryItem = data.payload;
    if (!newHistoryItem) return;

    logToSessionStorage('Received real-time history update', { newHistoryItem });

    // Debounce state update to prevent rapid re-renders
    const debounceTimeout = setTimeout(() => {
      setHistory((prevHistory) => {
        const newHistory = [newHistoryItem, ...prevHistory];
        sessionStorage.setItem('history', JSON.stringify(newHistory));
        logToSessionStorage('Updated history state', { historyLength: newHistory.length });
        return newHistory;
      });

      toast.success(`New run recorded: ${newHistoryItem.displayName || newHistoryItem.scriptId}`);
    }, 500); // 500ms debounce delay

    return () => clearTimeout(debounceTimeout); // Cleanup debounce timeout
  }, []);

  // --- Effect for WebSocket Subscription ---
  useEffect(() => {
    if (!websocketService) return;

    logToSessionStorage('Subscribing to history_update', {});
    const unsubscribe = websocketService.on('history_update', handleHistoryUpdate);

    return () => {
      unsubscribe();
      logToSessionStorage('Unsubscribed from history_update', {});
    };
  }, [websocketService, handleHistoryUpdate]);

  // --- Return Value ---
  return { history, isLoading, fetchHistory };
};
