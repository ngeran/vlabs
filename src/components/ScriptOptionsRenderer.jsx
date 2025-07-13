/**
 * React component for rendering script-specific custom sidebar options.
 * Delegates to BaselineScriptOptions for standard inputs or custom components for specialized scripts.
 */

import React from "react";
import { useTestDiscovery } from "../hooks/useTestDiscovery";
import TestSelector from "./TestSelector";
import BaselineScriptOptions from "./BaselineScriptOptions";

// -----------------------------------
// Discoverable Test Options Component
// -----------------------------------

/**
 * Component for rendering test selection UI for scripts with dynamic test discovery.
 * @param {Object} props - Component props.
 * @param {Object} props.script - Script metadata.
 * @param {Object} props.parameters - Current script parameters.
 * @param {Function} props.onParamChange - Callback to update parameters.
 */
function DiscoverableTestOptions({ script, parameters, onParamChange }) {
  const { categorizedTests, loading, error } = useTestDiscovery(script.id, parameters.environment);

  /**
   * Toggle a test's selection state.
   * @param {string} testId - ID of the test to toggle.
   */
  const handleTestToggle = (testId) => {
    const currentTests = parameters.tests || [];
    const newSelection = currentTests.includes(testId)
      ? currentTests.filter((id) => id !== testId)
      : [...currentTests, testId];
    onParamChange("tests", newSelection);
  };

  /**
   * Select all available tests.
   */
  const handleSelectAll = () => {
    const allTestNames = Object.values(categorizedTests).flat().map((t) => t.id);
    onParamChange("tests", allTestNames);
  };

  /**
   * Clear all selected tests.
   */
  const handleClearAll = () => {
    onParamChange("tests", []);
  };

  // Render loading, error, or test selection UI
  if (loading) return <p className="text-xs text-slate-500 italic">Discovering tests...</p>;
  if (error) return <p className="text-xs font-semibold text-red-600">Error: {error}</p>;
  return (
    <>
      <TestSelector
        categorizedTests={categorizedTests}
        selectedTests={parameters.tests || []}
        onTestToggle={handleTestToggle}
      />
      <div className="mt-4 flex gap-4 border-t border-slate-200 pt-3">
        <button type="button" onClick={handleSelectAll} className="text-blue-600 hover:underline text-sm font-medium">
          Select All
        </button>
        <button type="button" onClick={handleClearAll} className="text-blue-600 hover:underline text-sm font-medium">
          Clear All
        </button>
      </div>
    </>
  );
}

// -----------------------------------
// Main Script Options Renderer
// -----------------------------------

/**
 * Main component for rendering script-specific sidebar options.
 * Uses BaselineScriptOptions for standard inputs or custom components for specialized scripts.
 * @param {Object} props - Component props.
 * @param {Object} props.script - Script metadata.
 * @param {Object} props.parameters - Current script parameters.
 * @param {Function} props.onParamChange - Callback to update parameters.
 */
function ScriptOptionsRenderer({ script, parameters, onParamChange }) {
  if (!script) return null;

  // Handle scripts with dynamic test discovery
  if (script.capabilities?.dynamicDiscovery) {
    return (
      <DiscoverableTestOptions script={script} parameters={parameters} onParamChange={onParamChange} />
    );
  }

  // Handle custom sidebar components (extendable for future custom UIs)
  if (script.capabilities?.sidebarComponent) {
    // Example: Add custom component mappings here as needed
    // if (script.capabilities.sidebarComponent === 'CustomComponent') return <CustomComponent ... />;
    // For now, assume custom components like BackupRestoreOptions use BaselineScriptOptions
    return (
      <BaselineScriptOptions script={script} parameters={parameters} onParamChange={onParamChange} />
    );
  }

  // Default to baseline options for all other scripts
  return (
    <BaselineScriptOptions script={script} parameters={parameters} onParamChange={onParamChange} />
  );
}

export default ScriptOptionsRenderer;
