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
import ReportsRunner from "./runners/ReportsRunner.jsx";
import ValidationRunner from "./runners/ValidationRunner.jsx";

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
  ReportsRunner,
  ValidationRunner,
};

// =================================================================================================
// SECTION 3: MAIN COMPONENT DEFINITION & STATE MANAGEMENT
// =================================================================================================
function PythonScriptRunner() {
  const [allScripts, setAllScripts] = useState([]);
  const [scriptParameters, setScriptParameters] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const [selectedScriptId, setSelectedScriptId] = useState(() => {
    return sessionStorage.getItem('selectedScriptId') || "";
  });

  const wsContext = useWebSocket({ autoConnect: true });

  // =================================================================================================
  // SECTION 4: LIFECYCLE & DATA FETCHING
  // =================================================================================================
  useEffect(() => {
    sessionStorage.setItem('selectedScriptId', selectedScriptId);
  }, [selectedScriptId]);

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
  // =================================================================================================
  const selectedScript = useMemo(() => allScripts.find((s) => s.id === selectedScriptId), [allScripts, selectedScriptId]);

  const currentParameters = useMemo(() => scriptParameters[selectedScriptId] || {}, [selectedScriptId, scriptParameters]);

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
        setScriptParameters((prev) => ({
          ...prev,
          [newScriptId]: { ...defaults, ...(prev[newScriptId] || {}) }
        }));
      }
    }
  }, [allScripts]);

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

    // No fallback component (GenericScriptRunner) is rendered anymore
    return null;
  }, [selectedScript, currentParameters, handleParamChange, wsContext]);

  // =================================================================================================
  // SECTION 7: MAIN RENDER METHOD
  // =================================================================================================
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
