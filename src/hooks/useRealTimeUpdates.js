// src/hooks/useRealTimeUpdates.js
import { useState, useCallback, useRef, useEffect } from 'react';

export function useRealTimeUpdates(wsContext = {}, options = {}) {
  const {
    onProgress = () => {},
    onComplete = () => {},
    onError = () => {},
    onStart = () => {},
    resetOnStart = true,
    debug = true // Enable debug mode by default for diagnostics
  } = options;

  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [progress, setProgress] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [currentStep, setCurrentStep] = useState(null);
  const [totalSteps, setTotalSteps] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(0);
  const [progressPercentage, setProgressPercentage] = useState(0);

  const activeOperationRef = useRef(null);
  const timeoutRef = useRef(null);
  const listenerCleanupRef = useRef([]);
  const mountedRef = useRef(true);

  console.log('[DIAG][useRealTimeUpdates] Hook initialized with options:', { resetOnStart, debug });

  useEffect(() => {
    if (totalSteps > 0) {
      setProgressPercentage(Math.round((completedSteps / totalSteps) * 100));
      console.log('[DIAG][useRealTimeUpdates] Updated progressPercentage:', {
        completedSteps,
        totalSteps,
        progressPercentage: Math.round((completedSteps / totalSteps) * 100)
      });
    }
  }, [completedSteps, totalSteps]);

  const handleMessage = useCallback((message) => {
    console.log('[DIAG][useRealTimeUpdates] handleMessage called with:', message);
    console.log('[DIAG][useRealTimeUpdates] Current state:', {
      isRunning,
      activeOperationRef: activeOperationRef.current,
      mounted: mountedRef.current
    });

    if (!mountedRef.current) {
      console.log('[DIAG][useRealTimeUpdates] Ignoring message - component unmounted');
      return;
    }

    if (debug) {
      console.log('[DIAG][useRealTimeUpdates] Debug: Received message:', message);
    }

    // If operationId is provided, filter messages to match active operation
    if (activeOperationRef.current && message.data?.operationId && message.data.operationId !== activeOperationRef.current) {
      console.log('[DIAG][useRealTimeUpdates] Ignoring message - operationId mismatch:', {
        received: message.data.operationId,
        expected: activeOperationRef.current
      });
      return;
    }

    const { type, data, step, total_steps, event_type, level, message: msg, timestamp } = message;

    const progressEntry = {
      id: Date.now() + Math.random(),
      timestamp: timestamp || new Date().toISOString(),
      message: msg || data?.message || JSON.stringify(data || message),
      type: level === 'ERROR' ? 'error' :
            level === 'SUCCESS' ? 'success' :
            level === 'WARNING' ? 'warning' : 'info',
      step: data?.step || step || null,
      event_type: event_type,
      level: level,
      data: data
    };

    console.log('[DIAG][useRealTimeUpdates] Created progress entry:', progressEntry);

    setProgress(prev => {
      const newProgress = [...prev, progressEntry];
      console.log('[DIAG][useRealTimeUpdates] Updated progress:', newProgress);
      return newProgress;
    });

    if (event_type === 'OPERATION_START') {
      console.log('[DIAG][useRealTimeUpdates] Operation started');
      if (data?.total_steps) {
        setTotalSteps(data.total_steps);
        console.log('[DIAG][useRealTimeUpdates] Set totalSteps:', data.total_steps);
      }
    } else if (event_type === 'STEP_START') {
      console.log('[DIAG][useRealTimeUpdates] Step started:', data?.step);
      if (data?.step) {
        setCurrentStep(data.step);
        console.log('[DIAG][useRealTimeUpdates] Set currentStep:', data.step);
      }
    } else if (event_type === 'STEP_COMPLETE') {
      console.log('[DIAG][useRealTimeUpdates] Step completed:', data?.step);
      if (data?.step) {
        setCompletedSteps(prev => {
          const newCompleted = Math.max(prev, data.step);
          console.log('[DIAG][useRealTimeUpdates] Updated completedSteps:', newCompleted);
          return newCompleted;
        });
      }
    } else if (event_type === 'OPERATION_COMPLETE') {
      console.log('[DIAG][useRealTimeUpdates] Operation completed');
      setIsRunning(false);
      setIsComplete(true);
      setResult(data);
      console.log('[DIAG][useRealTimeUpdates] Updated state for OPERATION_COMPLETE:', {
        isRunning: false,
        isComplete: true,
        result: data
      });
      onComplete(data);
      activeOperationRef.current = null;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        console.log('[DIAG][useRealTimeUpdates] Cleared timeout');
      }
    } else if (level === 'ERROR') {
      console.log('[DIAG][useRealTimeUpdates] Error received:', data);
      setIsRunning(false);
      setHasError(true);
      setError(data || { message: msg || 'An error occurred' });
      console.log('[DIAG][useRealTimeUpdates] Updated state for ERROR:', {
        isRunning: false,
        hasError: true,
        error: data || { message: msg }
      });
      onError(data || { message: msg });
      activeOperationRef.current = null;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        console.log('[DIAG][useRealTimeUpdates] Cleared timeout');
      }
    } else {
      onProgress(message);
      console.log('[DIAG][useRealTimeUpdates] Processed progress message');
    }
  }, [onProgress, onComplete, onError, debug, isRunning]);

  const setupWebSocketListener = useCallback(() => {
    console.log('[DIAG][useRealTimeUpdates] setupWebSocketListener called, wsContext:', {
      wsContext,
      wsServiceMethods: wsContext?.websocketService ? Object.keys(wsContext.websocketService) : wsContext ? Object.keys(wsContext) : 'null'
    });

    if (!wsContext?.websocketService) {
      console.error('[DIAG][useRealTimeUpdates] WebSocket service is not available');
      throw new Error('WebSocket service is not available.');
    }

    // Clean up existing listeners
    if (listenerCleanupRef.current.length > 0) {
      console.log('[DIAG][useRealTimeUpdates] Cleaning up existing listeners');
      listenerCleanupRef.current.forEach(unsubscribe => {
        try {
          unsubscribe();
        } catch (err) {
          console.warn('[DIAG][useRealTimeUpdates] Error cleaning up listener:', err);
        }
      });
      listenerCleanupRef.current = [];
    }

    const wsService = wsContext.websocketService;
    console.log('[DIAG][useRealTimeUpdates] Subscribing to WebSocket events');

    // Subscribe to progress, result, and error events
    const unsubscribeProgress = wsService.on('progress', handleMessage);
    const unsubscribeResult = wsService.on('result', handleMessage);
    const unsubscribeError = wsService.on('error', handleMessage);

    listenerCleanupRef.current = [unsubscribeProgress, unsubscribeResult, unsubscribeError];
    console.log('[DIAG][useRealTimeUpdates] Subscribed to events:', ['progress', 'result', 'error']);

    return () => {
      console.log('[DIAG][useRealTimeUpdates] Cleaning up WebSocket listeners');
      listenerCleanupRef.current.forEach(unsubscribe => {
        try {
          unsubscribe();
        } catch (err) {
          console.warn('[DIAG][useRealTimeUpdates] Error cleaning up listener:', err);
        }
      });
      listenerCleanupRef.current = [];
    };
  }, [wsContext, handleMessage]);

  const resetState = useCallback(() => {
    console.log('[DIAG][useRealTimeUpdates] Resetting state');
    setIsRunning(false);
    setIsComplete(false);
    setHasError(false);
    setProgress([]);
    setCurrentStep(null);
    setResult(null);
    setError(null);
    setTotalSteps(0);
    setCompletedSteps(0);
    setProgressPercentage(0);
    activeOperationRef.current = null;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      console.log('[DIAG][useRealTimeUpdates] Cleared timeout on reset');
    }
  }, []);

  const startOperation = useCallback(async (operationFn) => {
    console.log('[DIAG][useRealTimeUpdates] startOperation called, isRunning:', isRunning);
    if (isRunning) {
      console.log('[DIAG][useRealTimeUpdates] Operation already running, ignoring');
      return;
    }

    if (resetOnStart) {
      resetState();
      console.log('[DIAG][useRealTimeUpdates] State reset on start');
    }

    setIsRunning(true);
    onStart();
    activeOperationRef.current = Date.now().toString();
    console.log('[DIAG][useRealTimeUpdates] Operation started with ID:', activeOperationRef.current);

    setProgress(prev => [...prev, {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      message: 'Starting operation...',
      type: 'info'
    }]);
    console.log('[DIAG][useRealTimeUpdates] Added initial progress entry');

    try {
      console.log('[DIAG][useRealTimeUpdates] Setting up WebSocket listeners');
      setupWebSocketListener();
      console.log('[DIAG][useRealTimeUpdates] Executing operation function');
      const response = await operationFn();
      console.log('[DIAG][useRealTimeUpdates] Operation function completed:', response);

      if (response?.operationId) {
        activeOperationRef.current = response.operationId;
        console.log('[DIAG][useRealTimeUpdates] Updated operation ID:', response.operationId);
      }

      timeoutRef.current = setTimeout(() => {
        console.log('[DIAG][useRealTimeUpdates] Operation timeout reached');
        if (activeOperationRef.current && mountedRef.current) {
          handleMessage({
            type: 'progress',
            event_type: 'OPERATION_COMPLETE',
            level: 'ERROR',
            message: 'Operation timed out after 5 minutes',
            data: { message: 'Operation timed out after 5 minutes' }
          });
        }
      }, 300000);
    } catch (err) {
      console.error('[DIAG][useRealTimeUpdates] Operation failed:', err);
      handleMessage({
        type: 'error',
        event_type: 'OPERATION_COMPLETE',
        level: 'ERROR',
        message: err.message || 'Operation failed to start.',
        data: { message: err.message || 'Operation failed to start.' }
      });
    }
  }, [isRunning, resetOnStart, resetState, onStart, setupWebSocketListener, handleMessage]);

  useEffect(() => {
    mountedRef.current = true;
    console.log('[DIAG][useRealTimeUpdates] Component mounted');
    return () => {
      console.log('[DIAG][useRealTimeUpdates] Component unmounting');
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        console.log('[DIAG][useRealTimeUpdates] Cleared timeout on unmount');
      }
      if (listenerCleanupRef.current.length > 0) {
        console.log('[DIAG][useRealTimeUpdates] Cleaning up WebSocket listeners on unmount');
        listenerCleanupRef.current.forEach(unsubscribe => {
          try {
            unsubscribe();
          } catch (err) {
            console.warn('[DIAG][useRealTimeUpdates] Error cleaning up listener:', err);
          }
        });
        listenerCleanupRef.current = [];
      }
      activeOperationRef.current = null;
    };
  }, []);

  return {
    isRunning,
    isComplete,
    hasError,
    isActive: isRunning || isComplete || hasError || progress.length > 0,
    canReset: !isRunning,
    progress,
    result,
    error,
    latestMessage: progress.length > 0 ? progress[progress.length - 1] : null,
    currentStep,
    totalSteps,
    completedSteps,
    progressPercentage,
    startOperation,
    resetState,
  };
}
