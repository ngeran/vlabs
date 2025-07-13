/**
 * Main React component for running Python scripts in a web interface.
 * Manages script selection, parameter input, execution, and output display.
 * Integrates FetchDynamicOptions for dynamic restore fields in backup_restore script.
 */

import React, { useEffect, useState, useMemo, useCallback } from "react";
import PulseLoader from "react-spinners/PulseLoader";
import toast from "react-hot-toast";
import { PlayCircle, Layers } from "lucide-react";
import RunnerNavBar from "./RunnerNavBar.jsx";
import ScriptOutputDisplay from "./ScriptOutputDisplay.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import DynamicScriptForm from "./DynamicScriptForm.jsx";
import DeviceAuthFields from "./DeviceAuthFields.jsx";
import FetchDynamicOptions from "./FetchDynamicOptions.jsx";
import HistoryDrawer from "./HistoryDrawer.jsx";
import TemplateWorkflow from "./TemplateWorkflow.jsx";
import ScriptOptionsRenderer from "./ScriptOptionsRenderer.jsx";
import { useWebSocket, useScriptRunnerStream } from "../hooks/useWebSocket.jsx";

const API_BASE_URL = "http://localhost:3001";

// -----------------------------------
// Main Python Script Runner Component
// -----------------------------------

/**
 * Main component for the Python script runner UI.
 * Handles script selection, parameter management, execution, and history.
 */
function PythonScriptRunner() {
  // State management
  const [allScripts, setAllScripts] = useState([]); // Available scripts
  const [selectedScriptId, setSelectedScriptId] = useState(""); // Currently selected script ID
  const [scriptParameters, setScriptParameters] = useState({}); // Parameters for each script
  const [topLevelError, setTopLevelError] = useState(null); // Top-level error message
  const [isLoading, setIsLoading] = useState(true); // Loading state for scripts
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false); // History drawer visibility
  const [historyItems, setHistoryItems] = useState([]); // Script run history
  const [isLoadingHistory, setIsLoadingHistory] = useState(false); // History loading state
  const [selectedHistoryId, setSelectedHistoryId] = useState(null); // Selected history item ID
  const [historyOutput, setHistoryOutput] = useState(null); // Output of selected history item

  // WebSocket and script runner hooks
  const wsContext = useWebSocket({ autoConnect: true });
  const scriptRunner = useScriptRunnerStream(wsContext);
  const isActionInProgress = scriptRunner.isRunning;

  // -----------------------------------
  // Data Fetching
  // -----------------------------------

  /**
   * Fetch available scripts from the backend on component mount.
   */
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
  }, []);

  /**
   * Fetch script run history when the history drawer is opened.
   */
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
  }, [isHistoryDrawerOpen]);

  // -----------------------------------
  // Computed Values
  // -----------------------------------

  const selectedScript = useMemo(() => allScripts.find(s => s.id === selectedScriptId), [allScripts, selectedScriptId]);
  const currentParameters = useMemo(() => scriptParameters[selectedScriptId] || {}, [selectedScriptId, scriptParameters]);

  /**
   * Filter parameters to render in the main form, excluding sidebar and special parameters.
   */
  const mainParametersToRender = useMemo(() => {
    if (!selectedScript?.parameters) return [];
    const specialHandledParams = ["hostname", "username", "password", "backup_file", "inventory_file"];
    return selectedScript.parameters.filter(param => {
      if (specialHandledParams.includes(param.name)) return false;
      if (param.layout === 'sidebar') return false;
      if (param.show_if) {
        const controllingParamValue = currentParameters[param.show_if.name];
        if (controllingParamValue === undefined) return false;
        return controllingParamValue === param.show_if.value;
      }
      return true;
    });
  }, [selectedScript, currentParameters]);

  // -----------------------------------
  // Event Handlers
  // -----------------------------------

  /**
   * Handle selection of a history item to display its output.
   * @param {string} runId - ID of the history item.
   */
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

  /**
   * Handle script selection change.
   * @param {string} id - ID of the selected script.
   */
  const handleScriptChange = useCallback((id) => {
    setSelectedHistoryId(null);
    setHistoryOutput(null);
    scriptRunner.resetState();
    setSelectedScriptId(id);
    const script = allScripts.find(s => s.id === id);
    if (script?.parameters) {
      const defaults = {};
      script.parameters.forEach(p => { if (p.default !== undefined) { defaults[p.name] = p.default; } });
      setScriptParameters(prev => ({ ...prev, [id]: defaults }));
    }
  }, [allScripts, scriptRunner]);

  /**
   * Update a script parameter.
   * @param {string} name - Parameter name.
   * @param {any} value - Parameter value.
   */
  const handleParamChange = useCallback((name, value) => {
    if (!selectedScriptId) return;
    setScriptParameters(prev => ({ ...prev, [selectedScriptId]: { ...(prev[selectedScriptId] || {}), [name]: value } }));
  }, [selectedScriptId]);

  /**
   * Execute a standard script with current parameters.
   */
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

  // -----------------------------------
  // UI Rendering
  // -----------------------------------

  /**
   * Render the main UI based on the selected script and state.
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
          {/* Sidebar */}
          <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
            <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
                <Layers size={18} className="mr-2 text-slate-500" /> Script Options
              </h3>
              <ScriptOptionsRenderer
                script={selectedScript}
                parameters={currentParameters}
                onParamChange={handleParamChange}
              />
            </div>
          </aside>
          {/* Main Content */}
          <main className="flex-1 space-y-8">
            <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
              <header className="border-b border-slate-200 pb-4 mb-6">
                <h2 className="text-2xl font-bold text-slate-800">{selectedScript.displayName}</h2>
                <p className="mt-1 text-slate-600">{selectedScript.description}</p>
              </header>
              <div className="space-y-6">
                {selectedScript.capabilities?.deviceAuth && (
                  <>
                    <DeviceAuthFields
                      script={selectedScript}
                      parameters={currentParameters}
                      onParamChange={handleParamChange}
                    />
                    <FetchDynamicOptions
                      script={selectedScript}
                      parameters={currentParameters}
                      onParamChange={handleParamChange}
                    />
                  </>
                )}
                <div className="border-t border-slate-200 pt-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Action Details</h3>
                  <DynamicScriptForm
                    parametersToRender={mainParametersToRender}
                    formValues={currentParameters}
                    onParamChange={handleParamChange}
                  />
                </div>
              </div>
              <div className="mt-8 border-t pt-6">
                <button
                  type="button"
                  onClick={handleRunStandardScript}
                  disabled={isActionInProgress}
                  className="w-full flex items-center justify-center p-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition duration-150 ease-in-out"
                >
                  {scriptRunner.isRunning ? <PulseLoader color="#fff" size={8} /> : (
                    <>
                      <PlayCircle size={20} className="mr-2" /> Run Script
                    </>
                  )}
                </button>
              </div>
            </div>
            {(displayProps.isRunning || displayProps.isComplete) && (
              <ScriptOutputDisplay {...displayProps} script={selectedScript} />
            )}
          </main>
        </div>
      </ErrorBoundary>
    );
  };

  // Render loading state
  if (isLoading) {
    return <div className="flex justify-center items-center h-screen"><PulseLoader color="#3b82f6" /></div>;
  }

  // Render main UI
  return (
    <div className="bg-slate-50 min-h-screen">
      <RunnerNavBar
        allScripts={allScripts}
        selectedScriptId={selectedScriptId}
        onScriptChange={handleScriptChange}
        isActionInProgress={isActionInProgress}
        onReset={() => {}}
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
