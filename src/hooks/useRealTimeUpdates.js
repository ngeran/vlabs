// src/hooks/useRealTimeUpdates.js
import { useState, useCallback, useRef, useEffect } from 'react';

export function useRealTimeUpdates(wsContext = {}, options = {}) {
  const {
    onProgress = () => {},
    onComplete = () => {},
    onError = () => {},
    onStart = () => {},
    resetOnStart = true,
    debug = true
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
  // FIX: Use a ref to track the running state to avoid stale closures in callbacks.
  const isRunningRef = useRef(false);

  console.log('[DIAG][useRealTimeUpdates] Hook initialized with options:', { resetOnStart, debug });

  // FIX: Keep the ref in sync with the state value for other parts of the component.
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    if (totalSteps > 0) {
      setProgressPercentage(Math.round((completedSteps / totalSteps) * 100));
    } else {
      setProgressPercentage(0);
    }
  }, [completedSteps, totalSteps]);

  const handleMessage = useCallback((message) => {
    if (!mountedRef.current) return;
    if (debug) console.log('[DIAG][useRealTimeUpdates] Debug: Received message:', message);

    console.log('[DIAG][useRealTimeUpdates] Received message details:', {
      messageOperationId: message.data?.operationId,
      activeOperationId: activeOperationRef.current,
      fullMessage: JSON.stringify(message)
    });

    if (activeOperationRef.current && message.data?.operationId && message.data.operationId !== activeOperationRef.current) {
    console.log('[DIAG][useRealTimeUpdates] Ignoring message - operationId mismatch');
    return;
    }
    const { data, step, event_type, level, message: msg, timestamp } = message;
    const progressEntry = {
      id: Date.now() + Math.random(),
      timestamp: timestamp || new Date().toISOString(),
      message: msg || data?.message || JSON.stringify(data || message),
      type: level === 'ERROR' ? 'error' : level === 'SUCCESS' ? 'success' : level === 'WARNING' ? 'warning' : 'info',
      step: data?.step || step || null,
      event_type: event_type,
      level: level,
      data: data
    };

    setProgress(prev => [...prev, progressEntry]);

    if (event_type === 'OPERATION_START') {
      if (data?.total_steps) setTotalSteps(data.total_steps);
    } else if (event_type === 'STEP_START') {
      if (data?.step) {
        setCurrentStep(data.step);
        setTotalSteps(prevTotal => Math.max(prevTotal, data.step));
      }
    } else if (event_type === 'STEP_COMPLETE') {
      if (data?.step) {
        setCompletedSteps(prevCompleted => Math.max(prevCompleted, data.step));
        setCurrentStep(null);
        setTotalSteps(prevTotal => Math.max(prevTotal, data.step));
      }
    } else if (event_type === 'OPERATION_COMPLETE') {
      setIsRunning(false);
      setIsComplete(true);
      setResult(data);
      onComplete(data);
      activeOperationRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    } else if (level === 'ERROR') {
      setIsRunning(false);
      setHasError(true);
      setError(data || { message: msg || 'An error occurred' });
      onError(data || { message: msg });
      activeOperationRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    } else {
      onProgress(message);
    }
  }, [onProgress, onComplete, onError, debug]);

  const setupWebSocketListener = useCallback(() => {
    if (!wsContext?.websocketService) {
      console.error('[DIAG][useRealTimeUpdates] WebSocket service is not available');
      throw new Error('WebSocket service is not available.');
    }
    if (listenerCleanupRef.current.length > 0) {
      listenerCleanupRef.current.forEach(unsubscribe => unsubscribe());
    }
    const wsService = wsContext.websocketService;
    const unsubscribeProgress = wsService.on('progress', handleMessage);
    const unsubscribeResult = wsService.on('result', handleMessage);
    const unsubscribeError = wsService.on('error', handleMessage);
    listenerCleanupRef.current = [unsubscribeProgress, unsubscribeResult, unsubscribeError];
  }, [wsContext, handleMessage]);

  const resetState = useCallback(() => {
    console.log('[DIAG][useRealTimeUpdates] Resetting state');
    setIsRunning(false);
    // FIX: Ensure the ref is also reset.
    isRunningRef.current = false;
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
    }
  }, []);

  const startOperation = useCallback(async (operationFn) => {
    console.log('[DIAG][useRealTimeUpdates] startOperation called');
    // FIX: Use the ref for the guard clause. This always has the current value and avoids stale state.
    if (isRunningRef.current) {
      console.log('[DIAG][useRealTimeUpdates] Operation already running, ignoring');
      return;
    }

    if (resetOnStart) {
      resetState();
    }

    setIsRunning(true);
    onStart();
    activeOperationRef.current = Date.now().toString();

    setProgress(prev => [...prev, { id: Date.now(), timestamp: new Date().toISOString(), message: 'Starting operation...', type: 'info' }]);

    try {
      console.log('[DIAG][useRealTimeUpdates] Setting up WebSocket listeners');
      setupWebSocketListener();
      console.log('[DIAG][useRealTimeUpdates] Executing operation function');
      const response = await operationFn();
      console.log('[DIAG][useRealTimeUpdates] Operation started, response:', {
        operationId: response?.operationId,
        activeOperationId: activeOperationRef.current
      });
      if (response?.operationId) {
        activeOperationRef.current = response.operationId;
      }
    } catch (err) {
      console.error('[DIAG][useRealTimeUpdates] Operation failed:', err);
      handleMessage({ type: 'error', event_type: 'OPERATION_COMPLETE', level: 'ERROR', data: { message: err.message || 'Operation failed to start.' } });
    }
  // FIX: Removed `isRunning` from dependency array to make `startOperation` stable.
  }, [resetOnStart, resetState, onStart, setupWebSocketListener, handleMessage]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (listenerCleanupRef.current.length > 0) {
        listenerCleanupRef.current.forEach(unsubscribe => unsubscribe());
      }
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
