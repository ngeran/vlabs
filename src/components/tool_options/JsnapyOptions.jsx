// =============================================================================
// FILE:               src/components/tool_options/JsnapyOptions.jsx
//
// DESCRIPTION:
//   Component for rendering JSNAPy-specific sidebar options, including test selection.
//
// OVERVIEW:
//   This component handles the UI for selecting JSNAPy tests using dynamic test
//   discovery. It integrates with the useTestDiscovery hook and delegates to
//   TestSelector for rendering the test selection UI.
//
// KEY FEATURES:
//   - Fetches and displays categorized tests using useTestDiscovery.
//   - Allows selecting/deselecting individual tests.
//   - Provides "Select All" and "Clear All" functionality.
//   - Displays loading and error states.
//
// DEPENDENCIES:
//   - react: For component rendering and hooks.
//   - useTestDiscovery: For fetching discoverable tests.
//   - TestSelector: For rendering the test selection UI.
//
// HOW TO USE:
//   Use this component within a parent component that manages script parameters:
//   ```javascript
//   import JsnapyOptions from '../components/tool_options/JsnapyOptions';
//
//   function ParentComponent({ script, parameters, onParamChange }) {
//     return (
//       <JsnapyOptions script={script} parameters={parameters} onParamChange={onParamChange} />
//     );
//   }
//   ```
// =============================================================================

// =============================================================================
// SECTION 1: IMPORTS
// =============================================================================
import React from "react";
import { useTestDiscovery } from "../../hooks/useTestDiscovery";
import TestSelector from "../TestSelector";

// =============================================================================
// SECTION 2: COMPONENT DEFINITION
// =============================================================================
/**
 * Component for rendering JSNAPy test selection options.
 * @param {Object} props - Component props.
 * @param {Object} props.script - Script metadata.
 * @param {Object} props.parameters - Current script parameters.
 * @param {Function} props.onParamChange - Callback to update parameters.
 */
function JsnapyOptions({ script, parameters, onParamChange }) {
  // =============================================================================
  // SECTION 3: TEST DISCOVERY
  // =============================================================================
  const { categorizedTests, loading, error } = useTestDiscovery(script.id, parameters.environment);

  // =============================================================================
  // SECTION 4: EVENT HANDLERS
  // =============================================================================
  /**
   * Toggles a test's selection state.
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
   * Selects all available tests.
   */
  const handleSelectAll = () => {
    const allTestNames = Object.values(categorizedTests).flat().map((t) => t.id);
    onParamChange("tests", allTestNames);
  };

  /**
   * Clears all selected tests.
   */
  const handleClearAll = () => {
    onParamChange("tests", []);
  };

  // =============================================================================
  // SECTION 5: RENDER
  // =============================================================================
  if (loading) {
    return <p className="text-xs text-slate-500 italic">Discovering tests...</p>;
  }
  if (error) {
    return <p className="text-xs font-semibold text-red-600">Error: {error}</p>;
  }
  return (
    <div className="space-y-4">
      <TestSelector
        categorizedTests={categorizedTests}
        selectedTests={parameters.tests || []}
        onTestToggle={handleTestToggle}
      />
      <div className="flex gap-4 border-t border-slate-200 pt-3">
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
    </div>
  );
}

// =============================================================================
// SECTION 6: EXPORT
// =============================================================================
export default JsnapyOptions;
