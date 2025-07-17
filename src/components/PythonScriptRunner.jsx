// ====================================================================================
// FILE: PythonScriptRunner.jsx
// ====================================================================================
//
// Description: The main React component for the script runner application. It manages
//              the overall UI/UX, including script selection, parameter input,
//              script execution via WebSockets, and displaying results or history.
//              It now renders the RunnerDashboard as its initial view.
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
import RunnerDashboard from "./RunnerDashboard.jsx"; // <<< ENHANCEMENT: Import the new dashboard component

// Custom hook imports
import { useWebSocket, useScriptRunnerStream } from "../hooks/useWebSocket.jsx";

const API_BASE_URL = "http://localhost:3001";

// ====================================================================================
// SECTION 1: Main Python Script Runner Component
// ====================================================================================

function PythonScriptRunner() {
    // -----------------------------------
    // State Management
    // -----------------------------------
    const [allScripts, setAllScripts] = useState([]);
    const [selectedScriptId, setSelectedScriptId] = useState("");
    const [scriptParameters, setScriptParameters] = useState({});
    const [topLevelError, setTopLevelError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
    const [historyItems, setHistoryItems] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [selectedHistoryId, setSelectedHistoryId] = useState(null);
    const [historyOutput, setHistoryOutput] = useState(null);

    // -----------------------------------
    // Hooks for WebSocket and Script Streaming
    // -----------------------------------
    const wsContext = useWebSocket({ autoConnect: true });
    const scriptRunner = useScriptRunnerStream(wsContext);
    const isActionInProgress = scriptRunner.isRunning;

    // -----------------------------------
    // Data Fetching Effects
    // -----------------------------------

    /**
     * This effect fetches the list of all available scripts from the backend
     * when the component initially mounts.
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
    }, []); // Empty dependency array ensures this runs only once.

    /**
     * This effect fetches the script run history from the backend, but only when
     * the history drawer is opened to avoid unnecessary API calls.
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
    }, [isHistoryDrawerOpen]); // Re-runs whenever the drawer's open state changes.

    // -----------------------------------
    // Memoized Values for Performance
    // -----------------------------------

    /**
     * Memoizes the currently selected script object to prevent re-computation
     * on every render unless the list of scripts or the selected ID changes.
     */
    const selectedScript = useMemo(() => allScripts.find(s => s.id === selectedScriptId), [allScripts, selectedScriptId]);

    /**
     * Memoizes the parameters for the currently selected script.
     */
    const currentParameters = useMemo(() => scriptParameters[selectedScriptId] || {}, [selectedScriptId, scriptParameters]);

    /**
     * Memoizes the list of parameters to be rendered in the main form area.
     * This logic filters out special parameters (handled elsewhere) and handles
     * conditional visibility (`show_if`) based on other parameter values.
     */
    const mainParametersToRender = useMemo(() => {
        if (!selectedScript?.parameters) return [];
        const specialHandledParams = ["hostname", "username", "password", "backup_file", "inventory_file"];
        return selectedScript.parameters.filter(param => {
            if (specialHandledParams.includes(param.name) || param.layout === 'sidebar') return false;
            if (param.show_if) {
                const controllingParamValue = currentParameters[param.show_if.name];
                return controllingParamValue === param.show_if.value;
            }
            return true;
        });
    }, [selectedScript, currentParameters]);

    // -----------------------------------
    // Event Handlers (wrapped in useCallback)
    // -----------------------------------

    /**
     * Handles selecting a history item from the drawer. It sets the UI state
     * to display the details and output of that past run.
     * useCallback ensures the function reference is stable between renders.
     */
    const handleSelectHistoryItem = useCallback((runId) => {
        const item = historyItems.find(h => h.runId === runId);
        if (item) {
            scriptRunner.resetState();
            setSelectedHistoryId(runId);
            setSelectedScriptId(item.scriptId);
            setHistoryOutput({
                finalResult: item.isSuccess ? JSON.parse(item.output) : null,
                error: item.isSuccess ? null : item.error,
                fullLog: item.isSuccess ? item.output : item.error,
                isComplete: true,
                isRunning: false,
            });
        }
    }, [historyItems, scriptRunner]);

    /**
     * Handles changing the selected script. It resets any previous run state
     * and initializes the parameters for the newly selected script with defaults.
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
            setScriptParameters(prev => ({ ...prev, [id]: { ...defaults, ...(prev[id] || {}) } }));
        }
    }, [allScripts, scriptRunner]);

    /**
     * Handles updates to any script parameter, storing the value in state.
     */
    const handleParamChange = useCallback((name, value) => {
        if (!selectedScriptId) return;
        setScriptParameters(prev => ({
            ...prev,
            [selectedScriptId]: { ...(prev[selectedScriptId] || {}), [name]: value }
        }));
    }, [selectedScriptId]);

    /**
     * Triggers the execution of a standard script by calling the streaming hook.
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
    // UI Rendering Logic
    // -----------------------------------

    /**
     * The main rendering function that decides what to display based on the
     * application's current state (e.g., dashboard, script form, loading).
     */
    const renderToolUI = () => {
        // <<< ENHANCEMENT: If no script is selected, render the new RunnerDashboard.
        if (!selectedScript) {
            return <RunnerDashboard />;
        }

        // Handle scripts with special custom UIs.
        if (selectedScript.capabilities?.customUI === 'templateWorkflow') {
            return <TemplateWorkflow wsContext={wsContext} />;
        }

        // Determine whether to show live output or historical output.
        const displayProps = selectedHistoryId ? historyOutput : scriptRunner;

        // Render the standard script runner interface.
        return (
            <ErrorBoundary>
                <div className="flex flex-col md:flex-row gap-8">
                    {/* Sidebar for Script Options */}
                    <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
                        <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
                            <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
                                <Layers size={18} className="mr-2 text-slate-500" /> Script Options
                            </h3>
                            <ScriptOptionsRenderer script={selectedScript} parameters={currentParameters} onParamChange={handleParamChange} />
                        </div>
                    </aside>

                    {/* Main Content Area */}
                    <main className="flex-1 space-y-8">
                        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
                            <header className="border-b border-slate-200 pb-4 mb-6">
                                <h2 className="text-2xl font-bold text-slate-800">{selectedScript.displayName}</h2>
                                <p className="mt-1 text-slate-600">{selectedScript.description}</p>
                            </header>

                            {/* Form Sections */}
                            <div className="space-y-6">
                                {selectedScript.capabilities?.deviceAuth && (
                                    <>
                                        <DeviceAuthFields script={selectedScript} parameters={currentParameters} onParamChange={handleParamChange} />
                                        <FetchDynamicOptions script={selectedScript} parameters={currentParameters} onParamChange={handleParamChange} />
                                    </>
                                )}
                                <div className="border-t border-slate-200 pt-6">
                                    <h3 className="text-lg font-semibold text-slate-800 mb-4">Action Details</h3>
                                    <DynamicScriptForm parametersToRender={mainParametersToRender} formValues={currentParameters} onParamChange={handleParamChange} />
                                </div>
                            </div>

                            {/* Action Button */}
                            <div className="mt-8 border-t pt-6">
                                <button
                                    type="button"
                                    onClick={handleRunStandardScript}
                                    disabled={isActionInProgress}
                                    className="w-full flex items-center justify-center p-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition duration-150 ease-in-out"
                                >
                                    {isActionInProgress ? <PulseLoader color="#fff" size={8} /> : ( <><PlayCircle size={20} className="mr-2" /> Run Script</> )}
                                </button>
                            </div>
                        </div>

                        {/* Output Display */}
                        {(displayProps.isRunning || displayProps.isComplete) && (
                            <ScriptOutputDisplay {...displayProps} script={selectedScript} />
                        )}
                    </main>
                </div>
            </ErrorBoundary>
        );
    };

    // Render a global loading spinner while fetching initial script list.
    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><PulseLoader color="#3b82f6" /></div>;
    }

    // Render the final page structure with Navbar and content area.
    return (
        <div className="bg-slate-50 min-h-screen">
            <RunnerNavBar
                allScripts={allScripts}
                selectedScriptId={selectedScriptId}
                onScriptChange={handleScriptChange}
                isActionInProgress={isActionInProgress}
                onReset={() => handleScriptChange("")}
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
