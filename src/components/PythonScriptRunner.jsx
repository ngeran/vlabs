// =================================================================================================
//
//  COMPONENT: PythonScriptRunner.jsx
//  PATH: src/components/PythonScriptRunner.jsx
//
// =================================================================================================
//
//  DESCRIPTION:
//  This component serves as the top-level orchestrator and "container" for the entire script
//  execution interface. It is the central nervous system that manages application state, fetches
//  initial data, handles user selections, and decides which specialized UI ("runner") to display.
//
//  KEY FEATURES:
//  - **Metadata-Driven UI Routing:** Dynamically renders different runner components based on a
//    `runnerComponent` key in a script's metadata, falling back to a legacy switch statement or
//    a generic runner. This makes the system highly extensible.
//  - **Centralized State Management:** Manages the master list of scripts, the currently selected
//    script and its parameters, and the visibility of the history drawer.
//  - **Automated Real-Time History:** Leverages the `useHistoryUpdates` custom hook. This hook
//    fetches the initial history via a REST API call and then listens for a `history_updated`
//    WebSocket broadcast from the server, ensuring the history is always perfectly in sync for
//    all connected clients with no extra API calls.
//  - **Backward Compatibility:** The routing logic supports both new, modular runner components
//    and older, monolithic ones, allowing for gradual refactoring.
//  - **Complete UI Assembly:** Integrates all major UI pieces: the `RunnerNavBar` for navigation,
//    the main content area (which shows the active runner or dashboard), and the `HistoryDrawer`.
//
//  HOW-TO GUIDE (THE DATA FLOW):
//  1.  **Initialization:** The component mounts. The `useWebSocket` hook establishes the connection
//      context. The `useEffect` hook fires to fetch the master list of all available scripts.
//  2.  **History Loading:** Simultaneously, the `useHistoryUpdates` hook is initialized. It makes a
//      one-time API call to `/api/history/list` to get the current snapshot of the history. It
//      then subscribes to the `history_updated` WebSocket event.
//  3.  **User Interaction:** The user selects a script from the `RunnerNavBar`. `handleScriptChange`
//      updates the `selectedScriptId` state.
//  4.  **UI Routing:** The component re-renders. The `renderToolUI` function is called. It checks the
//      metadata of the `selectedScript` and renders the appropriate runner component
//      (e.g., `BackupAndRestoreRunner`, `GenericScriptRunner`).
//  5.  **Script Execution:** The user interacts with the active runner, which eventually calls a
//      function to execute the script on the backend.
//  6.  **The Live Update:** The script finishes on the server. The server updates its master `runHistory`
//      array and then **broadcasts** a `history_updated` event containing the complete, new list to
//      all connected clients.
//  7.  **Automatic Refresh:** The `useHistoryUpdates` hook on the frontend receives the broadcast and
//      updates its internal `history` state. Because this component uses that state (`historyItems`),
//      it re-renders, passing the new, updated list to `RunnerNavBar` and `HistoryDrawer`. The UI
//      updates instantly, without any further action from the user.
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
import ScriptOutputDisplay from "./ScriptOutputDisplay.jsx";
import HistoryDrawer from "./HistoryDrawer.jsx";

// --- Specialized "Feature Runner" Components ---
import BackupAndRestoreRunner from "./runners/BackupAndRestoreRunner.jsx";
import CodeUpgradeRunner from "./runners/CodeUpgradeRunner.jsx";
import FileUploaderRunner from "./runners/FileUploaderRunner.jsx";
import GenericScriptRunner from "./GenericScriptRunner.jsx";
import JsnapyRunner from "./JsnapyRunner.jsx";
import TemplateWorkflow from "./TemplateWorkflow.jsx"; // Restored for backward compatibility

// --- Core Application Hooks ---
import { useWebSocket } from "../hooks/useWebSocket.jsx";
import { useHistoryUpdates } from "../hooks/useHistoryUpdates.js";

// =================================================================================================
// SECTION 2: COMPONENT-LEVEL CONSTANTS
// -------------------------------------------------------------------------------------------------

const API_BASE_URL = "http://localhost:3001";

/**
 * A mapping from the string identifier in script metadata (`runnerComponent`) to the
 * actual, imported React component. This is the core of the metadata-driven routing system.
 */
const RUNNER_MAP = {
  BackupAndRestoreRunner,
  CodeUpgradeRunner,
  FileUploaderRunner,
  // Add other new, modular runners here as they are created.
};

// =================================================================================================
// SECTION 3: MAIN COMPONENT DEFINITION & STATE MANAGEMENT
// -------------------------------------------------------------------------------------------------

