// =================================================================================================
//
// PAGE: PythonScriptRunner.jsx
//
// ROLE: The main orchestrator page for running all Python-based tools.
//
// DESCRIPTION: This component serves as the primary user interface for script execution. It's
//              designed to be a "dummy" container that inspects the metadata of the
//              selected script and then conditionally renders the correct workflow.
//
// WORKFLOWS SUPPORTED:
//   1. Standard Script Workflow: For typical scripts (like JSNAPy, Backup/Restore), it
//      renders a dynamic form based on the script's `metadata.yml` file. It uses
//      reusable child components like `DeviceAuthFields` and `DynamicScriptForm`.
//
//   2. Template Generation Workflow: For scripts with the `templateGeneration` capability,
//      it renders the specialized `TemplateWorkflow` component, which handles the entire
//      process of selecting, configuring, generating, and applying a configuration template.
//
// =================================================================================================

// =================================================================================================
// SECTION 1: IMPORTS & DEPENDENCIES
// =================================================================================================

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

// --- Local Custom Components (Building Blocks) ---
import RunnerNavBar from "./RunnerNavBar.jsx";
import ScriptOutputDisplay from "./ScriptOutputDisplay.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import DynamicScriptForm from "./DynamicScriptForm.jsx";
import ScriptOptionsRenderer from "./ScriptOptionsRenderer.jsx";
import DeviceAuthFields from "./DeviceAuthFields.jsx";
import TemplateWorkflow from "./TemplateWorkflow.jsx"; // The specialized UI for templates

// --- Local Custom Hooks (State and Logic) ---
import { useWebSocket, useScriptRunnerStream } from "../hooks/useWebSocket.jsx";

// =================================================================================================
// SECTION 2: CONFIGURATION CONSTANTS
// =================================================================================================

const API_BASE_URL = "http://localhost:3001";

// =================================================================================================
// SECTION 3: HELPER & CHILD COMPONENTS
// These are defined here for clarity but could be moved to separate files.
// =================================================================================================

