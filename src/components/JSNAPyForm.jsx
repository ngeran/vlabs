import React from "react";
import { useJsnapyTests } from "../hooks/useJsnapyTests";

export default function JSNAPyForm({ parameters, setParameters }) {
  // Use the refactored hook to get categorized test data
  const { categorizedTests, loading, error } = useJsnapyTests();

  // This function now uses the 'parameters' prop for current state
  const handleTestToggle = (testName) => {
    const currentTests = parameters.tests || [];
    const newTests = currentTests.includes(testName)
      ? currentTests.filter((name) => name !== testName)
      : [...currentTests, testName];

    // Updates the parent state via the 'setParameters' prop
    setParameters({ ...parameters, tests: newTests });
  };

  // This function also lives here now
  const handleSelectAll = () => {
    const allTestNames = Object.values(categorizedTests)
      .flat()
      .map((t) => t.id);
    setParameters({ ...parameters, tests: allTestNames });
  };

  const handleClearAll = () => {
    setParameters({ ...parameters, tests: [] });
  };

  // This handler for other inputs is unchanged
  const handleChange = (e) => {
    const { name, value } = e.target;
    setParameters({ ...parameters, [name]: value });
  };

  return (
    <div className="space-y-6">
      {/* Test Selection Section */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select JSNAPy Tests
        </label>
        {loading && (
          <p className="text-sm text-gray-500">Loading available tests...</p>
        )}
        {error && <p className="text-sm text-red-600">Error: {error}</p>}

        {!loading && Object.keys(categorizedTests).length > 0 && (
          <div className="space-y-3 border p-4 rounded-md bg-gray-50/50">
            {Object.entries(categorizedTests).map(([category, tests]) => (
              <details
                key={category}
                className="border rounded-md bg-white shadow-sm"
                open
              >
                <summary className="cursor-pointer font-semibold p-3 hover:bg-gray-100 list-none flex justify-between items-center">
                  {category}
                  {/* You can add a chevron icon here for better UX */}
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
                        checked={(parameters.tests || []).includes(test.id)} // Reads from props
                        onChange={() => handleTestToggle(test.id)} // Calls local handler
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

      {/* Credential and other fields (logic unchanged) */}
      {[
        { name: "hostname", label: "Target Hostname or IP" },
        { name: "username", label: "Username" },
        { name: "password", label: "Password" },
      ].map((field) => (
        <div key={field.name}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {field.label}
          </label>
          <input
            type={field.name === "password" ? "password" : "text"}
            name={field.name}
            value={parameters[field.name] || ""}
            onChange={handleChange}
            className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
      ))}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Target Environment
        </label>
        <select
          name="environment"
          value={parameters.environment || "development"}
          onChange={handleChange}
          className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="development">Development</option>
          <option value="lab">Lab</option>
          <option value="staging">Staging</option>
          <option value="production">Production</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Network Type
        </label>
        <select
          name="network_type"
          value={parameters.network_type || "enterprise"}
          onChange={handleChange}
          className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="enterprise">Enterprise</option>
          <option value="service_provider">Service Provider</option>
          <option value="datacenter">Data Center</option>
        </select>
      </div>
    </div>
  );
}
