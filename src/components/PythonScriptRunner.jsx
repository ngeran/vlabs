// ====================================================================================
// PAGE: PythonScriptRunner.jsx - FINAL STREAMING VERSION
// ====================================================================================

// ====================================================================================
// SECTION 1: IMPORTS & DEPENDENCIES
// ====================================================================================
import React, { useEffect, useState, useMemo, useCallback } from "react";
import PulseLoader from "react-spinners/PulseLoader";
import toast from "react-hot-toast";
import {
  PlayCircle,
  Layers,
  History,
  X,
  Clock,
  CheckCircle,
  ServerCrash,
} from "lucide-react";

// --- Local Custom Components ---
import RunnerNavBar from "./RunnerNavBar.jsx";
import ScriptOutputDisplay from "./ScriptOutputDisplay.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import DynamicScriptForm from "./DynamicScriptForm.jsx";
import ScriptOptionsRenderer from "./ScriptOptionsRenderer.jsx";
import DeviceAuthFields from "./DeviceAuthFields.jsx";

// --- Local Custom Hooks ---
import { useWebSocket, useScriptRunnerStream } from "../hooks/useWebSocket.jsx";

// ====================================================================================
// SECTION 2: API CONSTANTS
// ====================================================================================
const API_BASE_URL = "http://localhost:3001";

// ====================================================================================
// SECTION 3: HELPER COMPONENTS
// ====================================================================================

