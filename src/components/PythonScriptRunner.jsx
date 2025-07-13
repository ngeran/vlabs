// ====================================================================================
//
// PAGE: PythonScriptRunner.jsx (STABLE & COMPLETE)
//
// ROLE: The application's central tool orchestrator.
//
// DESCRIPTION: This is the definitive, stable, and complete version of the main application
//              component. It orchestrates the entire UI workflow, acting as a "controller" that
//              delegates specific UI rendering to child components. Its behavior is
//              driven entirely by script metadata, making the system scalable and easy
//              to maintain without modifying this file.
//
// KEY FEATURES:
// - Manages all high-level state for tool selection, parameters, and results.
// - Uses a `renderToolUI` function to act as a switchboard, choosing which UI to display.
// - Supports both specialized tools with custom UIs (e.g., TemplateWorkflow) and
//   standard scripts with dynamically generated UIs.
// - A local `ScriptOptionsRenderer` function handles the logic for script-specific
//   sidebar options without requiring new files.
// - Integrates a responsive history panel via the HistoryDrawer component.
//
// ====================================================================================


// ====================================================================================
// SECTION 1: HEADER & IMPORTS
// ====================================================================================

import React, { useEffect, useState, useMemo, useCallback } from "react";
import PulseLoader from "react-spinners/PulseLoader";
import toast from "react-hot-toast";
import { PlayCircle, Layers } from "lucide-react";

// --- Local Custom Components ---
import RunnerNavBar from "./RunnerNavBar.jsx";
import ScriptOutputDisplay from "./ScriptOutputDisplay.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import DynamicScriptForm from "./DynamicScriptForm.jsx";
import DeviceAuthFields from "./DeviceAuthFields.jsx";
import HistoryDrawer from "./HistoryDrawer.jsx";
import TemplateWorkflow from "./TemplateWorkflow.jsx";
import TestSelector from "./TestSelector.jsx";
import ScriptParameterInput from "./ScriptParameterInput.jsx";

// --- Local Custom Hooks ---
import { useWebSocket, useScriptRunnerStream } from "../hooks/useWebSocket.jsx";
import { useTestDiscovery } from "../hooks/useTestDiscovery.jsx";


// ====================================================================================
// SECTION 2: API & CONSTANTS
// ====================================================================================

const API_BASE_URL = "http://localhost:3001";


// ====================================================================================
// SECTION 3: SCOPED CHILD COMPONENTS
//
// To keep the main component clean, helper components used only by this file are
// defined here. This includes the logic for rendering script-specific sidebar options.
// This self-contained approach prevents any external file import/declaration errors.
// ====================================================================================

/**
 * @description Renders the correct UI options in the sidebar based on the selected script's metadata.
 *              This acts as a "switchboard" for the sidebar content.
 * @param {object} props The component props.
 * @returns {JSX.Element|null} The rendered sidebar options UI.
 */
function ScriptOptionsRenderer({ script, parameters, onParamChange }) {
  if (!script) {
    return null;
  }

  // --- JSNAPy Runner Specific UI ---
  if (script.id === 'jsnapy_runner') {
    const { categorizedTests, loading, error } = useTestDiscovery(script.id, parameters.environment);
    const environmentParam = script.parameters.find(p => p.name === 'environment');

    return (
      <div className="space-y-4">
        {environmentParam && <ScriptParameterInput param={environmentParam} value={parameters.environment} onChange={onParamChange} />}
        <hr className="!my-5 border-t border-slate-200" />
        <h3 className="text-sm font-semibold text-slate-700">Available Tests</h3>
        {loading && <p className="text-sm text-slate-500 italic">Discovering tests...</p>}
        {error && <p className="text-sm font-semibold text-red-600">Error: {error}</p>}
        <TestSelector
          categorizedTests={categorizedTests}
          selectedTests={parameters.tests || []}
          onTestToggle={(testId) => {
            const currentTests = parameters.tests || [];
            const newSelection = currentTests.includes(testId)
              ? currentTests.filter((id) => id !== testId)
              : [...currentTests, testId];
            onParamChange("tests", newSelection);
          }}
        />
      </div>
    );
  }

  // --- Backup & Restore Specific UI ---
  if (script.id === 'backup_restore') {
    const commandParam = script.parameters.find(p => p.name === 'command');
    if (!commandParam) {
      return <p className="text-red-500 text-xs">Error: 'command' parameter not defined in metadata.</p>;
    }
    return <ScriptParameterInput param={commandParam} value={parameters.command} onChange={onParamChange} />;
  }

  // --- Default Case for other scripts ---
  // This message is shown for any script that does not have a matching `if` block above.
  return <p className="text-xs text-slate-500 italic">This script has no additional sidebar options.</p>;
}


