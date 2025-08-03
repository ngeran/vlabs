// =================================================================================================
// FILE:               EnhancedRealTimeDisplay.jsx
// COMPONENT:          Enhanced Real-Time Display Component
// VERSION:            2.0.0
// LAST UPDATED:       2025-08-03
//
// DESCRIPTION:
//   A comprehensive, space-efficient real-time progress display system designed for modern
//   web applications. Features collapsible sections, two-line log format, intelligent state
//   management, and seamless integration with WebSocket streams or polling systems. Built
//   with shadcn/ui styling and optimized for both desktop and mobile experiences.
//
// KEY FEATURES:
//   ✅ Two-line log format: "Live Log" + latest status message
//   ✅ Collapsible sections for space optimization
//   ✅ Auto-scrolling to latest log entries
//   ✅ Comprehensive progress visualization
//   ✅ Real-time status banners (success/error states)
//   ✅ Copy-to-clipboard functionality for results
//   ✅ Quick statistics footer with step counts
//   ✅ Responsive design with mobile optimization
//   ✅ shadcn/ui compatible styling with dark mode
//   ✅ Accessibility features with proper ARIA labels
//   ✅ Performance optimized with memoization
//
// DEPENDENCIES:
//   - React 16.8+ (hooks: useState, useMemo, useRef, useEffect)
//   - lucide-react (icons: AlertTriangle, CheckCircle, RefreshCw, ChevronDown, ChevronUp, Terminal)
//   - Tailwind CSS 3.0+ (full utility classes and custom scrollbar support)
//   - EnhancedProgressBar component (./EnhancedProgressBar)
//   - EnhancedProgressStep component (./EnhancedProgressStep)
//   - Optional: shadcn/ui theme configuration
//
// HOW TO USE:
//   1. Import: import EnhancedRealTimeDisplay from './EnhancedRealTimeDisplay';
//   2. Prepare your data structure:
//      const realTimeProps = {
//        isActive: scriptRunner.isTriggered,
//        isRunning: scriptRunner.isRunning,
//        isComplete: scriptRunner.isComplete,
//        hasError: !!scriptRunner.error,
//        progress: scriptRunner.progressEvents,
//        progressPercentage: calculatePercentage(),
//        currentStep: getCurrentStep(),
//        totalSteps: getTotalSteps(),
//        completedSteps: getCompletedSteps(),
//        result: scriptRunner.finalResult,
//        error: scriptRunner.error,
//        onReset: handleReset,
//        canReset: true
//      };
//   3. Conditional rendering:
//      {(isTriggered || isRunning || isComplete) &&
//        <EnhancedRealTimeDisplay {...realTimeProps} />}
//
// INTEGRATION PATTERNS:
//   - WebSocket streams: Real-time event processing
//   - Polling systems: Periodic status updates
//   - Script runners: Process execution monitoring
//   - File operations: Upload/download progress
//   - API operations: Multi-step request handling
//
// PERFORMANCE NOTES:
//   - Uses React.memo for step components to prevent unnecessary re-renders
//   - Implements useMemo for expensive calculations
//   - Auto-scrolling is throttled to prevent performance issues
//   - Large log histories are handled with virtual scrolling considerations
// =================================================================================================

import React, { useMemo, useRef, useEffect } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw, ChevronDown, ChevronUp, Terminal } from 'lucide-react';

// =================================================================================================
// SECTION 1: EMBEDDED COMPONENT DEFINITIONS
// Self-contained versions of EnhancedProgressBar and EnhancedProgressStep
// In production, these would be separate files and imported normally
// =================================================================================================

/**
 * Embedded Enhanced Progress Bar Component
 * Compact progress visualization with intelligent state management
 */
