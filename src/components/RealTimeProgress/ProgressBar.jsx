// src/components/RealTimeProgress/ProgressBar.jsx
import React from 'react';
import { Loader } from 'lucide-react';

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
  animated = true
}) => {
  const getBarColor = () => {
    if (hasError) return 'bg-red-500';
    if (isComplete) return 'bg-green-500';
    return 'bg-blue-500';
  };

  const getBackgroundColor = () => {
    if (hasError) return 'bg-red-100';
    if (isComplete) return 'bg-green-100';
    return 'bg-blue-100';
  };

  const getTextColor = () => {
    if (hasError) return 'text-red-700';
    if (isComplete) return 'text-green-700';
    return 'text-blue-700';
  };

  return (
    <div className="space-y-2">
      {/* Progress Bar */}
      <div className={`w-full ${getBackgroundColor()} rounded-full h-2 overflow-hidden`}>
        <div
          className={`h-full ${getBarColor()} transition-all duration-500 ease-out ${
            animated && isRunning ? 'animate-pulse' : ''
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      {/* Progress Info */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {isRunning && <Loader className="w-4 h-4 animate-spin text-blue-500" />}

          {currentStep && (
            <span className={`font-medium ${getTextColor()}`}>
              {currentStep}
            </span>
          )}

          {!currentStep && isRunning && (
            <span className={`${getTextColor()}`}>
              Processing...
            </span>
          )}

          {!currentStep && isComplete && (
            <span className="text-green-700 font-medium">
              Complete
            </span>
          )}

          {!currentStep && hasError && (
            <span className="text-red-700 font-medium">
              Error
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs">
          {showStepCounter && totalSteps > 0 && (
            <span className={`${getTextColor()}`}>
              {completedSteps} / {totalSteps} steps
            </span>
          )}

          {showPercentage && (
            <span className={`font-medium ${getTextColor()}`}>
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProgressBar;
