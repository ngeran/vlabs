// =================================================================================================
// COMPONENT: PythonScriptRunner.jsx
//
// ROLE:
//   This component serves as the top-level orchestrator and router for the entire script execution
//   interface. It is the central nervous system that manages application state, user selections,
//   and decides which specialized UI ("runner") to display to the user.
//
// DESCRIPTION:
//   - Fetches the master list of all available scripts on initial load.
//   - Manages state for the currently selected script and all associated parameters.
//   - Implements a hybrid routing system:
//     1. Prioritizes a `runnerComponent` key in a script's metadata for new, refactored components.
//     2. Falls back to a `switch` statement based on script `id` for backward compatibility with
//        legacy, self-contained components like TemplateWorkflow and JsnapyRunner.
//
// DEPENDENCIES:
//   - React Hooks: (useState, useEffect, useMemo, useCallback) for state and lifecycle management.
//   - Custom Components: All possible runners and UI elements it can display.
//   - Custom Hooks: (useWebSocket, useHistoryUpdates) for core services.
// =================================================================================================

// SECTION 1: IMPORTS
// -------------------------------------------------------------------------------------------------
// All necessary libraries and components are imported here.

import React, { useEffect, useState, useMemo, useCallback } from "react";
import PulseLoader from "react-spinners/PulseLoader";
import toast from "react-hot-toast";

// --- High-Level UI Components ---
import RunnerNavBar from "./RunnerNavBar.jsx";
import RunnerDashboard from "./RunnerDashboard.jsx";
import ScriptOutputDisplay from "./ScriptOutputDisplay.jsx";
import HistoryDrawer from "./HistoryDrawer.jsx";

// --- Specialized "Feature Runner" Components ---
// These are the components that the router will choose between.
import BackupAndRestoreRunner from './runners/BackupAndRestoreRunner.jsx';
import CodeUpgradeRunner from './runners/CodeUpgradeRunner.jsx';
import GenericScriptRunner from "./GenericScriptRunner.jsx";
import JsnapyRunner from "./JsnapyRunner.jsx";
import TemplateWorkflow from "./TemplateWorkflow.jsx"; // <-- THIS IMPORT IS RESTORED

// --- Core Application Hooks ---
import { useWebSocket } from "../hooks/useWebSocket.jsx";
import { useHistoryUpdates } from "../hooks/useHistoryUpdates.js";


// =================================================================================================
// SECTION 2: COMPONENT-LEVEL CONSTANTS
// -------------------------------------------------------------------------------------------------

const API_BASE_URL = "http://localhost:3001";

/**
 * A mapping from the string identifier in the metadata (`runnerComponent`) to the
 * actual, imported React component. This is the core of the new routing system.
 */
const RUNNER_MAP = {
  BackupAndRestoreRunner,
  CodeUpgradeRunner,
};


// =================================================================================================
// SECTION 3: MAIN COMPONENT DEFINITION & STATE MANAGEMENT
// -------------------------------------------------------------------------------------------------

