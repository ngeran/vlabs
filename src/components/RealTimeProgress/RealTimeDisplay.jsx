// =================================================================================================
// FILE:               src/components/RealTimeProgress/RealTimeDisplay.jsx
//
// OVERVIEW:
//   A comprehensive, reusable React component designed to provide a rich, real-time
//   display for ongoing script executions. It visualizes the progress, live logs, and
//   final status (success or failure) of an operation being tracked via WebSocket events.
//
// KEY FEATURES:
//   - Dynamic Progress Bar: Shows the overall percentage complete, the current step's
//     status message, and step counters, with color-coding for different states (running,
//     success, error).
//   - Live Log Streaming: Renders a scrollable list of real-time progress events,
//     with each step individually styled based on its severity (e.g., INFO, ERROR).
//   - Final Status Banners: Displays a clear, prominent banner upon completion,
//     indicating whether the operation succeeded or failed.
//   - Prop-Driven & Reusable: Designed to be a "dumb" component that simply renders the
//     state given to it via props, making it highly versatile and easy to integrate with
//     any runner component.
//   - Clean & Modern UI: Built with TailwindCSS for a polished and responsive user experience.
//
// HOW-TO GUIDE (INTEGRATION):
//   This component is designed to be used within a "runner" component (e.g.,
//   `FileUploaderRunner.jsx` or `BackupAndRestoreRunner.jsx`).
//
//   1.  **Import**:
//       `import RealTimeDisplay from '../RealTimeProgress/RealTimeDisplay.jsx';`
//
//   2.  **State Management**: The parent runner component is responsible for managing the
//       script's state (typically via the `useScriptRunnerStream` hook).
//
//   3.  **Conditional Rendering**: The parent should conditionally render this component. A
//       robust condition ensures it appears as soon as the process starts:
//       `{(isTriggered || isRunning || isComplete) && <RealTimeDisplay {...props} />}`
//
//   4.  **Prop Passing**: The parent must pass a `realTimeProps` object containing all the
//       necessary state variables, such as `isRunning`, `isComplete`, `progress`,
//       `progressPercentage`, `currentStep`, etc.
//
//       Example `realTimeProps` object:
//       const realTimeProps = {
//         isRunning: scriptRunner.isRunning,
//         isComplete: scriptRunner.isComplete,
//         hasError: !!scriptRunner.error,
//         progress: scriptRunner.progressEvents,
//         result: scriptRunner.finalResult,
//         error: scriptRunner.error,
//         ...progressMetrics, // Contains percentage, currentStep, etc.
//       };
// =================================================================================================

// =================================================================================================
// SECTION 1: IMPORTS
// All necessary libraries and child components are imported here.
// =================================================================================================
import React from 'react';
import ProgressBar from './ProgressBar.jsx';
import ProgressStep from './ProgressStep.jsx';
import { AlertTriangle, CheckCircle, ServerCrash } from 'lucide-react';

// =================================================================================================
// SECTION 2: COMPONENT DEFINITION
// The main functional component for the real-time display.
// =================================================================================================
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
          currentStep={progress.length > 0 ? progress[progress.length - 1].message : currentStep}
          //currentStep={latestMessage?.message || currentStep}
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
            {/* ===================================================================
                THE DEFINITIVE FIX:
                The `key` prop must be absolutely unique for every item in the list.
                We combine the event's timestamp (if it exists) with its mandatory
                index in the array to guarantee uniqueness, even for events that
                arrive simultaneously or lack a timestamp.
                =================================================================== */}
            {progress.map((step, index) => (
              <ProgressStep
                key={step.timestamp ? `${step.timestamp}-${index}` : `step-${index}`} // <-- THE FIX IS HERE
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
