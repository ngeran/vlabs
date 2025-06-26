// src/components/PythonScriptRunner.jsx
import React, { useState, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";

import { useScriptData } from "../hooks/useScriptData.jsx";
import { useScriptParameters } from "../hooks/useScriptParameters.jsx";
import { useScriptExecution } from "../hooks/useScriptExecution.jsx";

import FeaturedScripts from "./FeaturedScripts.jsx";
import ScriptStatisticsChart from "./ScriptStatisticsChart.jsx";
import TargetHostsSelector from "./TargetHostsSelector.jsx";
import ScriptParameterInput from "./ScriptParameterInput.jsx";
import ScriptOutputDisplay from "./ScriptOutputDisplay.jsx";

/**
 * @description Main component for running Python scripts.
 * It orchestrates data fetching, parameter management, script execution,
 * and displays featured scripts, statistics, and output.
 */
function PythonScriptRunner() {
  const {
    availableScripts,
    availableInventories,
    fetchingScripts,
    fetchingInventories,
    error: dataError,
  } = useScriptData();

  const [selectedScriptConfig, setSelectedScriptConfig] = useState(null);
  const [inventorySelectionMode, setInventorySelectionMode] = useState("file");

  const { currentArgs, handleArgChange, resetArgs } = useScriptParameters(
    selectedScriptConfig,
    availableInventories,
    inventorySelectionMode,
  );

  const {
    output,
    executionError,
    setExecutionError,
    isLoading,
    runScript,
    clearOutput,
    clearError,
  } = useScriptExecution();

  // Combine data fetching errors and script execution errors for a single display point
  const currentOverallError = dataError || executionError;

  // Effect to set the first script as selected by default if none is chosen
  useEffect(() => {
    if (availableScripts.length > 0 && !selectedScriptConfig) {
      setSelectedScriptConfig(availableScripts[0]);
    }
  }, [availableScripts, selectedScriptConfig]);

  // Handler for when a user selects a different script from the dropdown
  const handleScriptSelectChange = (e) => {
    const selectedId = e.target.value;
    const config = availableScripts.find((script) => script.id === selectedId);
    setSelectedScriptConfig(config);
    setInventorySelectionMode("file"); // Reset inventory mode to default when script changes
    clearOutput(); // Clear previous output
    clearError(); // Clear previous errors
  };

  // Handler for running the selected script
  const handleRunScript = async () => {
    if (!selectedScriptConfig) {
      setExecutionError("No script selected.");
      return;
    }

    const parametersToSend = {};
    let hasMissingRequired = false;

    // --- MODIFIED: Process factOptions checkboxes from currentArgs ---
    if (selectedScriptConfig.factOptions) {
      const selectedFacts = selectedScriptConfig.factOptions
        .filter((opt) => currentArgs[opt.id]) // Check if the option's ID is true in currentArgs
        .map((opt) => opt.id);

      // If get_device_facts is selected, at least one fact must be checked
      if (
        selectedScriptConfig.id === "get_device_facts" &&
        selectedFacts.length === 0
      ) {
        setExecutionError("Please select at least one fact type to retrieve.");
        hasMissingRequired = true;
      } else if (selectedFacts.length > 0) {
        parametersToSend["fact_types"] = selectedFacts.join(",");
      }
    }
    // --- END MODIFIED ---

    // --- NEW: Process testOptions checkboxes from currentArgs ---
    if (selectedScriptConfig.testOptions) {
      const selectedTests = selectedScriptConfig.testOptions
        .filter((opt) => currentArgs[opt.id]) // Check if the option's ID is true in currentArgs
        .map((opt) => opt.id);

      // If run_jsnapy_tests is selected, at least one test must be checked
      if (
        selectedScriptConfig.id === "run_jsnapy_tests" &&
        selectedTests.length === 0
      ) {
        setExecutionError("Please select at least one JSNAPy test to run.");
        hasMissingRequired = true;
      } else if (selectedTests.length > 0) {
        parametersToSend["test_ids"] = selectedTests.join(",");
      }
    }
    // --- END NEW ---

    // Special handling for 'get_device_facts' to manage inventory/hosts
    if (selectedScriptConfig.id === "get_device_facts") {
      if (inventorySelectionMode === "file") {
        const inventoryFileValue = currentArgs["inventory_file"];
        if (!inventoryFileValue || inventoryFileValue.trim() === "") {
          setExecutionError("Please select an inventory file.");
          hasMissingRequired = true;
        }
        parametersToSend["inventory_file"] = inventoryFileValue;
        // Ensure 'hosts' is not sent if we're using an inventory file
        delete parametersToSend["hosts"];
      } else {
        // inventorySelectionMode === 'manual'
        const hostsValue = currentArgs["hosts"];
        if (!hostsValue || hostsValue.trim() === "") {
          setExecutionError("Please enter at least one host.");
          hasMissingRequired = true;
        }
        parametersToSend["hosts"] = hostsValue.trim();
        // Ensure 'inventory_file' is not sent if we're manually entering hosts
        delete parametersToSend["inventory_file"];
      }
    }

    // Process other dynamic script parameters from the hook's state
    selectedScriptConfig.parameters.forEach((paramDef) => {
      // Filter out parameters already handled (inventory_file, hosts, and checkbox options)
      if (
        (selectedScriptConfig.id === "get_device_facts" &&
          (paramDef.name === "inventory_file" || paramDef.name === "hosts")) ||
        (selectedScriptConfig.factOptions &&
          selectedScriptConfig.factOptions.some(
            (opt) => opt.id === paramDef.name,
          )) ||
        (selectedScriptConfig.testOptions &&
          selectedScriptConfig.testOptions.some(
            (opt) => opt.id === paramDef.name,
          ))
      ) {
        return; // Skip this parameter as it's handled by a checkbox or a special selector
      }

      const value = currentArgs[paramDef.name];

      // Validate required parameters
      if (
        paramDef.required &&
        (value === undefined ||
          value === null ||
          (typeof value === "string" && value.trim() === ""))
      ) {
        setExecutionError(
          `Required parameter "${paramDef.label || paramDef.name}" is missing.`,
        );
        hasMissingRequired = true;
      }

      // Add to payload
      parametersToSend[paramDef.name] = value;
    });

    if (hasMissingRequired) {
      return; // Stop script execution if validation failed
    }

    // Execute the script via the useScriptExecution hook
    await runScript(selectedScriptConfig.id, parametersToSend);
  };

  // Memoized list of featured scripts for the FeaturedScripts component
  const featuredScripts = useMemo(() => {
    return availableScripts.filter(
      (script) => script.tags && script.tags.includes("featured"),
    );
  }, [availableScripts]);

  // Memoized data for the ScriptStatisticsChart component
  const scriptsByCategoryData = useMemo(() => {
    const categoryCounts = availableScripts.reduce((acc, script) => {
      const category = script.category || "Uncategorized";
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});

    return Object.keys(categoryCounts).map((category) => ({
      name: category,
      value: categoryCounts[category],
    }));
  }, [availableScripts]);

  // Handler for when a user selects a script from the Featured Scripts table
  const handleFeaturedScriptSelection = (scriptId) => {
    const config = availableScripts.find((script) => script.id === scriptId);
    if (config) {
      setSelectedScriptConfig(config);
      setInventorySelectionMode("file"); // Reset inventory mode
      clearOutput(); // Clear any existing output
      clearError(); // Clear any existing errors
      resetArgs(); // Reset args when selecting from featured

      // Scroll to the "Run a Script" section for better UX
      document
        .getElementById("run-script-section")
        .scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Display a full-page loading indicator while initial data is being fetched
  if (fetchingScripts || fetchingInventories) {
    return (
      <div className="w-full bg-white shadow-sm border-b border-gray-200 py-12 sm:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Loader2 className="animate-spin h-10 w-10 text-blue-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {fetchingScripts ? "Loading Scripts..." : "Loading Inventories..."}
          </h1>
          <p className="text-gray-600">
            Please wait while data is being fetched from the backend.
          </p>
        </div>
      </div>
    );
  }

  // Display a full-page error if there's a critical data loading error and no scripts are available
  if (currentOverallError && !output && !selectedScriptConfig) {
    return (
      <div className="w-full bg-red-50 shadow-sm border-b border-red-200 py-12 sm:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-red-700">
          <h1 className="text-2xl font-bold text-red-800 mb-3">
            Error Loading Data
          </h1>
          <p className="mb-2">There was an issue loading resources:</p>
          <pre className="whitespace-pre-wrap break-all font-mono bg-red-100 p-3 rounded-md text-red-800 text-sm overflow-x-auto">
            {currentOverallError}
          </pre>
          <p className="mt-4 text-red-600">
            Please ensure your backend is running and configurations are
            correct.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-sm border-b border-gray-200 py-12 sm:py-16 lg:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-extrabold text-gray-900 mb-8 text-center">
          Python Script Runner
        </h1>

        {/* Top section with Featured Scripts and Script Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div className="md:col-span-2">
            <FeaturedScripts
              featuredScripts={featuredScripts}
              onSelectScript={handleFeaturedScriptSelection}
            />
          </div>

          <div className="md:col-span-1">
            <ScriptStatisticsChart
              data={scriptsByCategoryData}
              totalScripts={availableScripts.length}
            />
          </div>
        </div>

        {/* Main section for running a script */}
        <div
          id="run-script-section"
          className="bg-white rounded-lg shadow-md p-6"
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Run a Script
          </h2>

          {/* Script selection dropdown */}
          <div className="mb-6">
            <label
              htmlFor="script-select"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Select Script:
            </label>
            <select
              id="script-select"
              value={selectedScriptConfig ? selectedScriptConfig.id : ""}
              onChange={handleScriptSelectChange}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md shadow-sm"
              disabled={availableScripts.length === 0}
            >
              {availableScripts.length === 0 ? (
                <option value="">No scripts available</option>
              ) : (
                availableScripts.map((script) => (
                  <option key={script.id} value={script.id}>
                    {script.displayName} - {script.description} (
                    {script.category})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Conditional rendering for Target Hosts Selector (only for get_device_facts) */}
          {selectedScriptConfig &&
            selectedScriptConfig.id === "get_device_facts" && (
              <TargetHostsSelector
                inventorySelectionMode={inventorySelectionMode}
                onInventoryModeChange={setInventorySelectionMode}
                availableInventories={availableInventories}
                fetchingInventories={fetchingInventories}
                currentInventoryFile={currentArgs["inventory_file"]}
                onInventoryFileChange={(value) =>
                  handleArgChange("inventory_file", value)
                }
                currentHosts={currentArgs["hosts"]}
                onHostsChange={(value) => handleArgChange("hosts", value)}
              />
            )}

          {/* Conditional rendering for other Script Parameters */}
          {selectedScriptConfig &&
            selectedScriptConfig.parameters.length > 0 && (
              <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">
                  Script Parameters:
                </h3>
                {selectedScriptConfig.parameters
                  .filter(
                    (param) =>
                      // Filter out inventory_file and hosts as they're handled by TargetHostsSelector
                      param.name !== "inventory_file" && param.name !== "hosts",
                  )
                  .map((param) => (
                    <ScriptParameterInput
                      key={param.name}
                      param={param}
                      value={currentArgs[param.name]}
                      onChange={handleArgChange}
                    />
                  ))}
              </div>
            )}

          {/* --- MODIFIED: Conditional rendering for factOptions checkboxes --- */}
          {selectedScriptConfig && selectedScriptConfig.factOptions && (
            <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                Select Facts to Retrieve:
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {selectedScriptConfig.factOptions.map((fact) => (
                  <div key={fact.id} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`fact-${fact.id}`}
                      checked={!!currentArgs[fact.id]} // Check against the currentArgs state
                      onChange={(e) =>
                        handleArgChange(fact.id, e.target.checked)
                      } // Use the generic handler
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label
                      htmlFor={`fact-${fact.id}`}
                      className="ml-2 block text-sm font-medium text-gray-700 cursor-pointer"
                    >
                      {fact.label}
                      {fact.description && (
                        <span className="font-normal text-xs text-gray-500 ml-1">
                          ({fact.description})
                        </span>
                      )}
                    </label>
                  </div>
                ))}
              </div>
              {/* This validation message is now handled by setExecutionError */}
              {currentOverallError &&
                currentOverallError.includes(
                  "select at least one fact type",
                ) && (
                  <p className="text-red-500 text-xs mt-2">
                    {currentOverallError}
                  </p>
                )}
            </div>
          )}
          {/* --- END MODIFIED --- */}

          {/* --- NEW: Conditional rendering for testOptions checkboxes --- */}
          {selectedScriptConfig && selectedScriptConfig.testOptions && (
            <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                Select JSNAPy Tests:
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {selectedScriptConfig.testOptions.map((test) => (
                  <div key={test.id} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`test-${test.id}`}
                      checked={!!currentArgs[test.id]} // Check against the currentArgs state
                      onChange={(e) =>
                        handleArgChange(test.id, e.target.checked)
                      } // Use the generic handler
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label
                      htmlFor={`test-${test.id}`}
                      className="ml-2 block text-sm font-medium text-gray-700 cursor-pointer"
                    >
                      {test.label}
                      {test.description && (
                        <span className="font-normal text-xs text-gray-500 ml-1">
                          ({test.description})
                        </span>
                      )}
                    </label>
                  </div>
                ))}
              </div>
              {/* Validation message for tests */}
              {currentOverallError &&
                currentOverallError.includes(
                  "select at least one JSNAPy test",
                ) && (
                  <p className="text-red-500 text-xs mt-2">
                    {currentOverallError}
                  </p>
                )}
            </div>
          )}
          {/* --- END NEW --- */}

          {/* Run Script Button */}
          <button
            onClick={handleRunScript}
            disabled={
              isLoading ||
              !selectedScriptConfig ||
              // --- MODIFIED: Include validation for checkboxes ---
              (selectedScriptConfig.id === "get_device_facts" &&
                !currentArgs.fact_types &&
                selectedScriptConfig.factOptions &&
                selectedScriptConfig.factOptions.length > 0 &&
                selectedScriptConfig.factOptions.every(
                  (opt) => !currentArgs[opt.id],
                )) ||
              (selectedScriptConfig.id === "run_jsnapy_tests" &&
                !currentArgs.test_ids &&
                selectedScriptConfig.testOptions &&
                selectedScriptConfig.testOptions.length > 0 &&
                selectedScriptConfig.testOptions.every(
                  (opt) => !currentArgs[opt.id],
                )) ||
              // --- END MODIFIED ---
              (selectedScriptConfig.id === "get_device_facts" &&
                ((inventorySelectionMode === "file" &&
                  (!currentArgs["inventory_file"] ||
                    currentArgs["inventory_file"].trim() === "")) ||
                  (inventorySelectionMode === "manual" &&
                    (!currentArgs["hosts"] ||
                      currentArgs["hosts"].trim() === ""))))
            }
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin h-5 w-5 mr-3" /> Running
                Script...
              </>
            ) : (
              "Run Script"
            )}
          </button>

          {/* Script Output Display */}
          <ScriptOutputDisplay
            output={output}
            error={currentOverallError}
            isLoading={isLoading}
            fetchingScripts={fetchingScripts}
            fetchingInventories={fetchingInventories}
          />
        </div>
      </div>
    </div>
  );
}

export default PythonScriptRunner;
