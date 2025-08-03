// =================================================================================================
//
// FILE:               src/components/PythonScriptRunner.jsx
//
// DESCRIPTION:
//   This component serves as the main UI router for the script execution engine. It fetches
//   the list of available scripts and renders the appropriate specialized runner UI
//   based on the user's selection from the navigation.
//
// OVERVIEW:
//   The component fetches available scripts from the backend, persists the selected script
//   ID in sessionStorage, and dynamically renders the corresponding runner component
//   based on the script's metadata. It integrates with a centralized WebSocket context for
//   real-time updates and manages all script parameters in a central state object, passing
//   them down to the active runner component.
//
// KEY FEATURES:
//   - Centralized State Management: Holds the state for `allScripts` and `scriptParameters`,
//     acting as the single source of truth for the application.
//   - Resilient State: Persists `selectedScriptId` to `sessionStorage` to withstand page reloads.
//   - Metadata-Driven UI Router: Uses a `RUNNER_MAP` to dynamically render the correct
//     "feature runner" component based on the `runnerComponent` key in a script's metadata.
//     This eliminates the need for hardcoded switch statements.
//   - Generic Fallback: Renders a `GenericScriptRunner` for any script that does not have a
//     specialized runner component defined in the `RUNNER_MAP`.
//   - WebSocket Integration: Initializes and provides the `wsContext` to all child components,
//     enabling real-time communication with the backend.
//   - Clean Parameter Handling: Initializes script parameters with default values from metadata
//     and provides a single `handleParamChange` callback for all updates.
//
// HOW-TO GUIDE (INTEGRATION):
//   1. To add a new specialized tool (e.g., "MyNewTool"):
//      a. Create a new runner component (e.g., `MyNewToolRunner.jsx`) in `src/components/runners/`.
//      b. In its `metadata.yml`, set `runnerComponent: "MyNewToolRunner"`.
//      c. Import `MyNewToolRunner.jsx` in this file.
//      d. Add `"MyNewToolRunner"` to the `RUNNER_MAP` constant below.
//   2. The component will now be rendered automatically when selected. No further changes are needed here.
//
// DEPENDENCIES:
//   - React Core Hooks: useState, useEffect, useMemo, useCallback.
//   - Custom Hooks: useWebSocket.
//   - UI Components: RunnerNavBar, RunnerDashboard, specialized runners (BackupAndRestoreRunner, etc.).
//   - External Libraries: react-hot-toast, react-spinners.
//
// =================================================================================================

// =================================================================================================
// SECTION 1: IMPORTS
// =================================================================================================
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
import JsnapyRunner from "./runners/JsnapyRunner.jsx"; // <-- UPDATED: Import the refactored JsnapyRunner
import GenericScriptRunner from "./GenericScriptRunner.jsx";

// --- Core Application Hooks ---
import { useWebSocket } from "../hooks/useWebSocket.jsx";

// =================================================================================================
// SECTION 2: COMPONENT-LEVEL CONSTANTS
// =================================================================================================
const API_BASE_URL = "http://localhost:3001";

/**
 * A map that links the `runnerComponent` string from a script's metadata
 * to the actual React component. This is the core of the UI router.
 */
const RUNNER_MAP = {
  BackupAndRestoreRunner,
  CodeUpgradeRunner,
  FileUploaderRunner,
  DeviceConfigurationRunner,
  JsnapyRunner, // <-- UPDATED: Add the new JsnapyRunner to the map
};

// =================================================================================================
// SECTION 3: MAIN COMPONENT DEFINITION & STATE MANAGEMENT
// =================================================================================================
/**
 * Main UI router for script execution, rendering specialized runner components based on script selection.
 */
function PythonScriptRunner() {
  // --- State Declarations ---
  const [allScripts, setAllScripts] = useState([]);
  const [scriptParameters, setScriptParameters] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // Persists the currently selected script across page reloads.
  const [selectedScriptId, setSelectedScriptId] = useState(() => {
    return sessionStorage.getItem('selectedScriptId') || "";
  });

  // --- Hooks for Core Services ---
  const wsContext = useWebSocket({ autoConnect: true });

  // =================================================================================================
  // SECTION 4: LIFECYCLE & DATA FETCHING
  // =================================================================================================
  // Persist selectedScriptId to sessionStorage whenever it changes.
  useEffect(() => {
    sessionStorage.setItem('selectedScriptId', selectedScriptId);
  }, [selectedScriptId]);

  // Fetch the list of all available, non-hidden scripts from the backend on initial component mount.
  useEffect(() => {
    const fetchScripts = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/scripts/list`);
        if (!response.ok) throw new Error("Network response was not ok.");
        const data = await response.json();
        if (data.success && Array.isArray(data.scripts)) {
          // Filter out any scripts marked as 'hidden' in their metadata
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
  // =================================================================================================
  // Memoized value for the currently selected script object.
  const selectedScript = useMemo(() => allScripts.find((s) => s.id === selectedScriptId), [allScripts, selectedScriptId]);

  // Memoized value for the parameters of the currently selected script.
  const currentParameters = useMemo(() => scriptParameters[selectedScriptId] || {}, [selectedScriptId, scriptParameters]);

  /**
   * Handles script selection changes from the navigation bar.
   * Initializes the script's parameters with default values from metadata if they don't exist yet.
   */
  const handleScriptChange = useCallback((id) => {
    const newScriptId = id || "";
    setSelectedScriptId(newScriptId);
    if (newScriptId) {
      const script = allScripts.find((s) => s.id === newScriptId);
      if (script?.parameters) {
        const defaults = {};
        script.parameters.forEach((p) => {
          if (p.default !== undefined) {
            defaults[p.name] = p.default;
          }
        });
        // Set default parameters only if they haven't been set before for this script
        setScriptParameters((prev) => ({
          ...prev,
          [newScriptId]: { ...defaults, ...(prev[newScriptId] || {}) }
        }));
      }
    }
  }, [allScripts]);

  /**
   * A universal callback passed down to all runner components to handle parameter updates.
   */
  const handleParamChange = useCallback((name, value) => {
    if (!selectedScriptId) return;
    setScriptParameters((prev) => ({
      ...prev,
      [selectedScriptId]: { ...(prev[selectedScriptId] || {}), [name]: value },
    }));
  }, [selectedScriptId]);

  // =================================================================================================
  // SECTION 6: UI ROUTER LOGIC (MEMOIZED)
  // =================================================================================================
  // This memoized block determines which UI to render based on the selected script.
  const toolUI = useMemo(() => {
    // If no script is selected, show the main dashboard.
    if (!selectedScript) {
      return <RunnerDashboard />;
    }

    // Look up the specialized runner component in the RUNNER_MAP.
    const RunnerComponent = RUNNER_MAP[selectedScript.runnerComponent];

    // If a specialized component is found, render it with all necessary props.
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

    // --- REMOVED ---
    // The previous `switch` statement that contained a special case for 'jsnapy_runner'
    // is no longer necessary because it is now handled by the RUNNER_MAP logic above.

    // If no specialized runner is found, fall back to the generic runner.
    return (
      <GenericScriptRunner
        script={selectedScript}
        parameters={currentParameters}
        onParamChange={handleParamChange}
        wsContext={wsContext}
      />
    );
  }, [selectedScript, currentParameters, handleParamChange, wsContext]);

  // =================================================================================================
  // SECTION 7: MAIN RENDER METHOD
  // =================================================================================================
  // Show a loading spinner while fetching the initial script list.
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
        isActionInProgress={false} // This could be wired to a global state if needed
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {toolUI}
      </main>
    </div>
  );
}

export default PythonScriptRunner;
