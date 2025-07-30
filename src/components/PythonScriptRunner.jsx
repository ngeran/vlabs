// =================================================================================================
//
// COMPONENT:          PythonScriptRunner.jsx (Clean Baseline Version)
// FILE:               src/components/PythonScriptRunner.jsx
//
// OVERVIEW:
//   This is a clean, stable, foundational version of the script runner's main component. Its sole
//   purpose is to act as a UI router, displaying the correct interface for the user's selected
//   script. It has been intentionally stripped of all history-related functionality to provide a
//   stable baseline for development.
//
// KEY FEATURES:
//   - Pure UI Router: Its primary responsibility is to decide which runner component to render.
//   - Stateful Runner Delegation: This component does NOT manage the state of an active script
//     run. It delegates that responsibility entirely to the individual, self-contained runner
//     components, which is a proven, stable architectural pattern.
//   - Metadata-Driven: Uses a `RUNNER_MAP` to dynamically render specialized UIs based on a
//     `runnerComponent` key in a script's metadata file.
//
// DEPENDENCIES:
//   - React Core Hooks: (useState, useEffect, useMemo, useCallback) for state and lifecycle.
//   - Custom Hooks: `useWebSocket` for providing the global connection context to child runners.
//   - UI Components: All runner components, `RunnerNavBar`, and `RunnerDashboard`.
//
// =================================================================================================


// SECTION 1: IMPORTS
// -------------------------------------------------------------------------------------------------
// All unnecessary imports related to history have been removed.

import React, { useEffect, useState, useMemo, useCallback } from "react";
import PulseLoader from "react-spinners/PulseLoader";
import toast from "react-hot-toast";

// --- High-Level UI Components ---
import RunnerNavBar from "./RunnerNavBar.jsx";
import RunnerDashboard from "./RunnerDashboard.jsx";
// ScriptOutputDisplay and HistoryDrawer are no longer needed by this component.

// --- Specialized "Feature Runner" Components ---
import BackupAndRestoreRunner from './runners/BackupAndRestoreRunner.jsx';
import CodeUpgradeRunner from './runners/CodeUpgradeRunner.jsx';
import GenericScriptRunner from "./GenericScriptRunner.jsx";
import JsnapyRunner from "./JsnapyRunner.jsx";
import TemplateWorkflow from "./TemplateWorkflow.jsx";
import FileUploaderRunner from './runners/FileUploaderRunner.jsx';

// --- Core Application Hooks ---
import { useWebSocket } from "../hooks/useWebSocket.jsx";
// `useHistoryUpdates` hook has been removed.


// SECTION 2: COMPONENT-LEVEL CONSTANTS
// -------------------------------------------------------------------------------------------------

const API_BASE_URL = "http://localhost:3001";

const RUNNER_MAP = {
  BackupAndRestoreRunner,
  CodeUpgradeRunner,
  FileUploaderRunner,
};


// SECTION 3: MAIN COMPONENT DEFINITION & STATE MANAGEMENT
// -------------------------------------------------------------------------------------------------

function PythonScriptRunner() {
  // --- State Declarations (Minimal & Clean) ---
  const [allScripts, setAllScripts] = useState([]);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [scriptParameters, setScriptParameters] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  // All history-related state has been removed.

  // --- Hooks for Core Services ---
  const wsContext = useWebSocket({ autoConnect: true });
  // The `useHistoryUpdates` hook call has been removed.


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


  // SECTION 5: MEMOIZED DERIVED STATE & EVENT HANDLERS
  // -------------------------------------------------------------------------------------------------

  const selectedScript = useMemo(() => allScripts.find((s) => s.id === selectedScriptId), [allScripts, selectedScriptId]);
  const currentParameters = useMemo(() => scriptParameters[selectedScriptId] || {}, [selectedScriptId, scriptParameters]);

  const handleScriptChange = useCallback((id) => {
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

  // All history-related event handlers have been removed.


  // SECTION 6: UI ROUTER LOGIC
  // -------------------------------------------------------------------------------------------------
  // The router is now simplified, with no logic for displaying history.

  const renderToolUI = () => {
    // Priority 1: Show the dashboard if no script is selected.
    if (!selectedScript) {
      return <RunnerDashboard />;
    }

    // Priority 2: Use the metadata-driven routing system.
    const RunnerComponent = RUNNER_MAP[selectedScript.runnerComponent];
    if (RunnerComponent) {
      return <RunnerComponent
        script={selectedScript}
        parameters={currentParameters}
        onParamChange={handleParamChange}
        wsContext={wsContext}
      />;
    }

    // Priority 3: Fall back to the legacy switch statement.
    switch (selectedScript.id) {
      case 'jsnapy_runner':
        return <JsnapyRunner wsContext={wsContext} script={selectedScript} />;
      case 'template_workflow':
        return <TemplateWorkflow wsContext={wsContext} />;
      default:
        return <GenericScriptRunner
          script={selectedScript}
          parameters={currentParameters}
          onParamChange={handleParamChange}
          wsContext={wsContext}
        />;
    }
  };


  // SECTION 7: MAIN RENDER METHOD
  // -------------------------------------------------------------------------------------------------

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
        isWsConnected={wsContext.isConnected}
        // All history-related props have been removed to prevent child components from crashing.
        onViewHistory={null}
        historyItemCount={0}
        isActionInProgress={false}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderToolUI()}
      </main>
      {/* The HistoryDrawer component has been completely removed from the render tree. */}
    </div>
  );
}

export default PythonScriptRunner;
