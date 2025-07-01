// src/components/PythonScriptRunner.jsx

import React, { useEffect, useState, useMemo } from "react";
import { Tag, FileCode, PlayCircle } from "lucide-react";

// Import all necessary components
import JSNAPyForm from "./JSNAPyForm";
import DeviceAuthFields from "./DeviceAuthFields";
import ScriptOutputDisplay from "./ScriptOutputDisplay";
import ErrorBoundary from "./ErrorBoundary";

const API_BASE_URL = "http://localhost:3001";

// --- Internal Component: ScriptFilterSidebar ---
function ScriptFilterSidebar({
  allScripts,
  selectedCategories,
  onCategoryChange,
}) {
  const { uniqueCategories, scriptCounts } = useMemo(() => {
    const counts = {};
    allScripts.forEach((script) => {
      if (script.category) {
        counts[script.category] = (counts[script.category] || 0) + 1;
      }
    });
    const categories = Object.keys(counts).sort();
    return { uniqueCategories: categories, scriptCounts: counts };
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
      <div className="sticky top-24">
        <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-200 pb-2 flex items-center">
          <Tag size={18} className="mr-2 text-slate-500" />
          Filter by Category
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
    </aside>
  );
}

// --- Internal Component: ScriptSelector ---
function ScriptSelector({
  scripts,
  selectedScriptId,
  onScriptChange,
  disabled,
}) {
  return (
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
        onChange={(e) => onScriptChange(e.target.value)}
        disabled={disabled || scripts.length === 0}
        className="block w-full border border-slate-300 rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 transition-colors"
      >
        <option value="">
          {scripts.length > 0
            ? `--- Choose from ${scripts.length} available script(s) ---`
            : "No scripts match filter"}
        </option>
        {scripts.map((script) => (
          <option key={script.id} value={script.id}>
            {script.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}

// --- Main Page Component ---
function PythonScriptRunner() {
  const [allScripts, setAllScripts] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [scriptParameters, setScriptParameters] = useState({});
  const [scriptOutputs, setScriptOutputs] = useState({});
  const [error, setError] = useState(null);
  const [loadingScripts, setLoadingScripts] = useState(true);
  const [runningScripts, setRunningScripts] = useState(false);

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

  const filteredScripts = useMemo(() => {
    if (selectedCategories.length === 0) return allScripts;
    return allScripts.filter((script) =>
      selectedCategories.includes(script.category),
    );
  }, [allScripts, selectedCategories]);

  const selectedScript = useMemo(() => {
    return allScripts.find((script) => script.id === selectedScriptId);
  }, [allScripts, selectedScriptId]);

  const handleCategoryChange = (newCategories) => {
    setSelectedCategories(newCategories);
    const isStillVisible = allScripts.some(
      (script) =>
        script.id === selectedScriptId &&
        (newCategories.length === 0 || newCategories.includes(script.category)),
    );
    if (!isStillVisible) {
      setSelectedScriptId("");
    }
  };

  const handleScriptChange = (scriptId) => {
    setSelectedScriptId(scriptId);
    setScriptOutputs({});
    setError(null);
  };

  const updateCurrentScriptParameters = (newParams) => {
    if (!selectedScriptId) return;
    setScriptParameters((prev) => ({ ...prev, [selectedScriptId]: newParams }));
  };

  const runSingleScript = async () => {
    if (!selectedScriptId) return alert("Please select a script.");
    const params = scriptParameters[selectedScriptId] || {};
    const payload = {
      scriptId: selectedScriptId,
      parameters: {
        ...params,
        tests: Array.isArray(params.tests)
          ? params.tests.join(",")
          : params.tests,
        hostname: params.hostname
          ? params.hostname.split("\n").join(",")
          : undefined,
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
      if (!res.ok || !data.success)
        throw new Error(
          data.message || `Request failed with status ${res.status}`,
        );
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
    <div className="bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 mb-10 text-center">
          Python Script Runner
        </h1>

        <div className="flex flex-col md:flex-row gap-x-10 gap-y-12">
          <ScriptFilterSidebar
            allScripts={allScripts}
            selectedCategories={selectedCategories}
            onCategoryChange={handleCategoryChange}
          />

          <main className="flex-1">
            {loadingScripts && (
              <p className="text-center text-slate-500">
                Loading available scripts...
              </p>
            )}
            {error && !runningScripts && (
              <div className="bg-red-100 border border-red-200 text-red-800 p-4 rounded-lg mb-6">
                <strong>Error:</strong> {error}
              </div>
            )}

            {!loadingScripts && allScripts.length > 0 ? (
              <div className="mb-8 border border-slate-200 rounded-lg p-6 lg:p-8 shadow-md bg-white">
                <ScriptSelector
                  scripts={filteredScripts}
                  selectedScriptId={selectedScriptId}
                  onScriptChange={handleScriptChange}
                  disabled={runningScripts}
                />

                {selectedScriptId && (
                  <div className="border-t border-slate-200 pt-6 mt-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4">
                      Script Inputs
                    </h3>
                    {selectedScript.id === "run_jsnapy_tests" ||
                    selectedScript.id === "jsnapy_runner" ? (
                      <JSNAPyForm
                        parameters={scriptParameters[selectedScriptId] || {}}
                        setParameters={updateCurrentScriptParameters}
                      />
                    ) : (
                      <DeviceAuthFields
                        parameters={scriptParameters[selectedScriptId] || {}}
                        setParameters={updateCurrentScriptParameters}
                      />
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={runSingleScript}
                  disabled={!selectedScriptId || runningScripts}
                  className={`mt-8 w-full flex items-center justify-center px-4 py-3 rounded-md text-white text-lg font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${!selectedScriptId || runningScripts ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}
                >
                  {runningScripts ? (
                    "Running..."
                  ) : (
                    <>
                      <PlayCircle size={22} className="mr-2" />
                      Run Script
                    </>
                  )}
                </button>
              </div>
            ) : (
              !loadingScripts && (
                <div className="text-center p-8 border-2 border-dashed border-slate-300 rounded-lg">
                  <p className="text-slate-500">No scripts found.</p>
                </div>
              )
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
