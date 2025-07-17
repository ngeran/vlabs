// src/components/ScriptOutputDisplay.jsx

// ====================================================================================
// SECTION 1: IMPORTS AND CONFIGURATION
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

// API configuration for backend communication
const API_BASE_URL = "http://localhost:3001";

// ====================================================================================
// SECTION 2: UTILITY COMPONENTS FOR STATUS AND ICONS
// ====================================================================================

/**
 * Renders a specific icon based on the provided status string.
 * Used throughout the component to show visual status indicators.
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
 * Displays raw progress event data for debugging purposes.
 * Uses proper text wrapping to prevent overflow issues with long content.
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
        {/* Fixed: Proper text wrapping for JSON content */}
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
// SECTION 4: DATA DISPLAY AND TABLE COMPONENTS
// ====================================================================================

/**
 * Renders a styled table for structured test results.
 * Includes responsive design and proper text wrapping for long content.
 * @param {{title: string, headers: Array<string>, data: Array<object>}} props
 * @returns {JSX.Element} A formatted table component with overflow handling.
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
                    style={{maxWidth: '300px'}}
                  >
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

// ====================================================================================
// SECTION 5: PROGRESS TRACKING AND REAL-TIME UPDATES
// ====================================================================================

/**
 * Displays real-time progress of script execution with step-by-step breakdown.
 * Includes progress bar, step status, and duration tracking.
 * @param {{progressEvents: Array<object>, isRunning: boolean, isComplete: boolean, showDebug: boolean}} props
 * @returns {JSX.Element | null} The real-time progress UI or null if not applicable.
 */
