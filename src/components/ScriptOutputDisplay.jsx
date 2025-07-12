// src/components/ScriptOutputDisplay.jsx

// ====================================================================================
// SECTION 1: HEADER & IMPORTS
//
// This section imports all necessary libraries and components.
// - `react` for core component functionality (useState, useMemo, useEffect).
// - `lucide-react` for modern, clean icons.
// - The API_BASE_URL is defined for making calls to the backend.
// ====================================================================================

import React, { useState, useMemo, useEffect } from "react";
import {
  ChevronDown,
  AlertTriangle,
  Info,
  Save,
  CheckCircle,
  XCircle,
  Loader,
  Bug,
} from "lucide-react";

const API_BASE_URL = "http://localhost:3001";

// ====================================================================================
// SECTION 2: VISUAL HELPER COMPONENTS
//
// These are small, stateless components that provide visual feedback but contain
// no complex logic. They are used throughout the main display components.
// ====================================================================================

/**
 * @description Renders a specific icon based on the provided status string.
 * @param {{status: 'COMPLETED' | 'SUCCESS' | 'FAILED' | 'ERROR' | 'IN_PROGRESS' | string}} props
 * @returns {JSX.Element} A status icon component.
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
      return (
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
      );
    default:
      return <ChevronDown className="text-slate-400" size={20} />;
  }
};

/**
 * @description A collapsible component for displaying raw progress event data for debugging.
 * @param {{progressEvents: Array<object>, isVisible: boolean}} props
 * @returns {JSX.Element | null} A debug view or null if not visible.
 */
function DebugProgressEvents({ progressEvents, isVisible }) {
  if (!isVisible || !progressEvents || progressEvents.length === 0) {
    return null;
  }

  return (
    <details className="border rounded-lg bg-yellow-50 border-yellow-200 mb-4">
      <summary className="cursor-pointer p-3 font-semibold text-yellow-800 flex items-center justify-between list-none hover:bg-yellow-100 transition-colors">
        <span className="flex items-center gap-2">
          <Bug size={16} />
          Debug: Progress Events ({progressEvents.length})
        </span>
        <ChevronDown
          className="transition-transform duration-200 group-open:rotate-180"
          size={20}
        />
      </summary>
      <div className="border-t border-yellow-200 p-4">
        <pre className="bg-yellow-100 text-yellow-900 p-4 rounded-md whitespace-pre-wrap font-mono text-xs overflow-x-auto max-h-64 overflow-y-auto">
          {JSON.stringify(progressEvents, null, 2)}
        </pre>
      </div>
    </details>
  );
}


// ====================================================================================
// SECTION 3: DATA DISPLAY COMPONENTS
//
// Components specialized in rendering specific data structures, like tabular data.
// ====================================================================================

/**
 * @description Renders a simple, styled table for displaying structured test results.
 * @param {{title: string, headers: Array<string>, data: Array<object>}} props
 * @returns {JSX.Element} A formatted table component.
 */
