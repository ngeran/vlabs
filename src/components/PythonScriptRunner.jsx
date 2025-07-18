// src/components/PythonScriptRunner.jsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import PulseLoader from "react-spinners/PulseLoader";
import toast from "react-hot-toast";

// ====================================================================================
// SECTION 1: IMPORTS
// ====================================================================================
// We import all the possible "views" or "runners" that this component can choose to render.

import RunnerNavBar from "./RunnerNavBar.jsx";
import ScriptOutputDisplay from "./ScriptOutputDisplay.jsx"; // Still needed for history!
import HistoryDrawer from "./HistoryDrawer.jsx";
import RunnerDashboard from "./RunnerDashboard.jsx";
import TemplateWorkflow from "./TemplateWorkflow.jsx";     // The custom UI for configuration
import JsnapyRunner from "./JsnapyRunner.jsx";           // The custom UI for JSNAPy
import GenericScriptRunner from "./GenericScriptRunner.jsx"; // The UI for all other standard scripts

// Import the application's core hooks.
import { useWebSocket } from "../hooks/useWebSocket.jsx";
import { useHistoryUpdates } from "../hooks/useHistoryUpdates.js";

const API_BASE_URL = "http://localhost:3001";


// ====================================================================================
// SECTION 2: MAIN COMPONENT DEFINITION
// ====================================================================================
// This component acts as the top-level controller and router.

function PythonScriptRunner() {
  // --- STATE MANAGEMENT ---
  const [allScripts, setAllScripts] = useState([]);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [scriptParameters, setScriptParameters] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [historyOutput, setHistoryOutput] = useState(null);

  // --- HOOKS ---
  const wsContext = useWebSocket({ autoConnect: true });
  const { history: historyItems, isLoading: isLoadingHistory } = useHistoryUpdates({
    websocketService: wsContext.websocketService,
  });


  // --- DATA FETCHING & MEMOIZATION ---
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
        toast.error(error.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchScripts();
  }, []);

  const selectedScript = useMemo(() => {
    return allScripts.find((s) => s.id === selectedScriptId);
  }, [allScripts, selectedScriptId]);

  const currentParameters = useMemo(() => {
    return scriptParameters[selectedScriptId] || {};
  }, [selectedScriptId, scriptParameters]);


  // --- EVENT HANDLERS ---
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
    setScriptParameters((prev) => ({ ...prev, [selectedScriptId]: { ...(prev[selectedScriptId] || {}), [name]: value } }));
  }, [selectedScriptId]);

  const handleSelectHistoryItem = useCallback((runId) => {
      const item = historyItems.find((h) => h.runId === runId);
      if (item) {
        setSelectedHistoryId(runId);
        setSelectedScriptId(item.scriptId);
        setHistoryOutput({
          finalResult: item.isSuccess ? JSON.parse(item.output) : null,
          error: item.isSuccess ? null : item.error,
          isComplete: true,
          isRunning: false,
        });
      }
    }, [historyItems]);

  const handleViewHistory = useCallback(() => setIsHistoryDrawerOpen((prev) => !prev), []);


  // ====================================================================================
  // SECTION 3: UI ROUTER LOGIC (CORRECTED)
  // ====================================================================================
  const renderToolUI = () => {
    // Priority 1: If we are viewing a past run, show the static history display.
    if (selectedHistoryId && historyOutput) {
      return <ScriptOutputDisplay {...historyOutput} script={selectedScript} />;
    }

    // Priority 2: If no script is selected yet, show the main dashboard.
    if (!selectedScript) {
      return <RunnerDashboard />;
    }

    // This logic correctly handles the Template Workflow by checking its unique capability.
    if (selectedScript.capabilities?.customUI === 'templateWorkflow') {
      return <TemplateWorkflow wsContext={wsContext} />;
    }

    // This switch handles other specialized UIs by their unique ID.
    switch (selectedScript.id) {
      // FIX: Use the correct ID from scripts.yaml to render the JSNAPy component.
      case 'jsnapy_runner':
        return <JsnapyRunner wsContext={wsContext} script={selectedScript} />;

      default:
        // For all other standard scripts, delegate to the GenericScriptRunner.
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


  // ====================================================================================
  // SECTION 4: MAIN RENDER
  // ====================================================================================
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
