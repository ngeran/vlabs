// ====================================================================================
//
// PAGE: PythonScriptRunner.jsx
//
// ROLE: A self-contained, metadata-driven UI for executing Python scripts.
//
// DESCRIPTION: This component serves as the main user interface for selecting and
//              running various tools. It dynamically generates forms based on a
//              script's `metadata.yml` file, including support for conditionally
//              showing fields and moving primary action controls to the sidebar
//              for a cleaner user experience.
//
// ====================================================================================


// ====================================================================================
// SECTION 1: HEADER & IMPORTS
//
// This section imports all necessary libraries, components, and custom hooks.
// ====================================================================================

import React, { useEffect, useState, useMemo, useCallback } from "react";
import PulseLoader from "react-spinners/PulseLoader";
import toast from "react-hot-toast";
import { PlayCircle, Layers, History } from "lucide-react";

// --- Local Custom Components ---
import RunnerNavBar from "./RunnerNavBar.jsx";
import ScriptOutputDisplay from "./ScriptOutputDisplay.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import DynamicScriptForm from "./DynamicScriptForm.jsx";
import DeviceAuthFields from "./DeviceAuthFields.jsx";
import TestSelector from "./TestSelector.jsx";
// This component is now used in the sidebar to render individual form elements.
import ScriptParameterInput from "./ScriptParameterInput.jsx";

// --- Local Custom Hooks ---
import { useTestDiscovery } from "../hooks/useTestDiscovery.jsx";
import { useTemplateGeneration } from "../hooks/useTemplateDiscovery.jsx";
import { useWebSocket, useTemplateApplication, useScriptRunnerStream } from "../hooks/useWebSocket.jsx";


// ====================================================================================
// SECTION 2: CHILD COMPONENTS
//
// Helper components that are logically scoped to this runner page.
// ====================================================================================

/**
 * @description Renders the appropriate options in the sidebar. It now handles both
 *              capability-driven options (like JSNAPy tests) AND general parameters
 *              that have been flagged with `layout: 'sidebar'` in their metadata.
 * @param {object} props - Component props.
 * @param {object} props.script - The metadata for the selected script.
 * @param {object} props.parameters - The current values for all form parameters.
 * @param {function} props.onParamChange - The callback to update a parameter's value.
 * @param {Array<object>} props.sidebarParameters - The filtered list of parameters to render in the sidebar.
 */
function ScriptOptionsRenderer({ script, parameters, onParamChange, sidebarParameters }) {
  // Hook for JSNAPy Test Discovery (only fetches if script has the capability)
  const testDiscovery = useTestDiscovery(script?.id, parameters?.environment);

  if (!script) return null;

  const hasSidebarParams = sidebarParameters && sidebarParameters.length > 0;
  const hasDynamicTestOptions = script.capabilities?.dynamicDiscovery;

  return (
    <div className="space-y-4">
      {/* --- Part 1: General Sidebar Parameters --- */}
      {/* Render any parameters that are explicitly designated for the sidebar via metadata. */}
      {hasSidebarParams && (
        <div className="space-y-4">
          {sidebarParameters.map(param => (
            <ScriptParameterInput
              key={param.name}
              param={param}
              value={parameters[param.name]}
              onChange={onParamChange}
            />
          ))}
        </div>
      )}

      {/* Add a visual separator if both general and capability-specific options exist. */}
      {hasSidebarParams && hasDynamicTestOptions && (
        <hr className="!my-5 border-t border-slate-200" />
      )}

      {/* --- Part 2: Capability-Driven Sidebar UI --- */}
      {/* Render UI for dynamic test discovery if the script supports it. */}
      {hasDynamicTestOptions && (
        <>
            {testDiscovery.loading && <p className="text-sm text-slate-500 italic">Discovering tests...</p>}
            {testDiscovery.error && <p className="text-sm font-semibold text-red-600">Error: {testDiscovery.error}</p>}
            <TestSelector
              categorizedTests={testDiscovery.categorizedTests}
              selectedTests={parameters.tests || []}
              onTestToggle={(testId) => {
                const currentTests = parameters.tests || [];
                const newSelection = currentTests.includes(testId)
                  ? currentTests.filter((id) => id !== testId)
                  : [...currentTests, testId];
                onParamChange("tests", newSelection);
              }}
            />
        </>
      )}

      {/* --- Default Case --- */}
      {/* Display a message if the script has no special sidebar UI. */}
      {!hasSidebarParams && !hasDynamicTestOptions && (
        <p className="text-xs text-slate-500 italic">This script has no additional sidebar options.</p>
      )}
    </div>
  );
}


// ====================================================================================
// SECTION 3: API & CONSTANTS
// ====================================================================================

const API_BASE_URL = "http://localhost:3001";


// ====================================================================================
// SECTION 4: MAIN COMPONENT - PythonScriptRunner
// ====================================================================================

