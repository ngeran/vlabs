// src/components/ScriptOutputDisplay.jsx

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
// Note: Using simple alert instead of toast for demo purposes
// In your actual implementation, use your preferred toast library

const API_BASE_URL = "http://localhost:3001";

// Helper to render an icon based on status
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

// Debug component to show raw progress events
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

// Your existing SimpleTable component - no changes needed
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

/**
 * @description Enhanced RealtimeProgressView component for displaying script execution progress
 */
function RealtimeProgressView({
  progressEvents = [],
  isRunning,
  isComplete,
  showDebug = false,
}) {
  // Log progress events for debugging
  useEffect(() => {
    if (progressEvents.length > 0) {
      console.log("Progress events received:", progressEvents);
    }
  }, [progressEvents]);

  // Find the final operation completion event once.
  const finalOpEvent = Array.isArray(progressEvents)
    ? progressEvents.find((e) => e?.event_type === "OPERATION_COMPLETE")
    : null;

  // Memoize the calculation of steps to avoid re-computing on every render
  const { stepArray, currentStep, totalSteps, processingStats } =
    useMemo(() => {
      // Safety check for an empty or invalid event stream.
      if (!Array.isArray(progressEvents) || progressEvents.length === 0) {
        return {
          stepArray: [],
          currentStep: 0,
          totalSteps: 0,
          processingStats: { totalEvents: 0, stepEvents: 0, validSteps: 0 },
        };
      }

      console.log("Processing progress events:", progressEvents.length);

      // Filter only the events relevant to steps.
      const stepEvents = progressEvents.filter((e) => {
        const isStepEvent =
          e?.event_type === "STEP_START" || e?.event_type === "STEP_COMPLETE";
        if (!isStepEvent) {
          console.log("Non-step event:", e);
        }
        return isStepEvent;
      });

      console.log("Step events found:", stepEvents.length);

      // Group events by their step number to create a definitive state for each step.
      const groupedSteps = stepEvents.reduce((acc, event) => {
        const stepNum = event?.data?.step;
        console.log("Processing step event:", { stepNum, event });

        if (stepNum) {
          // For each step, keep track of the most recent event data
          if (!acc[stepNum]) {
            acc[stepNum] = { step: stepNum };
          }

          // Merge event data, with later events overriding earlier ones
          acc[stepNum] = {
            ...acc[stepNum],
            ...event.data,
            step: stepNum,
            // Keep track of when this step was last updated
            lastUpdated: event.timestamp || Date.now(),
            // Track the event type to determine final status
            lastEventType: event.event_type,
          };
        }
        return acc;
      }, {});

      console.log("Grouped steps:", groupedSteps);

      // Create a sorted array of the step objects.
      const steps = Object.values(groupedSteps).sort((a, b) => a.step - b.step);

      console.log("Sorted steps:", steps);

      // Post-process steps to fix status based on operation completion
      const processedSteps = steps.map((step) => {
        // If the operation is complete and this step doesn't have an explicit COMPLETED status,
        // but it has been started, then it should be considered completed
        if ((finalOpEvent || isComplete) && step.status === "IN_PROGRESS") {
          return {
            ...step,
            status: "COMPLETED",
          };
        }
        return step;
      });

      // Calculate total steps based on the highest step number seen
      const totalSteps =
        processedSteps.length > 0
          ? Math.max(...processedSteps.map((s) => s.step))
          : 0;

      // Calculate current step more accurately
      let currentStepNumber = 0;

      if (finalOpEvent || isComplete) {
        // If the entire operation is complete, all steps are complete
        currentStepNumber = totalSteps;
      } else if (isRunning) {
        // Find the active step (in progress) or the last completed step
        const activeStep = processedSteps.find(
          (step) => step.status === "IN_PROGRESS",
        );
        if (activeStep) {
          currentStepNumber = activeStep.step;
        } else {
          // If no active step, find the last completed step
          const completedSteps = processedSteps.filter(
            (step) => step.status === "COMPLETED",
          );
          if (completedSteps.length > 0) {
            currentStepNumber = Math.max(...completedSteps.map((s) => s.step));
          }
        }
      } else {
        // Default case
        currentStepNumber = totalSteps;
      }

      // Ensure the current step doesn't exceed the total
      if (currentStepNumber > totalSteps) {
        currentStepNumber = totalSteps;
      }

      const processingStats = {
        totalEvents: progressEvents.length,
        stepEvents: stepEvents.length,
        validSteps: processedSteps.length,
      };

      console.log("Final processing result:", {
        stepArray: processedSteps,
        currentStep: currentStepNumber,
        totalSteps,
        processingStats,
      });

      return {
        stepArray: processedSteps,
        currentStep: currentStepNumber,
        totalSteps: totalSteps,
        processingStats,
      };
    }, [progressEvents, finalOpEvent, isRunning, isComplete]);

  // Helper function to get step status display
  const getStepStatusDisplay = (step) => {
    switch (step?.status) {
      case "COMPLETED":
        return "✓ Completed";
      case "IN_PROGRESS":
        return "⏳ In Progress";
      case "FAILED":
        return "✗ Failed";
      default:
        return "⏸ Pending";
    }
  };

  // Helper function to get step status color
  const getStepStatusColor = (step) => {
    switch (step?.status) {
      case "COMPLETED":
        return "text-green-600 bg-green-50 border-green-200";
      case "IN_PROGRESS":
        return "text-blue-600 bg-blue-50 border-blue-200";
      case "FAILED":
        return "text-red-600 bg-red-50 border-red-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  // Don't render if we have no progress events and we're not running
  if (!isRunning && stepArray.length === 0) {
    return null;
  }

  return (
    <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
      {/* Debug information */}
      {showDebug && (
        <div className="mb-4 p-3 bg-gray-100 rounded-lg text-sm">
          <strong>Debug Info:</strong> {processingStats.totalEvents} total
          events, {processingStats.stepEvents} step events,{" "}
          {processingStats.validSteps} valid steps processed
        </div>
      )}

      <div className="border-b border-slate-200 pb-4 mb-6">
        <h3 className="text-xl font-bold text-slate-800 flex items-center">
          {finalOpEvent || isComplete ? (
            <StatusIcon status={finalOpEvent?.data?.status || "SUCCESS"} />
          ) : (
            <Loader className="animate-spin text-blue-500" size={20} />
          )}
          <span className="ml-3">Execution Progress</span>
        </h3>

        {/* Progress bar */}
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
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(currentStep / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        )}

        {finalOpEvent && (
          <p className="text-sm text-slate-500 mt-2">{finalOpEvent.message}</p>
        )}
      </div>

      <div className="space-y-4">
        {stepArray.length === 0 ? (
          <div className="text-center py-8">
            <div className="animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-3/4 mx-auto mb-2"></div>
              <div className="h-3 bg-slate-200 rounded w-1/2 mx-auto"></div>
            </div>
            <p className="text-slate-500 mt-4">
              {isRunning
                ? "Initializing script execution..."
                : "Waiting for script to start..."}
            </p>
            {showDebug && (
              <p className="text-xs text-gray-500 mt-2">
                Events received: {processingStats.totalEvents}, Step events:{" "}
                {processingStats.stepEvents}
              </p>
            )}
          </div>
        ) : (
          stepArray.map((step) => (
            <div
              key={step.step}
              className={`border-l-4 p-4 rounded-r-lg transition-all duration-300 ${
                step.status === "IN_PROGRESS"
                  ? "border-blue-500 bg-blue-50 shadow-md"
                  : step.status === "COMPLETED"
                    ? "border-green-500 bg-green-50"
                    : step.status === "FAILED"
                      ? "border-red-500 bg-red-50"
                      : "border-gray-300 bg-gray-50"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start flex-1">
                  <div className="flex-shrink-0 mt-1">
                    <StatusIcon status={step.status} />
                  </div>
                  <div className="ml-3 flex-grow">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-slate-800">
                        Step {step.step}: {step.name || "Unknown Step"}
                      </h4>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium border ${getStepStatusColor(step)}`}
                      >
                        {getStepStatusDisplay(step)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">
                      {step.description || "No description available"}
                    </p>

                    {/* Show file created */}
                    {step.details?.file_created && (
                      <div className="flex items-center gap-1 text-xs text-blue-600 mb-1">
                        <span>📄</span>
                        <span>
                          File: {step.details.file_created.split("/").pop()}
                        </span>
                      </div>
                    )}

                    {/* Show directory path */}
                    {step.details?.path && (
                      <div className="flex items-center gap-1 text-xs text-blue-600 mb-1">
                        <span>📁</span>
                        <span>Path: {step.details.path.split("/").pop()}</span>
                      </div>
                    )}

                    {/* Show error */}
                    {step.details?.error && (
                      <div className="flex items-center gap-1 text-xs text-red-600 mb-1">
                        <span>⚠️</span>
                        <span>Error: {step.details.error}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Duration display */}
                {step.duration != null && (
                  <div className="text-xs text-slate-500 font-mono ml-4 flex-shrink-0">
                    {step.duration.toFixed(2)}s
                  </div>
                )}
              </div>

              {/* Progress indicator for active step */}
              {step.status === "IN_PROGRESS" && (
                <div className="mt-2 flex items-center gap-2 text-xs text-blue-600">
                  <div className="animate-pulse w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>Processing...</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Summary section */}
      {finalOpEvent && (
        <div className="mt-6 pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              Operation: {finalOpEvent.data?.operation || "Unknown"}
            </span>
            <span className="text-sm text-slate-500">
              Total time:{" "}
              {finalOpEvent.data?.total_duration?.toFixed(2) || "0.00"}s
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * @description Renders the final, structured output of a script.
 */
function FinalResultView({ finalResult }) {
  if (!finalResult) return null;

  if (finalResult.results_by_host) {
    return (
      <div className="space-y-6">
        {finalResult.results_by_host.map((hostResult, index) => (
          <div key={index} className="p-4 border rounded-md bg-white shadow-sm">
            <h3 className="text-lg font-bold text-slate-800">
              Results for:{" "}
              <span className="font-mono">{hostResult.hostname}</span>
            </h3>
            {hostResult.status === "error" ? (
              <p className="text-red-600 mt-2">{hostResult.message}</p>
            ) : (
              hostResult.test_results?.map((testResult, testIndex) => (
                <div key={testIndex} className="mt-2">
                  {testResult.error ? (
                    <p className="text-yellow-600">{testResult.error}</p>
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
        className={`p-4 rounded-lg border ${finalResult.success ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-red-50 border-red-200 text-red-800"}`}
      >
        <div className="flex items-center font-bold">
          {finalResult.success ? (
            <Info size={20} className="mr-2" />
          ) : (
            <AlertTriangle size={20} className="mr-2" />
          )}
          Status
        </div>
        <p className="mt-2 text-sm">{finalResult.message}</p>
      </div>
    );
  }

  return (
    <p className="italic text-slate-500">
      Script finished, but produced no standard output to display.
    </p>
  );
}

/**
 * @description The main display component that switches between real-time progress and final results.
 */
export default function ScriptOutputDisplay({
  progressEvents,
  finalResult,
  error,
  isRunning,
  isComplete,
  fullLog,
  showDebug = false, // Add debug prop
}) {
  const [isSaving, setIsSaving] = useState(false);

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
          filename: defaultFilename,
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

  // Show progress view as soon as the script starts running
  if (isRunning) {
    return (
      <div className="space-y-6">
        {/* Debug information */}
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

        {/* Show error details if there's an error while running */}
        {error && (
          <details className="border rounded-lg bg-white">
            <summary className="cursor-pointer p-3 font-semibold text-slate-700 flex items-center justify-between list-none hover:bg-slate-50 transition-colors">
              <span>Console Output</span>
              <ChevronDown
                className="transition-transform duration-200 group-open:rotate-180"
                size={20}
              />
            </summary>
            <div className="border-t border-slate-200 p-4">
              <pre className="bg-slate-800 text-slate-200 p-4 rounded-md whitespace-pre-wrap font-mono text-xs overflow-x-auto">
                {fullLog?.trim() ||
                  error?.trim() ||
                  "No console output available"}
              </pre>
            </div>
          </details>
        )}
      </div>
    );
  }

  // Show completion view when script is done
  if (isComplete) {
    // Prioritize showing a top-level error if the whole process failed
    if (error && !finalResult?.success) {
      return (
        <div className="space-y-6">
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">
            <div className="flex items-center font-bold">
              <AlertTriangle size={20} className="mr-2" />
              SCRIPT FAILED
            </div>
            <p className="mt-2 text-sm font-mono whitespace-pre-wrap">
              {error}
            </p>
          </div>

          {/* Show progress view even on failure to show what steps were completed */}
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

    return (
      <div className="space-y-6">
        {/* Debug information */}
        <DebugProgressEvents
          progressEvents={progressEvents}
          isVisible={showDebug}
        />

        {/* Conditionally render save button only when complete and successful */}
        {finalResult?.success && (
          <div className="flex items-center p-3">
            <button
              onClick={handleSaveReport}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:bg-slate-200 transition-colors"
            >
              <Save size={16} />
              {isSaving ? "Saving..." : "Save Formatted Report"}
            </button>
          </div>
        )}

        {/* Show progress view with completed steps */}
        {progressEvents.length > 0 && (
          <RealtimeProgressView
            progressEvents={progressEvents}
            isRunning={false}
            isComplete={true}
            showDebug={showDebug}
          />
        )}

        {/* Show final results */}
        {finalResult && <FinalResultView finalResult={finalResult} />}

        {/* Collapsible Raw Log Display */}
        {(error || fullLog) && (
          <details
            className="border rounded-lg bg-white"
            open={!finalResult?.success}
          >
            <summary className="cursor-pointer p-3 font-semibold text-slate-700 flex items-center justify-between list-none hover:bg-slate-50 transition-colors">
              <span>Raw Console Log</span>
              <ChevronDown
                className="transition-transform duration-200 group-open:rotate-180"
                size={20}
              />
            </summary>
            <div className="border-t border-slate-200 p-4">
              <pre className="bg-slate-800 text-slate-200 p-4 rounded-md whitespace-pre-wrap font-mono text-xs overflow-x-auto">
                {fullLog?.trim() ||
                  error?.trim() ||
                  "No console output available"}
              </pre>
            </div>
          </details>
        )}
      </div>
    );
  }

  // Nothing to render if the script hasn't started
  return null;
}
