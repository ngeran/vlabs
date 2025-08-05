// =============================================================================
// FILE:               src/components/shared/ScriptOutputDisplay.jsx
//
// DESCRIPTION:
//   Component for displaying real-time script execution output, including progress
//   events, final results, and errors.
//
// OVERVIEW:
//   This component renders a scrollable log of progress events as they arrive via
//   WebSocket, followed by the final result or error when the script completes.
//   It supports debug mode for detailed output and ensures smooth real-time updates.
//
// KEY FEATURES:
//   - Displays progress events in real-time with timestamps.
//   - Renders tabular results for completed scripts.
//   - Shows error messages with details.
//   - Auto-scrolls to the latest progress event.
//   - Supports debug mode for verbose output.
//
// DEPENDENCIES:
//   - react: For component rendering and hooks (useEffect, useRef).
//   - lucide-react: For AlertTriangle icon.
//
// HOW TO USE:
//   Use this component in a runner component that provides execution state:
//   ```javascript
//   import ScriptOutputDisplay from '../components/shared/ScriptOutputDisplay';
//
//   function Runner({ script, isRunning, isComplete, progressEvents, finalResult, error, showDebug }) {
//     return (
//       <ScriptOutputDisplay
//         script={script}
//         isRunning={isRunning}
//         isComplete={isComplete}
//         progressEvents={progressEvents}
//         finalResult={finalResult}
//         error={error}
//         showDebug={showDebug}
//       />
//     );
//   }
//   ```
// =============================================================================

// =============================================================================
// SECTION 1: IMPORTS
// =============================================================================
import React, { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

// =============================================================================
// SECTION 2: UTILITY FUNCTIONS
// =============================================================================
/**
 * Formats a timestamp for display.
 * @param {string} timestamp - ISO timestamp.
 * @returns {string} Formatted time (e.g., "14:30:45").
 */
const formatTimestamp = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString();
};

/**
 * Renders a single progress event.
 * @param {Object} event - Progress event object.
 * @returns {JSX.Element} Rendered event.
 */
const renderProgressEvent = (event) => (
  <div key={event.id} className="text-sm text-slate-600">
    <span className="font-mono text-xs text-slate-400 mr-2">
      {formatTimestamp(event.timestamp)}
    </span>
    {event.message}
    {event.data?.status && (
      <span className="ml-2 text-xs font-semibold text-blue-600">
        [{event.data.status}]
      </span>
    )}
  </div>
);

/**
 * Renders tabular results from the final result data.
 * @param {Object} result - Final result data.
 * @returns {JSX.Element|null} Rendered table or null if no tabular data.
 */
const renderResultTable = (result) => {
  if (!result.results_by_host || !Array.isArray(result.results_by_host)) return null;

  return result.results_by_host.map((hostResult, index) => (
    <div key={index} className="mt-4">
      <h4 className="text-md font-semibold text-slate-800">
        Results for {hostResult.hostname} ({hostResult.status})
      </h4>
      {hostResult.test_results.map((test, testIndex) => (
        <div key={testIndex} className="mt-2">
          <h5 className="text-sm font-medium text-slate-700">{test.title}</h5>
          {test.data && Array.isArray(test.data) && test.headers ? (
            <table className="min-w-full divide-y divide-slate-200 mt-2">
              <thead>
                <tr>
                  {test.headers.map((header) => (
                    <th
                      key={header}
                      className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {test.data.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {test.headers.map((header) => (
                      <td
                        key={header}
                        className="px-4 py-2 whitespace-pre-line text-sm text-slate-600"
                      >
                        {row[header]?.trim() || "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-500 italic">No tabular data available.</p>
          )}
          {test.error && (
            <p className="text-sm text-red-600 mt-2">Error: {test.error}</p>
          )}
        </div>
      ))}
    </div>
  ));
};

// =============================================================================
// SECTION 3: MAIN COMPONENT
// =============================================================================
/**
 * Displays script execution output.
 * @param {Object} props - Component props.
 * @param {Object} props.script - Script metadata.
 * @param {boolean} props.isRunning - Whether the script is running.
 * @param {boolean} props.isComplete - Whether the script has completed.
 * @param {Array} props.progressEvents - Array of progress events.
 * @param {Object} props.finalResult - Final result data.
 * @param {Object} props.error - Error data, if any.
 * @param {boolean} props.showDebug - Whether to show debug output.
 */
function ScriptOutputDisplay({ script, isRunning, isComplete, progressEvents, finalResult, error, showDebug }) {
  const outputRef = useRef(null);

  // Auto-scroll to the latest progress event
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [progressEvents]);

  // Render loading state
  if (isRunning && progressEvents.length === 0) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
        <p className="text-sm text-slate-500 italic">Waiting for script output...</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Script Output</h3>
      <div
        ref={outputRef}
        className="max-h-96 overflow-y-auto border border-slate-200 rounded-md p-4 space-y-2"
      >
        {/* Progress Events */}
        {progressEvents.map(renderProgressEvent)}

        {/* Final Result */}
        {isComplete && finalResult && (
          <div className="mt-4">
            <h4 className="text-md font-semibold text-slate-800">Final Results</h4>
            {renderResultTable(finalResult)}
          </div>
        )}

        {/* Error Display */}
        {isComplete && error && (
          <div className="mt-4 flex items-center text-red-600">
            <AlertTriangle size={18} className="mr-2" />
            <div>
              <p className="text-sm font-semibold">Error: {error.message}</p>
              {showDebug && error.details && (
                <pre className="text-xs text-red-500 mt-2">{JSON.stringify(error.details, null, 2)}</pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// SECTION 4: EXPORT
// =============================================================================
export default ScriptOutputDisplay;
