// =================================================================================================
//
//  COMPONENT: ScriptOutputDisplay.jsx
//  PATH: src/components/ScriptOutputDisplay.jsx
//
// =================================================================================================
//
//  DESCRIPTION:
//  This is a versatile "presentational" component designed to be the primary UI for visualizing
//  the output of a script execution. It is capable of rendering both the real-time progress of a
//  live run and the final, static results of a completed run (viewed from history).
//
//  KEY FEATURES:
//  - **State-Driven Display:** Renders different views based on props like `isRunning` and `isComplete`.
//  - **Real-time Progress:** Includes a `RealtimeProgressView` to show a step-by-step breakdown
//    and a progress bar for live script runs.
//  - **Structured Results:** Can render complex, structured data (e.g., test results) in a clean,
//    readable table format using the `FinalResultView`.
//  - **Clear Status Indication:** Uses icons and color-coding to clearly communicate whether a
//    process is running, has succeeded, or has failed.
//  - **Resilient and Safe:** This version has been "hardened" with default props and the fix for
//    the `useMemo` crash, making it highly stable and preventing crashes.
//
//  HOW-TO GUIDE (USAGE):
//  This component is not self-sufficient; it expects to receive all its data via props from a
//  parent "container" component (like `GenericScriptRunner.jsx` or `PythonScriptRunner.jsx`).
//
//  THE FIX (useMemo Crash):
//  The crash `Cannot destructure property 'stepArray' of 'useMemo(...)'` was caused by a missing
//  `return` statement inside the `useMemo` hook within the `RealtimeProgressView` sub-component.
//  If `progressEvents` was not empty, the callback function would run to completion without
//  returning a value, resulting in `undefined`. A `return` statement has been added at the end
//  of the `useMemo` callback to ensure it always returns a valid object, fixing the crash.
//
// =================================================================================================

// SECTION 1: IMPORTS AND CONFIGURATION
// =================================================================================================
import React, { useState, useMemo } from "react";
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

// API configuration for backend communication.
const API_BASE_URL = "http://localhost:3001";

// ====================================================================================
// SECTION 2: UTILITY COMPONENTS (STATUS ICONS)
// ====================================================================================

/**
 * Renders a dynamic icon based on a status string.
 * @param {{status: string}} props
 * @returns {JSX.Element} A styled status icon.
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

// ====================================================================================
// SECTION 3: DEBUG AND DEVELOPMENT COMPONENTS
// ====================================================================================

/**
 * Displays raw progress event data in a collapsible view for debugging.
 * @param {{progressEvents: Array<object>, isVisible: boolean}} props
 * @returns {JSX.Element | null} A debug view or null if not needed.
 */
function DebugProgressEvents({ progressEvents, isVisible }) {
  if (!isVisible || !progressEvents || progressEvents.length === 0) {
    return null;
  }
  return (
    <details className="border rounded-lg bg-yellow-50 border-yellow-200 mb-4">
      <summary className="cursor-pointer p-3 font-semibold text-yellow-800 flex items-center justify-between list-none hover:bg-yellow-100 transition-colors">
        <span className="flex items-center gap-2">
          <Bug size={16} /> Debug: Progress Events ({progressEvents.length})
        </span>
        <ChevronDown
          className="transition-transform duration-200 group-open:rotate-180"
          size={20}
        />
      </summary>
      <div className="border-t border-yellow-200 p-4">
        <div className="w-full">
          <pre className="bg-yellow-100 text-yellow-900 p-4 rounded-md font-mono text-xs max-h-64 overflow-auto break-all whitespace-pre-wrap">
            {JSON.stringify(progressEvents, null, 2)}
          </pre>
        </div>
      </div>
    </details>
  );
}

// ====================================================================================
// SECTION 4: STRUCTURED DATA DISPLAY COMPONENTS (TABLES)
// ====================================================================================

