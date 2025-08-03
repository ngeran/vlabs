// =========================================================================================
//
// COMPONENT:          ScriptOutputDisplay.jsx
// FILE:               /src/components/shared/ScriptOutputDisplay.jsx
//
// OVERVIEW:
//   A universal, shared component responsible for rendering the entire output section for
//   any script execution. It handles all possible states: running, completed successfully,
//   and failed with an error. This component is the single source of truth for how
//   script progress and results are displayed to the user.
//
// KEY FEATURES:
//   - Unified Display Logic: Centralizes all output rendering, ensuring a consistent
//     user experience across all feature runners (JSNAPy, Backup & Restore, etc.).
//   - Robust Live Progress Tracking: Features a "Live Log" that accurately displays the
//     most recent message from the backend, providing real-time feedback.
//   - Accurate Progress Bar: Correctly calculates and displays step-based progress.
//   - Resilient Results Rendering: It can render known structured data formats (like
//     tables or messages) but also includes a fallback to display raw JSON. This prevents
//     the UI from showing a blank screen if the backend sends an unexpected data structure.
//   - Metadata-Driven Save Button: The "Save Report" button's visibility is controlled
//     by the script's metadata (`enableReportSaving: true`) and appears upon successful
//     completion, independent of the specific format of the final result object.
//   - Integrated Debug View: Includes a collapsible section to display raw progress
//     events for easier debugging when enabled in the script's metadata.
//   - Collapsible Final Results: All final result displays (multi-host, message, and raw JSON)
//     are collapsible with an initial state of closed for a cleaner UI.
//
// HOW-TO GUIDE (INTEGRATION):
//   1. This component should be placed at `/src/components/shared/`.
//   2. Any "feature runner" (e.g., `JsnapyRunner.jsx`) should render this component
//      conditionally when a script is running or complete.
//   3. Pass the following props from the runner's `useScriptRunnerStream` hook:
//      - `script`: The full script metadata object.
//      - `isRunning`, `isComplete`, `error`: State booleans/objects.
//      - `progressEvents`, `finalResult`: Data arrays/objects.
//      - `showDebug`: (Optional) A boolean to toggle the debug view.
//
// DEPENDENCIES:
//   - React (useState, useMemo)
//   - lucide-react (for icons)
//
// =========================================================================================

// ====================================================================================
// SECTION 1: IMPORTS & CONFIGURATION
// ====================================================================================
import React, { useState, useMemo } from "react";
import { ChevronDown, AlertTriangle, Info, Save, CheckCircle, XCircle, Loader, Bug } from "lucide-react";

const API_BASE_URL = "http://localhost:3001";

// ====================================================================================
// SECTION 2: UTILITY & DEBUG SUB-COMPONENTS
// ====================================================================================

/**
 * Renders a specific icon based on the provided status string.
 * @param {{status: 'COMPLETED' | 'SUCCESS' | 'FAILED' | 'ERROR' | 'IN_PROGRESS' | string}} props
 * @returns {JSX.Element} A status icon component with appropriate styling.
 */
const StatusIcon = ({ status }) => {
  switch (status) {
    case "COMPLETED":
    case "SUCCESS":
      return <CheckCircle className="text-green-500" size={20} />;
    case "FAILED":
    case "ERROR":
      return <XCircle className="text-red-500" size={20} />;
    case "IN_PROGRESS":
      return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>;
    default:
      return <ChevronDown className="text-slate-400" size={20} />;
  }
};

/**
 * Displays raw progress event data for debugging purposes.
 * @param {{progressEvents: Array<object>, isVisible: boolean}} props
 * @returns {JSX.Element | null} A debug view or null if not visible.
 */