function PythonScriptRunner() {
  // --- State Declarations ---
  const [allScripts, setAllScripts] = useState([]);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [scriptParameters, setScriptParameters] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [historyOutput, setHistoryOutput] = useState(null);

  // --- Hooks for Core Services ---
  const wsContext = useWebSocket({ autoConnect: true });
  const { history: historyItems, isLoading: isLoadingHistory } = useHistoryUpdates({
    websocketService: wsContext.websocketService,
  });

  // =================================================================================================
  // SECTION 4: DATA FETCHING & INITIALIZATION
  // -------------------------------------------------------------------------------------------------

  useEffect(() => {
    const fetchScripts = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/scripts/list`);
        if (!response.ok) throw new Error("Network response was not ok.");
        const data = await response.json();
        if (data.success && Array.isArray(data.scripts)) {
          setAllScripts(data.scripts.filter(s => !s.hidden));
        } else {
          throw new Error(data.message || "Failed to load scripts.");
        }
      } catch (error) {
        toast.error(`Failed to load script list: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    fetchScripts();
  }, []);


  // =================================================================================================
  // SECTION 5: MEMOIZED DERIVED STATE & EVENT HANDLERS
  // -------------------------------------------------------------------------------------------------

  const selectedScript = useMemo(() => allScripts.find((s) => s.id === selectedScriptId), [allScripts, selectedScriptId]);
  const currentParameters = useMemo(() => scriptParameters[selectedScriptId] || {}, [selectedScriptId, scriptParameters]);

  const handleScriptChange = useCallback((id) => {
    setSelectedHistoryId(null);
    setHistoryOutput(null);
    setSelectedScriptId(id);
    const script = allScripts.find((s) => s.id === id);
    if (script?.parameters) {
      const defaults = {};
      script.parameters.forEach((p) => {
        if (p.default !== undefined) defaults[p.name] = p.default;
      });
      setScriptParameters((prev) => ({ ...prev, [id]: { ...defaults, ...(prev[id] || {}) } }));
    }
  }, [allScripts]);

  const handleParamChange = useCallback((name, value) => {
    if (!selectedScriptId) return;
    setScriptParameters((prev) => ({
      ...prev,
      [selectedScriptId]: { ...(prev[selectedScriptId] || {}), [name]: value },
    }));
  }, [selectedScriptId]);

  const handleSelectHistoryItem = useCallback((runId) => {
    const item = historyItems.find((h) => h.runId === runId);
    if (item) {
      setSelectedHistoryId(runId);
      setSelectedScriptId(item.scriptId);
      setHistoryOutput({
        finalResult: item.isSuccess ? JSON.parse(item.output) : null,
        error: item.isSuccess ? null : item.error,
        isComplete: true, isRunning: false,
      });
      setIsHistoryDrawerOpen(false);
    }
  }, [historyItems]);

  const handleViewHistory = useCallback(() => setIsHistoryDrawerOpen((prev) => !prev), []);


  // =================================================================================================
  // SECTION 6: UI ROUTER LOGIC (CORRECTED HYBRID APPROACH)
  // -------------------------------------------------------------------------------------------------
  // This function implements the metadata-driven routing to decide which UI to render.

  const renderToolUI = () => {
    // Priority 1: Handle displaying historical runs.
    if (selectedHistoryId && historyOutput) {
      return <ScriptOutputDisplay {...historyOutput} script={selectedScript} />;
    }

    // Priority 2: Show the dashboard if no script is selected.
    if (!selectedScript) {
      return <RunnerDashboard />;
    }

    // --- THIS IS THE CRITICAL CHANGE ---
    // First, try the new metadata-driven routing system.
    const RunnerComponent = RUNNER_MAP[selectedScript.runnerComponent];
    if (RunnerComponent) {
      // If the script specifies a `runnerComponent` in its metadata, we render it.
      // This is the new, preferred path for refactored tools like Backup & Restore.
      return <RunnerComponent
        script={selectedScript}
        parameters={currentParameters}
        onParamChange={handleParamChange}
        wsContext={wsContext}
      />;
    }

    // If no `runnerComponent` was found, fall back to the original `switch` statement.
    // This provides backward compatibility for legacy components that take over the whole page.
    switch (selectedScript.id) {
      case 'jsnapy_runner':
        return <JsnapyRunner wsContext={wsContext} script={selectedScript} />;

      case 'template_workflow': // Use the actual script ID from its YAML file.
        return <TemplateWorkflow wsContext={wsContext} />; // <-- THIS NOW WORKS AGAIN.

      default:
        // For all other simple scripts that don't have a special case, use the GenericScriptRunner.
        return <GenericScriptRunner
          script={selectedScript}
          parameters={currentParameters}
          onParamChange={handleParamChange}
          wsContext={wsContext}
        />;
    }
  };


  // =================================================================================================
  // SECTION 7: MAIN RENDER METHOD
  // -------------------------------------------------------------------------------------------------
  // Assembles the final UI layout.

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen"><PulseLoader color="#3b82f6" /></div>;
  }

  return (
    <div className="bg-slate-50 min-h-screen">
      <RunnerNavBar
        allScripts={allScripts}
        selectedScriptId={selectedScriptId}
        onScriptChange={handleScriptChange}
        onReset={() => handleScriptChange("")}
        onViewHistory={handleViewHistory}
        historyItemCount={historyItems.length}
        isWsConnected={wsContext.isConnected}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderToolUI()}
      </main>
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