// ====================================================================================
// SECTION 4: MAIN COMPONENT - PythonScriptRunner
// ====================================================================================

function PythonScriptRunner() {

  // ==================================================================================
  // 4.1: State Management
  // ==================================================================================
  const [allScripts, setAllScripts] = useState([]);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [scriptParameters, setScriptParameters] = useState({});
  const [topLevelError, setTopLevelError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // State specifically for the history feature
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [historyOutput, setHistoryOutput] = useState(null);


  // ==================================================================================
  // 4.2: Custom Hooks
  // ==================================================================================
  const wsContext = useWebSocket({ autoConnect: true });
  const scriptRunner = useScriptRunnerStream(wsContext);
  const isActionInProgress = scriptRunner.isRunning;


  // ==================================================================================
  // 4.3: Data Fetching & Side Effects
  // ==================================================================================

  // Effect to fetch the list of all available tools on initial component mount.
  useEffect(() => {
    const fetchScripts = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/scripts/list`);
            if (!response.ok) throw new Error("Network response was not ok.");
            const data = await response.json();
            if (data.success && Array.isArray(data.scripts)) {
                setAllScripts(data.scripts.filter(s => !s.hidden));
            } else { throw new Error(data.message || "Failed to load scripts."); }
        } catch (error) {
            toast.error(error.message);
            setTopLevelError(error.message);
        } finally {
            setIsLoading(false);
        }
    };
    fetchScripts();
  }, []); // Empty dependency array ensures this runs only once.

  // Effect to fetch the run history from the API when the history drawer is opened.
  useEffect(() => {
    if (isHistoryDrawerOpen) {
      const fetchHistory = async () => {
        setIsLoadingHistory(true);
        try {
          const response = await fetch(`${API_BASE_URL}/api/history/list`);
          const data = await response.json();
          if (data.success) {
            setHistoryItems(data.history || []);
          } else {
            toast.error(data.message || 'Failed to fetch history.');
          }
        } catch (error) {
          toast.error('Could not connect to server to get history.');
        } finally {
          setIsLoadingHistory(false);
        }
      };
      fetchHistory();
    }
  }, [isHistoryDrawerOpen]); // Re-runs only when the drawer is opened.


  // ==================================================================================
  // 4.4: Memoized Derived State for Performance
  // ==================================================================================
  const selectedScript = useMemo(() => allScripts.find(s => s.id === selectedScriptId), [allScripts, selectedScriptId]);
  const currentParameters = useMemo(() => scriptParameters[selectedScriptId] || {}, [selectedScriptId, scriptParameters]);

  // This logic calculates which parameters to show in the main form area for standard scripts.
  const mainParametersToRender = useMemo(() => {
    if (!selectedScript?.parameters) return [];

    // Define all parameter names that are handled by specialized UI components,
    // not by the generic DynamicScriptForm.
    const specialHandledParams = [
        "hostname", "inventory_file", "username", "password", // Handled by DeviceAuthFields
        "tests", "environment"                               // Handled by ScriptOptionsRenderer
    ];

    return selectedScript.parameters.filter(param => {
      // Rule 1: Exclude if it's a special-handled parameter.
      if (specialHandledParams.includes(param.name)) return false;

      // Rule 2: Exclude if it's explicitly designated for the sidebar.
      if (param.layout === 'sidebar') return false;

      // Rule 3: Handle conditional visibility based on other parameters.
      if (param.show_if) {
        const controllingParamValue = currentParameters[param.show_if.name];
        if (controllingParamValue === undefined) return false;
        return controllingParamValue === param.show_if.value;
      }

      // If no exclusion rules match, render the parameter.
      return true;
    });
  }, [selectedScript, currentParameters]);


  // ==================================================================================
  // 4.5: Event Handlers & Callbacks
  // ==================================================================================
  const handleSelectHistoryItem = useCallback((runId) => {
    const item = historyItems.find(h => h.runId === runId);
    if (item) {
      scriptRunner.resetState();
      setSelectedHistoryId(runId);
      setSelectedScriptId(item.scriptId);
      setHistoryOutput({
        progressEvents: [],
        finalResult: item.isSuccess ? JSON.parse(item.output) : null,
        error: item.isSuccess ? null : item.error,
        fullLog: item.isSuccess ? item.output : item.error,
        isComplete: true,
        isRunning: false,
      });
    }
  }, [historyItems, scriptRunner]);

  const handleScriptChange = useCallback((id) => {
    setSelectedHistoryId(null);
    setHistoryOutput(null);
    scriptRunner.resetState();
    setSelectedScriptId(id);
    const script = allScripts.find(s => s.id === id);
    if (script?.parameters) {
        const defaults = {};
        script.parameters.forEach(p => { if (p.default !== undefined) { defaults[p.name] = p.default; }});
        setScriptParameters(prev => ({ ...prev, [id]: defaults }));
    }
  }, [allScripts, scriptRunner]);

  const handleParamChange = useCallback((name, value) => {
    if (!selectedScriptId) return;
    setScriptParameters(prev => ({ ...prev, [selectedScriptId]: { ...(prev[selectedScriptId] || {}), [name]: value }}));
  }, [selectedScriptId]);


  // ==================================================================================
  // 4.6: Action Handlers
  // ==================================================================================
  const handleRunStandardScript = async () => {
    setSelectedHistoryId(null);
    setHistoryOutput(null);
    scriptRunner.resetState();
    const paramsToSend = { ...currentParameters };
    if (Array.isArray(paramsToSend.tests)) {
        paramsToSend.tests = paramsToSend.tests.join(',');
    }
    await scriptRunner.runScript({ scriptId: selectedScriptId, parameters: paramsToSend });
  };


  // ==================================================================================
  // 4.7: Main Render Logic - The Orchestrator
  // ==================================================================================

  /**
   * Renders the appropriate UI for the selected tool based on its metadata.
   */
  const renderToolUI = () => {
    if (!selectedScript) {
      return (
        <div className="text-center py-24 px-6 bg-white rounded-xl shadow-lg shadow-slate-200/50">
          <h2 className="text-2xl font-semibold text-slate-600">Select a tool to begin.</h2>
          <p className="text-slate-500 mt-2">Or view a past run from the history panel.</p>
        </div>
      );
    }

    if (selectedScript.capabilities?.customUI === 'templateWorkflow') {
      return <TemplateWorkflow wsContext={wsContext} />;
    }

    const displayProps = selectedHistoryId ? historyOutput : scriptRunner;
    return (
      <ErrorBoundary>
        <div className="flex flex-col md:flex-row gap-8">
          <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
            <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3"><Layers size={18} className="mr-2 text-slate-500" /> Script Options</h3>
              <ScriptOptionsRenderer
                script={selectedScript}
                parameters={currentParameters}
                onParamChange={handleParamChange}
              />
            </div>
          </aside>
          <main className="flex-1 space-y-8">
            <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
              <header className="border-b border-slate-200 pb-4 mb-6">
                <h2 className="text-2xl font-bold text-slate-800">{selectedScript.displayName}</h2>
                <p className="mt-1 text-slate-600">{selectedScript.description}</p>
              </header>
              <div className="space-y-6">
                {selectedScript.capabilities?.deviceAuth && <DeviceAuthFields parameters={currentParameters} onParamChange={handleParamChange} />}
                <div className="border-t border-slate-200 pt-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Action Details</h3>
                  <DynamicScriptForm parametersToRender={mainParametersToRender} formValues={currentParameters} onParamChange={handleParamChange} />
                </div>
              </div>
              <div className="mt-8 border-t pt-6">
                <button type="button" onClick={handleRunStandardScript} disabled={isActionInProgress} className="w-full flex items-center justify-center p-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-slate-400">
                  {scriptRunner.isRunning ? <PulseLoader color="#fff" size={8} /> : <><PlayCircle size={20} className="mr-2" /> Run Script</>}
                </button>
              </div>
            </div>
            {(displayProps.isRunning || displayProps.isComplete) && <ScriptOutputDisplay {...displayProps} script={selectedScript} />}
          </main>
        </div>
      </ErrorBoundary>
    );
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen"><PulseLoader color="#3b82f6" /></div>;
  }

  return (
    <div className="bg-slate-50 min-h-screen">
      <RunnerNavBar
        allScripts={allScripts}
        selectedScriptId={selectedScriptId}
        onScriptChange={handleScriptChange}
        isActionInProgress={isActionInProgress}
        onReset={() => { /* Implement full reset if needed */ }}
        onViewHistory={() => setIsHistoryDrawerOpen(true)}
        historyItemCount={historyItems.length}
        isWsConnected={wsContext.isConnected}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderToolUI()}
      </div>
      <HistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        history={historyItems}
        isLoading={isLoadingHistory}
        onSelectHistoryItem={handleSelectHistoryItem}
        selectedHistoryId={selectedHistoryId}
      />
    </div>
  );
}

export default PythonScriptRunner;