function DebugProgressEvents({ progressEvents, isVisible }) {
  if (!isVisible || !progressEvents || progressEvents.length === 0) {
    return null;
  }
  return (
    <details className="border rounded-lg bg-yellow-50 border-yellow-200 mb-4">
      <summary className="cursor-pointer p-3 font-semibold text-yellow-800 flex items-center justify-between list-none hover:bg-yellow-100 transition-colors group">
        <span className="flex items-center gap-2">
          <Bug size={16} /> Debug: Progress Events ({progressEvents.length})
        </span>
        <ChevronDown className="transition-transform duration-200 group-open:rotate-180" size={20} />
      </summary>
      <div className="border-t border-yellow-200 p-4">
        <pre className="bg-yellow-100 text-yellow-900 p-4 rounded-md font-mono text-xs max-h-64 overflow-auto break-all whitespace-pre-wrap">
          {JSON.stringify(progressEvents, null, 2)}
        </pre>
      </div>
    </details>
  );
}

// ====================================================================================
// SECTION 3: DATA DISPLAY SUB-COMPONENTS (WITH FIXES)
// ====================================================================================

/**
 * Renders a styled table for structured test results.
 * @param {{title: string, headers: Array<string>, data: Array<object>}} props
 * @returns {JSX.Element} A formatted table component.
 */
