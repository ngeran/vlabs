// =================================================================================================
// FILE:               ProgressBar.jsx
// COMPONENT:          Modern Progress Bar Component
// VERSION:            3.1.0
// LAST UPDATED:       2025-08-05
//
// DESCRIPTION:
//   A highly optimized, visually modern progress bar component designed for real-time applications.
//   Features a thicker bar for better visibility, sleek shadcn/ui-inspired styling, smooth gradient
//   animations, and enhanced accessibility. Provides clear visual feedback with dynamic color-coded
//   states (black gradient for running, green for success, red for error), detailed progress metrics,
//   and responsive design for mobile and desktop.
//
// OVERVIEW:
//   This component is built for performance and aesthetics, offering a polished user experience
//   with minimal computational overhead. It supports both standard and compact layouts, making
//   it versatile for various UI contexts. The progress bar includes a thicker design, gradient-based
//   fills (using a black-based gradient for the running state), modern typography, and dynamic icons
//   that adapt to the operation's state. It is optimized for WebSocket-driven applications and
//   integrates seamlessly with real-time data.
//
// KEY FEATURES:
//   ✅ Thicker progress bar for improved visibility
//   ✅ Sleek, modern design with black gradient for running state
//   ✅ Smooth animations with cubic-bezier timing
//   ✅ Color-coded states: running (black gradient), success (green gradient), error (red gradient)
//   ✅ Dynamic icons with animated transitions
//   ✅ Compact and standard layout modes
//   ✅ Step counter and percentage display with enhanced typography
//   ✅ Fully responsive and accessible (ARIA-compliant)
//   ✅ Dark mode support with shadcn/ui compatibility
//   ✅ Memoized for optimal performance
//
// DEPENDENCIES:
//   - React 18.0+ (hooks and memoization support required)
//   - lucide-react (^0.263.0) for icons (Loader2, CheckCircle2, AlertCircle, Clock)
//   - Tailwind CSS 3.4+ for utility-first styling
//   - Optional: shadcn/ui theme configuration for consistent design
//
// DETAILED HOW-TO GUIDE:
//   1. Installation:
//      - Ensure dependencies are installed: `npm install react lucide-react tailwindcss`
//      - Configure Tailwind CSS in your project (see tailwindcss.com/docs/installation)
//      - Optional: Set up shadcn/ui for theme consistency
//
//   2. Basic Usage:
//      ```jsx
//      import ProgressBar from './ProgressBar';
//      <ProgressBar
//        percentage={75}
//        currentStep="Processing data..."
//        isRunning={true}
//      />
//      ```
//
//   3. Advanced Usage:
//      ```jsx
//      <ProgressBar
//        percentage={progressPercentage}
//        currentStep={latestMessage}
//        totalSteps={totalSteps}
//        completedSteps={completedSteps}
//        isRunning={isRunning}
//        isComplete={isComplete}
//        hasError={hasError}
//        compact={true}
//        animated={true}
//        showStepCounter={true}
//        showPercentage={true}
//      />
//      ```
//
//   4. Integration Notes:
//      - Ideal for WebSocket streams or async operation tracking
//      - Works with custom hooks for progress tracking
//      - Supports controlled and uncontrolled modes
//      - Ensure Tailwind CSS is configured for dark mode if needed
//      - Use `React.memo` for performance in high-frequency updates
//
// =================================================================================================

import React, { memo } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

// =================================================================================================
// SECTION 1: Component Definition and Props
// Defines the component and its props with type annotations for clarity
// =================================================================================================

/**
 * Modern Progress Bar Component
 *
 * @param {Object} props - Component props
 * @param {number} props.percentage - Progress percentage (0-100)
 * @param {string} props.currentStep - Current step description
 * @param {number} props.totalSteps - Total number of steps
 * @param {number} props.completedSteps - Number of completed steps
 * @param {boolean} props.isRunning - Whether operation is running
 * @param {boolean} props.isComplete - Whether operation is complete
 * @param {boolean} props.hasError - Whether there's an error
 * @param {boolean} props.showStepCounter - Show step counter
 * @param {boolean} props.showPercentage - Show percentage
 * @param {boolean} props.animated - Enable animations
 * @param {boolean} props.compact - Use compact layout
 */
