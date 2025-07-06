// ====================================================================================
// SECTION 1: IMPORTS & DEPENDENCIES
// ====================================================================================
// React and Core Hooks
import React, { useEffect, useState, useMemo, useCallback } from "react";

// External Libraries
import PulseLoader from "react-spinners/PulseLoader";

// Iconography from lucide-react
import {
  Tag,
  FileCode,
  PlayCircle,
  Layers,
  History,
  Clock,
  ServerCrash,
  CheckCircle,
  X,
  FileText,
  Plus,
  Minus,
  Wrench,
  Send,
  Wifi,
  WifiOff,
  Cpu,
} from "lucide-react";

// --- Local Custom Components (Ensuring all are imported) ---
import DeviceAuthFields from "./DeviceAuthFields.jsx";
import ScriptOutputDisplay from "./ScriptOutputDisplay.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import TestSelector from "./TestSelector.jsx";
import ScriptRunnerIcon from "./icons/ScriptRunnerIcon.jsx";
// Note: HistoryDrawer and ScriptFilterSidebar are now defined inside this file, so no import is needed.
import TemplateApplyProgress from "./TemplateApplyProgress.jsx";

// --- Local Custom Hooks (All necessary hooks for functionality) ---
import { useTestDiscovery } from "../hooks/useTestDiscovery.jsx";
import {
  useTemplateGeneration,
  useTemplateDiscovery,
} from "../hooks/useTemplateDiscovery.jsx";
// IMPORT BOTH WebSocket hooks for different script types
import {
  useWebSocket,
  useTemplateApplication,
  useScriptRunnerStream,
} from "../hooks/useWebSocket.jsx";

// ====================================================================================
// SECTION 2: API CONSTANTS
// ====================================================================================
const API_BASE_URL = "http://localhost:3001";

// ====================================================================================
// SECTION 3: HELPER & CHILD UI COMPONENTS (Restored from Original)
// These are smaller components used by the main runner. They are included here
// to ensure the file is self-contained and prevents "not defined" errors.
// ====================================================================================

function DiscoverableTestOptions({ script, parameters, setParameters }) {
  const { categorizedTests, loading, error } = useTestDiscovery(
    script?.id,
    parameters?.environment,
  );
  const handleTestToggle = (testId) => {
    const currentTests = parameters.tests || [];
    const newSelection = currentTests.includes(testId)
      ? currentTests.filter((id) => id !== testId)
      : [...currentTests, testId];
    setParameters({ ...parameters, tests: newSelection });
  };
  if (loading)
    return (
      <p className="text-sm text-slate-500 italic">Discovering tests...</p>
    );
  if (error)
    return <p className="text-sm font-semibold text-red-600">Error: {error}</p>;
  return (
    <TestSelector
      categorizedTests={categorizedTests}
      selectedTests={parameters.tests || []}
      onTestToggle={handleTestToggle}
    />
  );
}