function PythonScriptRunner() {

  // ==================================================================================
  // 4.1: State Management
  //
  // All `useState` hooks that manage the component's internal state.
  // ==================================================================================

  const [allScripts, setAllScripts] = useState([]);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  // Stores the form values for ALL scripts, keyed by script ID.
  const [scriptParameters, setScriptParameters] = useState({});
  const [topLevelError, setTopLevelError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // ==================================================================================
  // 4.2: Custom Hooks
  //
  // Initialization of custom hooks that abstract away complex logic like
  // WebSocket connections and API action calls.
  // ==================================================================================

  // Manages the primary WebSocket connection and its status.
  const wsContext = useWebSocket({ autoConnect: true });
  // Provides the `runScript` function and manages the real-time output stream.
  const scriptRunner = useScriptRunnerStream(wsContext);
  // A flag to determine if any backend process is active to disable UI elements.
  const isActionInProgress = scriptRunner.isRunning;


  // ==================================================================================
  // 4.3: Data Fetching & Effects
  //
  // `useEffect` hooks for actions that need to run on component mount or when
  // dependencies change, such as fetching initial data from the API.
  // ==================================================================================

  useEffect(() => {
    // Fetches the list of all available scripts from the backend when the component mounts.
    const fetchScripts = async () => {
      setIsLoading(true);
      setTopLevelError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/scripts/list`);
        if (!response.ok) throw new Error("Network response was not ok. Is the server running?");
        const data = await response.json();
        if (data && data.success && Array.isArray(data.scripts)) {
          // Filter out any scripts marked as hidden in their metadata.
          setAllScripts(data.scripts.filter(s => !s.hidden));
        } else {
          throw new Error(data.message || "Failed to load scripts in a valid format.");
        }
      } catch (error) {
        toast.error("Failed to load scripts. Check server connection.");
        setTopLevelError(error.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchScripts();
  }, []); // Empty dependency array means this runs only once on mount.


  // ==================================================================================
  // 4.4: Memoized Derived State
  //
  // `useMemo` hooks to calculate derived data. This is more efficient than
  // recalculating on every render.
  // ==================================================================================

  // Finds the full metadata object for the currently selected script.
  const selectedScript = useMemo(() => allScripts.find(s => s.id === selectedScriptId), [allScripts, selectedScriptId]);

  // Retrieves the current form values for the selected script.
  const currentParameters = useMemo(() => scriptParameters[selectedScriptId] || {}, [selectedScriptId, scriptParameters]);

  // FIX: Creates a list of parameters that should be rendered in the SIDEBAR.
  // It filters all script parameters to find only those with `layout: 'sidebar'`.
  const sidebarParametersToRender = useMemo(() => {
    if (!selectedScript?.parameters) return [];
    return selectedScript.parameters.filter(p => p.layout === 'sidebar');
  }, [selectedScript]);

  // FIX: Creates a list of parameters for the MAIN content area.
  // It filters out sidebar parameters, hard-coded special parameters, and applies `show_if` logic.
  const mainParametersToRender = useMemo(() => {
    if (!selectedScript?.parameters) return [];

    return selectedScript.parameters.filter(param => {
      // Exclude if it's meant for the sidebar.
      if (param.layout === 'sidebar') return false;
      // Exclude special parameters handled by dedicated components (like DeviceAuthFields).
      const specialParams = ["hostname", "inventory_file", "username", "password", "tests"];
      if (specialParams.includes(param.name)) return false;
      // Respect the `show_if` condition for dynamic visibility based on sidebar controls.
      if (param.show_if) {
        const controllingParamValue = currentParameters[param.show_if.name];
        return controllingParamValue === param.show_if.value;
      }
      // If not excluded, it belongs in the main form.
      return true;
    });
  }, [selectedScript, currentParameters]);


  // ==================================================================================
  // 4.5: Event Handlers & Callbacks
  //
  // `useCallback` hooks to create stable functions for event handlers,
  // preventing unnecessary re-renders of child components.
  // ==================================================================================

  // Resets all state related to a script run.
  const handleReset = useCallback((clearScriptId = true) => {
    const scriptIdToClear = selectedScriptId;
    if (clearScriptId) {
      setSelectedScriptId("");
    }
    setScriptParameters(prev => ({ ...prev, [scriptIdToClear]: {} }));
    setTopLevelError(null);
    scriptRunner.resetState();
  }, [selectedScriptId, scriptRunner]);

  // Handles changing the selected script.
  const handleScriptChange = useCallback((id) => {
    handleReset(false); // Reset states but don't clear the new ID.
    setSelectedScriptId(id);
    const script = allScripts.find(s => s.id === id);

    // IMPORTANT: Pre-populates the form with any default values from the script's metadata.
    // This is what makes "Perform Backup" the default selection.
    if (script?.parameters) {
      const defaults = {};
      script.parameters.forEach(p => {
        if (p.default !== undefined) {
          defaults[p.name] = p.default;
        }
      });
      setScriptParameters(prev => ({ ...prev, [id]: defaults }));
    }
  }, [allScripts, handleReset]);

  // A generic handler for any form input change.
  const handleParamChange = useCallback((name, value) => {
    if (!selectedScriptId) return;
    setScriptParameters(prev => ({
      ...prev,
      [selectedScriptId]: { ...(prev[selectedScriptId] || {}), [name]: value },
    }));
  }, [selectedScriptId]);


  // ==================================================================================
  // 4.6: Action Handlers
  //
  // Functions that initiate backend processes.
  // ==================================================================================

  const handleRunStandardScript = async () => {
    setTopLevelError(null);
    scriptRunner.resetState();
    const paramsToSend = { ...currentParameters };
    // Convert array of selected tests to a comma-separated string if needed.
    if (Array.isArray(paramsToSend.tests)) {
      paramsToSend.tests = paramsToSend.tests.join(',');
    }
    await scriptRunner.runScript({ scriptId: selectedScriptId, parameters: paramsToSend });
  };


  // ==================================================================================
  // 4.7: Main Render Logic
  //
  // The JSX that defines the component's structure and appearance.
  // ==================================================================================

  // Renders a loading spinner while fetching the initial script list.
  if (isLoading) {
    return (
      <div className="bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-center"><PulseLoader color="#3b82f6" size={12} /><p className="mt-4 text-slate-600">Loading scripts...</p></div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-screen">
      <RunnerNavBar
        allScripts={allScripts}
        selectedScriptId={selectedScriptId}
        onScriptChange={handleScriptChange}
        isActionInProgress={isActionInProgress}
        onReset={() => handleReset(true)}
        onViewHistory={() => { /* History functionality can be added here */ }}
        historyItemCount={0}
        isWsConnected={wsContext.isConnected}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Renders a welcome message if no script is selected yet. */}
        {!selectedScriptId ? (
          <div className="text-center py-24">
            <h2 className="text-2xl font-semibold text-slate-600">Select a tool to begin.</h2>
            {/* Renders an error message if script loading failed. */}
            {allScripts.length === 0 && !isLoading && (
              <div className="mt-8 max-w-2xl mx-auto"><div className="bg-red-50 border border-red-200 rounded-lg p-6"><h3 className="text-lg font-semibold text-red-800">No Scripts Available</h3><p className="text-red-700 mt-2">Unable to load scripts from the API. Please ensure the backend server is running and accessible at <code className="bg-red-100 p-1 rounded">{API_BASE_URL}</code>.</p>{topLevelError && (<div className="mt-4 p-3 bg-red-100 border-red-300 rounded"><strong>Error Details:</strong> {topLevelError}</div>)}</div></div>
            )}
          </div>
        ) : (
          <ErrorBoundary>
            {/* The main two-column layout for the runner page. */}
            <div className="flex flex-col md:flex-row gap-8">

              {/* --- LEFT SIDEBAR FOR SCRIPT OPTIONS --- */}
              <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
                <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
                  <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3"><Layers size={18} className="mr-2 text-slate-500" /> Script Options</h3>
                  {/* The sidebar renderer receives the filtered list of sidebar-specific parameters. */}
                  <ScriptOptionsRenderer
                    script={selectedScript}
                    parameters={currentParameters}
                    onParamChange={handleParamChange}
                    sidebarParameters={sidebarParametersToRender}
                  />
                </div>
              </aside>

              {/* --- MAIN CONTENT AREA --- */}
              <main className="flex-1 space-y-8">
                <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
                  <header className="border-b border-slate-200 pb-4 mb-6">
                    <h2 className="text-2xl font-bold text-slate-800">{selectedScript.displayName}</h2>
                    <p className="mt-1 text-slate-600">{selectedScript.description}</p>
                  </header>

                  <div className="space-y-6">
                    {/* Renders device connection fields if the script has `deviceAuth` capability. */}
                    {selectedScript.capabilities?.deviceAuth && (
                      <DeviceAuthFields parameters={currentParameters} onParamChange={handleParamChange} />
                    )}

                    {/* Renders the dynamic form for the main content area. */}
                    <div className="border-t border-slate-200 pt-6">
                      <h3 className="text-lg font-semibold text-slate-800 mb-4">Action Details</h3>
                      {/* This form receives the filtered list of main parameters. It will render
                          nothing if the list is empty (e.g., for the default "Perform Backup" action). */}
                      <DynamicScriptForm
                        parametersToRender={mainParametersToRender}
                        formValues={currentParameters}
                        onParamChange={handleParamChange}
                      />
                    </div>
                  </div>

                  {/* The main action button to run the script. */}
                  <div className="mt-8 border-t pt-6">
                      <button type="button" onClick={handleRunStandardScript} disabled={isActionInProgress} className="w-full flex items-center justify-center p-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-slate-400">
                        {scriptRunner.isRunning ? <PulseLoader color="#fff" size={8} /> : <><PlayCircle size={20} className="mr-2" /> Run Script</>}
                      </button>
                      {topLevelError && (<div className="mt-4 p-3 bg-red-50 text-red-700 rounded text-sm">{topLevelError}</div>)}
                  </div>
                </div>

                {/* The output display area, which only appears when a script is running or has completed. */}
                {(scriptRunner.isRunning || scriptRunner.isComplete) &&
                  <ScriptOutputDisplay
                    {...scriptRunner}
                    script={selectedScript} // Pass the script object to check for `enableReportSaving` capability.
                  />
                }
              </main>
            </div>
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

export default PythonScriptRunner;
