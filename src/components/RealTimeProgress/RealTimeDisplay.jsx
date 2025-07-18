// src/components/RealTimeProgress/RealTimeDisplay.jsx
import React from 'react';
import ProgressBar from './ProgressBar.jsx';
import ProgressStep from './ProgressStep.jsx';
import { AlertTriangle, CheckCircle, ServerCrash } from 'lucide-react';

const RealTimeDisplay = ({
  isRunning,
  isComplete,
  hasError,
  progress = [],
  currentStep,
  result,
  error,
  totalSteps,
  completedSteps,
  progressPercentage,
  onReset,
  isActive = false,
  canReset = false,
  latestMessage,
}) => {
  console.log('[DIAG][RealTimeDisplay] Received props:', {
    isActive,
    isRunning,
    isComplete,
    hasError,
    progressLength: progress.length,
    progressPercentage,
    currentStep,
    totalSteps,
    completedSteps,
    latestMessage
  });

  const shouldShow = isActive || isRunning || isComplete || hasError || progress.length > 0;
  console.log('[DIAG][RealTimeDisplay] shouldShow:', shouldShow);

  if (!shouldShow) {
    console.log('[DIAG][RealTimeDisplay] Not rendering - no activity detected');
    return null;
  }

  console.log('[DIAG][RealTimeDisplay] Rendering component');

  return (
    <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50 space-y-6">
      <header className="space-y-4">
        <h3 className="text-xl font-bold text-slate-800">
          {isRunning ? 'Operation in Progress...' :
           isComplete ? 'Operation Complete' :
           hasError ? 'Operation Failed' : 'Real-time Updates'}
        </h3>
        <ProgressBar
          percentage={progressPercentage}
          currentStep={latestMessage?.message || currentStep}
          totalSteps={totalSteps}
          completedSteps={completedSteps}
          isRunning={isRunning}
          isComplete={isComplete}
          hasError={hasError}
        />
      </header>
      {progress.length > 0 && (
        <div className="border-t border-slate-200 pt-4">
          <h4 className="font-semibold text-slate-700 mb-2">Live Log:</h4>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
            {progress.map((step, index) => (
              <ProgressStep
                key={step.id || `step-${index}`}
                step={step}
                isLatest={index === progress.length - 1}
              />
            ))}
          </div>
        </div>
      )}
      {(isComplete || hasError) && (
        <div className="border-t border-slate-200 pt-4 space-y-4">
          {hasError ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-3">
                <AlertTriangle className="text-red-500 flex-shrink-0" size={24} />
                <div>
                  <h4 className="font-bold text-red-800">Operation Failed</h4>
                  <p className="text-red-700 text-sm mt-1">
                    {error?.message || 'An unknown error occurred.'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle className="text-green-500 flex-shrink-0" size={24} />
                <div>
                  <h4 className="font-bold text-green-800">Operation Successful</h4>
                  <p className="text-green-700 text-sm mt-1">
                    {result?.message || 'The operation completed successfully.'}
                  </p>
                </div>
              </div>
            </div>
          )}
          {result && result !== null && typeof result === 'object' && Object.keys(result).length > 0 && (
            <div>
              <h4 className="font-semibold text-slate-700 mb-2">Final Result:</h4>
              <pre className="bg-slate-900 text-white p-4 rounded-md text-xs overflow-auto max-h-96">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
          {error && error !== null && typeof error === 'object' && Object.keys(error).length > 0 && (
            <div>
              <h4 className="font-semibold text-slate-700 mb-2">Error Details:</h4>
              <pre className="bg-slate-900 text-red-300 p-4 rounded-md text-xs overflow-auto max-h-96">
                {JSON.stringify(error, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
      {canReset && onReset && (
        <div className="border-t border-slate-200 pt-4 flex justify-end">
          <button
            onClick={onReset}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
          >
            Clear Log
          </button>
        </div>
      )}
    </div>
  );
};

export default RealTimeDisplay;