function SimpleTable({ title, headers, data }) {
    if (!data || data.length === 0) {
        return (
            <div className="mt-2">
                <h4 className="font-semibold text-slate-700">{title}</h4>
                <p className="text-sm text-slate-500 italic">No data returned for this check.</p>
            </div>
        );
    }
    return (
        <div className="mt-4 w-full">
            <h4 className="font-semibold text-slate-700 mb-2">{title}</h4>
            <div className="border rounded-lg shadow-sm overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                        <tr>
                            {headers.map((header) => (
                                <th key={header} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{header}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {data.map((row, rowIndex) => (
                            <tr key={rowIndex} className="hover:bg-slate-50">
                                {headers.map((header) => (
                                    <td key={header} className="px-4 py-3 text-sm text-slate-800 font-mono" style={{maxWidth: '300px'}}>
                                        <div className="whitespace-pre-wrap" style={{wordBreak: 'break-word', overflowWrap: 'break-word'}}>
                                            {String(row[header] || "")}
                                        </div>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/**
 * Renders the final structured output of a script.
 * FIX: Now includes a robust fallback to render raw JSON if the result format is unknown.
 * UPDATE: All result displays are now collapsible with an initial state of closed.
 */
function FinalResultView({ finalResult }) {
    // Defensive unwrap in case the entire message object was passed accidentally
    const data = finalResult?.data ? finalResult.data : finalResult;
    console.log("[DEBUG] Final Result View received (unwrapped):", data);

    if (!data) return null;

    // Handle known multi-host results format
    if (data.results_by_host && Array.isArray(data.results_by_host)) {
        console.log("results_by_host length:", data.results_by_host.length);
        return (
            <details className="border rounded-lg bg-white shadow-sm mb-4">
                <summary className="cursor-pointer p-3 font-semibold text-slate-800 flex items-center justify-between list-none hover:bg-slate-50 transition-colors group">
                    <span>Final Results (Multi-Host)</span>
                    <ChevronDown className="transition-transform duration-200 group-open:rotate-180" size={20} />
                </summary>
                <div className="border-t border-slate-200 p-4 space-y-6">
                    {data.results_by_host.map((hostResult, index) => (
                        <div key={index} className="p-4 border rounded-md bg-white shadow-sm w-full">
                            <h3 className="text-lg font-bold text-slate-800" style={{wordBreak: 'break-word'}}>
                                Results for: <span className="font-mono">{hostResult.hostname}</span>
                            </h3>
                            {hostResult.status === "error" ? (
                                <div className="mt-2"><p className="text-red-600 whitespace-pre-wrap">{hostResult.message}</p></div>
                            ) : (
                                hostResult.test_results?.map((testResult, testIndex) => (
                                    <div key={testIndex} className="mt-2">
                                        {testResult.error ? (
                                            <div><p className="text-yellow-600 whitespace-pre-wrap">{testResult.error}</p></div>
                                        ) : (
                                            <SimpleTable title={testResult.title} headers={testResult.headers} data={testResult.data} />
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    ))}
                </div>
            </details>
        );
    }

    // Handle known simple message format
    if (data.message && typeof data.message === 'string') {
        const isSuccess = data.success !== false;
        return (
            <details className="border rounded-lg bg-white shadow-sm mb-4">
                <summary className="cursor-pointer p-3 font-semibold text-slate-800 flex items-center justify-between list-none hover:bg-slate-50 transition-colors group">
                    <span>Final Results (Message)</span>
                    <ChevronDown className="transition-transform duration-200 group-open:rotate-180" size={20} />
                </summary>
                <div className="border-t border-slate-200 p-4">
                    <div className={`p-4 rounded-lg border w-full ${isSuccess ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                        <div className="flex items-center font-bold">
                            {isSuccess ? <Info size={20} className="mr-2 flex-shrink-0" /> : <AlertTriangle size={20} className="mr-2 flex-shrink-0" />} Status
                        </div>
                        <div className="mt-2 text-sm whitespace-pre-wrap">{data.message}</div>
                    </div>
                </div>
            </details>
        );
    }

    // Fallback for any other successful result format
    return (
        <details className="border rounded-lg bg-white shadow-sm mb-4">
            <summary className="cursor-pointer p-3 font-semibold text-slate-800 flex items-center justify-between list-none hover:bg-slate-50 transition-colors group">
                <span>Final Results (Raw Data)</span>
                <ChevronDown className="transition-transform duration-200 group-open:rotate-180" size={20} />
            </summary>
            <div className="border-t border-slate-200 p-4">
                <pre className="bg-slate-800 text-slate-200 p-4 rounded-md text-xs whitespace-pre-wrap break-all overflow-auto">
                    {JSON.stringify(data, null, 2)}
                </pre>
            </div>
        </details>
    );
}

// ====================================================================================
// SECTION 4: REAL-TIME PROGRESS VIEW (WITH FIXES)
// ====================================================================================

/**
 * Displays the real-time progress of script execution.
 * FIX: Rewritten to accurately display the latest log message and progress.
 */
function RealtimeProgressView({ progressEvents = [], isRunning, isComplete, error }) {
    // This memoized calculation derives the display state from the raw event stream.
    const derivedState = useMemo(() => {
        if (!Array.isArray(progressEvents) || progressEvents.length === 0) {
            return { totalSteps: 0, completedSteps: 0, currentMessage: 'Waiting to start...' };
        }

        const operationStart = progressEvents.find(e => e.event_type === 'OPERATION_START');
        const totalSteps = operationStart?.data?.total_steps || 0;
        const completedSteps = progressEvents.filter(e => e.event_type === 'STEP_COMPLETE').length;

        // FIX: Find the most recent event with a non-empty message for the live log.
        let currentMessage = 'Executing...';
        const lastMessageEvent = [...progressEvents].reverse().find(e => e.message);
        if (lastMessageEvent) {
            currentMessage = lastMessageEvent.message;
        }

        // Set initial and final status messages.
        if (isRunning && progressEvents.length === 1 && progressEvents[0].type === 'script_start') {
             currentMessage = 'Initializing script run...';
        }
        if (isComplete) {
            currentMessage = error ? 'Operation failed. Please review logs.' : 'Operation completed successfully.';
        }

        return { totalSteps, completedSteps, currentMessage };
    }, [progressEvents, isRunning, isComplete, error]);

    const progressPercentage = derivedState.totalSteps > 0
        ? Math.min(100, (derivedState.completedSteps / derivedState.totalSteps) * 100)
        : 0;

    return (
        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50 w-full">
            {/* Header with overall status icon */}
            <div className="border-b border-slate-200 pb-4 mb-6">
                <h3 className="text-xl font-bold text-slate-800 flex items-center">
                    {isRunning ? <Loader className="animate-spin text-blue-500" size={20} /> : error ? <XCircle className="text-red-500" size={20}/> : <CheckCircle className="text-green-500" size={20}/>}
                    <span className="ml-3">Execution Progress</span>
                </h3>

                {/* The "Live Log" Display */}
                <div className="mt-4 bg-slate-100 p-3 rounded-md border border-slate-200">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Live Log</p>
                    <p className="text-sm text-slate-800 font-mono mt-1 whitespace-pre-wrap break-all h-6">
                        {derivedState.currentMessage}
                    </p>
                </div>

                {/* Progress Bar */}
                {derivedState.totalSteps > 0 && (
                    <div className="mt-4">
                        <div className="flex justify-between text-sm text-slate-600 mb-1">
                            <span>Step {derivedState.completedSteps} of {derivedState.totalSteps}</span>
                            <span>{Math.round(progressPercentage)}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2.5">
                            <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out" style={{ width: `${progressPercentage}%` }}></div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ====================================================================================
// SECTION 5: MAIN COMPONENT - SCRIPT OUTPUT DISPLAY (WITH FIXES)
// ====================================================================================

export default function ScriptOutputDisplay({ script, isRunning, isComplete, progressEvents, finalResult, error, showDebug = false }) {
  const [isSaving, setIsSaving] = useState(false);
  const saveButtonConfig = script?.capabilities?.saveButton;
  const canSaveReport = script?.capabilities?.enableReportSaving === true;

  /** Formats an error object or string for display. */
  const formatErrorMessage = (err) => {
    if (typeof err === 'object' && err !== null && err.message) {
      return String(err.message);
    }
    if (typeof err === 'object' && err !== null) {
      return JSON.stringify(err);
    }
    return err ? String(err) : "An unknown error occurred.";
  };

  /** Handles the save report API call. */
  const handleSaveReport = async () => {
    if (!finalResult) {
      alert("Cannot generate report: No final data available.");
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/report/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          savePath: saveButtonConfig.savePath,
          jsonData: finalResult,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to generate report on the server.");
      }
      alert(data.message || "Report saved successfully!");
    } catch (err) {
      alert(err.message || "An unknown error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  };

  // --- RUNNING STATE ---
  if (isRunning) {
    return (
      <div className="space-y-6 w-full">
        <DebugProgressEvents progressEvents={progressEvents} isVisible={showDebug} />
        <RealtimeProgressView progressEvents={progressEvents} isRunning={isRunning} isComplete={isComplete} error={error} />
      </div>
    );
  }

  // --- COMPLETED STATE ---
  if (isComplete) {
    // Handle script failure
    if (error) {
      return (
        <div className="space-y-6 w-full">
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">
                <div className="flex items-center font-bold">
                    <AlertTriangle size={20} className="mr-2 flex-shrink-0" /> SCRIPT FAILED
                </div>
                <div className="mt-2 text-sm font-mono whitespace-pre-wrap break-all">
                    {formatErrorMessage(error)}
                </div>
            </div>
            <RealtimeProgressView progressEvents={progressEvents} isRunning={false} isComplete={true} error={error} />
        </div>
      );
    }

    // Handle script success
    return (
      <div className="space-y-6 w-full">
        <DebugProgressEvents progressEvents={progressEvents} isVisible={showDebug} />

        {/*
          FIX: The condition for rendering the Save button is now more resilient.
          It shows as long as the capability is enabled, there's no error, and there's a result to save.
        */}
        {canSaveReport && !error && finalResult && (
          <div className="bg-white p-4 rounded-xl shadow-lg shadow-slate-200/50">
            <button
              onClick={handleSaveReport}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:bg-slate-200 disabled:cursor-not-allowed transition-colors"
            >
              <Save size={16} />
              {isSaving ? "Saving..." : (saveButtonConfig?.label || "Save Report")}
            </button>
          </div>
        )}

        {/* Always show final progress view on completion */}
        <RealtimeProgressView progressEvents={progressEvents} isRunning={false} isComplete={true} error={error} />

        {/* Always show final results on completion without error */}
        {finalResult && <FinalResultView finalResult={finalResult} />}
      </div>
    );
  }

  // Default state (should not be visible if used correctly)
  return null;
}