function SimpleTable({ title, headers, data }) {
    if (!data || data.length === 0) {
      return (
        <div className="mt-2">
          <h4 className="font-semibold text-slate-700">{title}</h4>
          <p className="text-sm text-slate-500 italic">
            No data returned for this check.
          </p>
        </div>
      );
    }
    return (
      <div className="mt-4 overflow-x-auto">
        <h4 className="font-semibold text-slate-700 mb-2">{title}</h4>
        <div className="border rounded-lg shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {headers.map((header) => (
                  <th
                    key={header}
                    className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {data.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-slate-50">
                  {headers.map((header) => (
                    <td
                      key={header}
                      className="px-4 py-3 whitespace-nowrap text-sm text-slate-800 font-mono"
                    >
                      {String(row[header] || "")}
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


// ====================================================================================
// SECTION 4: CORE VIEW COMPONENTS
//
// These are the primary components for displaying the two main states of the output:
// 1. The real-time progress view while the script is running.
// 2. The final, structured results view after the script has completed.
// ====================================================================================

/**
 * @description Displays the step-by-step progress of a script execution in real-time.
 * It processes a stream of progress events to build a user-friendly view.
 * @param {{progressEvents: Array<object>, isRunning: boolean, isComplete: boolean, showDebug: boolean}} props
 * @returns {JSX.Element | null} The real-time progress UI or null if not applicable.
 */
function RealtimeProgressView({
  progressEvents = [],
  isRunning,
  isComplete,
  showDebug = false,
}) {
  const finalOpEvent = useMemo(() =>
    Array.isArray(progressEvents) ? progressEvents.find((e) => e?.event_type === "OPERATION_COMPLETE") : null,
    [progressEvents]
  );

  const { stepArray, currentStep, totalSteps } = useMemo(() => {
    if (!Array.isArray(progressEvents) || progressEvents.length === 0) {
      return { stepArray: [], currentStep: 0, totalSteps: 0 };
    }

    const stepEvents = progressEvents.filter(e => e?.event_type === "STEP_START" || e?.event_type === "STEP_COMPLETE");

    const groupedSteps = stepEvents.reduce((acc, event) => {
      const stepNum = event?.data?.step;
      if (stepNum) {
        if (!acc[stepNum]) acc[stepNum] = { step: stepNum };
        acc[stepNum] = { ...acc[stepNum], ...event.data, step: stepNum, lastEventType: event.event_type };
      }
      return acc;
    }, {});

    const steps = Object.values(groupedSteps).sort((a, b) => a.step - b.step);

    const processedSteps = steps.map(step => {
      if ((finalOpEvent || isComplete) && step.status === "IN_PROGRESS") {
        return { ...step, status: "COMPLETED" };
      }
      return step;
    });

    const total = processedSteps.length > 0 ? Math.max(...processedSteps.map(s => s.step)) : 0;

    let current = 0;
    if (finalOpEvent || isComplete) {
      current = total;
    } else if (isRunning) {
      const activeStep = processedSteps.find(s => s.status === "IN_PROGRESS");
      current = activeStep ? activeStep.step : (processedSteps.filter(s => s.status === "COMPLETED").pop()?.step || 0);
    }

    return { stepArray: processedSteps, currentStep: current, totalSteps: total };
  }, [progressEvents, finalOpEvent, isRunning, isComplete]);

  if (!isRunning && stepArray.length === 0) {
    return null;
  }

  return (
    <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
      <div className="border-b border-slate-200 pb-4 mb-6">
        <h3 className="text-xl font-bold text-slate-800 flex items-center">
          {finalOpEvent || isComplete ? <StatusIcon status={finalOpEvent?.data?.status || "SUCCESS"} /> : <Loader className="animate-spin text-blue-500" size={20} />}
          <span className="ml-3">Execution Progress</span>
        </h3>
        {totalSteps > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-sm text-slate-600 mb-1">
              <span>Step {currentStep} of {totalSteps}</span>
              <span>{Math.round((currentStep / totalSteps) * 100)}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2"><div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${(currentStep / totalSteps) * 100}%` }} /></div>
          </div>
        )}
        {finalOpEvent && <p className="text-sm text-slate-500 mt-2">{finalOpEvent.message}</p>}
      </div>
      <div className="space-y-4">
        {stepArray.map((step) => (
          <div key={step.step} className={`border-l-4 p-4 rounded-r-lg ${step.status === "IN_PROGRESS" ? "border-blue-500 bg-blue-50" : step.status === "COMPLETED" ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1 flex items-start">
                  <StatusIcon status={step.status} />
                  <div className="ml-3">
                      <h4 className="font-semibold text-slate-800">Step {step.step}: {step.name}</h4>
                      <p className="text-sm text-slate-600">{step.description}</p>
                  </div>
              </div>
              {step.duration != null && <div className="text-xs text-slate-500 font-mono">{step.duration.toFixed(2)}s</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * @description Renders the final, structured output of a script after it has completed.
 * It handles displaying multi-host results, single messages, and errors.
 * @param {{finalResult: object}} props
 * @returns {JSX.Element | null} The final results view.
 */
function FinalResultView({ finalResult }) {
  if (!finalResult) return null;

  if (finalResult.results_by_host) {
    return (
      <div className="space-y-6">
        {finalResult.results_by_host.map((hostResult, index) => (
          <div key={index} className="p-4 border rounded-md bg-white shadow-sm">
            <h3 className="text-lg font-bold text-slate-800">Results for: <span className="font-mono">{hostResult.hostname}</span></h3>
            {hostResult.status === "error" ? (
              <p className="text-red-600 mt-2">{hostResult.message}</p>
            ) : (
              hostResult.test_results?.map((testResult, testIndex) => (
                <div key={testIndex} className="mt-2">
                  {testResult.error ? <p className="text-yellow-600">{testResult.error}</p> : <SimpleTable title={testResult.title} headers={testResult.headers} data={testResult.data} />}
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    );
  }

  if (finalResult.message) {
    return (
      <div className={`p-4 rounded-lg border ${finalResult.success ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-red-50 border-red-200 text-red-800"}`}>
        <div className="flex items-center font-bold">
          {finalResult.success ? <Info size={20} className="mr-2" /> : <AlertTriangle size={20} className="mr-2" />}
          Status
        </div>
        <p className="mt-2 text-sm">{finalResult.message}</p>
      </div>
    );
  }

  return <p className="italic text-slate-500">Script finished, but produced no standard output to display.</p>;
}


// ====================================================================================
// SECTION 5: MAIN EXPORTED COMPONENT (`ScriptOutputDisplay`)
//
// This is the primary component of the file. It acts as a controller, deciding
// which view to render based on the script's execution state (e.g., isRunning,
// isComplete, error). It also contains the logic for saving reports, which is
// now conditional based on the selected script's capabilities.
// ====================================================================================

/**
 * @description The main display component that switches between real-time progress and final results.
 * It now accepts the `script` object to conditionally render features like the "Save Report" button.
 *
 * @param {object} props - Component props.
 * @param {Array<object>} props.progressEvents - A stream of events from the script execution.
 * @param {object} props.finalResult - The final JSON object returned when the script completes successfully.
 * @param {string} props.error - Any top-level error message if the script fails.
 * @param {boolean} props.isRunning - A flag indicating if the script is currently executing.
 * @param {boolean} props.isComplete - A flag indicating if the script has finished its execution.
 * @param {string} props.fullLog - The complete raw console log from the script.
 * @param {object} props.script - The metadata object for the currently selected script.
 * @param {boolean} [props.showDebug=false] - A flag to show the debug view.
 * @returns {JSX.Element | null} The appropriate UI for the current script state.
 */
export default function ScriptOutputDisplay({
  progressEvents,
  finalResult,
  error,
  isRunning,
  isComplete,
  fullLog,
  script, // <-- FIX: Accept the selected script object as a prop.
  showDebug = false,
}) {
  const [isSaving, setIsSaving] = useState(false);

  // FIX: Determine if the "Save Report" button should be shown.
  // This is based on the `enableReportSaving` capability in the script's metadata.
  // If the capability is not defined, it defaults to false.
  const canSaveReport = script?.capabilities?.enableReportSaving === true;

  const handleSaveReport = async () => {
    if (!finalResult) {
      alert("Cannot generate report: No final data available.");
      return;
    }
    setIsSaving(true);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const defaultFilename = `report-${timestamp}.txt`;
    try {
      const response = await fetch(`${API_BASE_URL}/api/report/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: defaultFilename, jsonData: finalResult }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to generate report on the server.");
      }
      alert(data.message || "Report saved successfully!");
    } catch (err) {
      alert(err.message || "An unknown error occurred.");
    } finally {
      setIsSaving(false);
    }
  };

  // --- RENDER LOGIC ---

  // STATE 1: Script is actively running. Show the real-time progress view.
  if (isRunning) {
    return (
      <div className="space-y-6">
        <DebugProgressEvents progressEvents={progressEvents} isVisible={showDebug} />
        <RealtimeProgressView progressEvents={progressEvents} isRunning={isRunning} isComplete={isComplete} showDebug={showDebug} />
        {error && (
            <details className="border rounded-lg bg-white">
                <summary className="cursor-pointer p-3 font-semibold text-slate-700 flex items-center justify-between"><span>Console Output</span><ChevronDown size={20} /></summary>
                <div className="border-t p-4"><pre className="bg-slate-800 text-slate-200 p-4 rounded-md text-xs overflow-auto">{fullLog || error}</pre></div>
            </details>
        )}
      </div>
    );
  }

  // STATE 2: Script is complete.
  if (isComplete) {
    // SUB-STATE 2a: The script completed with a top-level failure.
    if (error && !finalResult?.success) {
      return (
        <div className="space-y-6">
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">
            <div className="flex items-center font-bold"><AlertTriangle size={20} className="mr-2" />SCRIPT FAILED</div>
            <p className="mt-2 text-sm font-mono whitespace-pre-wrap">{error}</p>
          </div>
          {progressEvents.length > 0 && <RealtimeProgressView progressEvents={progressEvents} isRunning={false} isComplete={true} showDebug={showDebug} />}
        </div>
      );
    }

    // SUB-STATE 2b: The script completed (successfully or with partial errors).
    return (
      <div className="space-y-6">
        <DebugProgressEvents progressEvents={progressEvents} isVisible={showDebug} />

        {/* --- FIX: CONDITIONAL SAVE BUTTON --- */}
        {/* Only render this section if the script is marked as allowing report saving and was successful. */}
        {canSaveReport && finalResult?.success && (
          <div className="flex items-center p-3">
            <button
              onClick={handleSaveReport}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:bg-slate-200"
            >
              <Save size={16} />
              {isSaving ? "Saving..." : "Save Formatted Report"}
            </button>
          </div>
        )}

        {/* Always show the final step-by-step summary */}
        {progressEvents.length > 0 && <RealtimeProgressView progressEvents={progressEvents} isRunning={false} isComplete={true} showDebug={showDebug} />}

        {/* Always show the final structured results */}
        {finalResult && <FinalResultView finalResult={finalResult} />}

        {/* Always provide access to the raw log for debugging */}
        {(error || fullLog) && (
          <details className="border rounded-lg bg-white" open={!finalResult?.success}>
            <summary className="cursor-pointer p-3 font-semibold text-slate-700 flex items-center justify-between"><span>Raw Console Log</span><ChevronDown size={20} /></summary>
            <div className="border-t p-4"><pre className="bg-slate-800 text-slate-200 p-4 rounded-md text-xs overflow-auto">{fullLog || error || "No console output available"}</pre></div>
          </details>
        )}
      </div>
    );
  }

  // STATE 3: Script has not started yet. Render nothing.
  return null;
}