function TemplateParameterForm({
  selectedTemplate,
  templateParams,
  onParamChange,
}) {
  if (!selectedTemplate || !selectedTemplate.parameters?.length) return null;
  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-slate-200 mb-6 mt-8">
      <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b pb-2 flex items-center">
        <Cpu size={18} className="mr-2 text-slate-500" /> Parameters for{" "}
        <span className="text-blue-600 ml-1">{selectedTemplate.name}</span>
      </h3>
      {selectedTemplate.description && (
        <p className="text-sm text-slate-600 italic mb-4">
          {selectedTemplate.description}
        </p>
      )}
      <div className="space-y-4">
        {selectedTemplate.parameters.map((param) => (
          <div key={param.name}>
            <label
              htmlFor={`param-${param.name}`}
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              {param.label}{" "}
              {param.required && <span className="text-red-500">*</span>}
            </label>
            <input
              type={param.type === "number" ? "number" : "text"}
              id={`param-${param.name}`}
              name={param.name}
              value={(templateParams || {})[param.name] || ""}
              onChange={(e) => onParamChange(param.name, e.target.value)}
              placeholder={param.placeholder || ""}
              required={param.required}
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
            {param.description && (
              <p className="mt-1 text-xs text-slate-500">{param.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateConfigurationOptions({ parameters, onTemplateSelected }) {
  const { categorizedTemplates, loading, error, discoverTemplates } =
    useTemplateDiscovery(null, parameters.environment);
  const [openCategory, setOpenCategory] = useState(null);
  const handleTemplateSelect = (templateId) => {
    const templateObject = Object.values(categorizedTemplates)
      .flat()
      .find((t) => t.id === templateId);
    onTemplateSelected(templateId, templateObject);
  };
  useEffect(() => {
    discoverTemplates(null, parameters.environment);
  }, [parameters.environment, discoverTemplates]);

  if (loading)
    return (
      <p className="text-sm text-slate-500 italic">Discovering templates...</p>
    );
  if (error)
    return <p className="text-sm font-semibold text-red-600">Error: {error}</p>;
  const toggleCategory = (categoryName) => {
    setOpenCategory(openCategory === categoryName ? null : categoryName);
  };
  return (
    <div className="space-y-4">
      <h3 className="text-md font-semibold text-slate-800 flex items-center mb-4">
        <FileText size={16} className="mr-2 text-slate-500" /> Choose Template
      </h3>
      {Object.entries(categorizedTemplates).length === 0 && !loading ? (
        <p className="text-sm text-slate-500 italic">No templates found.</p>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
          {Object.entries(categorizedTemplates).map(([category, templates]) => (
            <div
              key={category}
              className="border-b border-slate-200 last:border-b-0"
            >
              <button
                type="button"
                className="flex justify-between items-center w-full p-4 hover:bg-slate-50 focus:outline-none"
                onClick={() => toggleCategory(category)}
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-slate-700">{category}</span>
                  <span className="bg-slate-200 text-slate-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {templates.length}
                  </span>
                </div>
                {openCategory === category ? (
                  <Minus size={18} />
                ) : (
                  <Plus size={18} />
                )}
              </button>
              {openCategory === category && (
                <div className="p-4 bg-slate-50 border-t">
                  <div className="space-y-2">
                    {templates.map((template) => (
                      <label
                        key={template.id}
                        className="flex items-center text-sm font-medium text-slate-700 cursor-pointer p-2 rounded hover:bg-slate-100"
                      >
                        <input
                          type="radio"
                          name="selectedTemplate"
                          value={template.id}
                          checked={parameters.templateId === template.id}
                          onChange={() => handleTemplateSelect(template.id)}
                          className="h-4 w-4 text-blue-600"
                        />
                        <span className="ml-2">{template.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScriptOptionsRenderer({
  script,
  parameters,
  setParameters,
  onTemplateSelected,
}) {
  if (!script) return null;
  if (script.capabilities?.dynamicDiscovery)
    return (
      <DiscoverableTestOptions
        script={script}
        parameters={parameters}
        setParameters={setParameters}
      />
    );
  if (script.capabilities?.templateGeneration)
    return (
      <TemplateConfigurationOptions
        parameters={parameters}
        onTemplateSelected={onTemplateSelected}
      />
    );
  return (
    <p className="text-xs text-slate-500 italic">
      This script has no additional options.
    </p>
  );
}

function ScriptFilterSidebar({
  allScripts,
  selectedCategories,
  onCategoryChange,
  selectedScript,
  scriptParameters,
  setParameters,
  onTemplateSelected,
}) {
  const { uniqueCategories, scriptCounts } = useMemo(() => {
    const counts = {};
    allScripts.forEach((script) => {
      if (script.category)
        counts[script.category] = (counts[script.category] || 0) + 1;
    });
    return {
      uniqueCategories: Object.keys(counts).sort(),
      scriptCounts: counts,
    };
  }, [allScripts]);

  const handleCheckboxChange = (category) => {
    const newSelection = new Set(selectedCategories);
    newSelection.has(category)
      ? newSelection.delete(category)
      : newSelection.add(category);
    onCategoryChange(Array.from(newSelection));
  };
  return (
    <aside className="w-full md:w-64 lg:w-72 flex-shrink-0">
      <div className="sticky top-24 space-y-8">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b pb-2 flex items-center">
            <Tag size={18} className="mr-2 text-slate-500" /> Filter by Category
          </h3>
          <div className="space-y-1">
            {uniqueCategories.map((category) => (
              <label
                key={category}
                className="flex items-center justify-between text-sm font-medium p-2 cursor-pointer"
              >
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(category)}
                    onChange={() => handleCheckboxChange(category)}
                    className="h-4 w-4 rounded"
                  />
                  <span className="ml-3">{category}</span>
                </div>
                <span className="bg-slate-200 text-slate-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {scriptCounts[category]}
                </span>
              </label>
            ))}
            {selectedCategories.length > 0 && (
              <button
                onClick={() => onCategoryChange([])}
                className="text-sm text-blue-600 hover:underline mt-4 p-2 font-medium"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
        {selectedScript && (
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b pb-2 flex items-center">
              <Layers size={18} className="mr-2 text-slate-500" /> Script
              Options
            </h3>
            <ScriptOptionsRenderer
              script={selectedScript}
              parameters={scriptParameters}
              setParameters={setParameters}
              onTemplateSelected={onTemplateSelected}
            />
          </div>
        )}
      </div>
    </aside>
  );
}

function HistoryDrawer({
  isOpen,
  onClose,
  history,
  isLoading,
  onSelectHistoryItem,
  selectedHistoryId,
}) {
  useEffect(() => {
    const handleEsc = (event) => {
      if (event.keyCode === 27) onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 bottom-0 w-80 bg-white shadow-xl z-50 transform transition-transform ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="p-4 h-full flex flex-col">
          <header className="flex items-center justify-between border-b pb-3 mb-4">
            <h3 className="text-lg font-semibold flex items-center">
              <History size={18} className="mr-2" /> Run History
            </h3>
            <button onClick={onClose} className="p-1 rounded-full">
              <X size={20} />
            </button>
          </header>
          <div className="overflow-y-auto flex-1 pr-2">
            {isLoading ? (
              <p>Loading history...</p>
            ) : history.length === 0 ? (
              <p>No recent runs.</p>
            ) : (
              <ul>
                {history.map((run) => (
                  <li key={run.runId}>
                    <button
                      onClick={() => {
                        onSelectHistoryItem(run.runId);
                        onClose();
                      }}
                      className={`w-full text-left p-2 rounded-md hover:bg-slate-100 ${selectedHistoryId === run.runId ? "bg-blue-50" : ""}`}
                    >
                      <div className="flex items-center justify-between font-medium text-sm text-slate-800">
                        <span className="truncate">{run.scriptId}</span>
                        {run.isSuccess ? (
                          <CheckCircle size={16} className="text-green-500" />
                        ) : (
                          <ServerCrash size={16} className="text-red-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                        <Clock size={12} />
                        <span>
                          {new Date(run.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function StreamedOutputDisplay({ runnerState, onReset }) {
  if (!runnerState.isRunning && !runnerState.isComplete) return null;

  return (
    <div className="mt-10 border border-slate-200 rounded-lg p-6 lg:p-8 bg-white shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-slate-800 flex items-center">
          <FileCode size={20} className="mr-2 text-slate-500" />
          Script Output
        </h3>
        {runnerState.isComplete && (
          <button
            onClick={onReset}
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            Clear Output
          </button>
        )}
      </div>
      <ScriptOutputDisplay
        output={runnerState.output}
        error={runnerState.error}
      />
    </div>
  );
}

// ====================================================================================
// SECTION 4: MAIN PAGE COMPONENT - MERGED & CORRECTED
// ====================================================================================
function PythonScriptRunner() {
  // --- State for UI, Script Selection, and Parameters ---
  const [allScripts, setAllScripts] = useState([]);
  const [loadingScripts, setLoadingScripts] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [scriptParameters, setScriptParameters] = useState({});
  const [selectedTemplateDetails, setSelectedTemplateDetails] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [topLevelError, setTopLevelError] = useState(null);

  // --- State for the Two-Step Workflow ---
  const [generatedConfig, setGeneratedConfig] = useState(null);

  // --- ✨ REFACTORED: Single source of truth for WebSocket connection ---
  const wsContext = useWebSocket({ autoConnect: true });

  // --- Instantiate ALL necessary hooks for different actions ---
  const { generateConfig, loading: isGenerating } = useTemplateGeneration();
  const templateRunner = useTemplateApplication(wsContext);
  const scriptRunner = useScriptRunnerStream(wsContext);

  // A single, reliable flag to know if ANY background process is running
  const isActionInProgress =
    isGenerating || templateRunner.isApplying || scriptRunner.isRunning;

  // --- Data Fetching ---
  useEffect(() => {
    async function fetchScripts() {
      setLoadingScripts(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/scripts/list`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        setAllScripts(data.scripts || []);
      } catch (err) {
        setTopLevelError(`Error loading scripts: ${err.message}`);
      } finally {
        setLoadingScripts(false);
      }
    }
    fetchScripts();
  }, []);

  useEffect(() => {
    // Fetch history when the component loads or any run completes
    if (
      templateRunner.isComplete ||
      scriptRunner.isComplete ||
      historyItems.length === 0
    ) {
      setLoadingHistory(true);
      fetch(`${API_BASE_URL}/api/history/list`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setHistoryItems(data.history || []);
        })
        .finally(() => setLoadingHistory(false));
    }
  }, [templateRunner.isComplete, scriptRunner.isComplete, isHistoryDrawerOpen]);

  // --- Memoized Derived State ---
  const selectedScript = useMemo(
    () => allScripts.find((s) => s.id === selectedScriptId),
    [allScripts, selectedScriptId],
  );
  const liveScriptParameters = useMemo(
    () => scriptParameters[selectedScriptId] || {},
    [selectedScriptId, scriptParameters],
  );

  const displayedHistoryOutput = useMemo(() => {
    if (!selectedHistoryId) return null;
    const historicRun = historyItems.find((h) => h.runId === selectedHistoryId);
    return historicRun
      ? { output: historicRun.output, error: historicRun.error }
      : null;
  }, [selectedHistoryId, historyItems]);

  // --- UI Event Handlers using useCallback for stable references ---
  const handleScriptChange = useCallback(
    (scriptId) => {
      setSelectedScriptId(scriptId);
      setGeneratedConfig(null);
      setTopLevelError(null);
      setSelectedTemplateDetails(null);
      setSelectedHistoryId(null);
      templateRunner.resetState();
      scriptRunner.resetState();
    },
    [templateRunner, scriptRunner],
  );

  const updateCurrentScriptParameters = useCallback(
    (newParams) => {
      if (!selectedScriptId) return;
      setScriptParameters((prev) => ({
        ...prev,
        [selectedScriptId]: newParams,
      }));
    },
    [selectedScriptId],
  );

  const handleTemplateSelected = useCallback(
    (templateId, templateObject) => {
      updateCurrentScriptParameters({
        ...liveScriptParameters,
        templateId,
        templateParams: {},
      });
      setSelectedTemplateDetails(templateObject);
    },
    [liveScriptParameters, updateCurrentScriptParameters],
  );

  const handleTemplateParamChange = useCallback(
    (paramName, value) => {
      updateCurrentScriptParameters({
        ...liveScriptParameters,
        templateParams: {
          ...(liveScriptParameters.templateParams || {}),
          [paramName]: value,
        },
      });
    },
    [liveScriptParameters, updateCurrentScriptParameters],
  );

  const handleSelectHistoryItem = useCallback(
    (runId) => {
      handleScriptChange(""); // Clear current selections
      setSelectedHistoryId(runId);
    },
    [handleScriptChange],
  );

  // --- Action Handlers: The core logic for the buttons ---
  const handleGenerateConfig = async () => {
    setTopLevelError(null);
    setGeneratedConfig(null);
    templateRunner.resetState();

    const result = await generateConfig(
      liveScriptParameters.templateId,
      liveScriptParameters.templateParams || {},
    );
    if (result.success) {
      setGeneratedConfig(result.generated_config);
    } else {
      setTopLevelError(`Generation Error: ${result.error || "Unknown error"}`);
    }
  };

  const handleApplyConfig = async () => {
    setTopLevelError(null);
    if (!generatedConfig) {
      alert("Please generate config first.");
      return;
    }
    await templateRunner.applyTemplate({
      templateId: selectedScript.id,
      renderedConfig: generatedConfig,
      targetHostname: liveScriptParameters.hostname,
      inventoryFile: liveScriptParameters.inventory,
      username: liveScriptParameters.username,
      password: liveScriptParameters.password,
      commitCheck: liveScriptParameters.commitCheck || false,
    });
  };

  const handleRunOtherScript = async () => {
    setTopLevelError(null);
    try {
      // `runScript` is from the `useScriptRunnerStream` hook
      await scriptRunner.runScript({
        scriptId: selectedScriptId,
        parameters: liveScriptParameters,
      });
    } catch (error) {
      // This will now catch the "WebSocket not connected" error
      // and display it cleanly to the user.
      alert(`Could not run script: ${error.message}`);
      console.error("Script execution failed to start:", error);
    }
  };

  // --- Main Render (JSX) ---
  return (
    <div className="bg-slate-100 min-h-screen rounded-xl">
      <HistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        history={historyItems}
        isLoading={loadingHistory}
        onSelectHistoryItem={handleSelectHistoryItem}
        selectedHistoryId={selectedHistoryId}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-4">
            <ScriptRunnerIcon className="h-10 w-10" />
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-slate-900">
              Script Runner
            </h1>

            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${wsContext.isConnected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800 animate-pulse"}`}
            >
              {wsContext.isConnected ? (
                <Wifi size={14} />
              ) : (
                <WifiOff size={14} />
              )}
              <span>{wsContext.isConnected ? "Live" : "Offline"}</span>
            </div>
          </div>
          <button
            onClick={() => setIsHistoryDrawerOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <History size={16} />
            <span>View History</span>
            {historyItems.length > 0 && (
              <span className="bg-blue-600 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">
                {historyItems.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-x-10 gap-y-12">
          <ScriptFilterSidebar
            allScripts={allScripts}
            selectedCategories={selectedCategories}
            onCategoryChange={setSelectedCategories}
            selectedScript={selectedScript}
            scriptParameters={liveScriptParameters}
            setParameters={updateCurrentScriptParameters}
            onTemplateSelected={handleTemplateSelected}
          />

          <main className="flex-1">
            <ErrorBoundary>
              {/* --- Panel 1: Configuration & Action Buttons --- */}
              <div className="mb-8 border border-slate-200 rounded-lg p-6 lg:p-8 shadow-md bg-white">
                <div className="mb-6">
                  <label
                    htmlFor="script-select"
                    className="block text-sm font-medium text-slate-700 mb-2"
                  >
                    Select Script
                  </label>
                  <select
                    id="script-select"
                    value={selectedScriptId}
                    onChange={(e) => handleScriptChange(e.target.value)}
                    disabled={isActionInProgress}
                    className="block w-full border-slate-300 rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                  >
                    <option value="">--- Choose a script ---</option>
                    {allScripts.map((script) => (
                      <option key={script.id} value={script.id}>
                        {script.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedScriptId && (
                  <div className="border-t border-slate-200 pt-6 mt-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4">
                      Device & Authentication
                    </h3>
                    <DeviceAuthFields
                      parameters={liveScriptParameters}
                      onParamChange={updateCurrentScriptParameters}
                    />
                  </div>
                )}

                {selectedScript?.capabilities?.templateGeneration && (
                  <TemplateParameterForm
                    selectedTemplate={selectedTemplateDetails}
                    templateParams={liveScriptParameters.templateParams}
                    onParamChange={handleTemplateParamChange}
                  />
                )}

                <div className="mt-8">
                  {selectedScript?.capabilities?.templateGeneration ? (
                    <div className="space-y-4">
                      <button
                        type="button"
                        onClick={handleGenerateConfig}
                        disabled={isActionInProgress}
                        className="w-full flex items-center justify-center px-4 py-3 rounded-md bg-green-600 text-white text-lg font-semibold hover:bg-green-700 disabled:bg-slate-400 transition-all"
                      >
                        {isGenerating ? (
                          <PulseLoader color="#fff" size={10} />
                        ) : (
                          <>
                            <Wrench size={20} className="mr-2" />
                            1. Generate Config
                          </>
                        )}
                      </button>
                      {generatedConfig && (
                        <button
                          type="button"
                          onClick={handleApplyConfig}
                          disabled={isActionInProgress}
                          className="w-full flex items-center justify-center px-4 py-3 rounded-md bg-blue-600 text-white text-lg font-semibold hover:bg-blue-700 disabled:bg-slate-400 transition-all"
                        >
                          {templateRunner.isApplying ? (
                            <PulseLoader color="#fff" size={10} />
                          ) : (
                            <>
                              <Send size={20} className="mr-2" />
                              2. Apply to Device
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  ) : selectedScriptId ? (
                    <button
                      type="button"
                      onClick={handleRunOtherScript}
                      disabled={isActionInProgress}
                      className="w-full flex items-center justify-center px-4 py-3 rounded-md bg-blue-600 text-white text-lg font-semibold hover:bg-blue-700 disabled:bg-slate-400 transition-all"
                    >
                      {scriptRunner.isRunning ? (
                        <PulseLoader color="#fff" size={10} />
                      ) : (
                        <>
                          <PlayCircle size={22} className="mr-2" />
                          Run Script
                        </>
                      )}
                    </button>
                  ) : null}
                </div>
                {topLevelError && (
                  <div className="mt-4 p-3 bg-red-50 text-red-700 rounded text-sm">
                    {topLevelError}
                  </div>
                )}
              </div>

              {/* --- Panel 2: Generated Config Verification --- */}
              {generatedConfig &&
                !templateRunner.isApplying &&
                !templateRunner.isComplete && (
                  <div className="mt-10 border border-green-300 rounded-lg p-6 lg:p-8 bg-green-50 shadow-md">
                    <h3 className="text-xl font-semibold mb-4 text-green-800 flex items-center">
                      <CheckCircle size={20} className="mr-2" />
                      Generated Configuration (Please Verify)
                    </h3>
                    <pre className="bg-slate-900 text-white p-4 rounded-md text-sm overflow-x-auto max-h-96">
                      <code>{generatedConfig}</code>
                    </pre>
                  </div>
                )}

              {/* --- Panel 3, 4, 5: Real-time Progress, Streamed Output, and History --- */}
              <TemplateApplyProgress
                applicationState={templateRunner}
                onReset={templateRunner.resetState}
              />
              <StreamedOutputDisplay
                runnerState={scriptRunner}
                onReset={scriptRunner.resetState}
              />

              {displayedHistoryOutput && (
                <div className="mt-10 border border-slate-200 rounded-lg p-6 lg:p-8 bg-white shadow-md">
                  <h3 className="text-xl font-semibold mb-4 text-slate-800">
                    Historical Run Result
                  </h3>
                  <ScriptOutputDisplay
                    output={displayedHistoryOutput.output}
                    error={displayedHistoryOutput.error}
                  />
                </div>
              )}
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
}

export default PythonScriptRunner;
