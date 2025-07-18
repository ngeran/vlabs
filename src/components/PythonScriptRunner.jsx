// src/components/PythonScriptRunner.jsx
// ====================================================================================
// FILE: PythonScriptRunner.jsx (with RealTimeDisplay Integration)
// ====================================================================================
//
// Description: This updated version integrates the new RealTimeDisplay component for
//              live script executions, providing a rich, step-by-step visual log.
//              It retains the original ScriptOutputDisplay for viewing historical runs.
//
// ====================================================================================

import React, { useEffect, useState, useMemo, useCallback } from "react";
import PulseLoader from "react-spinners/PulseLoader";
import toast from "react-hot-toast";
import { PlayCircle, Layers } from "lucide-react";

// Child component imports
import RunnerNavBar from "./RunnerNavBar.jsx";
import ScriptOutputDisplay from "./ScriptOutputDisplay.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import DynamicScriptForm from "./DynamicScriptForm.jsx";
import DeviceAuthFields from "./DeviceAuthFields.jsx";
import FetchDynamicOptions from "./FetchDynamicOptions.jsx";
import HistoryDrawer from "./HistoryDrawer.jsx";
import TemplateWorkflow from "./TemplateWorkflow.jsx";
import ScriptOptionsRenderer from "./ScriptOptionsRenderer.jsx";
import RunnerDashboard from "./RunnerDashboard.jsx";
// +++ ADD THIS IMPORT +++
import RealTimeDisplay from './RealTimeProgress/RealTimeDisplay.jsx';

// Custom hook imports
import { useWebSocket, useScriptRunnerStream } from "../hooks/useWebSocket.jsx";
import { useHistoryUpdates } from "../hooks/useHistoryUpdates.js";

const API_BASE_URL = "http://localhost:3001";

// ==================================================================================
// SECTION 1: Main Component Definition
// ==================================================================================
/**
 * PythonScriptRunner is the top-level component that manages the script runner
 * application's state and UI. It handles script selection, parameter input, script
 * execution, history management via HistoryDrawer, and WebSocket integration for
 * real-time updates.
 */
