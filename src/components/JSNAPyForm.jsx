// src/components/JSNAPyForm.jsx
import React from "react";
import { useJsnapyTests } from "../hooks/useJsnapyTests";
import DeviceAuthFields from "./DeviceAuthFields";

export default function JSNAPyForm({ parameters, setParameters }) {
  const { categorizedTests, loading, error } = useJsnapyTests();

  const handleTestToggle = (testName) => {
    const currentTests = parameters.tests || [];
    const newTests = currentTests.includes(testName)
      ? currentTests.filter((name) => name !== testName)
      : [...currentTests, testName];
    setParameters({ ...parameters, tests: newTests });
  };

  const handleSelectAll = () => {
    const allTestNames = Object.values(categorizedTests)
      .flat()
      .map((t) => t.id);
    setParameters({ ...parameters, tests: allTestNames });
  };

  const handleClearAll = () => {
    setParameters({ ...parameters, tests: [] });
  };

  return (
    <div className="space-y-6">
      {/* 1. Render the common authentication and target fields */}
      <DeviceAuthFields parameters={parameters} setParameters={setParameters} />

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
            {Object.entries(categorizedTests).map(([category, tests]) => (
              <details
                key={category}
                className="border rounded-md bg-white shadow-sm"
                open
              >
                <summary className="cursor-pointer font-semibold p-3 hover:bg-slate-100 list-none flex justify-between items-center">
                  {category}
                  <span className="text-xs font-normal text-slate-500">
                    {tests.length} tests
                  </span>
                </summary>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-2 border-t">
                  {tests.map((test) => (
                    <label
                      key={test.id}
                      className="flex items-center"
                      title={test.description}
                    >
                      <input
                        type="checkbox"
                        checked={(parameters.tests || []).includes(test.id)}
                        onChange={() => handleTestToggle(test.id)}
                        className="form-checkbox h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm font-mono">{test.id}</span>
                    </label>
                  ))}
                </div>
              </details>
            ))}
            <div className="mt-4 flex gap-4">
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
