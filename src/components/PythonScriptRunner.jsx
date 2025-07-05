// src/components/PythonScriptRunner.jsx

import React, { useEffect, useState, useMemo } from "react";
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
  Cpu,
  ChevronDown,
  Plus,
  Minus,
  Wrench, // Icon for Generate
  Send, // Icon for Apply
} from "lucide-react";
import PulseLoader from "react-spinners/PulseLoader";

// === EXTERNAL COMPONENT DEPENDENCIES (These must exist in your project) ===
import DeviceAuthFields from "./DeviceAuthFields";
import ScriptOutputDisplay from "./ScriptOutputDisplay";
import ErrorBoundary from "./ErrorBoundary";
import TestSelector from "./TestSelector";
import ScriptRunnerIcon from "./icons/ScriptRunnerIcon";

// === EXTERNAL HOOK DEPENDENCY ===
// This import must correctly bring in the fixed `useTemplateGeneration` hook.
import { useTestDiscovery } from "../hooks/useTestDiscovery";
import {
  useTemplateDiscovery,
  useTemplateGeneration,
} from "../hooks/useTemplateDiscovery";

const API_BASE_URL = "http://localhost:3001";

// ====================================================================================
// === INTERNAL HELPER COMPONENTS (Included to prevent "not defined" errors) =========
// ====================================================================================
// Note: These are the internal components from your file, included here for completeness.

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
              min={param.type === "number" ? param.min : undefined}
              max={param.type === "number" ? param.max : undefined}
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
                <div className="p-4 bg-slate-25 border-t border-slate-100">
                  <div className="space-y-2">
                    {templates.map((template) => (
                      <label
                        key={template.id}
                        className="flex items-center text-sm font-medium text-slate-700 cursor-pointer hover:bg-slate-100 p-2 rounded"
                      >
                        <input
                          type="radio"
                          name="selectedTemplate"
                          value={template.id}
                          checked={parameters.templateId === template.id}
                          onChange={() => handleTemplateSelect(template.id)}
                          className="h-4 w-4 text-blue-600 border-slate-300"
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
          <div className="overflow-y-auto flex-1">
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
                      className={`w-full text-left p-2 rounded-md ${selectedHistoryId === run.runId ? "bg-blue-50" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate">{run.scriptId}</span>
                        {run.isSuccess ? (
                          <CheckCircle size={16} className="text-green-500" />
                        ) : (
                          <ServerCrash size={16} className="text-red-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs mt-1">
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

// ====================================================================================
// === MAIN PAGE COMPONENT with Two-Step "Generate & Apply" Workflow ================
// ====================================================================================
function PythonScriptRunner() {
  // --- Standard State Management ---
  const [allScripts, setAllScripts] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [scriptParameters, setScriptParameters] = useState({});
  const [scriptOutputs, setScriptOutputs] = useState({});
  const [error, setError] = useState(null);
  const [loadingScripts, setLoadingScripts] = useState(true);
  const [historyItems, setHistoryItems] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [selectedTemplateDetails, setSelectedTemplateDetails] = useState(null);

  // --- State for the Two-Step Workflow ---
  const [generatedConfig, setGeneratedConfig] = useState(null);
  const [isRunningOther, setIsRunningOther] = useState(false);

  // --- This is the key: Instantiate the custom hook for template generation ---
  const {
    generateConfig,
    loading: isGenerating,
    error: generationError,
  } = useTemplateGeneration();

  // Use a separate loading state for the "Apply" button.
  const [isApplying, setIsApplying] = useState(false);

  // --- Effect Hooks for fetching initial data ---
  useEffect(() => {
    async function fetchScripts() {
      setLoadingScripts(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/scripts/list`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        setAllScripts(data.scripts || []);
      } catch (err) {
        setError(`Error loading scripts: ${err.message}`);
      } finally {
        setLoadingScripts(false);
      }
    }
    fetchScripts();
  }, []);

  useEffect(() => {
    async function fetchHistory() {
      setLoadingHistory(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/history/list`);
        const data = await res.json();
        if (data.success) setHistoryItems(data.history || []);
      } catch (err) {
        console.error("Failed to fetch history:", err);
      } finally {
        setLoadingHistory(false);
      }
    }
    fetchHistory();
  }, []);

  // --- Memoized values to compute derived state efficiently ---
  const filteredScripts = useMemo(() => {
    if (selectedCategories.length === 0) return allScripts;
    return allScripts.filter((s) => selectedCategories.includes(s.category));
  }, [allScripts, selectedCategories]);

  const selectedScript = useMemo(
    () => allScripts.find((s) => s.id === selectedScriptId),
    [allScripts, selectedScriptId],
  );
  const liveScriptParameters = useMemo(
    () => scriptParameters[selectedScriptId] || {},
    [selectedScriptId, scriptParameters],
  );

  // With this improved version:
  const displayedOutput = useMemo(() => {
    if (selectedHistoryId) {
      const historicRun = historyItems.find(
        (h) => h.runId === selectedHistoryId,
      );
      return historicRun
        ? { output: historicRun.output, error: historicRun.error }
        : { output: null, error: null };
    }
    return scriptOutputs[selectedScriptId] || { output: null, error: null };
  }, [selectedHistoryId, historyItems, scriptOutputs, selectedScriptId]);

  // --- State Update Handlers ---
  const handleScriptChange = (scriptId) => {
    setSelectedScriptId(scriptId);
    setSelectedHistoryId(null);
    setScriptOutputs({});
    setError(null);
    setGeneratedConfig(null);
    setSelectedTemplateDetails(null);
  };
  const updateCurrentScriptParameters = (newParams) => {
    if (!selectedScriptId) return;
    setScriptParameters((prev) => ({ ...prev, [selectedScriptId]: newParams }));
  };
  const handleTemplateSelectedFromChild = (templateId, templateObject) => {
    updateCurrentScriptParameters({
      ...liveScriptParameters,
      templateId: templateId,
      templateParams: {},
    });
    setSelectedTemplateDetails(templateObject);
  };
  const handleTemplateParamChange = (paramName, value) => {
    if (!selectedScriptId) return;
    setScriptParameters((prev) => ({
      ...prev,
      [selectedScriptId]: {
        ...(prev[selectedScriptId] || {}),
        templateParams: {
          ...(prev[selectedScriptId]?.templateParams || {}),
          [paramName]: value,
        },
      },
    }));
  };
  const handleSelectHistoryItem = (runId) => {
    setSelectedHistoryId(runId);
    setSelectedScriptId("");
    setScriptOutputs({});
    setError(null);
    setGeneratedConfig(null);
  };

  // ===================================================================================
  // === ACTION HANDLERS for Generate, Apply, and Run ================================
  // ===================================================================================

  /**
   * Action 1: Handles the "Generate Config" button click.
   * It now correctly uses the `generateConfig` function from our custom hook.
   */
  const handleGenerateConfig = async () => {
    if (!selectedScriptId || !liveScriptParameters.templateId) {
      setError("Please select a script and a template first.");
      return;
    }
    setError(null);
    setGeneratedConfig(null);
    setScriptOutputs({});

    // Call the function from the hook. The hook itself manages the `isGenerating` state via its return value.
    const result = await generateConfig(
      liveScriptParameters.templateId,
      liveScriptParameters.templateParams || {},
    );

    // `console.log` added for final debugging verification.
    console.log("RECEIVED RESULT IN COMPONENT:", result);

    // The hook now reliably returns the result object.
    if (result.success) {
      // If successful, update the state. This will cause the UI to re-render and show the verification box.
      setGeneratedConfig(result.generated_config);
    } else {
      // If it failed, display the error from the result object.
      setError(
        `Generation Error: ${result.error || "An unknown error occurred."}`,
      );
    }
  };

  /**
   * Action 2: Handles the "Apply to Device" button click.
   */
  const handleApplyConfig = async () => {
    if (!generatedConfig) {
      alert("Please generate a configuration first.");
      return;
    }
    const currentParams = liveScriptParameters;
    const {
      hostname,
      inventory_file,
      username,
      password,
      templateId,
      commit_check,
    } = currentParams;
    if (!hostname || !username || !password) {
      setError(
        "Hostname, Username, and Password are required to apply configuration.",
      );
      return;
    }
    setIsApplying(true);
    setError(null);
    setScriptOutputs({});
    try {
      const payload = {
        templateId: templateId,
        renderedConfig: generatedConfig,
        targetHostname: hostname,
        inventoryFile: inventory_file,
        username: username,
        password: password,
        commitCheck: commit_check || false,
      };
      const response = await fetch(`${API_BASE_URL}/api/templates/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to apply configuration.");
      }
      setScriptOutputs({
        [selectedScriptId]: {
          output: JSON.stringify(data, null, 2),
          error: null,
        },
      });
    } catch (err) {
      setError(`Apply Error: ${err.message}`);
      setScriptOutputs({
        [selectedScriptId]: { output: null, error: err.message },
      });
    } finally {
      setIsApplying(false);
    }
  };

  /**
   * Action 3: Handles the "Run Script" button for non-template scripts.
   */
  const handleRunOtherScript = async () => {
    if (!selectedScriptId) return;
    setIsRunningOther(true);
    setError(null);
    setScriptOutputs({});
    try {
      const payload = {
        scriptId: selectedScriptId,
        parameters: liveScriptParameters,
      };
      const res = await fetch(`${API_BASE_URL}/api/scripts/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || data.message || "Request failed");
      setScriptOutputs({
        [selectedScriptId]: { output: data.output, error: data.error || null },
      });
      const historyRes = await fetch(`${API_BASE_URL}/api/history/list`);
      const historyData = await historyRes.json();
      if (historyData.success) {
        setHistoryItems(historyData.history);
        setSelectedHistoryId(historyData.history[0]?.runId);
      }
    } catch (err) {
      setError(`Script error: ${err.message}`);
    } finally {
      setIsRunningOther(false);
    }
  };

  // ===================================================================================
  // === JSX / UI RENDERING ============================================================
  // ===================================================================================
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
            onTemplateSelected={handleTemplateSelectedFromChild}
          />
          <main className="flex-1">
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
                  disabled={isApplying || isGenerating || isRunningOther}
                  className="block w-full border-slate-300 rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                >
                  <option value="">
                    {filteredScripts.length > 0
                      ? `--- Choose from ${filteredScripts.length} script(s) ---`
                      : "No scripts match filter"}
                  </option>
                  {filteredScripts.map((script) => (
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
                  templateParams={liveScriptParameters.templateParams || {}}
                  onParamChange={handleTemplateParamChange}
                />
              )}
              <div className="mt-8">
                {selectedScript?.capabilities?.templateGeneration ? (
                  <div className="space-y-4">
                    <button
                      type="button"
                      onClick={handleGenerateConfig}
                      disabled={isGenerating || isApplying || !selectedScriptId}
                      className="w-full flex items-center justify-center px-4 py-3 rounded-md bg-green-600 text-white text-lg font-semibold hover:bg-green-700 disabled:bg-slate-400 transition-all"
                    >
                      {isGenerating ? (
                        <PulseLoader color={"#ffffff"} size={10} />
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
                        disabled={isApplying || isGenerating}
                        className="w-full flex items-center justify-center px-4 py-3 rounded-md bg-blue-600 text-white text-lg font-semibold hover:bg-blue-700 disabled:bg-slate-400 transition-all"
                      >
                        {isApplying ? (
                          <PulseLoader color={"#ffffff"} size={10} />
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
                    disabled={isRunningOther}
                    className="w-full flex items-center justify-center px-4 py-3 rounded-md bg-blue-600 text-white text-lg font-semibold hover:bg-blue-700 disabled:bg-slate-400 transition-all"
                  >
                    {isRunningOther ? (
                      <PulseLoader color={"#ffffff"} size={10} />
                    ) : (
                      <>
                        <PlayCircle size={22} className="mr-2" />
                        Run Script
                      </>
                    )}
                  </button>
                ) : null}
              </div>
              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
                  {error}
                </div>
              )}
              {generationError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">{`Hook Error: ${generationError}`}</div>
              )}
            </div>
            {generatedConfig && (
              <div className="mt-10 border border-green-300 rounded-lg p-6 lg:p-8 bg-green-50 shadow-md">
                <h3 className="text-xl font-semibold mb-4 text-green-800 flex items-center">
                  <CheckCircle size={20} className="mr-2" /> Generated
                  Configuration (Please Verify)
                </h3>
                <pre className="bg-slate-900 text-white p-4 rounded-md text-sm overflow-x-auto max-h-96">
                  <code>{generatedConfig}</code>
                </pre>
              </div>
            )}
            {(Object.keys(scriptOutputs).length > 0 || selectedHistoryId) && (
              <div className="mt-10 border border-slate-200 rounded-lg p-6 lg:p-8 bg-white shadow-md">
                <h3 className="text-xl font-semibold mb-4 text-slate-800">
                  {selectedHistoryId
                    ? "Historical Run Result"
                    : "Apply/Run Result"}
                </h3>
                <ErrorBoundary>
                  <ScriptOutputDisplay
                    key={selectedHistoryId || selectedScriptId}
                    output={displayedOutput.output}
                    error={displayedOutput.error}
                  />
                </ErrorBoundary>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default PythonScriptRunner;