/**
 * Renders a styled table for structured data like test results.
 * @param {{title: string, headers: Array<string>, data: Array<object>}} props
 * @returns {JSX.Element} A formatted and responsive table.
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
    <div className="mt-4 w-full">
      <h4 className="font-semibold text-slate-700 mb-2">{title}</h4>
      <div className="border rounded-lg shadow-sm overflow-x-auto">
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
                    className="px-4 py-3 text-sm text-slate-800 font-mono"
                    style={{ maxWidth: "300px" }}
                  >
                    <div
                      className="whitespace-pre-wrap"
                      style={{
                        wordBreak: "break-word",
                        overflowWrap: "break-word",
                      }}
                    >
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

// ====================================================================================
// SECTION 5: REAL-TIME PROGRESS VISUALIZATION (FIXED)
// ====================================================================================

function RealtimeProgressView({
  progressEvents = [],
  isRunning,
  isComplete,
  error,
  showDebug = false,
}) {
  const finalOpEvent = useMemo(
    () =>
      Array.isArray(progressEvents)
        ? progressEvents.find((e) => e?.event_type === "OPERATION_COMPLETE")
        : null,
    [progressEvents],
  );

  const { stepArray, currentStep, totalSteps } = useMemo(() => {
    if (!Array.isArray(progressEvents) || progressEvents.length === 0) {
      return { stepArray: [], currentStep: 0, totalSteps: 0 };
    }
    const stepEvents = progressEvents.filter(
      (e) =>
        e?.event_type === "STEP_START" || e?.event_type === "STEP_COMPLETE",
    );
    const groupedSteps = stepEvents.reduce((acc, event) => {
      const stepNum = event?.data?.step;
      if (stepNum) {
        if (!acc[stepNum]) acc[stepNum] = { step: stepNum };
        acc[stepNum] = {
          ...acc[stepNum],
          ...event.data,
          step: stepNum,
          lastEventType: event.event_type,
        };
      }
      return acc;
    }, {});
    const steps = Object.values(groupedSteps).sort((a, b) => a.step - b.step);
    const processedSteps = steps.map((step) =>
      (finalOpEvent || isComplete) && step.status === "IN_PROGRESS"
        ? { ...step, status: "COMPLETED" }
        : step,
    );
    const total =
      processedSteps.length > 0
        ? Math.max(...processedSteps.map((s) => s.step))
        : 0;

    let current = 0;
    const lastCompletedStep =
      processedSteps.filter((s) => s.status === "COMPLETED").pop()?.step || 0;

    if (isComplete && error) {
      current = lastCompletedStep;
    } else if (finalOpEvent || isComplete) {
      current = total;
    } else if (isRunning) {
      const activeStep = processedSteps.find((s) => s.status === "IN_PROGRESS");
      current = activeStep ? activeStep.step : lastCompletedStep;
    }

    // --- THIS IS THE FIX ---
    // This return statement was missing. Without it, this function path returned `undefined`
    // when `progressEvents` was not empty, causing the destructuring assignment to crash.
    return {
      stepArray: processedSteps,
      currentStep: current,
      totalSteps: total,
    };
  }, [progressEvents, finalOpEvent, isRunning, isComplete, error]);

  if (!isRunning && stepArray.length === 0) {
    return null;
  }

  return (
    <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50 w-full">
      <div className="border-b border-slate-200 pb-4 mb-6">
        <h3 className="text-xl font-bold text-slate-800 flex items-center">
          {finalOpEvent || isComplete ? (
            <StatusIcon status={finalOpEvent?.data?.status || "SUCCESS"} />
          ) : (
            <Loader className="animate-spin text-blue-500" size={20} />
          )}
          <span className="ml-3">Execution Progress</span>
        </h3>
        {totalSteps > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-sm text-slate-600 mb-1">
              <span>
                Step {currentStep} of {totalSteps}
              </span>
              <span>{Math.round((currentStep / totalSteps) * 100)}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${(currentStep / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        )}
        {finalOpEvent && (
          <div className="mt-2">
            <p
              className="text-sm text-slate-500 whitespace-pre-wrap"
              style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
            >
              {finalOpEvent.message}
            </p>
          </div>
        )}
      </div>
      <div className="space-y-4">
        {stepArray.map((step) => (
          <div
            key={step.step}
            className={`border-l-4 p-4 rounded-r-lg w-full ${step.status === "IN_PROGRESS" ? "border-blue-500 bg-blue-50" : step.status === "COMPLETED" ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 flex items-start min-w-0">
                <StatusIcon status={step.status} />
                <div className="ml-3 min-w-0 flex-1">
                  <h4
                    className="font-semibold text-slate-800"
                    style={{
                      wordBreak: "break-word",
                      overflowWrap: "break-word",
                    }}
                  >
                    Step {step.step}: {step.name}
                  </h4>
                  <div
                    className="text-sm text-slate-600 whitespace-pre-wrap"
                    style={{
                      wordBreak: "break-word",
                      overflowWrap: "break-word",
                    }}
                  >
                    {step.description}
                  </div>
                </div>
              </div>
              {step.duration != null && (
                <div className="text-xs text-slate-500 font-mono ml-2 flex-shrink-0">
                  {step.duration.toFixed(2)}s
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ====================================================================================
// SECTION 6: FINAL SCRIPT RESULTS VIEW
// ====================================================================================

function FinalResultView({ finalResult }) {
  if (!finalResult) return null;
  if (finalResult.results_by_host) {
    return (
      <div className="space-y-6">
        {finalResult.results_by_host.map((hostResult, index) => (
          <div
            key={index}
            className="p-4 border rounded-md bg-white shadow-sm w-full"
          >
            <h3
              className="text-lg font-bold text-slate-800"
              style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
            >
              Results for:{" "}
              <span className="font-mono">{hostResult.hostname}</span>
            </h3>
            {hostResult.status === "error" ? (
              <div className="mt-2">
                <p
                  className="text-red-600 whitespace-pre-wrap"
                  style={{
                    wordBreak: "break-word",
                    overflowWrap: "break-word",
                  }}
                >
                  {hostResult.message}
                </p>
              </div>
            ) : (
              hostResult.test_results?.map((testResult, testIndex) => (
                <div key={testIndex} className="mt-2">
                  {testResult.error ? (
                    <div>
                      <p
                        className="text-yellow-600 whitespace-pre-wrap"
                        style={{
                          wordBreak: "break-word",
                          overflowWrap: "break-word",
                        }}
                      >
                        {testResult.error}
                      </p>
                    </div>
                  ) : (
                    <SimpleTable
                      title={testResult.title}
                      headers={testResult.headers}
                      data={testResult.data}
                    />
                  )}
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
      <div
        className={`p-4 rounded-lg border w-full ${finalResult.success ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-red-50 border-red-200 text-red-800"}`}
      >
        <div className="flex items-center font-bold">
          {finalResult.success ? (
            <Info size={20} className="mr-2 flex-shrink-0" />
          ) : (
            <AlertTriangle size={20} className="mr-2 flex-shrink-0" />
          )}{" "}
          Status
        </div>
        <div
          className="mt-2 text-sm whitespace-pre-wrap"
          style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
        >
          {finalResult.message}
        </div>
      </div>
    );
  }
  return (
    <p className="italic text-slate-500">
      Script finished, but produced no standard output to display.
    </p>
  );
}

// ====================================================================================
// SECTION 7: RAW CONSOLE OUTPUT VIEW
// ====================================================================================

function ConsoleOutputDisplay({
  content,
  isOpen = false,
  title = "Console Output",
}) {
  if (!content) return null;
  return (
    <details className="border rounded-lg bg-white w-full" open={isOpen}>
      <summary className="cursor-pointer p-3 font-semibold text-slate-700 flex items-center justify-between">
        <span>{title}</span>
        <ChevronDown size={20} />
      </summary>
      <div className="border-t p-4">
        <div className="w-full max-w-full overflow-auto">
          <pre className="bg-slate-800 text-slate-200 p-4 rounded-md text-xs break-all whitespace-pre-wrap">
            {content}
          </pre>
        </div>
      </div>
    </details>
  );
}

// ====================================================================================
// SECTION 8: MAIN COMPONENT - SCRIPT OUTPUT DISPLAY
// ====================================================================================

export default function ScriptOutputDisplay({
  progressEvents = [],
  finalResult = null,
  error = null,
  isRunning = false,
  isComplete = false,
  fullLog = "",
  script = {},
  showDebug = false,
}) {
  const [isSaving, setIsSaving] = useState(false);
  const saveButtonConfig = script?.capabilities?.saveButton;
  const canSaveReport = script?.capabilities?.enableReportSaving === true;

  const formatErrorMessage = (err) => {
    if (typeof err === "object" && err !== null && err.message) {
      return String(err.message);
    }
    if (typeof err === "object" && err !== null) {
      return JSON.stringify(err);
    }
    return err ? String(err) : "An unknown error occurred.";
  };

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
        throw new Error(
          data.message || "Failed to generate report on the server.",
        );
      }
      alert(data.message || "Report saved successfully!");
    } catch (err) {
      alert(err.message || "An unknown error occurred.");
    } finally {
      setIsSaving(false);
    }
  };

  // RENDER LOGIC FOR 'RUNNING' STATE
  if (isRunning) {
    return (
      <div className="space-y-6 w-full">
        <DebugProgressEvents
          progressEvents={progressEvents}
          isVisible={showDebug}
        />
        <RealtimeProgressView
          progressEvents={progressEvents}
          isRunning={isRunning}
          isComplete={isComplete}
          showDebug={showDebug}
        />
        {error && (
          <ConsoleOutputDisplay
            content={fullLog || formatErrorMessage(error)}
            isOpen={false}
            title="Console Output"
          />
        )}
      </div>
    );
  }

  // RENDER LOGIC FOR 'COMPLETED' STATE
  if (isComplete) {
    // Render path for FAILED execution
    if (error || !finalResult?.success) {
      return (
        <div className="space-y-6 w-full">
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">
            <div className="flex items-center font-bold">
              <AlertTriangle size={20} className="mr-2 flex-shrink-0" />
              SCRIPT FAILED
            </div>
            <div
              className="mt-2 text-sm font-mono whitespace-pre-wrap"
              style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
            >
              {formatErrorMessage(error)}
            </div>
          </div>
          {progressEvents.length > 0 && (
            <RealtimeProgressView
              progressEvents={progressEvents}
              isRunning={false}
              isComplete={true}
              showDebug={showDebug}
            />
          )}
        </div>
      );
    }
    // Render path for SUCCESSFUL execution
    return (
      <div className="space-y-6 w-full">
        <DebugProgressEvents
          progressEvents={progressEvents}
          isVisible={showDebug}
        />
        {canSaveReport && finalResult?.success && (
          <div className="flex items-center p-3">
            <button
              onClick={handleSaveReport}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:bg-slate-200 transition-colors"
            >
              <Save size={16} />
              {isSaving ? "Saving..." : saveButtonConfig.label || "Save Report"}
            </button>
          </div>
        )}
        {progressEvents.length > 0 && (
          <RealtimeProgressView
            progressEvents={progressEvents}
            isRunning={false}
            isComplete={true}
            showDebug={showDebug}
          />
        )}
        {finalResult && <FinalResultView finalResult={finalResult} />}
        {(error || fullLog) && (
          <ConsoleOutputDisplay
            content={
              fullLog ||
              formatErrorMessage(error) ||
              "No console output available"
            }
            isOpen={!finalResult?.success}
            title="Raw Console Log"
          />
        )}
      </div>
    );
  }

  // Default state: return null if not running and not complete.
  return null;
}
