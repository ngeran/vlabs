// src/components/tool_options/JsnapyOptions.jsx
import React from 'react';
import ScriptParameterInput from '../ScriptParameterInput';
import TestSelector from '../TestSelector';
import { useTestDiscovery } from '../../hooks/useTestDiscovery';

/**
 * A self-contained component that renders all UI options
 * specifically for the JSNAPy runner's sidebar.
 */
function JsnapyOptions({ script, parameters, onParamChange }) {
  const { categorizedTests, loading, error } = useTestDiscovery(script.id, parameters.environment);
  const environmentParam = script.parameters.find(p => p.name === 'environment');

  return (
    <div className="space-y-4">
      {environmentParam && (
        <ScriptParameterInput
          param={environmentParam}
          value={parameters.environment}
          onChange={onParamChange}
        />
      )}
      <hr className="!my-5 border-t border-slate-200" />
      <h3 className="text-sm font-semibold text-slate-700">Available Tests</h3>
      {loading && <p className="text-sm text-slate-500 italic">Discovering tests...</p>}
      {error && <p className="text-sm font-semibold text-red-600">Error: {error}</p>}
      <TestSelector
        categorizedTests={categorizedTests}
        selectedTests={parameters.tests || []}
        onTestToggle={(testId) => {
          const currentTests = parameters.tests || [];
          const newSelection = currentTests.includes(testId)
            ? currentTests.filter((id) => id !== testId)
            : [...currentTests, testId];
          onParamChange("tests", newSelection);
        }}
      />
    </div>
  );
}

export default JsnapyOptions;
