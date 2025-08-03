// =================================================================================================
//
// FILE:               src/components/PythonScriptRunner.jsx
//
// DESCRIPTION:
//   This component serves as the main UI router for the script execution engine. It fetches
//   the list of available scripts and renders the appropriate specialized runner UI
//   based on the user's selection. All history-related functionality has been removed
//   to create a simplified and stable user experience.
//
// OVERVIEW:
//   The component fetches available scripts from the backend, persists the selected script
//   ID in sessionStorage, and dynamically renders the corresponding runner component
//   based on script metadata. It integrates with WebSocket for real-time updates and
//   manages script parameters through a centralized state.
//
// KEY FEATURES:
//   - Resilient State: Persists `selectedScriptId` to `sessionStorage` to withstand page reloads.
//   - UI Router: Maps script IDs to specialized runner components via RUNNER_MAP or switch statement.
//   - Parameter Management: Handles script parameters with defaults and updates via callbacks.
//   - Simplified State: Removes history-related state to avoid race conditions.
//   - WebSocket Integration: Uses useWebSocket for real-time operation feedback.
//   - Error Handling: Displays fetch errors via react-hot-toast.
//
// HOW-TO GUIDE (INTEGRATION):
//   - Ensure the backend API is running at `http://localhost:3001`.
//   - Place this component at the root of the app or within a main layout.
//   - Add new runner components to `RUNNER_MAP` for scripts with `runnerComponent` in metadata.yml.
//   - Update the switch statement in `toolUI` for scripts without a `runnerComponent` (e.g., jsnapy_runner).
//   - Verify navigation items (e.g., in RunnerNavBar) include all script IDs, including `template_workflow`.
//   - Test with a navigation item for `template_workflow` to render DeviceConfigurationRunner.
//
// DEPENDENCIES:
//   - React Core Hooks: useState, useEffect, useMemo, useCallback.
//   - Custom Hooks: useWebSocket.
//   - UI Components: RunnerNavBar, RunnerDashboard, specialized runners (BackupAndRestoreRunner, etc.).
//   - External Libraries: react-hot-toast, react-spinners.
//
// =================================================================================================

// SECTION 1: IMPORTS
// -------------------------------------------------------------------------------------------------
import React, { useEffect, useState, useMemo, useCallback } from "react";
import PulseLoader from "react-spinners/PulseLoader";
import toast from "react-hot-toast";

// --- High-Level UI Components ---
import RunnerNavBar from "./RunnerNavBar.jsx";
import RunnerDashboard from "./RunnerDashboard.jsx";

// --- Specialized "Feature Runner" Components ---
import BackupAndRestoreRunner from './runners/BackupAndRestoreRunner.jsx';
import CodeUpgradeRunner from './runners/CodeUpgradeRunner.jsx';
import FileUploaderRunner from './runners/FileUploaderRunner.jsx';
import DeviceConfigurationRunner from './runners/DeviceConfigurationRunner.jsx';
import JsnapyRunner from "./JsnapyRunner.jsx";
import GenericScriptRunner from "./GenericScriptRunner.jsx";

// --- Core Application Hooks ---
import { useWebSocket } from "../hooks/useWebSocket.jsx";

// SECTION 2: COMPONENT-LEVEL CONSTANTS
// -------------------------------------------------------------------------------------------------
const API_BASE_URL = "http://localhost:3001";
const RUNNER_MAP = {
  BackupAndRestoreRunner,
  CodeUpgradeRunner,
  FileUploaderRunner,
  DeviceConfigurationRunner,
};

// SECTION 3: MAIN COMPONENT DEFINITION & STATE MANAGEMENT
// -------------------------------------------------------------------------------------------------
/**
 * Main UI router for script execution, rendering specialized runner components based on script selection.
 */
function PythonScriptRunner() {
  // --- State Declarations ---
  const [allScripts, setAllScripts] = useState([]);
  const [scriptParameters, setScriptParameters] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const [selectedScriptId, setSelectedScriptId] = useState(() => {
    return sessionStorage.getItem('selectedScriptId') || "";
  });

  // --- Hooks for Core Services ---
  const wsContext = useWebSocket({ autoConnect: true });

  // SECTION 4: LIFECYCLE & DATA FETCHING
  // -------------------------------------------------------------------------------------------------
  // Persist selectedScriptId to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('selectedScriptId', selectedScriptId);
  }, [selectedScriptId]);

  // Fetch available scripts from backend
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

  // Handle script selection and initialize parameters
  const handleScriptChange = useCallback((id) => {
    const newScriptId = id || "";
    setSelectedScriptId(newScriptId);
    if (newScriptId) {
      const script = allScripts.find((s) => s.id === newScriptId);
      if (script?.parameters) {
        const defaults = {};
        script.parameters.forEach((p) => {
          if (p.default !== undefined) defaults[p.name] = p.default;
        });
        setScriptParameters((prev) => ({ ...prev, [newScriptId]: { ...defaults, ...(prev[newScriptId] || {}) } }));
      }
    }
  }, [allScripts]);

  // Handle parameter updates
  const handleParamChange = useCallback((name, value) => {
    if (!selectedScriptId) return;
    setScriptParameters((prev) => ({
      ...prev,
      [selectedScriptId]: { ...(prev[selectedScriptId] || {}), [name]: value },
    }));
  }, [selectedScriptId]);

  // SECTION 6: UI ROUTER LOGIC (MEMOIZED)
  // -----------------------------------------------------------------------------------------------
  const toolUI = useMemo(() => {
    if (!selectedScript) {
      return <RunnerDashboard />;
    }

    const RunnerComponent = RUNNER_MAP[selectedScript.runnerComponent];
    if (RunnerComponent) {
      return (
        <RunnerComponent
          script={selectedScript}
          parameters={currentParameters}
          onParamChange={handleParamChange}
          wsContext={wsContext}
        />
      );
    }

    // Fallback for scripts without a runnerComponent
    switch (selectedScript.id) {
      case 'jsnapy_runner':
        return <JsnapyRunner wsContext={wsContext} script={selectedScript} />;
      default:
        return (
          <GenericScriptRunner
            script={selectedScript}
            parameters={currentParameters}
            onParamChange={handleParamChange}
            wsContext={wsContext}
          />
        );
    }
  }, [selectedScript, currentParameters, handleParamChange, wsContext]);

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
        isActionInProgress={false}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {toolUI}
      </main>
    </div>
  );
}

export default PythonScriptRunner;
