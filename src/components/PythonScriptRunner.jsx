import React, { useState, useEffect, useMemo } from "react";
import { Loader2, Zap } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Label } from "recharts";

function PythonScriptRunner() {
  const [availableScripts, setAvailableScripts] = useState([]);
  const [selectedScriptConfig, setSelectedScriptConfig] = useState(null);
  const [currentArgs, setCurrentArgs] = useState({});

  const [availableInventories, setAvailableInventories] = useState([]);
  const [fetchingInventories, setFetchingInventories] = useState(true);

  // New state for inventory selection mode: 'file' or 'manual'
  const [inventorySelectionMode, setInventorySelectionMode] = useState("file");

  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [fetchingScripts, setFetchingScripts] = useState(true);

  // Effect to fetch available scripts
  useEffect(() => {
    const fetchScripts = async () => {
      try {
        const response = await fetch("http://localhost:3001/api/scripts/list");
        if (!response.ok) {
          throw new Error("Failed to fetch script list from backend.");
        }
        const data = await response.json();
        if (data.success && Array.isArray(data.scripts)) {
          setAvailableScripts(data.scripts);
          if (data.scripts.length > 0) {
            // Set the first script as default, and initialize its parameters
            setSelectedScriptConfig(data.scripts[0]);
          }
        } else {
          setError(data.message || "Malformed script list received.");
        }
      } catch (err) {
        console.error("Error fetching script list:", err);
        setError(`Failed to load scripts: ${err.message}`);
      } finally {
        setFetchingScripts(false);
      }
    };

    fetchScripts();
  }, []);

  // Effect to fetch available inventories
  useEffect(() => {
    const fetchInventories = async () => {
      try {
        const response = await fetch(
          "http://localhost:3001/api/inventories/list",
        );
        if (!response.ok) {
          throw new Error("Failed to fetch inventory list from backend.");
        }
        const data = await response.json();
        if (data.success && Array.isArray(data.inventories)) {
          setAvailableInventories(data.inventories);
        } else {
          setError(data.message || "Malformed inventory list received.");
        }
      } catch (err) {
        console.error("Error fetching inventory list:", err);
        setError(`Failed to load inventories: ${err.message}`);
      } finally {
        setFetchingInventories(false);
      }
    };

    // Only fetch inventories once scripts are loaded, to ensure selectedScriptConfig is set
    if (!fetchingScripts && availableScripts.length > 0) {
      fetchInventories();
    }
  }, [fetchingScripts, availableScripts]);

  // Effect to initialize/reset currentArgs when selected script or inventories change
  useEffect(() => {
    if (selectedScriptConfig) {
      const newArgs = {};
      selectedScriptConfig.parameters.forEach((param) => {
        newArgs[param.name] = param.defaultValue || "";
      });

      // Special handling for 'get_device_facts' to set default inventory_file
      if (selectedScriptConfig.id === "get_device_facts") {
        if (
          availableInventories.length > 0 &&
          inventorySelectionMode === "file"
        ) {
          newArgs.inventory_file = availableInventories[0];
        } else {
          newArgs.inventory_file = ""; // Clear if switching from manual or no inventories
        }
        newArgs.hosts = ""; // Ensure hosts is cleared/initialized
      }

      setCurrentArgs(newArgs);
      setOutput("");
      setError("");
    }
  }, [selectedScriptConfig, availableInventories, inventorySelectionMode]);

  const handleScriptSelectChange = (e) => {
    const selectedId = e.target.value;
    const config = availableScripts.find((script) => script.id === selectedId);
    setSelectedScriptConfig(config);
    setInventorySelectionMode("file"); // Reset mode when script changes
  };

  const handleArgChange = (argName, value) => {
    setCurrentArgs((prevArgs) => ({
      ...prevArgs,
      [argName]: value,
    }));
  };

  const handleRunScript = async () => {
    if (!selectedScriptConfig) {
      setError("No script selected.");
      return;
    }

    setOutput("");
    setError("");
    setIsLoading(true);

    const parametersToSend = {};
    let hasMissingRequired = false;

    // Handle 'get_device_facts' specific inventory/host logic
    if (selectedScriptConfig.id === "get_device_facts") {
      if (inventorySelectionMode === "file") {
        const inventoryFileValue = currentArgs["inventory_file"];
        if (!inventoryFileValue || inventoryFileValue.trim() === "") {
          setError("Please select an inventory file.");
          hasMissingRequired = true;
        }
        parametersToSend["inventory_file"] = inventoryFileValue;
        // Ensure 'hosts' is not sent
        delete parametersToSend["hosts"];
      } else {
        // inventorySelectionMode === 'manual'
        const hostsValue = currentArgs["hosts"];
        if (!hostsValue || hostsValue.trim() === "") {
          setError("Please enter at least one host.");
          hasMissingRequired = true;
        }
        parametersToSend["hosts"] = hostsValue.trim();
        // Ensure 'inventory_file' is not sent
        delete parametersToSend["inventory_file"];
      }
    }

    // Process other parameters from script metadata, excluding inventory_file and hosts
    selectedScriptConfig.parameters.forEach((paramDef) => {
      // Skip inventory_file and hosts if get_device_facts because they are handled above
      if (
        selectedScriptConfig.id === "get_device_facts" &&
        (paramDef.name === "inventory_file" || paramDef.name === "hosts")
      ) {
        return;
      }

      const value = currentArgs[paramDef.name];
      if (
        paramDef.required &&
        (value === undefined ||
          value === null ||
          (typeof value === "string" && value.trim() === ""))
      ) {
        setError(
          `Required parameter "${paramDef.label || paramDef.name}" is missing.`,
        );
        hasMissingRequired = true;
      }

      if (paramDef.type === "number") {
        parametersToSend[paramDef.name] = Number(value);
      } else if (paramDef.type === "boolean") {
        parametersToSend[paramDef.name] =
          typeof value === "string" ? value.toLowerCase() === "true" : value;
      } else {
        parametersToSend[paramDef.name] = value;
      }
    });

    if (hasMissingRequired) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("http://localhost:3001/api/scripts/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scriptId: selectedScriptConfig.id,
          parameters: parametersToSend,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Failed to run script on backend.",
        );
      }

      const data = await response.json();
      if (data.success) {
        setOutput(data.output);
        setError(data.error);
      } else {
        setError(data.message || "Script execution failed.");
        setOutput(data.output);
      }
    } catch (err) {
      console.error("Error calling backend:", err);
      setError(`Network or backend error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const featuredScripts = useMemo(() => {
    return availableScripts.filter(
      (script) => script.tags && script.tags.includes("featured"),
    );
  }, [availableScripts]);

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

  const COLORS = [
    "#6BBD45",
    "#8BC34A",
    "#A1D36F",
    "#B3E594",
    "#C5F7B9",
    "#D9FAE7",
    "#A0DEB7",
    "#76C6A0",
  ];

  const handleFeaturedScriptClick = (scriptId) => {
    const config = availableScripts.find((script) => script.id === scriptId);
    if (config) {
      setSelectedScriptConfig(config);
      document
        .getElementById("run-script-section")
        .scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Display loading state while fetching scripts or inventories
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

  // Display error state if fetching failed and no scripts/output are available
  if (error && !output && !fetchingScripts && !fetchingInventories) {
    return (
      <div className="w-full bg-red-50 shadow-sm border-b border-red-200 py-12 sm:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-red-700">
          <h1 className="text-2xl font-bold text-red-800 mb-3">
            Error Loading Data
          </h1>
          <p className="mb-2">There was an issue loading resources:</p>
          <pre className="whitespace-pre-wrap break-all font-mono bg-red-100 p-3 rounded-md text-red-800 text-sm overflow-x-auto">
            {error}
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div className="md:col-span-2 bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center mb-4">
              <Zap size={20} className="mr-2 text-blue-500" />
              Featured Scripts
            </h2>
            {featuredScripts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Script Display Name
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Category
                      </th>
                      <th scope="col" className="relative px-6 py-3">
                        <span className="sr-only">Select</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {featuredScripts.map((script) => (
                      <tr key={script.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {script.displayName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {script.category}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleFeaturedScriptClick(script.id)}
                            className="text-blue-600 hover:text-blue-900 px-3 py-1 border border-blue-600 rounded-md hover:bg-blue-50 transition-colors duration-200"
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-600 text-center py-4">
                No featured scripts available. Add 'featured' tag in
                scripts.yaml.
              </p>
            )}
          </div>

          <div className="md:col-span-1 bg-white rounded-lg shadow-md p-6 flex flex-col items-center justify-center text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Script Statistics
            </h2>
            {availableScripts.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={scriptsByCategoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      fill="#8884d8"
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {scriptsByCategoryData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                      <Label
                        value={availableScripts.length}
                        position="center"
                        fill="#000"
                        className="font-bold text-3xl"
                      />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 w-full text-left">
                  {scriptsByCategoryData.map((entry, index) => (
                    <div
                      key={entry.name}
                      className="flex items-center justify-between text-gray-700 text-sm mb-1"
                    >
                      <div className="flex items-center">
                        <span
                          className="inline-block w-3 h-3 rounded-full mr-2"
                          style={{
                            backgroundColor: COLORS[index % COLORS.length],
                          }}
                        ></span>
                        {entry.name}
                      </div>
                      <span className="inline-block border border-gray-400 rounded px-2 py-0.5 text-xs font-semibold">
                        {entry.value}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-gray-600">No scripts to display statistics.</p>
            )}
          </div>
        </div>

        <div
          id="run-script-section"
          className="bg-white rounded-lg shadow-md p-6"
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Run a Script
          </h2>

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

          {/* Conditional rendering for Inventory/Host Selection for get_device_facts */}
          {selectedScriptConfig &&
            selectedScriptConfig.id === "get_device_facts" && (
              <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">
                  Target Hosts:
                </h3>

                <div className="flex items-center space-x-4 mb-4">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      className="form-radio text-blue-600"
                      name="inventoryMode"
                      value="file"
                      checked={inventorySelectionMode === "file"}
                      onChange={() => setInventorySelectionMode("file")}
                    />
                    <span className="ml-2 text-gray-700">
                      Select Inventory File
                    </span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      className="form-radio text-blue-600"
                      name="inventoryMode"
                      value="manual"
                      checked={inventorySelectionMode === "manual"}
                      onChange={() => setInventorySelectionMode("manual")}
                    />
                    <span className="ml-2 text-gray-700">
                      Manually Add Hosts
                    </span>
                  </label>
                </div>

                {inventorySelectionMode === "file" ? (
                  <div className="mb-4">
                    <label
                      htmlFor="inventory-file-select"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Inventory File: <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="inventory-file-select"
                      value={currentArgs["inventory_file"] || ""}
                      onChange={(e) =>
                        handleArgChange("inventory_file", e.target.value)
                      }
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      required
                      disabled={availableInventories.length === 0}
                    >
                      {availableInventories.length === 0 ? (
                        <option value="">No inventory files found</option>
                      ) : (
                        availableInventories.map((file) => (
                          <option key={file} value={file}>
                            {file}
                          </option>
                        ))
                      )}
                    </select>
                    {availableInventories.length === 0 &&
                      !fetchingInventories && (
                        <p className="text-red-500 text-xs mt-1">
                          No inventory files found in `python_pipeline/data/`.
                        </p>
                      )}
                  </div>
                ) : (
                  // inventorySelectionMode === 'manual'
                  <div className="mb-4">
                    <label
                      htmlFor="manual-hosts-input"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Hosts (comma-separated):{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="manual-hosts-input"
                      value={currentArgs["hosts"] || ""}
                      onChange={(e) => handleArgChange("hosts", e.target.value)}
                      placeholder="e.g., device1.lab.com,10.0.0.1,device3"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                )}
              </div>
            )}

          {selectedScriptConfig &&
            selectedScriptConfig.parameters.length > 0 && (
              <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">
                  Script Parameters:
                </h3>
                {selectedScriptConfig.parameters.map(
                  (param) =>
                    // Only render parameters that are NOT 'inventory_file' or 'hosts' as they are handled separately above
                    param.name !== "inventory_file" &&
                    param.name !== "hosts" && (
                      <div key={param.name} className="mb-4">
                        <label
                          htmlFor={`param-${param.name}`}
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          {param.label || param.name}{" "}
                          {param.required && (
                            <span className="text-red-500">*</span>
                          )}
                          :
                          {param.description && (
                            <span className="font-normal text-xs text-gray-500 ml-1">
                              {" "}
                              ({param.description})
                            </span>
                          )}
                        </label>
                        {param.type === "enum" ? (
                          <select
                            id={`param-${param.name}`}
                            value={currentArgs[param.name] || ""}
                            onChange={(e) =>
                              handleArgChange(param.name, e.target.value)
                            }
                            required={param.required}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          >
                            {param.options &&
                              param.options.map(
                                (
                                  option, // <-- Added check for param.options here
                                ) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ),
                              )}
                          </select>
                        ) : param.type === "boolean" ? (
                          <div className="flex items-center mt-1">
                            {" "}
                            {/* Use flexbox to align */}
                            <input
                              type="checkbox"
                              id={`param-${param.name}`}
                              checked={currentArgs[param.name] === true}
                              onChange={(e) =>
                                handleArgChange(param.name, e.target.checked)
                              }
                              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <label
                              htmlFor={`param-${param.name}`}
                              className="ml-2 block text-sm font-medium text-gray-700"
                            >
                              {param.label || param.name}
                              {param.description && (
                                <span className="font-normal text-xs text-gray-500 ml-1">
                                  {" "}
                                  ({param.description})
                                </span>
                              )}
                            </label>
                          </div>
                        ) : (
                          <input
                            type={param.type === "number" ? "number" : "text"}
                            id={`param-${param.name}`}
                            value={currentArgs[param.name] || ""}
                            onChange={(e) =>
                              handleArgChange(param.name, e.target.value)
                            }
                            placeholder={
                              param.placeholder ||
                              `Enter ${param.label || param.name}`
                            }
                            required={param.required}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          />
                        )}
                      </div>
                    ),
                )}
              </div>
            )}

          <button
            onClick={handleRunScript}
            // Disable button if loading, no script selected, or if 'get_device_facts' mode has no input
            disabled={
              isLoading ||
              !selectedScriptConfig ||
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

          <div className="mt-8 pt-6 border-t border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Script Output:
            </h2>
            {error && (
              <pre className="bg-red-50 text-red-700 p-4 rounded-md text-sm border border-red-200 whitespace-pre-wrap break-all overflow-x-auto">
                <span className="font-bold">ERROR:</span> {error}
              </pre>
            )}
            {output && (
              <pre className="bg-gray-100 p-4 rounded-md text-gray-800 text-sm border border-gray-200 whitespace-pre-wrap break-all overflow-x-auto">
                {output}
              </pre>
            )}
            {!output &&
              !error &&
              !isLoading &&
              !fetchingScripts &&
              !fetchingInventories && (
                <p className="text-gray-600 text-sm">
                  Run a script to see output here.
                </p>
              )}
            {isLoading && (
              <p className="text-blue-600 text-sm flex items-center">
                <Loader2 className="animate-spin h-4 w-4 mr-2" /> Loading...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PythonScriptRunner;
