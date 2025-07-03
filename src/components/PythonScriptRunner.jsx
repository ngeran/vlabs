// src/components/PythonScriptRunner.jsx

import React, { useEffect, useState, useMemo } from "react";
import { Tag, FileCode, PlayCircle, Layers } from "lucide-react";
import PulseLoader from "react-spinners/PulseLoader"; // Import the spinner

// === EXTERNAL COMPONENT DEPENDENCIES ===
import DeviceAuthFields from "./DeviceAuthFields";
import ScriptOutputDisplay from "./ScriptOutputDisplay";
import ErrorBoundary from "./ErrorBoundary";
import TestSelector from "./TestSelector";
import ScriptRunnerIcon from "./ScriptRunnerIcon";

// === EXTERNAL HOOK DEPENDENCY ===
import { useTestDiscovery } from "../hooks/useTestDiscovery";

const API_BASE_URL = "http://localhost:3001";

// ====================================================================================
// === INTERNAL COMPONENTS (Defined here for a single-file solution) ================
// ====================================================================================

/**
 * @description Renders the UI for selecting a script's discoverable tests in the sidebar.
 * This is a "smart" component that uses the useTestDiscovery hook to fetch its own data.
 * @param {object} props - Component props.
 * @param {object} props.script - The currently selected script object.
 * @param {object} props.parameters - The current state of parameters for this script.
 * @param {function} props.setParameters - The function to update the parent's state.
 */
function DiscoverableTestOptions({ script, parameters, setParameters }) {
  const { categorizedTests, loading, error } = useTestDiscovery(
    script.id,
    parameters.environment,
  );

  const handleTestToggle = (testId) => {
    const currentTests = parameters.tests || [];
    const newSelection = currentTests.includes(testId)
      ? currentTests.filter((id) => id !== testId)
      : [...currentTests, testId];
    setParameters({ ...parameters, tests: newSelection });
  };

  if (loading)
    return (
      <p className="text-xs text-slate-500 italic">Discovering tests...</p>
    );
  if (error)
    return <p className="text-xs font-semibold text-red-600">Error: {error}</p>;

  return (
    <TestSelector
      categorizedTests={categorizedTests}
      selectedTests={parameters.tests || []}
      onTestToggle={handleTestToggle}
    />
  );
}

/**
 * @description The "brain" that decides which options UI to render in the sidebar.
 * It acts as a switchboard, checking the selected script's metadata for capabilities.
 * @param {object} props - Component props.
 * @param {object} props.script - The currently selected script object.
 * @param {object} props.parameters - The current state of parameters for this script.
 * @param {function} props.setParameters - The function to update the parent's state.
 */
function ScriptOptionsRenderer({ script, parameters, setParameters }) {
  if (!script) return null;

  if (script.capabilities?.dynamicDiscovery) {
    return (
      <DiscoverableTestOptions
        script={script}
        parameters={parameters}
        setParameters={setParameters}
      />
    );
  }

  return (
    <p className="text-xs text-slate-500 italic">
      This script has no additional sidebar options.
    </p>
  );
}

/**
 * @description The static sidebar component for desktop view. It contains the category
 * filters and the area for script-specific options.
 * @param {object} props - Component props passed from the main PythonScriptRunner.
 */
function ScriptFilterSidebar({
  allScripts,
  selectedCategories,
  onCategoryChange,
  selectedScript,
  scriptParameters,
  setParameters,
}) {
  const { uniqueCategories, scriptCounts } = useMemo(() => {
    const counts = {};
    allScripts.forEach((script) => {
      if (script.category)
        counts[script.category] = (counts[script.category] || 0) + 1;
    });
    return {
      uniqueCategories: Object.keys(counts).sort(),
      scriptCounts: counts,
    };
  }, [allScripts]);

  const handleCheckboxChange = (category) => {
    const newSelection = new Set(selectedCategories);
    newSelection.has(category)
      ? newSelection.delete(category)
      : newSelection.add(category);
    onCategoryChange(Array.from(newSelection));
  };

  return (
    <aside className="w-full md:w-64 lg:w-72 flex-shrink-0">
      <div className="sticky top-24 space-y-8">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-200 pb-2 flex items-center">
            <Tag size={18} className="mr-2 text-slate-500" /> Filter by Category
          </h3>
          <div className="space-y-1">
            {uniqueCategories.map((category) => (
              <label
                key={category}
                className="flex items-center justify-between text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md p-2 cursor-pointer transition-colors duration-150"
              >
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(category)}
                    onChange={() => handleCheckboxChange(category)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-3">{category}</span>
                </div>
                <span className="bg-slate-200 text-slate-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {scriptCounts[category]}
                </span>
              </label>
            ))}
            {selectedCategories.length > 0 && (
              <button
                onClick={() => onCategoryChange([])}
                className="text-sm text-blue-600 hover:underline mt-4 p-2 font-medium"
              >
                Clear All Filters
              </button>
            )}
          </div>
        </div>

        {selectedScript && (
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-200 pb-2 flex items-center">
              <Layers size={18} className="mr-2 text-slate-500" /> Script
              Options
            </h3>
            <ScriptOptionsRenderer
              script={selectedScript}
              parameters={scriptParameters}
              setParameters={setParameters}
            />
          </div>
        )}
      </div>
    </aside>
  );
}