function PythonScriptRunner() {
  // ==================================================================================
  // SECTION 2: State Management
  // ==================================================================================
  const [allScripts, setAllScripts] = useState([]);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [scriptParameters, setScriptParameters] = useState({});
  const [topLevelError, setTopLevelError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [historyOutput, setHistoryOutput] = useState(null);

  const { history: historyItems, isLoading: isLoadingHistory } = useHistoryUpdates({
    websocketService: useWebSocket({ autoConnect: true }).websocketService,
  });

  // ==================================================================================
  // SECTION 3: WebSocket and Script Execution Hooks
  // ==================================================================================
  const wsContext = useWebSocket({ autoConnect: true });
  const scriptRunner = useScriptRunnerStream(wsContext); // This hook provides all the real-time state
  const isActionInProgress = scriptRunner.isRunning;

  // ==================================================================================
  // SECTION 4: Data Fetching Effects
  // ==================================================================================
  useEffect(() => {
    const fetchScripts = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/scripts/list`);
        if (!response.ok) throw new Error("Network response was not ok.");
        const data = await response.json();
        if (data.success && Array.isArray(data.scripts)) {
          const visibleScripts = data.scripts.filter((s) => !s.hidden);
          setAllScripts(visibleScripts);
        } else {
          throw new Error(data.message || "Failed to load scripts.");
        }
      } catch (error) {
        toast.error(error.message);
        setTopLevelError(error.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchScripts();
  }, []);

  // ==================================================================================
  // SECTION 5: Memoized Computations
  // ==================================================================================
  const selectedScript = useMemo(() => {
    return allScripts.find((s) => s.id === selectedScriptId);
  }, [allScripts, selectedScriptId]);

  const currentParameters = useMemo(() => {
    return scriptParameters[selectedScriptId] || {};
  }, [selectedScriptId, scriptParameters]);

  const mainParametersToRender = useMemo(() => {
    if (!selectedScript?.parameters) return [];
    const specialHandledParams = ["hostname", "username", "password", "backup_file", "inventory_file"];
    return selectedScript.parameters.filter((param) => {
      if (specialHandledParams.includes(param.name) || param.layout === "sidebar") return false;
      if (param.show_if) {
        return currentParameters[param.show_if.name] === param.show_if.value;
      }
      return true;
    });
  }, [selectedScript, currentParameters]);

  // ==================================================================================
  // SECTION 6: Event Handlers
  // ==================================================================================
  const handleSelectHistoryItem = useCallback((runId) => {
    const item = historyItems.find((h) => h.runId === runId);
    if (item) {
      scriptRunner.resetState();
      setSelectedHistoryId(runId);
      setSelectedScriptId(item.scriptId);
      // Set the static output for the old display component
      setHistoryOutput({
        finalResult: item.isSuccess ? JSON.parse(item.output) : null,
        error: item.isSuccess ? null : item.error,
        fullLog: item.isSuccess ? item.output : item.error,
        isComplete: true,
        isRunning: false,
        progressEvents: [], // Historical runs don't have progress events
      });
    }
  },[historyItems, scriptRunner]);

  const handleScriptChange = useCallback((id) => {
      setSelectedHistoryId(null);
      setHistoryOutput(null);
      scriptRunner.resetState();
      setSelectedScriptId(id);
      const script = allScripts.find((s) => s.id === id);
      if (script?.parameters) {
        const defaults = {};
        script.parameters.forEach((p) => {
          if (p.default !== undefined) defaults[p.name] = p.default;
        });
        setScriptParameters((prev) => ({ ...prev, [id]: { ...defaults, ...(prev[id] || {}) } }));
      }
    }, [allScripts, scriptRunner]);

  const handleParamChange = useCallback((name, value) => {
      if (!selectedScriptId) return;
      setScriptParameters((prev) => ({...prev, [selectedScriptId]: { ...(prev[selectedScriptId] || {}), [name]: value }}));
    }, [selectedScriptId]);

  const handleRunStandardScript = useCallback(async () => {
    setSelectedHistoryId(null);
    setHistoryOutput(null);
    scriptRunner.resetState();
    const paramsToSend = { ...currentParameters };
    if (Array.isArray(paramsToSend.tests)) {
      paramsToSend.tests = paramsToSend.tests.join(",");
    }
    try {
      await scriptRunner.runScript({ scriptId: selectedScriptId, parameters: paramsToSend });
    } catch (error) {
      toast.error("Failed to start script execution.");
    }
  }, [selectedScriptId, currentParameters, scriptRunner]);

  const handleViewHistory = useCallback(() => {
    setIsHistoryDrawerOpen((prev) => !prev);
  }, []);

  const handleResetAndClear = useCallback(() => {
    scriptRunner.resetState();
    // Potentially clear other related states if needed
  }, [scriptRunner]);


  // ==================================================================================
  // SECTION 7: UI Rendering Logic
  // ==================================================================================
  const renderToolUI = () => {
    if (!selectedScript) {
      return <RunnerDashboard />;
    }

    if (selectedScript.capabilities?.customUI === "templateWorkflow") {
      return <TemplateWorkflow wsContext={wsContext} />;
    }

    // --- RENDER LOGIC HAS BEEN UPDATED HERE ---
    return (
      <ErrorBoundary>
        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar for Script Options */}
          <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
            <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
                <Layers size={18} className="mr-2 text-slate-500" /> Script Options
              </h3>
              <ScriptOptionsRenderer script={selectedScript} parameters={currentParameters} onParamChange={handleParamChange}/>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 space-y-8">
            <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
              <header className="border-b border-slate-200 pb-4 mb-6">
                <h2 className="text-2xl font-bold text-slate-800">{selectedScript.displayName}</h2>
                <p className="mt-1 text-slate-600">{selectedScript.description}</p>
              </header>

              <div className="space-y-6">
                {selectedScript.capabilities?.deviceAuth && (
                  <>
                    <DeviceAuthFields script={selectedScript} parameters={currentParameters} onParamChange={handleParamChange} />
                    <FetchDynamicOptions script={selectedScript} parameters={currentParameters} onParamChange={handleParamChange} />
                  </>
                )}
                <div className="border-t border-slate-200 pt-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Action Details</h3>
                  <DynamicScriptForm parametersToRender={mainParametersToRender} formValues={currentParameters} onParamChange={handleParamChange}/>
                </div>
              </div>

              <div className="mt-8 border-t pt-6">
                <button type="button" onClick={handleRunStandardScript} disabled={isActionInProgress}
                  className="w-full flex items-center justify-center p-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition duration-150 ease-in-out">
                  {isActionInProgress ? <PulseLoader color="#fff" size={8} /> : <><PlayCircle size={20} className="mr-2" /> Run Script</>}
                </button>
              </div>
            </div>

            {/* +++ UPDATED OUTPUT DISPLAY LOGIC +++ */}
            <div className="mt-8">
              {selectedHistoryId ? (
                // For historical runs, use the existing static component
                <ScriptOutputDisplay {...historyOutput} script={selectedScript} />
              ) : (
                // For live runs, use the new real-time component.
                // It's crucial that your useScriptRunnerStream hook provides all these props.
                <RealTimeDisplay
                  isActive={scriptRunner.isRunning || scriptRunner.isComplete}
                  isRunning={scriptRunner.isRunning}
                  isComplete={scriptRunner.isComplete}
                  hasError={scriptRunner.hasError}
                  progress={scriptRunner.progress}
                  result={scriptRunner.result}
                  error={scriptRunner.error}
                  totalSteps={scriptRunner.totalSteps}
                  completedSteps={scriptRunner.completedSteps}
                  progressPercentage={scriptRunner.progressPercentage}
                  latestMessage={scriptRunner.latestMessage}
                  canReset={!scriptRunner.isRunning && scriptRunner.isComplete}
                  onReset={handleResetAndClear} // Use the new handler
                />
              )}
            </div>
            {/* +++ END OF UPDATED LOGIC +++ */}

          </main>
        </div>
      </ErrorBoundary>
    );
  };

  // ==================================================================================
  // SECTION 8: Main Render
  // ==================================================================================
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
        onReset={() => handleScriptChange("")}
        onViewHistory={handleViewHistory}
        historyItemCount={historyItems.length}
        isWsConnected={wsContext.isConnected}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderToolUI()}
      </div>
      <HistoryDrawer
        history={historyItems}
        isLoading={isLoadingHistory}
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        onSelectHistoryItem={handleSelectHistoryItem}
        selectedHistoryId={selectedHistoryId}
      />
    </div>
  );
}

export default PythonScriptRunner;
