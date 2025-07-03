// src/components/PythonScriptRunner.jsx

import React, { useEffect, useState, useMemo } from "react";
import {
  Tag,
  FileCode,
  PlayCircle,
  Layers,
  History,
  Clock,
  ServerCrash,
  CheckCircle,
  X,
} from "lucide-react";
import PulseLoader from "react-spinners/PulseLoader";

// === EXTERNAL COMPONENT DEPENDENCIES (Ensure these files exist) ===
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
 * @param {object} props - Component props.
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
      <p className="text-sm text-slate-500 italic">Discovering tests...</p>
    );
  if (error)
    return <p className="text-sm font-semibold text-red-600">Error: {error}</p>;
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
 * @param {object} props - Component props.
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
 * @description The static sidebar component for filtering scripts and displaying script options.
 * @param {object} props - Component props.
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
                className="flex items-center justify-between text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md p-2 cursor-pointer transition-colors"
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

/**
 * @description A slide-in drawer component for displaying script run history.
 * @param {object} props - Component props.
 */
function HistoryDrawer({
  isOpen,
  onClose,
  history,
  isLoading,
  onSelectHistoryItem,
  selectedHistoryId,
}) {
  useEffect(() => {
    const handleEsc = (event) => {
      if (event.keyCode === 27) onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 bottom-0 w-80 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="p-4 h-full flex flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center">
              <History size={18} className="mr-2 text-slate-500" /> Run History
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors"
            >
              <X size={20} />
            </button>
          </header>
          <div className="overflow-y-auto flex-1 pr-2">
            {isLoading ? (
              <p className="text-sm text-slate-500 p-2">Loading history...</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-slate-500 italic p-2">
                No recent runs found.
              </p>
            ) : (
              <ul className="space-y-1">
                {history.map((run) => (
                  <li key={run.runId}>
                    <button
                      onClick={() => {
                        onSelectHistoryItem(run.runId);
                        onClose();
                      }}
                      className={`w-full text-left p-2 rounded-md hover:bg-slate-100 transition-colors ${selectedHistoryId === run.runId ? "bg-blue-50" : ""}`}
                    >
                      <div className="flex items-center justify-between font-medium text-sm text-slate-800">
                        <span className="truncate">{run.scriptId}</span>
                        {run.isSuccess ? (
                          <CheckCircle size={16} className="text-green-500" />
                        ) : (
                          <ServerCrash size={16} className="text-red-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                        <Clock size={12} />
                        <span>
                          {new Date(run.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ====================================================================================
// === MAIN PAGE COMPONENT ============================================================
// ====================================================================================

function PythonScriptRunner() {
  const [allScripts, setAllScripts] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [scriptParameters, setScriptParameters] = useState({});
  const [scriptOutputs, setScriptOutputs] = useState({});
  const [error, setError] = useState(null);
  const [loadingScripts, setLoadingScripts] = useState(true);
  const [runningScripts, setRunningScripts] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);

  useEffect(() => {
    async function fetchScripts() {
      setLoadingScripts(true);
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

  useEffect(() => {
    async function fetchHistory() {
      setLoadingHistory(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/history/list`);
        const data = await res.json();
        if (data.success) setHistoryItems(data.history || []);
      } catch (err) {
        console.error("Failed to fetch initial history:", err);
      } finally {
        setLoadingHistory(false);
      }
    }
    fetchHistory();
  }, []);

  const filteredScripts = useMemo(() => {
    if (selectedCategories.length === 0) return allScripts;
    return allScripts.filter((s) => selectedCategories.includes(s.category));
  }, [allScripts, selectedCategories]);

  const selectedScript = useMemo(
    () => allScripts.find((s) => s.id === selectedScriptId),
    [allScripts, selectedScriptId],
  );

  const liveScriptParameters = useMemo(() => {
    if (!selectedScriptId) return {};
    return scriptParameters[selectedScriptId] || {};
  }, [selectedScriptId, scriptParameters]);

  const displayedOutput = useMemo(() => {
    if (selectedHistoryId) {
      const historicRun = historyItems.find(
        (h) => h.runId === selectedHistoryId,
      );
      return historicRun
        ? { output: historicRun.output, error: historicRun.error }
        : {};
    }
    return scriptOutputs[selectedScriptId] || {};
  }, [selectedHistoryId, historyItems, scriptOutputs, selectedScriptId]);

  const handleCategoryChange = (newCategories) => {
    setSelectedCategories(newCategories);
    const isStillVisible = allScripts.some(
      (s) =>
        s.id === selectedScriptId &&
        (newCategories.length === 0 || newCategories.includes(s.category)),
    );
    if (!isStillVisible) setSelectedScriptId("");
  };

  const handleScriptChange = (scriptId) => {
    setSelectedScriptId(scriptId);
    setSelectedHistoryId(null);
    setScriptOutputs({});
    setError(null);
  };

  const updateCurrentScriptParameters = (newParams) => {
    if (!selectedScriptId) return;
    setScriptParameters((prev) => ({ ...prev, [selectedScriptId]: newParams }));
  };

  const handleSelectHistoryItem = (runId) => {
    setSelectedHistoryId(runId);
    setSelectedScriptId("");
    setScriptOutputs({});
    setError(null);
  };

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
      if (!res.ok || !data.success)
        throw new Error(data.error || data.message || `Request failed`);
      setScriptOutputs({
        [selectedScriptId]: { output: data.output, error: data.error || null },
      });

      const historyRes = await fetch(`${API_BASE_URL}/api/history/list`);
      const historyData = await historyRes.json();
      if (historyData.success) {
        setHistoryItems(historyData.history);
        setSelectedHistoryId(historyData.history[0]?.runId);
      }
    } catch (err) {
      setError(`Script error: ${err.message}`);
    } finally {
      setRunningScripts(false);
    }
  };

  return (
    <div className="bg-slate-100 min-h-screen rounded-xl">
      <HistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        history={historyItems}
        isLoading={loadingHistory}
        onSelectHistoryItem={handleSelectHistoryItem}
        selectedHistoryId={selectedHistoryId}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-4">
            <ScriptRunnerIcon className="h-10 w-10" />
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-slate-900">
              Script Runner
            </h1>
          </div>
          <button
            onClick={() => setIsHistoryDrawerOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <History size={16} />
            <span>View History</span>
            {historyItems.length > 0 && (
              <span className="bg-blue-600 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">
                {historyItems.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-x-10 gap-y-12">
          <ScriptFilterSidebar
            allScripts={allScripts}
            selectedCategories={selectedCategories}
            onCategoryChange={handleCategoryChange}
            selectedScript={selectedScript}
            scriptParameters={liveScriptParameters}
            setParameters={updateCurrentScriptParameters}
          />

          <main className="flex-1">
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
                  className="block w-full border-slate-300 rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
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
                    parameters={liveScriptParameters}
                    onParamChange={updateCurrentScriptParameters}
                  />
                </div>
              )}

              <button
                type="button"
                onClick={runSingleScript}
                disabled={!selectedScriptId || runningScripts}
                className={`mt-8 w-full flex items-center justify-center px-4 py-3 rounded-md text-white text-lg font-semibold transition-all ${!selectedScriptId || runningScripts ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}
              >
                {runningScripts ? (
                  <PulseLoader color={"#ffffff"} size={10} />
                ) : (
                  <>
                    <PlayCircle size={22} className="mr-2" />
                    Run Script
                  </>
                )}
              </button>
            </div>

            {(Object.keys(displayedOutput).length > 0 ||
              (error && runningScripts)) && (
              <div className="mt-10 border border-slate-200 rounded-lg p-6 lg:p-8 bg-white shadow-md">
                <h3 className="text-xl font-semibold mb-4 text-slate-800 flex items-center">
                  <FileCode size={20} className="mr-2 text-slate-500" />
                  Script Output
                </h3>
                <ErrorBoundary>
                  <ScriptOutputDisplay
                    key={selectedHistoryId || selectedScriptId}
                    output={displayedOutput.output}
                    error={displayedOutput.error}
                  />
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
