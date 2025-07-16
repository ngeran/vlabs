// src/components/TemplateApplyProgress.jsx (COMPLETE ENHANCED VERSION WITH REAL-TIME UPDATES)

import React, { useEffect, useRef, useState, useCallback } from "react";
import { CheckCircle, XCircle, AlertTriangle, Loader, Clock } from "lucide-react";

// ================================================================================================
// HELPER COMPONENTS SECTION
// ================================================================================================

/**
 * Individual Progress Step Component
 * Renders a single step in the deployment process with real-time status updates
 * Features:
 * - Status-based icons and colors
 * - Smooth animations on status changes
 * - Duration display for completed steps
 * - Error and success details
 * - Active step highlighting
 */
const ProgressStep = ({ stepInfo, isActive = false }) => {
  // Local state for triggering re-renders on status changes
  const [animationKey, setAnimationKey] = useState(0);
  const prevStatusRef = useRef(stepInfo.status);

  // Trigger animation when step status changes for smooth transitions
  useEffect(() => {
    if (stepInfo.status !== prevStatusRef.current) {
      prevStatusRef.current = stepInfo.status;
      setAnimationKey(prev => prev + 1);
    }
  }, [stepInfo.status]);

  /**
   * Get color class based on step status
   * @returns {string} Tailwind color class
   */
  const getStatusColor = () => {
    switch (stepInfo.status) {
      case "COMPLETED":
        return "text-green-500";
      case "FAILED":
      case "TIMEOUT":
        return "text-red-500";
      case "IN_PROGRESS":
        return "text-blue-500";
      case "PENDING":
        return "text-slate-400";
      default:
        return "text-slate-500";
    }
  };

  /**
   * Get appropriate icon based on step status
   * @returns {JSX.Element} Lucide icon component
   */
  const getStatusIcon = () => {
    switch (stepInfo.status) {
      case "COMPLETED":
        return <CheckCircle size={20} className="animate-pulse" />;
      case "FAILED":
      case "TIMEOUT":
        return <XCircle size={20} className="animate-pulse" />;
      case "IN_PROGRESS":
        return <Loader size={20} className="animate-spin" />;
      case "PENDING":
        return <Clock size={20} className="opacity-50" />;
      default:
        return null;
    }
  };

  /**
   * Get background styling for active steps
   * @returns {string} Tailwind background classes
   */
  const getBgColor = () => {
    if (isActive && stepInfo.status === "IN_PROGRESS") {
      return "bg-blue-50 border-blue-200 border";
    }
    return "";
  };

  return (
    <li
      key={animationKey}
      className={`mb-4 pl-8 relative p-2 rounded-md transition-all duration-300 ${getBgColor()}`}
    >
      {/* Status Icon Circle */}
      <div
        className={`absolute left-0 top-3 w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-300 ${getStatusColor()}`}
      >
        {getStatusIcon()}
      </div>

      {/* Step Name and Running Indicator */}
      <div className="font-medium text-slate-800 flex items-center gap-2">
        {stepInfo.name}
        {stepInfo.status === "IN_PROGRESS" && (
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full animate-pulse">
            Running...
          </span>
        )}
      </div>

      {/* Step Description */}
      <div className="text-sm text-slate-500">{stepInfo.description}</div>

      {/* Duration Display (only for completed steps) */}
      {stepInfo.duration && stepInfo.status === "COMPLETED" && (
        <div className="text-xs text-slate-400 mt-1">
          Completed in {stepInfo.duration.toFixed(2)}s
        </div>
      )}

      {/* Success Details (commit reports, etc.) */}
      {stepInfo.details?.commit_report && (
        <div className="text-xs text-blue-600 mt-2 pl-4 border-l-2 border-blue-200 bg-blue-50 p-2 rounded">
          {stepInfo.details.commit_report}
        </div>
      )}

      {/* Error Details */}
      {stepInfo.details?.error && (
        <div className="text-xs text-red-600 mt-2 pl-4 border-l-2 border-red-200 bg-red-50 p-2 rounded">
          Error: {stepInfo.details.error}
        </div>
      )}
    </li>
  );
};

/**
 * Progress Bar Component
 * Shows overall deployment progress with animated bar
 * Features:
 * - Percentage calculation
 * - Smooth progress transitions
 * - Different colors for active/completed states
 * - Step counter display
 */