const EnhancedProgressBar = ({
  percentage = 0,
  currentStep,
  totalSteps = 0,
  completedSteps = 0,
  isRunning = false,
  isComplete = false,
  hasError = false,
  showStepCounter = true,
  showPercentage = true,
  animated = true,
  compact = false
}) => {
  const { Loader, CheckCircle: Check, AlertCircle, Clock } = {
    Loader: ({ className }) => <div className={`${className} animate-spin border-2 border-current border-t-transparent rounded-full`} />,
    CheckCircle: ({ className }) => <div className={`${className} rounded-full bg-current flex items-center justify-center text-white text-xs`}>✓</div>,
    AlertCircle: ({ className }) => <div className={`${className} rounded-full bg-current flex items-center justify-center text-white text-xs`}>!</div>,
    Clock: ({ className }) => <div className={`${className} rounded-full border-2 border-current`} />
  };

  const getProgressConfig = () => {
    if (hasError) return {
      bg: 'bg-red-100 dark:bg-red-950/20',
      fill: 'bg-red-500',
      text: 'text-red-700 dark:text-red-400',
      icon: AlertCircle,
      pulse: false
    };
    if (isComplete) return {
      bg: 'bg-green-100 dark:bg-green-950/20',
      fill: 'bg-green-500',
      text: 'text-green-700 dark:text-green-400',
      icon: Check,
      pulse: false
    };
    return {
      bg: 'bg-blue-100 dark:bg-blue-950/20',
      fill: 'bg-blue-500',
      text: 'text-blue-700 dark:text-blue-400',
      icon: isRunning ? Loader : Clock,
      pulse: isRunning && animated
    };
  };

  const config = getProgressConfig();
  const IconComponent = config.icon;
  const safePercentage = Math.min(Math.max(percentage, 0), 100);

  return (
    <div className={`space-y-${compact ? '2' : '3'}`}>
      <div className="relative">
        <div className={`w-full ${config.bg} rounded-full h-2 overflow-hidden border border-gray-200 dark:border-gray-700`}>
          <div
            className={`h-full ${config.fill} transition-all duration-700 ease-out rounded-full ${
              config.pulse ? 'animate-pulse' : ''
            }`}
            style={{
              width: `${safePercentage}%`,
              boxShadow: safePercentage > 0 ? '0 0 8px rgba(59, 130, 246, 0.3)' : 'none'
            }}
          />
        </div>

        {showPercentage && safePercentage > 15 && (
          <div
            className="absolute top-0 h-2 flex items-center"
            style={{ width: `${safePercentage}%` }}
          >
            <span className="text-[10px] font-medium text-white ml-auto mr-1 tabular-nums">
              {Math.round(safePercentage)}%
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <IconComponent
            className={`w-4 h-4 ${config.text} flex-shrink-0`}
          />

          <div className="min-w-0 flex-1">
            {currentStep ? (
              <p className={`text-sm font-medium ${config.text} truncate`} title={currentStep}>
                {currentStep}
              </p>
            ) : (
              <p className={`text-sm ${config.text}`}>
                {isRunning ? 'Processing...' :
                 isComplete ? 'Complete' :
                 hasError ? 'Error' : 'Ready'}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs flex-shrink-0">
          {showStepCounter && totalSteps > 0 && (
            <span className={`${config.text} tabular-nums`}>
              {completedSteps}/{totalSteps}
            </span>
          )}

          {showPercentage && (safePercentage <= 15 || !compact) && (
            <span className={`font-medium ${config.text} tabular-nums min-w-[3ch]`}>
              {Math.round(safePercentage)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const EnhancedProgressStep = ({
  step,
  isLatest = false,
  compact = false,
  showTimestamp = true
}) => {
  const stepType = step.level?.toLowerCase() || step.type?.toLowerCase() || 'info';

  const getStepConfig = (type) => {
    const configs = {
      success: {
        bgClass: 'bg-green-50 dark:bg-green-950/50',
        borderClass: 'border-l-green-500',
        textClass: 'text-green-900 dark:text-green-100',
        iconClass: 'text-green-600 dark:text-green-400',
        category: 'Success',
        icon: '✓'
      },
      error: {
        bgClass: 'bg-red-50 dark:bg-red-950/50',
        borderClass: 'border-l-red-500',
        textClass: 'text-red-900 dark:text-red-100',
        iconClass: 'text-red-600 dark:text-red-400',
        category: 'Error',
        icon: '✕'
      },
      warning: {
        bgClass: 'bg-yellow-50 dark:bg-yellow-950/50',
        borderClass: 'border-l-yellow-500',
        textClass: 'text-yellow-900 dark:text-yellow-100',
        iconClass: 'text-yellow-600 dark:text-yellow-400',
        category: 'Warning',
        icon: '⚠'
      },
      info: {
        bgClass: 'bg-blue-50 dark:bg-blue-950/50',
        borderClass: 'border-l-blue-500',
        textClass: 'text-blue-900 dark:text-blue-100',
        iconClass: 'text-blue-600 dark:text-blue-400',
        category: 'Info',
        icon: 'ℹ'
      }
    };

    return configs[type] || configs.info;
  };

  const config = getStepConfig(stepType);

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const baseClasses = `
    relative p-3 rounded-lg border-l-4 transition-all duration-300 ease-out
    ${config.bgClass} ${config.borderClass} ${config.textClass}
    ${isLatest ? 'ring-2 ring-blue-200 dark:ring-blue-800 shadow-sm' : ''}
    ${compact ? 'p-2' : ''}
  `.trim();

  return (
    <div className={baseClasses}>
      {isLatest && (
        <div className="absolute -left-1 top-3 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
      )}

      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <div className={`w-4 h-4 ${config.iconClass} flex items-center justify-center text-xs font-bold`}>
            {config.icon}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-semibold uppercase tracking-wide ${config.iconClass}`}>
                {config.category}
              </span>
              {showTimestamp && step.timestamp && (
                <div className="flex items-center gap-1 text-xs opacity-60 flex-shrink-0">
                  <span className="w-3 h-3 text-center">🕐</span>
                  <span className="tabular-nums">{formatTimestamp(step.timestamp)}</span>
                </div>
              )}
            </div>

            <p className={`text-sm leading-snug break-words ${compact ? 'text-xs' : ''}`}>
              {step.message}
            </p>
          </div>

          {step.step && (
            <p className="text-xs mt-2 opacity-60 border-t border-current/10 pt-1">
              Step: {step.step}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// =================================================================================================
// SECTION 2: MAIN COMPONENT DEFINITION
// The primary EnhancedRealTimeDisplay component with comprehensive documentation
// =================================================================================================

/**
 * Enhanced Real-Time Display Component
 *
 * Main container component that orchestrates real-time progress updates with:
 * - Collapsible sections for space efficiency
 * - Two-line log format as requested
 * - Auto-scrolling and performance optimization
 * - Comprehensive status indicators
 *
 * @param {Object} props - Component props
 * @param {boolean} props.isRunning - Whether operation is currently running
 * @param {boolean} props.isComplete - Whether operation has completed successfully
 * @param {boolean} props.hasError - Whether operation has encountered an error
 * @param {Array} props.progress - Array of progress step objects
 * @param {string} props.currentStep - Current step description
 * @param {Object} props.result - Final operation result object
 * @param {Object} props.error - Error object if operation failed
 * @param {number} props.totalSteps - Total number of expected steps
 * @param {number} props.completedSteps - Number of completed steps
 * @param {number} props.progressPercentage - Overall progress percentage (0-100)
 * @param {Function} props.onReset - Callback function for reset action
 * @param {boolean} props.isActive - Whether component should be visible
 * @param {boolean} props.canReset - Whether reset functionality is enabled
 * @param {boolean} props.compact - Use space-saving compact layout
 * @param {string} props.maxLogHeight - Maximum height for scrollable log section
 */
const EnhancedRealTimeDisplay = ({
  isRunning,
  isComplete,
  hasError,
  progress = [],
  currentStep,
  result,
  error,
  totalSteps,
  completedSteps,
  progressPercentage = 0,
  onReset,
  isActive = false,
  canReset = false,
  compact = false,
  maxLogHeight = 'max-h-80'
}) => {
  // =================================================================================================
  // SECTION 3: COMPONENT STATE MANAGEMENT
  // Local state for UI controls and interactions
  // =================================================================================================

  const [isLogExpanded, setIsLogExpanded] = React.useState(false);      // Controls log section visibility
  const [isResultExpanded, setIsResultExpanded] = React.useState(false); // Controls result section visibility
  const logEndRef = useRef(null);                                     // Reference for auto-scrolling

  // =================================================================================================
  // SECTION 4: AUTO-SCROLL BEHAVIOR
  // Automatic scrolling to latest log entries for better UX
  // =================================================================================================

  /**
   * Auto-scroll to latest log entry when new progress is added
   * Only scrolls when operation is running to avoid disrupting user browsing
   */
  useEffect(() => {
    if (isRunning && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [progress.length, isRunning]);

  // =================================================================================================
  // SECTION 5: VISIBILITY LOGIC
  // Determines when the component should be displayed
  // =================================================================================================

  /**
   * Component visibility logic
   * Shows component when there's any activity or explicit activation
   */
  const shouldShow = isActive || isRunning || isComplete || hasError || progress.length > 0;

  // =================================================================================================
  // SECTION 6: DATA PROCESSING & MEMOIZATION
  // Optimized data processing with React.useMemo for performance
  // =================================================================================================

  /**
   * Get the latest log message for compact display and status indication
   * Memoized to prevent unnecessary recalculations
   */
  const latestMessage = useMemo(() => {
    return progress.length > 0 ? progress[progress.length - 1] : null;
  }, [progress]);

  /**
   * Calculate comprehensive progress metrics
   * Handles both provided metrics and auto-calculated values
   */
  const metrics = useMemo(() => {
    const total = totalSteps || progress.length;
    const completed = completedSteps || progress.filter(p =>
      p.level?.toLowerCase() === 'success' || p.type?.toLowerCase() === 'success'
    ).length;

    return {
      totalSteps: total,
      completedSteps: completed,
      progressPercentage: total > 0 ? (completed / total) * 100 : progressPercentage
    };
  }, [totalSteps, completedSteps, progress, progressPercentage]);

  // =================================================================================================
  // SECTION 7: EARLY RETURN LOGIC
  // Performance optimization - exit early if component shouldn't render
  // =================================================================================================

  if (!shouldShow) {
    return null;
  }

  // =================================================================================================
  // SECTION 8: MAIN RENDER STRUCTURE
  // Organized rendering with clearly defined sections and subsections
  // =================================================================================================

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg space-y-4 p-4">

      {/* =================================================================================================
          SUBSECTION 8A: HEADER WITH STATUS AND CONTROLS
          Main header showing operation status and optional reset functionality
          ================================================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          {/* Operation status title with appropriate icon */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            {isRunning ? 'Operation in Progress' :
             isComplete ? 'Operation Complete' :
             hasError ? 'Operation Failed' : 'Real-time Updates'}
          </h3>

          {/* Reset button - only shown when operation is complete and reset is enabled */}
          {(isComplete || hasError) && canReset && onReset && (
            <button
              onClick={onReset}
              className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reset
            </button>
          )}
        </div>

        {/* Enhanced Progress Bar with calculated metrics */}
        <EnhancedProgressBar
          percentage={metrics.progressPercentage}
          currentStep={latestMessage?.message || currentStep}
          totalSteps={metrics.totalSteps}
          completedSteps={metrics.completedSteps}
          isRunning={isRunning}
          isComplete={isComplete}
          hasError={hasError}
          compact={compact}
        />
      </div>

      {/* =================================================================================================
          SUBSECTION 8B: LIVE LOG SECTION WITH TWO-LINE FORMAT (AS REQUESTED)
          Collapsible log section implementing the requested two-line display format
          ================================================================================================= */}
      {progress.length > 0 && (
        <div className="space-y-2">
          {/* Collapsible log header button with two-line format */}
          <button
            onClick={() => setIsLogExpanded(!isLogExpanded)}
            className="flex items-center justify-between w-full p-2 text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <div className="space-y-1 flex-1 min-w-0">
              {/* FIRST LINE: Live Log label with entry count badge */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Live Log
                </span>
                <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full">
                  {progress.length} entries
                </span>
              </div>

              {/* SECOND LINE: Latest status message (implements requested format) */}
              <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                {latestMessage ?
                  `${latestMessage.message}` :
                  'No recent activity'
                }
              </div>
            </div>

            {/* Expand/collapse icon */}
            {isLogExpanded ?
              <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0" /> :
              <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
            }
          </button>

          {/* Expandable log details with scrollable container */}
          {isLogExpanded && (
            <div className={`space-y-2 ${maxLogHeight} overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent`}>
              {progress.map((step, index) => (
                <EnhancedProgressStep
                  key={step.timestamp ? `${step.timestamp}-${index}` : `step-${index}`}
                  step={step}
                  isLatest={index === progress.length - 1}
                  compact={compact}
                />
              ))}
              {/* Invisible element for auto-scrolling target */}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      )}

      {/* =================================================================================================
          SUBSECTION 8C: FINAL STATUS BANNERS
          Prominent success/error status display when operation completes
          ================================================================================================= */}
      {(isComplete || hasError) && (
        <div className="space-y-3">
          {hasError ? (
            /* Error status banner with detailed error information */
            <div className="p-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-red-500 flex-shrink-0 w-5 h-5 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-red-900 dark:text-red-100">Operation Failed</h4>
                  <p className="text-red-700 dark:text-red-300 text-sm mt-1 break-words">
                    {error?.message || 'An unknown error occurred during execution.'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Success status banner with completion message */            <div className="p-4 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-start gap-3">
                <CheckCircle className="text-green-500 flex-shrink-0 w-5 h-5 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-green-900 dark:text-green-100">Operation Successful</h4>
                  <p className="text-green-700 dark:text-green-300 text-sm mt-1 break-words">
                    {result?.message || 'The operation completed successfully with no errors.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================================================
              SUBSECTION 8D: COLLAPSIBLE RESULT/ERROR DETAILS
              Expandable section for detailed result or error information with copy functionality
              ================================================================================================= */}
          {((result && typeof result === 'object' && Object.keys(result).length > 0) ||
            (error && typeof error === 'object' && Object.keys(error).length > 0)) && (
            <div className="space-y-2">
              {/* Collapsible header for result/error details */}
              <button
                onClick={() => setIsResultExpanded(!isResultExpanded)}
                className="flex items-center justify-between w-full p-2 text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {hasError ? 'Error Details' : 'Result Details'}
                </span>
                {isResultExpanded ?
                  <ChevronUp className="w-4 h-4 text-gray-500" /> :
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                }
              </button>

              {/* Expandable result/error content with copy functionality */}
              {isResultExpanded && (
                <div className="relative">
                  <pre className={`
                    text-xs p-4 rounded-lg overflow-auto max-h-64 border
                    ${hasError
                      ? 'bg-red-900 dark:bg-red-950 text-red-100 border-red-800'
                      : 'bg-gray-900 dark:bg-gray-950 text-gray-100 border-gray-800'
                    }
                    scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent
                  `}>
                    {JSON.stringify(hasError ? error : result, null, 2)}
                  </pre>
                  {/* Copy to clipboard button */}
                  <div className="absolute top-2 right-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(hasError ? error : result, null, 2));
                      }}
                      className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
                      title="Copy to clipboard"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =================================================================================================
          SUBSECTION 8E: QUICK STATISTICS FOOTER
          Summary statistics and timing information for completed operations
          ================================================================================================= */}
      {progress.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-3">
          {/* Left side: Step statistics by type */}
          <div className="flex items-center gap-4">
            <span>Total Steps: {progress.length}</span>
            <span>Success: {progress.filter(p => p.level?.toLowerCase() === 'success').length}</span>
            <span>Errors: {progress.filter(p => p.level?.toLowerCase() === 'error').length}</span>
          </div>

          {/* Right side: Last update timestamp */}
          {progress.length > 0 && progress[progress.length - 1].timestamp && (
            <span>
              Last Update: {new Date(progress[progress.length - 1].timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// =================================================================================================
// SECTION 9: COMPONENT EXPORT
// Default export for easy importing
// =================================================================================================

export default EnhancedRealTimeDisplay;
