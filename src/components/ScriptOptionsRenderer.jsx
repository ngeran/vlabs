// =================================================================================================
//
// COMPONENT: ScriptOptionsRenderer.jsx
//
// ROLE: A conditional renderer or "router" for the script runner's sidebar content.
//
// DESCRIPTION: This component is responsible for rendering the correct set of options in the
//              sidebar based on the selected script's metadata (`capabilities`). It functions
//              as a metadata-driven router that preserves a specific order of operations to
//              ensure backward compatibility while allowing for new, custom UI modules.
//
//              The logic is checked in the following order:
//              1. `dynamicDiscovery`: For compliance scripts with a test selector.
//              2. `sidebarComponent`: For complex scripts that require a fully custom UI module.
//              3. Default Fallback: Renders standard form fields for all other scripts.
//
// =================================================================================================


// =================================================================================================
// SECTION 1: IMPORTS
// =================================================================================================

import React from "react";

// --- Child Components & Hooks ---
// These are the different UI "modules" that this component can choose to render.
import { useTestDiscovery } from "../hooks/useTestDiscovery";
import TestSelector from "./TestSelector";
import BaselineScriptOptions from "./BaselineScriptOptions"; // Renders default form fields.
import MultiLevelSelect from "./MultiLevelSelect"; // The custom UI for code upgrades.


// =================================================================================================
// SECTION 2: HELPER COMPONENT (for Dynamic Test Discovery)
// =================================================================================================
// This helper is kept within the same file as it's only used by ScriptOptionsRenderer.

/**
 * A specialized UI for scripts that can dynamically discover tests (e.g., compliance checks).
 * @param {object} props - Component props.
 * @param {object} props.script - The script metadata.
 * @param {object} props.parameters - The current script parameters.
 * @param {function} props.onParamChange - Callback to update parameters in the parent component.
 */
function DiscoverableTestOptions({ script, parameters, onParamChange }) {
  // This hook encapsulates the API call to discover tests for the given script.
  const { categorizedTests, loading, error } = useTestDiscovery(script.id, parameters.environment);

  const handleTestToggle = (testId) => {
    const currentTests = parameters.tests || [];
    const newSelection = currentTests.includes(testId)
      ? currentTests.filter((id) => id !== testId)
            : [...currentTests, testId];
    onParamChange("tests", newSelection);
  };

  const handleSelectAll = () => {
    const allTestNames = Object.values(categorizedTests).flat().map((t) => t.id);
    onParamChange("tests", allTestNames);
  };

  const handleClearAll = () => {
    onParamChange("tests", []);
  };

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


// =================================================================================================
// SECTION 3: MAIN RENDERER COMPONENT & ROUTING LOGIC
// =================================================================================================

/**
 * Renders the appropriate sidebar content by inspecting the script's capabilities in a specific order.
 * @param {object} props - The component props.
 * @param {object} props.script - The metadata object for the currently selected script.
 * @param {object} props.parameters - The current parameters object from the parent.
 * @param {function} props.onParamChange - The callback function to update the parent's state.
 */
function ScriptOptionsRenderer({ script, parameters, onParamChange }) {
  // Render nothing if no script is selected yet.
  if (!script) return null;

  // --- LOGIC BRANCH 1: HANDLE DYNAMIC TEST DISCOVERY (HIGHEST PRIORITY) ---
  // This check is performed first to maintain the original working logic. Scripts that
  // discover tests have a very specific UI that overrides all other options.
  if (script.capabilities?.dynamicDiscovery) {
    return (
      <DiscoverableTestOptions script={script} parameters={parameters} onParamChange={onParamChange} />
    );
  }

  // --- LOGIC BRANCH 2: HANDLE FULLY CUSTOM SIDEBAR COMPONENTS ---
  // This is the new, enhanced logic. It replaces the placeholder from the original file.
  // It only runs if the script does NOT have `dynamicDiscovery`.
  if (script.capabilities?.sidebarComponent) {
    switch (script.capabilities.sidebarComponent) {
      // If metadata specifies `sidebarComponent: 'MultiLevelImageSelector'`...
      case 'MultiLevelSelect':
        // ...then render the MultiLevelSelect component.
        return <MultiLevelSelect parameters={parameters} onParamChange={onParamChange} />;

      // ✨ FUTURE EXTENSION POINT ✨
      // To add another custom component, add a new `case` here.
      // case 'AnotherCustomComponent':
      //   return <AnotherCustomComponent parameters={parameters} onParamChange={onParamChange} />;

      default:
        // Render an error if the identifier in the metadata is unknown.
        return <p className="text-xs font-semibold text-red-600">Error: Unknown sidebar component specified.</p>;
    }
  }

  // --- LOGIC BRANCH 3: DEFAULT FALLBACK (BASELINE OPTIONS) ---
  // If a script has neither `dynamicDiscovery` nor a recognized `sidebarComponent`,
  // this is the final fallback. It renders standard form fields based on the script's
  // `parameters` array where `layout: "sidebar"`. This is the most common case.
  return (
    <BaselineScriptOptions script={script} parameters={parameters} onParamChange={onParamChange} />
  );
}

// =================================================================================================
// SECTION 4: COMPONENT EXPORT
// =================================================================================================

export default ScriptOptionsRenderer