// ====================================================================================
// === MAIN PAGE COMPONENT ============================================================
// ====================================================================================

/**
 * @description The main page component that orchestrates the entire script runner UI.
 * It manages all state, fetches data, and coordinates the sidebar and main content areas.
 */
function PythonScriptRunner() {
  const [allScripts, setAllScripts] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [scriptParameters, setScriptParameters] = useState({});
  const [scriptOutputs, setScriptOutputs] = useState({});
  const [error, setError] = useState(null);
  const [loadingScripts, setLoadingScripts] = useState(true);
  const [runningScripts, setRunningScripts] = useState(false);

  // Effect to fetch the master list of all scripts on initial component mount.
  useEffect(() => {
    async function fetchScripts() {
      setLoadingScripts(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/api/scripts/list`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        setAllScripts(data.scripts || []);
      } catch (err) {
        setError(`Error loading scripts: ${err.message}`);
      } finally {
        setLoadingScripts(false);
      }
    }
    fetchScripts();
  }, []);

  // Memoized value to calculate the list of scripts to show based on category filters.
  const filteredScripts = useMemo(() => {
    if (selectedCategories.length === 0) return allScripts;
    return allScripts.filter((script) =>
      selectedCategories.includes(script.category),
    );
  }, [allScripts, selectedCategories]);

  // Memoized value to get the full object for the currently selected script.
  const selectedScript = useMemo(
    () => allScripts.find((s) => s.id === selectedScriptId),
    [allScripts, selectedScriptId],
  );

  // Handler for when the user changes category selections in the sidebar.
  const handleCategoryChange = (newCategories) => {
    setSelectedCategories(newCategories);
    const isStillVisible = allScripts.some(
      (s) =>
        s.id === selectedScriptId &&
        (newCategories.length === 0 || newCategories.includes(s.category)),
    );
    if (!isStillVisible) {
      setSelectedScriptId("");
    }
  };

  // Handler for when the user selects a different script from the dropdown.
  const handleScriptChange = (scriptId) => {
    setSelectedScriptId(scriptId);
    setScriptOutputs({});
    setError(null);
  };

  // The single callback function passed to child components to update the parameter state.
  const updateCurrentScriptParameters = (newParams) => {
    if (!selectedScriptId) return;
    setScriptParameters((prev) => ({ ...prev, [selectedScriptId]: newParams }));
  };

  // Handler for the main "Run Script" button.
  const runSingleScript = async () => {
    if (!selectedScriptId) return alert("Please select a script.");
    const params = scriptParameters[selectedScriptId] || {};

    const payload = {
      scriptId: selectedScriptId,
      parameters: {
        ...params,
        hostname: params.hostname,
        tests: Array.isArray(params.tests)
          ? params.tests.join(",")
          : params.tests,
      },
    };

    setRunningScripts(true);
    setError(null);
    setScriptOutputs({});
    try {
      const res = await fetch(`${API_BASE_URL}/api/scripts/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(
          data.error ||
            data.message ||
            `Request failed with status ${res.status}`,
        );
      }
      setScriptOutputs({
        [selectedScriptId]: { output: data.output, error: data.error || null },
      });
    } catch (err) {
      console.error("Script execution fetch error:", err);
      setError(`Script error: ${err.message}`);
    } finally {
      setRunningScripts(false);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen rounded-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-4 mb-10">
          <ScriptRunnerIcon className="h-10 w-10" />
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-slate-900">
            Script Runner
          </h1>
        </div>

        <div className="flex flex-col md:flex-row gap-x-10 gap-y-12">
          <ScriptFilterSidebar
            allScripts={allScripts}
            selectedCategories={selectedCategories}
            onCategoryChange={handleCategoryChange}
            selectedScript={selectedScript}
            scriptParameters={scriptParameters[selectedScriptId] || {}}
            setParameters={updateCurrentScriptParameters}
          />

          <main className="flex-1">
            {loadingScripts ? (
              // ✨ 1. Show a Skeleton Loader while fetching scripts ✨
              <div className="border border-slate-200 rounded-lg p-6 lg:p-8 shadow-md bg-white animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-1/4 mb-4"></div>
                <div className="h-10 bg-slate-200 rounded w-full mb-6"></div>
                <div className="h-4 bg-slate-200 rounded w-1/3 mb-4"></div>
                <div className="h-10 bg-slate-200 rounded w-full mb-2"></div>
                <div className="h-10 bg-slate-200 rounded w-full"></div>
              </div>
            ) : selectedScriptId ? (
              // The existing block for when a script IS selected
              <div className="mb-8 border ...">
                {/* ... The existing form and button ... */}
              </div>
            ) : (
              // ✨ 2. Show an "Empty State" when NO script is selected ✨
              <div className="text-center p-12 border-2 border-dashed border-slate-300 rounded-lg bg-white">
                <Layers size={48} className="mx-auto text-slate-400 mb-4" />
                <h3 className="text-lg font-semibold text-slate-700">
                  Select a Script
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Choose a script from the dropdown to see its available options
                  and run it.
                </p>
              </div>
            )}

            {loadingScripts && (
              <div className="text-center p-8">
                <p className="text-slate-500">Loading available scripts...</p>
              </div>
            )}

            {error && !runningScripts && (
              <div className="bg-red-100 border border-red-200 text-red-800 p-4 rounded-lg mb-6">
                <strong>Error:</strong> {error}
              </div>
            )}

            {!loadingScripts && allScripts.length > 0 && (
              <div className="mb-8 border border-slate-200 rounded-lg p-6 lg:p-8 shadow-md bg-white">
                <div className="mb-6">
                  <label
                    htmlFor="script-select"
                    className="block text-sm font-medium text-slate-700 mb-2"
                  >
                    Select Script
                  </label>
                  <select
                    id="script-select"
                    value={selectedScriptId}
                    onChange={(e) => handleScriptChange(e.target.value)}
                    disabled={runningScripts || filteredScripts.length === 0}
                    className="block w-full border border-slate-300 rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 transition-colors"
                  >
                    <option value="">
                      {filteredScripts.length > 0
                        ? `--- Choose from ${filteredScripts.length} script(s) ---`
                        : "No scripts match filter"}
                    </option>
                    {filteredScripts.map((script) => (
                      <option key={script.id} value={script.id}>
                        {script.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedScriptId && (
                  <div className="border-t border-slate-200 pt-6 mt-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4">
                      Device & Authentication
                    </h3>
                    <DeviceAuthFields
                      parameters={scriptParameters[selectedScriptId] || {}}
                      onParamChange={updateCurrentScriptParameters}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={runSingleScript}
                  disabled={!selectedScriptId || runningScripts}
                  className={`mt-8 w-full flex items-center justify-center px-4 py-3 rounded-md text-white text-lg font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${!selectedScriptId || runningScripts ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}
                >
                  {runningScripts ? (
                    <PulseLoader
                      color={"#ffffff"}
                      size={10}
                      speedMultiplier={0.8}
                    />
                  ) : (
                    <>
                      <PlayCircle size={22} className="mr-2" />
                      Run Script
                    </>
                  )}
                </button>
              </div>
            )}

            {(Object.keys(scriptOutputs).length > 0 ||
              (error && runningScripts)) && (
              <div className="mt-10 border border-slate-200 rounded-lg p-6 lg:p-8 bg-white shadow-md">
                <h3 className="text-xl font-semibold mb-4 text-slate-800 flex items-center">
                  <FileCode size={20} className="mr-2 text-slate-500" />
                  Script Output
                </h3>
                <ErrorBoundary>
                  {Object.entries(scriptOutputs).map(
                    ([scriptId, { output, error: scriptError }]) => (
                      <ScriptOutputDisplay
                        key={scriptId}
                        output={output}
                        error={scriptError || error}
                      />
                    ),
                  )}
                  {error && Object.keys(scriptOutputs).length === 0 && (
                    <ScriptOutputDisplay error={error} />
                  )}
                </ErrorBoundary>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default PythonScriptRunner;
