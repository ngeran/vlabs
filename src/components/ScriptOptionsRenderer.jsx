// src/components/ScriptOptionsRenderer.jsx

import React from "react";
import { useTestDiscovery } from "../hooks/useTestDiscovery";
import TestSelector from "./TestSelector";

/**
 * @description A helper component that encapsulates the logic for scripts with discoverable tests.
 * IT NOW USES THE GRANULAR `onParamChange` for more robust state updates.
 */
function DiscoverableTestOptions({ script, parameters, onParamChange }) {
  // Use our generic hook to fetch tests for the currently selected script.
  const { categorizedTests, loading, error } = useTestDiscovery(
    script.id,
    parameters.environment,
  );

  const handleTestToggle = (testId) => {
    const currentTests = parameters.tests || [];
    const newSelection = currentTests.includes(testId)
      ? currentTests.filter((id) => id !== testId)
      : [...currentTests, testId];

    // ✨ FIX: Use the granular change handler for the 'tests' parameter.
    onParamChange("tests", newSelection);
  };

  const handleSelectAll = () => {
    const allTestNames = Object.values(categorizedTests)
      .flat()
      .map((t) => t.id);
    onParamChange("tests", allTestNames);
  };

  const handleClearAll = () => {
    onParamChange("tests", []);
  };

  if (loading)
    return <p className="text-xs text-slate-500 italic">Discovering tests...</p>;
  if (error)
    return <p className="text-xs font-semibold text-red-600">Error: {error}</p>;

  // Render the generic TestSelector UI component with the fetched data and handlers
  return (
    <>
      <TestSelector
        categorizedTests={categorizedTests}
        selectedTests={parameters.tests || []}
        onTestToggle={handleTestToggle}
      />
      <div className="mt-4 flex gap-4 border-t border-slate-200 pt-3">
        <button
          type="button"
          onClick={handleSelectAll}
          className="text-blue-600 hover:underline text-sm font-medium"
        >
          Select All
        </button>
        <button
          type="button"
          onClick={handleClearAll}
          className="text-blue-600 hover:underline text-sm font-medium"
        >
          Clear All
        </button>
      </div>
    </>
  );
}

/**
 * @description The main renderer component. Acts as a switchboard to decide which
 * script-specific options component to render based on the selected script's metadata.
 */
function ScriptOptionsRenderer({ script, parameters, onParamChange }) {
  // Don't render anything if no script is selected.
  if (!script) {
    return null;
  }

  // Check for the dynamicDiscovery capability. This will now correctly handle jsnapy_runner.
  if (script.capabilities?.dynamicDiscovery) {
    return (
      <DiscoverableTestOptions
        script={script}
        parameters={parameters}
        // ✨ FIX: Pass the correct handler down.
        onParamChange={onParamChange}
      />
    );
  }

  // If the script is selected but has no special sidebar options, render the default message.
  return (
    <p className="text-xs text-slate-500 italic">
      This script has no additional sidebar options.
    </p>
  );
}

export default ScriptOptionsRenderer;