const ProgressBar = ({
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
  compact = false,
}) => {
  // =================================================================================================
  // SECTION 2: Progress State Configuration
  // Configures visual styling and behavior based on operation state
  // =================================================================================================

  /**
   * Determines styling and behavior based on operation state
   * @returns {Object} Configuration with colors, gradients, icons, and animations
   */
  const getProgressConfig = () => {
    if (hasError) {
      return {
        bg: 'bg-red-100 dark:bg-red-900/20', // Light red background for errors
        fill: 'bg-gradient-to-r from-red-500 to-red-600', // Red gradient fill
        text: 'text-red-700 dark:text-red-400', // Red text with dark mode
        icon: AlertCircle, // Error icon
        pulse: false, // No pulse for errors
      };
    }

    if (isComplete) {
      return {
        bg: 'bg-green-100 dark:bg-green-900/20', // Light green background
        fill: 'bg-gradient-to-r from-green-500 to-green-600', // Green gradient fill
        text: 'text-green-700 dark:text-green-400', // Green text with dark mode
        icon: CheckCircle2, // Success icon
        pulse: false, // No pulse for completed
      };
    }

    return {
      bg: 'bg-gray-100 dark:bg-gray-900/20', // Light gray background for running state
      fill: 'bg-gradient-to-r from-gray-800 to-gray-900', // Black-based gradient fill
      text: 'text-gray-800 dark:text-gray-300', // Black/gray text with dark mode
      icon: isRunning ? Loader2 : Clock, // Dynamic icon based on state
      pulse: isRunning && animated, // Pulse only when running and animated
    };
  };

  // =================================================================================================
  // SECTION 3: Data Processing and Validation
  // Ensures safe and consistent data for rendering
  // =================================================================================================

  const config = getProgressConfig();
  const IconComponent = config.icon;
  const safePercentage = Math.min(Math.max(percentage, 0), 100); // Clamp percentage to 0-100

  // =================================================================================================
  // SECTION 4: Render Structure
  // Main component rendering with organized layout sections
  // =================================================================================================

  return (
    <div
      className={`space-y-${compact ? '2' : '4'} transition-all duration-300 ${
        compact ? 'max-w-md' : 'max-w-lg'
      }`}
      role="progressbar"
      aria-valuenow={safePercentage}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-label={currentStep || 'Progress bar'}
    >
      {/* SUBSECTION 4A: Progress Bar Visualization
         Renders the main progress bar with gradient fill and percentage overlay */}
      <div className="relative">
        <div
          className={`w-full ${config.bg} rounded-full h-6 overflow-hidden border border-border/30 shadow-sm`}
        >
          <div
            className={`h-full ${config.fill} transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] rounded-full ${
              config.pulse ? 'animate-pulse' : ''
            }`}
            style={{
              width: `${safePercentage}%`,
              boxShadow:
                safePercentage > 0
                  ? '0 0 12px rgba(31, 41, 55, 0.4), inset 0 0 4px rgba(255, 255, 255, 0.2)'
                  : 'none',
            }}
          />
        </div>

        {showPercentage && safePercentage > 10 && (
          <div
            className="absolute top-0 h-6 flex items-center justify-end"
            style={{ width: `${safePercentage}%` }}
          >
            <span
              className={`font-semibold ${config.text} tabular-nums text-base min-w-[4ch] mr-2 bg-white/80 dark:bg-gray-800/80 rounded px-1.5 py-0.5 shadow-sm`}
            >
              {Math.round(safePercentage)}%
            </span>
          </div>
        )}
      </div>

      {/* SUBSECTION 4B: Status Information Display
         Shows status icon, step description, and progress metrics */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <IconComponent
            className={`w-5 h-5 ${config.text} flex-shrink-0 ${
              isRunning && config.icon === Loader2 ? 'animate-spin' : ''
            }`}
          />
          <div className="min-w-0 flex-1">
            {currentStep ? (
              <p
                className={`text-base font-medium ${config.text} truncate`}
                title={currentStep}
              >
                {currentStep}
              </p>
            ) : (
              <p className={`text-base ${config.text}`}>
                {isRunning
                  ? 'Processing...'
                  : isComplete
                  ? 'Complete'
                  : hasError
                  ? 'Error'
                  : 'Ready'}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm flex-shrink-0">
          {showStepCounter && totalSteps > 0 && (
            <span
              className={`${config.text} tabular-nums font-medium bg-white/80 dark:bg-gray-800/80 rounded px-1.5 py-0.5 shadow-sm`}
            >
              {completedSteps}/{totalSteps}
            </span>
          )}
          {showPercentage && (safePercentage <= 10 || !compact) && (
            <span
              className={`font-semibold ${config.text} tabular-nums min-w-[4ch] bg-white/80 dark:bg-gray-800/80 rounded px-1.5 py-0.5 shadow-sm`}
            >
              {Math.round(safePercentage)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// =================================================================================================
// SECTION 5: Component Export
// Exports the memoized component to prevent unnecessary re-renders
// =================================================================================================

export default memo(ProgressBar);
