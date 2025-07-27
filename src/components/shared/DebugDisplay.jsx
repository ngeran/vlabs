// =============================================================================
// FILE: DebugDisplay.jsx
// DESCRIPTION: Reusable component for displaying debug information and progress
//              events in a collapsible, styled container. Can be enabled/disabled
//              through script metadata capabilities.
//
// OVERVIEW:
//   This component provides a developer-friendly way to display raw progress
//   events, API responses, and debugging data. It formats JSON data with proper
//   syntax highlighting and provides a clean, collapsible interface that doesn't
//   interfere with the main UI when debugging is disabled.
//
// DEPENDENCIES:
//   - react: For building the UI and managing component state
//   - lucide-react: For icons (Bug, ChevronDown)
//
// HOW TO USE:
//   1. Add to your script metadata:
//      capabilities:
//        enableDebug: true
//
//   2. Import and use in your component:
//      import DebugDisplay from '../components/shared/DebugDisplay';
//
//      <DebugDisplay
//        progressEvents={progressEvents}
//        isVisible={script?.capabilities?.enableDebug}
//        title="Debug Information"
//      />
//
//   3. Optional props:
//      - className: Additional CSS classes
//      - maxHeight: Custom max height for scrollable content
// =============================================================================

import React, { useState } from "react";
import { Bug, ChevronDown } from "lucide-react";

// =============================================================================
// SECTION 1: COMPONENT DEFINITION
// =============================================================================
/**
 * Displays debug information in a collapsible, styled container.
 * @param {Object} props - Component props
 * @param {Array} props.progressEvents - Array of progress events to display
 * @param {boolean} props.isVisible - Controls visibility (from metadata capabilities)
 * @param {string} props.title - Customizable title (default: "Debug Information")
 * @param {string} props.className - Additional CSS classes
 * @param {string} props.maxHeight - Maximum height for scrollable content
 * @returns {JSX.Element|null} Debug display component or null if not visible
 */
export default function DebugDisplay({
  progressEvents = [],
  isVisible = false,
  title = "Debug Information",
  className = "",
  maxHeight = "400px"
}) {
  // =============================================================================
  // SECTION 2: STATE MANAGEMENT
  // =============================================================================
  const [isExpanded, setIsExpanded] = useState(false);

  // =============================================================================
  // SECTION 3: EARLY RETURN CONDITIONS
  // =============================================================================
  // Don't render if not visible or no events to show
  if (!isVisible || !progressEvents || progressEvents.length === 0) {
    return null;
  }

  // =============================================================================
  // SECTION 4: DATA PROCESSING
  // =============================================================================
  const eventCount = progressEvents.length;
  const formattedData = JSON.stringify(progressEvents, null, 2);

  // =============================================================================
  // SECTION 5: EVENT HANDLERS
  // =============================================================================
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // =============================================================================
  // SECTION 6: RENDER LOGIC
  // =============================================================================
  return (
    <div className={`bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200/60 rounded-2xl shadow-sm backdrop-blur-sm ${className}`}>
      {/* SECTION 6.1: HEADER */}
      <div className="px-5 py-4 border-b border-yellow-100/80">
        <button
          onClick={toggleExpanded}
          className="w-full flex items-center justify-between gap-3 cursor-pointer hover:bg-yellow-100/50 rounded-xl p-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-300/50"
          aria-expanded={isExpanded}
          aria-controls="debug-content"
        >
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-yellow-100 to-amber-100 rounded-xl shadow-sm">
              <Bug className="h-4 w-4 text-yellow-600" />
            </div>
            <div className="min-w-0 text-left">
              <h3 className="text-base font-semibold text-yellow-900 truncate">
                {title}
              </h3>
              <p className="text-xs text-yellow-600 truncate">
                {eventCount} event{eventCount !== 1 ? 's' : ''} available
              </p>
            </div>
          </div>

          {/* Expand/Collapse Indicator */}
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 bg-gradient-to-r from-yellow-100/80 to-amber-50 rounded-full border border-yellow-200/60">
              <span className="text-xs font-medium text-yellow-700">
                {isExpanded ? 'Collapse' : 'Expand'}
              </span>
            </div>
            <ChevronDown
              className={`h-5 w-5 text-yellow-600 transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
              }`}
            />
          </div>
        </button>
      </div>

      {/* SECTION 6.2: COLLAPSIBLE CONTENT */}
      {isExpanded && (
        <div
          id="debug-content"
          className="border-t border-yellow-200/60 p-5 animate-in slide-in-from-top-2 duration-200"
        >
          <div className="w-full">
            <div
              className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-auto border border-slate-700 shadow-inner"
              style={{ maxHeight }}
            >
              <pre className="whitespace-pre-wrap break-all">
                {formattedData}
              </pre>
            </div>

            {/* SECTION 6.3: METADATA INFO */}
            <div className="mt-3 flex items-center justify-between text-xs text-yellow-600">
              <span>Events: {eventCount}</span>
              <span>Generated: {new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