function RealtimeProgressView({
  progressEvents = [],
  isRunning,
  isComplete,
  showDebug = false,
}) {
  // Find the final operation event to determine overall completion status
  const finalOpEvent = useMemo(() =>
    Array.isArray(progressEvents) ? progressEvents.find((e) => e?.event_type === "OPERATION_COMPLETE") : null,
    [progressEvents]
  );

  // Process progress events to extract step information and current progress
  const { stepArray, currentStep, totalSteps } = useMemo(() => {
    if (!Array.isArray(progressEvents) || progressEvents.length === 0) {
      return { stepArray: [], currentStep: 0, totalSteps: 0 };
    }

    // Filter events related to step progress
    const stepEvents = progressEvents.filter(e => e?.event_type === "STEP_START" || e?.event_type === "STEP_COMPLETE");

    // Group events by step number to get complete step information
    const groupedSteps = stepEvents.reduce((acc, event) => {
      const stepNum = event?.data?.step;
      if (stepNum) {
        if (!acc[stepNum]) acc[stepNum] = { step: stepNum };
        acc[stepNum] = { ...acc[stepNum], ...event.data, step: stepNum, lastEventType: event.event_type };
      }
      return acc;
    }, {});

    // Convert to array and sort by step number
    const steps = Object.values(groupedSteps).sort((a, b) => a.step - b.step);

    // Update step statuses based on completion state
    const processedSteps = steps.map(step => {
      if ((finalOpEvent || isComplete) && step.status === "IN_PROGRESS") {
        return { ...step, status: "COMPLETED" };
      }
      return step;
    });

    // Calculate total steps and current progress
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

  // Don't render if not running and no steps to show
  if (!isRunning && stepArray.length === 0) {
    return null;
  }

  return (
    <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50 w-full">
      {/* Progress Header with overall status and progress bar */}
      <div className="border-b border-slate-200 pb-4 mb-6">
        <h3 className="text-xl font-bold text-slate-800 flex items-center">
          {finalOpEvent || isComplete ? (
            <StatusIcon status={finalOpEvent?.data?.status || "SUCCESS"} />
          ) : (
            <Loader className="animate-spin text-blue-500" size={20} />
          )}
          <span className="ml-3">Execution Progress</span>
        </h3>

        {/* Progress bar showing completion percentage */}
        {totalSteps > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-sm text-slate-600 mb-1">
              <span>Step {currentStep} of {totalSteps}</span>
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

        {/* Final operation message */}
        {finalOpEvent && (
          <div className="mt-2">
            <p className="text-sm text-slate-500 whitespace-pre-wrap" style={{wordBreak: 'break-word', overflowWrap: 'break-word'}}>
              {finalOpEvent.message}
            </p>
          </div>
        )}
      </div>

      {/* Individual step progress display */}
      <div className="space-y-4">
        {stepArray.map((step) => (
          <div
            key={step.step}
            className={`border-l-4 p-4 rounded-r-lg w-full ${
              step.status === "IN_PROGRESS"
                ? "border-blue-500 bg-blue-50"
                : step.status === "COMPLETED"
                ? "border-green-500 bg-green-50"
                : "border-red-500 bg-red-50"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 flex items-start min-w-0">
                <StatusIcon status={step.status} />
                <div className="ml-3 min-w-0 flex-1">
                  <h4 className="font-semibold text-slate-800" style={{wordBreak: 'break-word', overflowWrap: 'break-word'}}>
                    Step {step.step}: {step.name}
                  </h4>
                  <div className="text-sm text-slate-600 whitespace-pre-wrap" style={{wordBreak: 'break-word', overflowWrap: 'break-word'}}>
                    {step.description}
                  </div>
                </div>
              </div>
              {/* Step duration display */}
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
// SECTION 6: FINAL RESULTS DISPLAY COMPONENTS
// ====================================================================================

/**
 * Renders the final structured output of a script execution.
 * Handles both host-based results and simple message results.
 * @param {{finalResult: object}} props
 * @returns {JSX.Element | null} The final results view with proper text wrapping.
 */
function FinalResultView({ finalResult }) {
  if (!finalResult) return null;

  // Handle multi-host results format
  if (finalResult.results_by_host) {
    return (
      <div className="space-y-6">
        {finalResult.results_by_host.map((hostResult, index) => (
          <div key={index} className="p-4 border rounded-md bg-white shadow-sm w-full">
            <h3 className="text-lg font-bold text-slate-800" style={{wordBreak: 'break-word', overflowWrap: 'break-word'}}>
              Results for: <span className="font-mono">{hostResult.hostname}</span>
            </h3>
            {hostResult.status === "error" ? (
              <div className="mt-2">
                <p className="text-red-600 whitespace-pre-wrap" style={{wordBreak: 'break-word', overflowWrap: 'break-word'}}>
                  {hostResult.message}
                </p>
              </div>
            ) : (
              hostResult.test_results?.map((testResult, testIndex) => (
                <div key={testIndex} className="mt-2">
                  {testResult.error ? (
                    <div>
                      <p className="text-yellow-600 whitespace-pre-wrap" style={{wordBreak: 'break-word', overflowWrap: 'break-word'}}>
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

  // Handle simple message results format
  if (finalResult.message) {
    return (
      <div className={`p-4 rounded-lg border w-full ${
        finalResult.success
          ? "bg-blue-50 border-blue-200 text-blue-800"
          : "bg-red-50 border-red-200 text-red-800"
      }`}>
        <div className="flex items-center font-bold">
          {finalResult.success ? (
            <Info size={20} className="mr-2 flex-shrink-0" />
          ) : (
            <AlertTriangle size={20} className="mr-2 flex-shrink-0" />
          )}
          Status
        </div>
        <div className="mt-2 text-sm whitespace-pre-wrap" style={{wordBreak: 'break-word', overflowWrap: 'break-word'}}>
          {finalResult.message}
        </div>
      </div>
    );
  }

  // Fallback for no displayable results
  return (
    <p className="italic text-slate-500">
      Script finished, but produced no standard output to display.
    </p>
  );
}

// ====================================================================================
// SECTION 7: CONSOLE OUTPUT AND LOG DISPLAY
// ====================================================================================

/**
 * Renders console output in a collapsible details element.
 * Properly handles long text content with wrapping and overflow.
 * @param {{content: string, isOpen: boolean, title: string}} props
 * @returns {JSX.Element} A collapsible console output display.
 */
function ConsoleOutputDisplay({ content, isOpen = false, title = "Console Output" }) {
  if (!content) return null;

  return (
    <details className="border rounded-lg bg-white w-full" open={isOpen}>
      <summary className="cursor-pointer p-3 font-semibold text-slate-700 flex items-center justify-between">
        <span>{title}</span>
        <ChevronDown size={20} />
      </summary>

      <div className="border-t p-4">
        {/*
          Prevent layout breaks from long strings:
          - break-all: forces long strings to wrap
          - whitespace-pre-wrap: preserves indentation & line breaks
          - overflow-auto: vertical & horizontal scroll if needed
          - max-w-full: no wider than container
        */}
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

/**
 * Main display component for script progress and results.
 * Handles different execution states: running, completed, and error states.
 * Includes save functionality for reports when enabled.
 * @param {object} props - Component props containing script data and state.
 * @returns {JSX.Element | null} The appropriate UI for the current script state.
 */
export default function ScriptOutputDisplay({
  progressEvents,
  finalResult,
  error,
  isRunning,
  isComplete,
  fullLog,
  script,
  showDebug = false,
}) {
  console.log("[DEBUG] Script prop received by ScriptOutputDisplay:", script);

  // State for save button loading indicator
  const [isSaving, setIsSaving] = useState(false);

  // Extract save button configuration from script capabilities
  const saveButtonConfig = script?.capabilities?.saveButton;
  const canSaveReport = script?.capabilities?.enableReportSaving === true;

  /**
   * Handles the save report functionality by calling the backend API.
   * Shows user feedback through alerts and loading states.
   */
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
      alert(err.message || "An unknown error occurred.");
    } finally {
      setIsSaving(false);
    }
  };

  // ====================================================================================
  // RUNNING STATE DISPLAY
  // ====================================================================================
  if (isRunning) {
    return (
      <div className="space-y-6 w-full">
        {/* Debug information (only shown when debug mode is enabled) */}
        <DebugProgressEvents progressEvents={progressEvents} isVisible={showDebug} />

        {/* Real-time progress display */}
        <RealtimeProgressView
          progressEvents={progressEvents}
          isRunning={isRunning}
          isComplete={isComplete}
          showDebug={showDebug}
        />

        {/* Console output (shown if there's an error during execution) */}
        {error && (
          <ConsoleOutputDisplay
            content={fullLog || error}
            isOpen={false}
            title="Console Output"
          />
        )}
      </div>
    );
  }

  // ====================================================================================
  // COMPLETED STATE DISPLAY
  // ====================================================================================
  if (isComplete) {
    console.log("[DEBUG] Final Render Check:", {
      canSaveReport: canSaveReport,
      isSuccess: finalResult?.success,
    });

    // Handle failed execution
    if (error && !finalResult?.success) {
      return (
        <div className="space-y-6 w-full">
          {/* Error message display */}
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">
            <div className="flex items-center font-bold">
              <AlertTriangle size={20} className="mr-2 flex-shrink-0" />
              SCRIPT FAILED
            </div>
            <div className="mt-2 text-sm font-mono whitespace-pre-wrap" style={{wordBreak: 'break-word', overflowWrap: 'break-word'}}>
              {error}
            </div>
          </div>

          {/* Show progress steps if available */}
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

    // Handle successful execution
    return (
      <div className="space-y-6 w-full">
        {/* Debug information */}
        <DebugProgressEvents progressEvents={progressEvents} isVisible={showDebug} />

        {/* Save report button (only shown when enabled and successful) */}
        {canSaveReport && finalResult?.success && (
          <div className="flex items-center p-3">
            <button
              onClick={handleSaveReport}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:bg-slate-200 transition-colors"
            >
              <Save size={16} />
              {isSaving ? "Saving..." : (saveButtonConfig.label || "Save Report")}
            </button>
          </div>
        )}

        {/* Progress steps display */}
        {progressEvents.length > 0 && (
          <RealtimeProgressView
            progressEvents={progressEvents}
            isRunning={false}
            isComplete={true}
            showDebug={showDebug}
          />
        )}

        {/* Final results display */}
        {finalResult && <FinalResultView finalResult={finalResult} />}

        {/* Console log display (open by default if execution failed) */}
        {(error || fullLog) && (
          <ConsoleOutputDisplay
            content={fullLog || error || "No console output available"}
            isOpen={!finalResult?.success}
            title="Raw Console Log"
          />
        )}
      </div>
    );
  }

  // ====================================================================================
  // DEFAULT STATE (NOT RUNNING AND NOT COMPLETE)
  // ====================================================================================
  return null;
}
