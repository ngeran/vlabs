// src/components/RealTimeProgress/ProgressStep.jsx
import React from 'react';
import { CheckCircle, AlertCircle, Info, AlertTriangle, Clock } from 'lucide-react';

const ProgressStep = ({ step, isLatest = false }) => {
  // ===================================================================
  // THE FIX: Determine the visual style based on `step.level` (from our
  // runner) or `step.type` (from other runners).
  // ===================================================================
  const stepType = step.level?.toLowerCase() || step.type || 'info';

  const getIcon = () => {
    switch (stepType) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'info':
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

    const getStyles = () => {
    const baseStyles = "p-3 rounded-md border-l-4 transition-all duration-300";
    // This was already correct, it checks for `level` first.
    const stepType = step.level?.toLowerCase() || step.type || 'info';

    // --- START OF FIX #2 ---
    // THE FIX: This switch statement now correctly uses the `stepType` variable,
    // which checks for `step.level`. This will apply the correct colors.
    switch (stepType) {
      case 'success':
        return `${baseStyles} bg-green-50 border-green-500 text-green-800`;
      case 'error':
        return `${baseStyles} bg-red-50 border-red-500 text-red-800`;
      case 'warning':
        return `${baseStyles} bg-yellow-50 border-yellow-500 text-yellow-800`;
      case 'info':
      default:
        return `${baseStyles} bg-blue-50 border-blue-500 text-blue-800`;
    }
    // --- END OF FIX #2 ---
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className={`${getStyles()} ${isLatest ? 'ring-2 ring-blue-200' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium leading-5 break-words">
              {step.message}
            </p>
            <div className="flex items-center gap-2 text-xs opacity-75 flex-shrink-0">
              <Clock className="w-3 h-3" />
              {formatTimestamp(step.timestamp)}
            </div>
          </div>
          {step.step && (
            <p className="text-xs mt-1 opacity-75">
              Step: {step.step}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProgressStep;