/**
 * @description Renders a slide-out drawer displaying the history of script runs.
 */
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
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 bottom-0 w-full max-w-md bg-white shadow-xl z-50 transform transition-transform ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
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
                            <CheckCircle size={18} className="text-green-500 flex-shrink-0" />
                          ) : (
                            <ServerCrash size={18} className="text-red-500 flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1.5">
                          <Clock size={12} />
                          <span>{new Date(run.timestamp).toLocaleString()}</span>
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

/**
 * @description Renders a sidebar for scripts that have special, dynamic options
 *              (e.g., JSNAPy test discovery).
 */
function ScriptOptionsSidebar({ script, parameters, onParamChange }) {
  // This sidebar only appears if the script's metadata signals it's needed.
  if (!script?.capabilities?.dynamicDiscovery) {
    return null;
  }
  return (
    <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
      <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
          <Layers size={18} className="mr-2 text-slate-500" /> Script Options
        </h3>
        <ScriptOptionsRenderer
          script={script}
          parameters={parameters}
          onParamChange={onParamChange}
        />
      </div>
    </aside>
  );
}

// =================================================================================================
// SECTION 4: MAIN PAGE COMPONENT - PythonScriptRunner
// =================================================================================================

function PythonScriptRunner() {
  // -----------------------------------------------------------------------------------------------
  // Subsection 4.1: State Management
  // -----------------------------------------------------------------------------------------------

  const [allScripts, setAllScripts] = useState([]);
  const [loadingScripts, setLoadingScripts] = useState(true);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [scriptParameters, setScriptParameters] = useState({});
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);

  // -----------------------------------------------------------------------------------------------
  // Subsection 4.2: Custom Hooks
  // -----------------------------------------------------------------------------------------------

  const wsContext = useWebSocket({ autoConnect: true });
  const { runScript, isRunning, isComplete, resetState: resetStreamState, ...streamState } = useScriptRunnerStream(wsContext);

  // -----------------------------------------------------------------------------------------------
  // Subsection 4.3: Data Fetching & Effects
  // -----------------------------------------------------------------------------------------------

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/scripts/list`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAllScripts(data.scripts || []);
        else toast.error(data.message || "Failed to load scripts.");
      })
      .catch((err) => toast.error(`Network Error: ${err.message}`))
      .finally(() => setLoadingScripts(false));
  }, []);

  useEffect(() => {
    if (isHistoryDrawerOpen) {
      fetch(`${API_BASE_URL}/api/history/list`)
        .then((res) => res.json())
        .then((data) => { if (data.success) setHistoryItems(data.history || []); });
    }
  }, [isHistoryDrawerOpen]);

  // -----------------------------------------------------------------------------------------------
  // Subsection 4.4: Memoized Derived State & Logic (The "Brain" of the Component)
  // -----------------------------------------------------------------------------------------------

  const selectedScript = useMemo(() => allScripts.find((s) => s.id === selectedScriptId), [allScripts, selectedScriptId]);
  const isTemplateWorkflow = useMemo(() => selectedScript?.capabilities?.templateGeneration === true, [selectedScript]);
  const currentParameters = useMemo(() => scriptParameters[selectedScriptId] || {}, [selectedScriptId, scriptParameters]);

  const genericParametersToRender = useMemo(() => {
    if (!selectedScript?.parameters) return [];

    const specialParams = ["hostname", "inventory_file", "username", "password", "tests"];

    return selectedScript.parameters.filter(param => {
      if (specialParams.includes(param.name)) return false;

      if (param.show_if) {
        const { name: conditionName, value: conditionValue } = param.show_if;
        if (currentParameters[conditionName] !== conditionValue) return false;
      }

      return true;
    });
  }, [selectedScript, currentParameters]);

  // -----------------------------------------------------------------------------------------------
  // Subsection 4.5: Event Handlers & Callbacks
  // -----------------------------------------------------------------------------------------------

  const handleScriptChange = useCallback((id) => {
    setSelectedScriptId(id);
    resetStreamState();

    if (!scriptParameters[id]) {
      const script = allScripts.find(s => s.id === id);
      if (script?.parameters) {
        const defaults = {};
        script.parameters.forEach(p => {
          defaults[p.name] = p.default ?? (p.type === 'boolean' ? false : '');
        });
        setScriptParameters(prev => ({ ...prev, [id]: defaults }));
      }
    }
  }, [allScripts, scriptParameters, resetStreamState]);

  const handleParamChange = useCallback((name, value) => {
    if (!selectedScriptId) return;
    setScriptParameters(prev => ({
      ...prev,
      [selectedScriptId]: { ...(prev[selectedScriptId] || {}), [name]: value },
    }));
  }, [selectedScriptId]);

  const handleRunScript = async () => {
    const paramsToSend = { ...currentParameters };
    if (Array.isArray(paramsToSend.tests)) {
      paramsToSend.tests = paramsToSend.tests.join(",");
    }
    await runScript({ scriptId: selectedScriptId, parameters: paramsToSend });
  };

  // -----------------------------------------------------------------------------------------------
  // Subsection 4.6: Main Render Logic
  // -----------------------------------------------------------------------------------------------

  return (
    <div className="bg-slate-50 min-h-screen">
      <RunnerNavBar
        allScripts={allScripts}
        selectedScriptId={selectedScriptId}
        onScriptChange={handleScriptChange}
        isActionInProgress={isRunning}
        onReset={() => { setSelectedScriptId(""); resetStreamState(); }}
        onViewHistory={() => setIsHistoryDrawerOpen(true)}
        historyItemCount={historyItems.length}
        isWsConnected={wsContext.isConnected}
      />
      <HistoryDrawer isOpen={isHistoryDrawerOpen} onClose={() => setIsHistoryDrawerOpen(false)} history={historyItems} allScripts={allScripts} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!selectedScriptId ? (
          <div className="text-center py-24"><h2 className="text-2xl font-semibold text-slate-600">Select a tool from the navigation to begin.</h2></div>
        ) : (
          <ErrorBoundary>
            {isTemplateWorkflow ? (
              // --- WORKFLOW #1: Render the specialized UI for Configuration Templates. ---
              <TemplateWorkflow wsContext={wsContext} />
            ) : (
              // --- WORKFLOW #2: Render the standard layout for all other scripts. ---
              <div className="flex flex-col md:flex-row gap-8">
                <ScriptOptionsSidebar
                  script={selectedScript}
                  parameters={currentParameters}
                  onParamChange={handleParamChange}
                />
                <main className="flex-1 space-y-8">
                  <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
                    <header className="border-b border-slate-200 pb-4 mb-6">
                      <h2 className="text-2xl font-bold text-slate-800">{selectedScript.displayName}</h2>
                      <p className="mt-1 text-slate-600">{selectedScript.description}</p>
                    </header>
                    <div className="space-y-6">
                      {selectedScript.capabilities?.deviceAuth && (
                        <DeviceAuthFields
                          parameters={currentParameters}
                          onParamChange={handleParamChange}
                        />
                      )}
                      <div className="border-t border-slate-200 pt-6">
                        <h3 className="text-lg font-semibold text-slate-800 mb-4">
                          Action Details
                        </h3>
                        <DynamicScriptForm
                          parametersToRender={genericParametersToRender}
                          formValues={currentParameters}
                          onParamChange={handleParamChange}
                        />
                      </div>
                    </div>
                    <div className="mt-8 border-t pt-6">
                      <button type="button" onClick={handleRunScript} disabled={isRunning} className="w-full flex items-center justify-center p-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-slate-400">
                        {isRunning ? <PulseLoader color="#fff" size={8} /> : <><PlayCircle size={20} className="mr-2" /> Run Script</>}
                      </button>
                    </div>
                  </div>
                  {(isRunning || isComplete) && <ScriptOutputDisplay isRunning={isRunning} isComplete={isComplete} {...streamState} />}
                </main>
              </div>
            )}
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

export default PythonScriptRunner;
