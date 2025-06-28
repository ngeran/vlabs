import React from "react";
import { useJsnapyTests } from "../hooks/useJsnapyTests";

export default function JSNAPyForm({ parameters, setParameters }) {
  const { jsnapyTests, loading, error } = useJsnapyTests();

  // Handle checkbox toggle directly
  const handleTestToggle = (testName) => {
    const currentTests = parameters.tests || [];
    const newTests = currentTests.includes(testName)
      ? currentTests.filter((name) => name !== testName)
      : [...currentTests, testName];

    setParameters({
      ...parameters,
      tests: newTests,
    });
  };

  const handleSelectAll = () => {
    setParameters({
      ...parameters,
      tests: [...jsnapyTests],
    });
  };

  const handleClearAll = () => {
    setParameters({
      ...parameters,
      tests: [],
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setParameters({
      ...parameters,
      [name]: value,
    });
  };

  return (
    <div className="space-y-6">
      {error && <p className="text-red-600">Error: {error}</p>}
      {loading && <p>Loading JSNAPy tests...</p>}

      {!loading && jsnapyTests.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select JSNAPy Tests
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {jsnapyTests.map((testName) => (
              <label key={testName} className="flex items-center">
                <input
                  type="checkbox"
                  name="tests"
                  value={testName}
                  checked={(parameters.tests || []).includes(testName)}
                  onChange={() => handleTestToggle(testName)}
                  className="form-checkbox h-4 w-4 text-blue-600"
                />
                <span className="ml-2 text-sm">{testName}</span>
              </label>
            ))}
          </div>
          <div className="mt-2 flex gap-4">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-blue-600 hover:underline text-sm"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-blue-600 hover:underline text-sm"
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* Credential fields */}
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

      {/* NEW: Environment and Network Type fields */}
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
          <option value="development">Development Environment</option>
          <option value="lab">Lab Environment</option>
          <option value="staging">Staging Environment</option>
          <option value="production">Production Environment</option>
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
          <option value="enterprise">Enterprise Network</option>
          <option value="service_provider">Service Provider Network</option>
          <option value="datacenter">Data Center Network</option>
        </select>
      </div>
    </div>
  );
}
