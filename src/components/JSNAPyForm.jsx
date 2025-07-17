// src/components/JSNAPyForm.jsx

import React from "react";
import { useTestDiscovery } from "../hooks/useTestDiscovery";
import DeviceAuthFields from "./DeviceAuthFields";
import TestSelector from "./TestSelector"; // Import the generic TestSelector

/**
 * @description A form tailored for JSNAPy, combining device authentication
 * with a dynamically discovered list of tests.
 *
 * @param {object} props - Component props.
 * @param {object} props.parameters - The current parameter values for the form.
 * @param {(name: string, value: any) => void} props.onParamChange - The callback to handle changes.
 */
export default function JSNAPyForm({ parameters, onParamChange }) {
  // Use the generic test discovery hook, passing the correct scriptId
  const { categorizedTests, loading, error } = useTestDiscovery(
    "jsnapy_runner",
    parameters.environment,
  );

  const handleTestToggle = (testId) => {
    const currentTests = parameters.tests || [];
    const newSelection = currentTests.includes(testId)
      ? currentTests.filter((id) => id !== testId)
      : [...currentTests, testId];

    // Use the granular onParamChange for better state management
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

  return (
    <div className="space-y-6">
      {/* 1. Render the common authentication and target fields */}
      <DeviceAuthFields parameters={parameters} onParamChange={onParamChange} />

      <div className="border-t border-slate-200 my-6"></div>

      {/* 2. Render the JSNAPy-specific test selection UI */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Select JSNAPy Tests
        </label>
        {loading && (
          <p className="text-sm text-slate-500">Loading available tests...</p>
        )}
        {error && <p className="text-sm text-red-600">Error: {error}</p>}

        {!loading && Object.keys(categorizedTests).length > 0 && (
          <div className="space-y-3 border border-slate-200 p-4 rounded-md bg-slate-50/50">
            {/* Use the generic TestSelector component for the UI */}
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
          </div>
        )}
      </div>
    </div>
  );
}
