// src/components/ScriptOptionsRenderer.jsx

import React from "react";
import { useTestDiscovery } from "../hooks/useTestDiscovery"; // The generic data hook
import TestSelector from "./TestSelector"; // The generic UI component

/**
 * @description A helper component that encapsulates the logic for scripts with discoverable tests.
 * It uses the useTestDiscovery hook to fetch data and renders the TestSelector component.
 * @param {object} props - Component props.
 * @param {object} props.script - The currently selected script object.
 * @param {object} props.parameters - The current state of parameters for this script.
 * @param {function} props.setParameters - The function to update the parent's state.
 */
function DiscoverableTestOptions({ script, parameters, setParameters }) {
  // Use our generic hook to fetch tests for the currently selected script.
  // It automatically re-fetches if the script or environment changes.
  const { categorizedTests, loading, error } = useTestDiscovery(
    script.id,
    parameters.environment,
  );

  const handleTestToggle = (testId) => {
    const currentTests = parameters.tests || [];
    const newSelection = currentTests.includes(testId)
      ? currentTests.filter((id) => id !== testId)
      : [...currentTests, testId];

    // Update the state in the main PythonScriptRunner component
    setParameters({ ...parameters, tests: newSelection });
  };

  if (loading)
    return (
      <p className="text-xs text-slate-500 italic">Discovering tests...</p>
    );
  if (error)
    return <p className="text-xs font-semibold text-red-600">Error: {error}</p>;

  // Render the generic TestSelector UI component with the fetched data and handlers
  return (
    <TestSelector
      categorizedTests={categorizedTests}
      selectedTests={parameters.tests || []}
      onTestToggle={handleTestToggle}
    />
  );
}

/**
 * @description The main renderer component. Acts as a switchboard to decide which
 * script-specific options component to render based on the selected script's metadata.
 */
function ScriptOptionsRenderer({ script, parameters, setParameters }) {
  // Don't render anything if no script is selected.
  if (!script) {
    return null;
  }

  // Check for a capability flag in the script's metadata. This is more scalable
  // than hardcoding script IDs.
  if (script.capabilities?.dynamicDiscovery) {
    return (
      <DiscoverableTestOptions
        script={script}
        parameters={parameters}
        setParameters={setParameters}
      />
    );
  }

  // --- Future Extension Point ---
  // To support another type of script option, you would add another check here:
  //
  // if (script.capabilities?.someOtherCapability) {
  //   return <SomeOtherOptionsComponent ... />;
  // }

  // If the script is selected but has no special sidebar options, render nothing.
  return (
    <p className="text-xs text-slate-500 italic">
      This script has no additional sidebar options.
    </p>
  );
}

export default ScriptOptionsRenderer;