function PythonScriptRunner() {
  // --- State Declarations ---
  const [allScripts, setAllScripts] = useState([]);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [scriptParameters, setScriptParameters] = useState({});
  const [isLoading, setIsLoading] = useState(true); // For the initial script list fetch
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null); // For viewing a specific past run
  const [historyOutput, setHistoryOutput] = useState(null); // The data of the selected past run

  // --- Hooks for Core Services ---
  // Establishes the WebSocket connection context, passed to all child runners.
  const wsContext = useWebSocket({ autoConnect: true });

  // This custom hook provides a live, automatically updating list of history items.
  const { history: historyItems, isLoading: isLoadingHistory } =
    useHistoryUpdates({
      websocketService: wsContext.websocketService,
    });

  // =================================================================================================
  // SECTION 4: DATA FETCHING & INITIALIZATION
  // -------------------------------------------------------------------------------------------------

  // This effect runs once on component mount to fetch the master list of available scripts.
  useEffect(() => {
    const fetchScripts = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/scripts/list`);
        if (!response.ok) throw new Error("Server connection failed.");
        const data = await response.json();
        if (data.success && Array.isArray(data.scripts)) {
          // Filter out any scripts marked as "hidden" in their metadata.
          setAllScripts(data.scripts.filter((s) => !s.hidden));
        } else {
          throw new Error(data.message || "Failed to parse script data.");
        }
      } catch (error) {
        toast.error(`Failed to load script list: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    fetchScripts();
  }, []); // Empty dependency array ensures this runs only once.

  // =================================================================================================
  // SECTION 5: MEMOIZED STATE & EVENT HANDLERS
  // -------------------------------------------------------------------------------------------------

  // Memoized values to prevent unnecessary recalculations on every render.
  const selectedScript = useMemo(
    () => allScripts.find((s) => s.id === selectedScriptId),
    [allScripts, selectedScriptId],
  );
  const currentParameters = useMemo(
    () => scriptParameters[selectedScriptId] || {},
    [selectedScriptId, scriptParameters],
  );

  /**
   * Handles changing the selected script from the navbar.
   */
  const handleScriptChange = useCallback(
    (id) => {
      setSelectedHistoryId(null); // Clear any historical view.
      setHistoryOutput(null);
      setSelectedScriptId(id);

      // Pre-populate parameters with default values from script metadata, if they exist.
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
    [allScripts],
  );

  /**
   * Handles updating a parameter for the currently selected script.
   */
  const handleParamChange = useCallback(
    (name, value) => {
      if (!selectedScriptId) return;
      setScriptParameters((prev) => ({
        ...prev,
        [selectedScriptId]: {
          ...(prev[selectedScriptId] || {}),
          [name]: value,
        },
      }));
    },
    [selectedScriptId],
  );

  /**
   * Handles selecting a run from the history drawer to view its output.
   */
  const handleSelectHistoryItem = useCallback(
    (runId) => {
      const item = historyItems.find((h) => h.runId === runId);
      if (item) {
        setSelectedHistoryId(runId);
        setSelectedScriptId(item.scriptId); // Also select the script that was used for that run.

        // Construct a state object that mimics the props `ScriptOutputDisplay` expects.
        let parsedOutput = null;
        try {
          const lastLine = item.output?.trim().split("\n").pop();
          if (lastLine) parsedOutput = JSON.parse(lastLine);
        } catch (e) {
          /* Parsing can fail, which is fine. */
        }

        setHistoryOutput({
          progressEvents: item.progressEvents || [],
          finalResult: item.isSuccess ? parsedOutput : null,
          error: item.isSuccess ? null : item.error || "An error occurred.",
          isComplete: true,
          isRunning: false,
          fullLog: item.output || item.error || "",
        });
        setIsHistoryDrawerOpen(false);
      }
    },
    [historyItems],
  );

  // Toggles the visibility of the history drawer.
  const handleViewHistory = useCallback(
    () => setIsHistoryDrawerOpen((prev) => !prev),
    [],
  );

  // =================================================================================================
  // SECTION 6: UI ROUTER LOGIC (HYBRID APPROACH)
  // -------------------------------------------------------------------------------------------------

  /**
   * This function is the core of the component's routing. It decides which UI to render.
   * @returns {React.ReactElement} The active runner component or view.
   */
  const renderToolUI = () => {
    // Priority 1: If a historical run is being viewed, show its output.
    if (selectedHistoryId && historyOutput) {
      return <ScriptOutputDisplay {...historyOutput} script={selectedScript} />;
    }

    // Priority 2: If no script is selected, show the main dashboard.
    if (!selectedScript) {
      return <RunnerDashboard />;
    }

    // Priority 3: Check for a modern, specified runner component in the script's metadata.
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

    // Priority 4: Fall back to the legacy switch statement for backward compatibility.
    switch (selectedScript.id) {
      case "jsnapy_runner":
        return <JsnapyRunner wsContext={wsContext} script={selectedScript} />;
      case "template_workflow":
        return <TemplateWorkflow wsContext={wsContext} />;
      // Default: Use the GenericScriptRunner for any script without a special case.
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
  };

  // =================================================================================================
  // SECTION 7: MAIN RENDER METHOD
  // -------------------------------------------------------------------------------------------------

  // Show a global loading spinner only during the very initial script list fetch.
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <PulseLoader color="#3b82f6" />
      </div>
    );
  }

  // Assemble the final UI layout.
  return (
    <div className="bg-slate-50 min-h-screen">
      <RunnerNavBar
        allScripts={allScripts}
        selectedScriptId={selectedScriptId}
        onScriptChange={handleScriptChange}
        onReset={() => handleScriptChange("")} // Resetting clears the script selection.
        onViewHistory={handleViewHistory}
        historyItemCount={historyItems.length} // Count comes directly from the live history hook.
        isWsConnected={wsContext.isConnected}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderToolUI()}
      </main>
      <HistoryDrawer
        history={historyItems} // Data comes directly from the live history hook.
        isLoading={isLoadingHistory} // Loading state also comes from the hook.
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        onSelectHistoryItem={handleSelectHistoryItem}
        selectedHistoryId={selectedHistoryId}
      />
    </div>
  );
}

export default PythonScriptRunner;