const ProgressBar = ({ current, total, isActive = false }) => {
  // Calculate completion percentage
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="mb-4">
      {/* Progress Text and Percentage */}
      <div className="flex justify-between items-center text-sm text-slate-600 mb-2">
        <span>Progress: {current} of {total} steps</span>
        <span>{percentage}%</span>
      </div>

      {/* Animated Progress Bar */}
      <div className="w-full bg-slate-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-500 ease-out ${
            isActive ? 'bg-blue-500 animate-pulse' : 'bg-green-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

// ================================================================================================
// MAIN COMPONENT SECTION
// ================================================================================================

/**
 * Main Template Apply Progress Component
 * Displays real-time deployment progress with step-by-step updates
 *
 * Features:
 * - Real-time step visibility as they execute
 * - Incremental progress updates
 * - Auto-scrolling to current step
 * - Status indicators and animations
 * - Error handling and display
 * - Final result presentation
 *
 * @param {Object} applicationState - Current deployment state
 * @param {Function} onReset - Callback to reset deployment
 */
const TemplateApplyProgress = ({ applicationState, onReset }) => {
  // Destructure application state
  const {
    isApplying,
    progress,
    result,
    error,
    isComplete,
    duration
  } = applicationState;

  // ================================================================================================
  // COMPONENT STATE MANAGEMENT SECTION
  // ================================================================================================

  // State to track steps as they come in (real-time visibility)
  const [visibleSteps, setVisibleSteps] = useState([]);
  // Index of currently active/running step
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  // Force re-render key for smooth animations
  const [renderKey, setRenderKey] = useState(0);
  // Reference to step container for auto-scrolling
  const stepContainerRef = useRef(null);

  // ================================================================================================
  // REAL-TIME STEP PROCESSING SECTION
  // ================================================================================================

  /**
   * Process incoming steps and update visible steps incrementally
   * This is the core function that enables real-time step visibility
   *
   * @param {Array} newSteps - Array of step objects from progress updates
   */
  const processSteps = useCallback((newSteps) => {
    if (!newSteps || !Array.isArray(newSteps)) return;

    try {
      setVisibleSteps(prevSteps => {
        const updatedSteps = [...prevSteps];

        // Process each incoming step
        newSteps.forEach((newStep, index) => {
          if (index < updatedSteps.length) {
            // Update existing step if status has changed
            if (updatedSteps[index].status !== newStep.status) {
              updatedSteps[index] = { ...newStep };
            }
          } else {
            // Add new step that wasn't visible before
            updatedSteps.push({ ...newStep });
          }
        });

        return updatedSteps;
      });

      // Update current step index based on step statuses
      const inProgressIndex = newSteps.findIndex(step => step.status === "IN_PROGRESS");
      const lastCompletedIndex = newSteps.length > 0 ? newSteps.map((step, index) => step.status === "COMPLETED" ? index : -1).filter(index => index !== -1).pop() || -1 : -1;
      const newCurrentIndex = inProgressIndex >= 0 ? inProgressIndex : Math.min(lastCompletedIndex + 1, newSteps.length - 1);

      setCurrentStepIndex(newCurrentIndex);
    } catch (error) {
      console.error('Error processing steps:', error);
    }
  }, []);

  // ================================================================================================
  // REAL-TIME UPDATE EFFECTS SECTION
  // ================================================================================================

  /**
   * Process steps from ongoing progress updates
   * This effect handles real-time updates during deployment
   */
  useEffect(() => {
    if (progress?.steps) {
      processSteps(progress.steps);
      setRenderKey(prev => prev + 1);
    }
  }, [progress, processSteps]);

  /**
   * Process steps from final result
   * This effect handles the final state when deployment completes
   */
  useEffect(() => {
    if (result?.progress?.steps) {
      processSteps(result.progress.steps);
      setRenderKey(prev => prev + 1);
    }
  }, [result, processSteps]);

  /**
   * Auto-scroll to current step for better UX
   * Keeps the active step visible in the viewport
   */
  useEffect(() => {
    if (isApplying && currentStepIndex >= 0) {
      try {
        const currentStepElement = document.getElementById(`step-${currentStepIndex}`);
        if (currentStepElement && stepContainerRef.current) {
          currentStepElement.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest'
          });
        }
      } catch (error) {
        console.error('Error scrolling to current step:', error);
      }
    }
  }, [currentStepIndex, isApplying]);

  /**
   * Reset visible steps when starting new deployment
   * Ensures clean state for each new deployment
   */
  useEffect(() => {
    if (isApplying && !isComplete) {
      setVisibleSteps([]);
      setCurrentStepIndex(-1);
    }
  }, [isApplying, isComplete]);

  // ================================================================================================
  // COMPONENT VISIBILITY CONTROL SECTION
  // ================================================================================================

  // Don't render if not applying and not complete
  if (!isApplying && !isComplete) {
    return null;
  }

  // ================================================================================================
  // COMPUTED VALUES SECTION
  // ================================================================================================

  // Calculate overall deployment status
  const overallStatus = result?.success ? "SUCCESS" : "FAILURE";
  // Count completed steps for progress calculation
  const completedSteps = visibleSteps.filter(step => step.status === "COMPLETED").length;
  // Total steps currently visible
  const totalSteps = visibleSteps.length;

  // ================================================================================================
  // MAIN RENDER SECTION
  // ================================================================================================

  return (
    <div
      key={renderKey}
      className="mt-10 border border-slate-200 rounded-lg p-6 lg:p-8 bg-white shadow-md"
    >
      {/* ================================================================================================ */}
      {/* HEADER SECTION */}
      {/* ================================================================================================ */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
          Configuration Deployment
          {isApplying && (
            <span className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded-full animate-pulse">
              In Progress
            </span>
          )}
        </h3>
        {isComplete && (
          <button
            onClick={onReset}
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            Start New Deployment
          </button>
        )}
      </div>

      {/* ================================================================================================ */}
      {/* PROGRESS BAR SECTION */}
      {/* ================================================================================================ */}
      {totalSteps > 0 && (
        <ProgressBar
          current={completedSteps}
          total={totalSteps}
          isActive={isApplying}
        />
      )}

      {/* ================================================================================================ */}
      {/* OVERALL STATUS SECTION */}
      {/* ================================================================================================ */}
      {isComplete && (
        <div
          className={`p-4 rounded-md mb-6 flex items-center gap-4 text-lg font-semibold transition-all duration-500 ${
            overallStatus === "SUCCESS"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {overallStatus === "SUCCESS" ? (
            <CheckCircle className="animate-pulse" />
          ) : (
            <AlertTriangle className="animate-pulse" />
          )}
          <span>
            Deployment{" "}
            {overallStatus === "SUCCESS" ? "Completed Successfully" : "Failed"}{" "}
            {duration ? `in ${(duration / 1000).toFixed(2)}s` : ""}
          </span>
        </div>
      )}

      {/* ================================================================================================ */}
      {/* LIVE STATUS INDICATOR SECTION */}
      {/* ================================================================================================ */}
      {isApplying && (
        <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-md flex items-center gap-3">
          <Loader className="animate-spin text-blue-600" size={20} />
          <span className="text-blue-800 font-medium">
            Processing deployment...
            {currentStepIndex >= 0 && visibleSteps[currentStepIndex] && (
              <span className="ml-2 text-sm">
                ({visibleSteps[currentStepIndex].name})
              </span>
            )}
          </span>
        </div>
      )}

      {/* ================================================================================================ */}
      {/* PROGRESS STEPS SECTION */}
      {/* ================================================================================================ */}
      {visibleSteps.length > 0 && (
        <div className="border-l-2 border-slate-200 relative" ref={stepContainerRef}>
          <ul className="space-y-2">
            {visibleSteps.map((step, index) => (
              <div key={`${step.name}-${index}`} id={`step-${index}`}>
                <ProgressStep
                  stepInfo={step}
                  isActive={index === currentStepIndex}
                />
              </div>
            ))}
          </ul>
        </div>
      )}

      {/* ================================================================================================ */}
      {/* ERROR DISPLAY SECTION */}
      {/* ================================================================================================ */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-md">
          <h4 className="font-bold flex items-center gap-2">
            <XCircle size={18} />
            Error:
          </h4>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {/* ================================================================================================ */}
      {/* FINAL RESULT DETAILS SECTION */}
      {/* ================================================================================================ */}
      {result && isComplete && (
        <div className="mt-6 border-t pt-4">
          <h4 className="font-semibold text-slate-700 mb-2">Final Details:</h4>
          <div className="bg-slate-900 text-slate-200 text-xs p-4 rounded-md overflow-x-auto">
            <pre className="whitespace-pre-wrap break-all">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* ================================================================================================ */}
      {/* REAL-TIME CONNECTION STATUS SECTION */}
      {/* ================================================================================================ */}
      {isApplying && (
        <div className="mt-4 text-xs text-slate-500 border-t pt-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            Real-time updates active
            {visibleSteps.length > 0 && (
              <span className="ml-2">({visibleSteps.length} steps visible)</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateApplyProgress;