function HistoryDrawer({ isOpen, onClose, history, allScripts = [] }) {
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
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 bottom-0 w-full max-w-md bg-white shadow-xl z-50 transform transition-transform ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="p-4 h-full flex flex-col">
          <header className="flex items-center justify-between border-b pb-3 mb-4">
            <h3 className="text-lg font-semibold flex items-center">
              <History size={18} className="mr-2" /> Run History
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-slate-100"
            >
              <X size={20} />
            </button>
          </header>
          <div className="overflow-y-auto flex-1 pr-2 -mr-2">
            {history.length === 0 ? (
              <p className="text-slate-500 italic p-4">No recent runs.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((run) => {
                  const script = allScripts.find((s) => s.id === run.scriptId);
                  const displayName = script?.displayName || run.scriptId;

                  return (
                    <li key={run.runId}>
                      <div className="w-full text-left p-3 rounded-md border bg-white border-slate-200">
                        <div className="flex items-center justify-between font-semibold text-sm text-slate-800">
                          <span className="truncate pr-2">{displayName}</span>
                          {run.isSuccess ? (
                            <CheckCircle
                              size={18}
                              className="text-green-500 flex-shrink-0"
                            />
                          ) : (
                            <ServerCrash
                              size={18}
                              className="text-red-500 flex-shrink-0"
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1.5">
                          <Clock size={12} />
                          <span>
                            {new Date(run.timestamp).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function ScriptOptionsSidebar({ script, parameters, setParameters }) {
  const hasSidebarOptions = script?.capabilities?.dynamicDiscovery;

  return (
    <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
      <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
          <Layers size={18} className="mr-2 text-slate-500" /> Script Options
        </h3>
        {/* This renderer will now handle the JSNAPy options correctly */}
        <ScriptOptionsRenderer
          script={script}
          parameters={parameters}
          setParameters={setParameters}
        />
      </div>
    </aside>
  );
}

// ====================================================================================
// SECTION 4: MAIN PAGE COMPONENT
// ====================================================================================
function PythonScriptRunner() {
  // ----------------------------------------------------------------------------------
  // Subsection 4.1: State Management
  // ----------------------------------------------------------------------------------
  const [allScripts, setAllScripts] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [loadingScripts, setLoadingScripts] = useState(true);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [scriptParameters, setScriptParameters] = useState({});

  const wsContext = useWebSocket({ autoConnect: true });
  const {
    runScript,
    progressEvents,
    finalResult,
    error,
    fullLog,
    isRunning,
    isComplete,
    resetState: resetStreamState,
  } = useScriptRunnerStream(wsContext);

  const isActionInProgress = isRunning;

  // ----------------------------------------------------------------------------------
  // Subsection 4.2: Data Fetching and Effects
  // ----------------------------------------------------------------------------------
  useEffect(() => {
    async function fetchScripts() {
      setLoadingScripts(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/scripts/list`);
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        setAllScripts(data.scripts || []);
      } catch (err) {
        toast.error(`Error loading scripts: ${err.message}`);
      } finally {
        setLoadingScripts(false);
      }
    }
    fetchScripts();
  }, []);

  useEffect(() => {
    if (isHistoryDrawerOpen || isComplete) {
      fetch(`${API_BASE_URL}/api/history/list`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setHistoryItems(data.history || []);
        });
    }
  }, [isHistoryDrawerOpen, isComplete]);

  // ----------------------------------------------------------------------------------
  // Subsection 4.3: Memoized Derived State
  // ----------------------------------------------------------------------------------
  const selectedScript = useMemo(
    () => allScripts.find((s) => s.id === selectedScriptId),
    [allScripts, selectedScriptId],
  );
  const currentParameters = useMemo(
    () => scriptParameters[selectedScriptId] || {},
    [selectedScriptId, scriptParameters],
  );

  const genericParametersToRender = useMemo(() => {
    if (!selectedScript?.parameters) return [];

    // Define parameters that are handled by specialized components
    const handledBySpecialComponent = [
      "hostname",
      "inventory_file",
      "username",
      "password",
      "tests", // Handled by ScriptOptionsRenderer for scripts with dynamicDiscovery
    ];

    return selectedScript.parameters.filter((param) => {
      // Hide if handled by a special UI component
      if (handledBySpecialComponent.includes(param.name)) {
        return false;
      }

      // Handle conditional visibility
      if (param.show_if) {
        const { name, value: conditionValue } = param.show_if;
        return currentParameters[name] === conditionValue;
      }

      return true;
    });
  }, [selectedScript, currentParameters]);

  // ----------------------------------------------------------------------------------
  // Subsection 4.4: Event Handlers & Callbacks
  // ----------------------------------------------------------------------------------
  const handleReset = useCallback(() => {
    setSelectedScriptId("");
    setScriptParameters({});
    resetStreamState();
  }, [resetStreamState]);

  const handleScriptChange = useCallback(
    (id) => {
      setSelectedScriptId(id);
      resetStreamState();
      const script = allScripts.find((s) => s.id === id);
      if (script?.parameters) {
        const defaults = {};
        script.parameters.forEach((p) => {
          if (p.default !== undefined) defaults[p.name] = p.default;
        });
        setScriptParameters((prev) => ({
          ...prev,
          [id]: { ...defaults, ...(prev[id] || {}) },
        }));
      }
    },
    [allScripts, resetStreamState],
  );

  const handleParamChange = useCallback(
    (name, value) => {
      if (!selectedScriptId) return;
      setScriptParameters((prev) => {
        const currentScriptParams = prev[selectedScriptId] || {};
        const newScriptParams = { ...currentScriptParams };
        if (value === undefined || value === null) {
          delete newScriptParams[name];
        } else {
          newScriptParams[name] = value;
        }
        return { ...prev, [selectedScriptId]: newScriptParams };
      });
    },
    [selectedScriptId],
  );

  const updateCurrentScriptParameters = useCallback(
    (newParams) => {
      if (!selectedScriptId) return;
      setScriptParameters((prev) => ({
        ...prev,
        [selectedScriptId]: newParams,
      }));
    },
    [selectedScriptId],
  );

  const handleRunScript = async () => {
    // Standard validation
    const requiredAuthFields = ["username", "password"];
    const missingAuth = requiredAuthFields.filter(
      (field) =>
        !currentParameters[field] ||
        String(currentParameters[field]).trim() === "",
    );
    if (missingAuth.length > 0) {
      return toast.error(`Missing required fields: ${missingAuth.join(", ")}`);
    }

    const hasHostname =
      currentParameters.hostname && currentParameters.hostname.trim() !== "";
    const hasInventory =
      currentParameters.inventory_file &&
      currentParameters.inventory_file.trim() !== "";
    if (!hasHostname && !hasInventory) {
      return toast.error(
        "Please provide a target hostname or an inventory file.",
      );
    }

    // JSNAPy-specific validation
    if (
      selectedScript.capabilities?.dynamicDiscovery &&
      (!currentParameters.tests || currentParameters.tests.length === 0)
    ) {
      return toast.error(
        "Please select at least one test from the sidebar options.",
      );
    }

    // Convert tests array to comma-separated string for the script
    const paramsToSend = { ...currentParameters };
    if (Array.isArray(paramsToSend.tests)) {
      paramsToSend.tests = paramsToSend.tests.join(",");
    }

    try {
      await runScript({
        scriptId: selectedScriptId,
        parameters: paramsToSend,
      });
    } catch (error) {
      console.error("Script execution error:", error);
      toast.error(`Could not run script: ${error.message}`);
    }
  };

  // ----------------------------------------------------------------------------------
  // Subsection 4.5: Main Render Logic
  // ----------------------------------------------------------------------------------
  return (
    <div className="bg-slate-50 min-h-screen">
      <HistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        history={historyItems}
        allScripts={allScripts}
      />
      <RunnerNavBar
        allScripts={allScripts}
        selectedScriptId={selectedScriptId}
        onScriptChange={handleScriptChange}
        isActionInProgress={isActionInProgress}
        onReset={handleReset}
        onViewHistory={() => setIsHistoryDrawerOpen(true)}
        historyItemCount={historyItems.length}
        isWsConnected={wsContext.isConnected}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!selectedScriptId ? (
          <div className="text-center py-24">
            <h2 className="text-2xl font-semibold text-slate-600">
              Please select a script from the navigation bar to begin.
            </h2>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-8">
            <ScriptOptionsSidebar
              script={selectedScript}
              parameters={currentParameters}
              setParameters={updateCurrentScriptParameters}
            />
            <main className="flex-1 space-y-8">
              <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
                <div className="border-b border-slate-200 pb-4 mb-6">
                  <h2 className="text-2xl font-bold text-slate-800">
                    {selectedScript.displayName}
                  </h2>
                  <p className="mt-1 text-slate-600">
                    {selectedScript.description}
                  </p>
                </div>

                <ErrorBoundary>
                  {/* --- ✨ SIMPLIFIED AND CORRECTED: Render based on capability --- */}
                  {selectedScript.capabilities?.deviceAuth && (
                    <DeviceAuthFields
                      parameters={currentParameters}
                      onParamChange={handleParamChange}
                    />
                  )}
                  {/* --- END OF CORRECTION --- */}

                  <div className="border-t border-slate-200 pt-6 mt-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4">
                      Action Details
                    </h3>
                    <DynamicScriptForm
                      parametersToRender={genericParametersToRender}
                      formValues={currentParameters}
                      onParamChange={handleParamChange}
                    />
                  </div>

                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={handleRunScript}
                      disabled={isActionInProgress}
                      className="w-full flex items-center justify-center p-3 bg-blue-600 text-white text-base font-bold rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition-all shadow hover:shadow-lg"
                    >
                      {isActionInProgress ? (
                        <PulseLoader color="#fff" size={8} />
                      ) : (
                        <>
                          <PlayCircle size={20} className="mr-2" /> Run Script
                        </>
                      )}
                    </button>
                  </div>
                </ErrorBoundary>
              </div>

              <ScriptOutputDisplay
                script={selectedScript}
                progressEvents={progressEvents}
                finalResult={finalResult}
                error={error}
                fullLog={fullLog}
                isRunning={isRunning}
                isComplete={isComplete}
              />
            </main>
          </div>
        )}
      </div>
    </div>
  );
}

export default PythonScriptRunner;
