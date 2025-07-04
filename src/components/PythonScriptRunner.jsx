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
  FileText, // Added for template icon
  Cpu, // Added for parameters icon
  ChevronDown,
  Plus,
  Minus,
} from "lucide-react";
import PulseLoader from "react-spinners/PulseLoader";

// === EXTERNAL COMPONENT DEPENDENCIES (Ensure these files exist) ===
import DeviceAuthFields from "./DeviceAuthFields";
import ScriptOutputDisplay from "./ScriptOutputDisplay";
import ErrorBoundary from "./ErrorBoundary";
import TestSelector from "./TestSelector";
import ScriptRunnerIcon from "./icons/ScriptRunnerIcon";

// === EXTERNAL HOOK DEPENDENCY ===
import { useTestDiscovery } from "../hooks/useTestDiscovery";
import {
  useTemplateDiscovery,
  useTemplateGeneration,
} from "../hooks/useTemplateDiscovery"; // Added useTemplateDiscovery and useTemplateGeneration

const API_BASE_URL = "http://localhost:3001";

// ====================================================================================
// === INTERNAL COMPONENTS (Defined here for a single-file solution) ================
// ====================================================================================

/**
 * @description Renders the UI for selecting a script's discoverable tests in the sidebar.
 * @param {object} props - Component props.
 */
function DiscoverableTestOptions({ script, parameters, setParameters }) {
  const { categorizedTests, loading, error } = useTestDiscovery(
    script.id,
    parameters.environment,
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

/**
 * @description Renders the input form for template-specific parameters.
 * This component is placed in the main content area and only displays if a template
 * is selected and has defined parameters.
 * @param {object} props - Component props.
 * @param {object|null} props.selectedTemplate - The currently selected template object.
 * @param {object} props.templateParams - The current values of the template parameters (from parent state).
 * @param {function} props.onParamChange - Handler function to update individual parameter values in the parent state.
 */
function TemplateParameterForm({
  selectedTemplate,
  templateParams,
  onParamChange,
}) {
  // Do not render if no template is selected or if the selected template has no parameters.
  if (!selectedTemplate || !selectedTemplate.parameters?.length) {
    return null;
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-slate-200 mb-6 mt-8">
      <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b pb-2 flex items-center">
        <Layers size={18} className="mr-2 text-slate-500" /> Parameters for{" "}
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
              value={templateParams[param.name] || ""}
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

// ====================================================================================
// ====================== Template Configuration Options ==============================
// ====================================================================================

/**
 * @description Renders the UI for selecting and configuring templates in the sidebar.
 * @param {object} props - Component props.
 */

function TemplateConfigurationOptions({
  script,
  parameters,
  setParameters,
  onTemplateSelected,
  onTemplateParamChange,
}) {
  const { categorizedTemplates, loading, error, discoverTemplates } =
    useTemplateDiscovery(
      null, // No initial category filter
      parameters.environment,
    );

  // State to manage which accordion category is open
  const [openCategory, setOpenCategory] = useState(null); // Stores the name of the currently open category

  // Changed to accept templateId directly for radio buttons
  const handleTemplateSelect = (templateId) => {
    const templateObject = Object.values(categorizedTemplates)
      .flat()
      .find((t) => t.id === templateId);
    onTemplateSelected(templateId, templateObject); // Use the new callback
  };

  const selectedTemplate = useMemo(() => {
    const allTemplates = Object.values(categorizedTemplates).flat();
    return allTemplates.find((t) => t.id === parameters.templateId);
  }, [parameters.templateId, categorizedTemplates]);

  useEffect(() => {
    // Re-discover templates when environment changes
    discoverTemplates(null, parameters.environment);
  }, [parameters.environment, discoverTemplates]);

  if (loading)
    return (
      <p className="text-sm text-slate-500 italic">Discovering templates...</p>
    );
  if (error)
    return <p className="text-sm font-semibold text-red-600">Error: {error}</p>;

  // Function to toggle accordion section
  const toggleCategory = (categoryName) => {
    setOpenCategory(openCategory === categoryName ? null : categoryName);
  };

  return (
    <div className="space-y-4">
      {/* Optional: A main heading for template options */}
      <h3 className="text-md font-semibold text-slate-800 flex items-center mb-4">
        <FileText size={16} className="mr-2 text-slate-500" /> Choose Template
      </h3>

      {Object.entries(categorizedTemplates).length === 0 && !loading ? (
        <p className="text-sm text-slate-500 italic">
          No templates found for this environment.
        </p>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
          {Object.entries(categorizedTemplates).map(([category, templates]) => (
            <div
              key={category}
              className="border-b border-slate-200 last:border-b-0"
            >
              <button
                type="button"
                className="flex justify-between items-center w-full p-4 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors border-none"
                onClick={() => toggleCategory(category)}
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-slate-700">{category}</span>
                  <span className="bg-slate-200 text-slate-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {templates.length}
                  </span>
                </div>
                {openCategory === category ? (
                  <Minus size={18} className="text-slate-600" />
                ) : (
                  <Plus size={18} className="text-slate-600" />
                )}
              </button>
              {openCategory === category && (
                <div className="p-4 bg-slate-25 border-t border-slate-100">
                  <div className="space-y-2">
                    {templates.map((template) => (
                      <label
                        key={template.id}
                        className="flex items-center text-sm font-medium text-slate-700 cursor-pointer hover:bg-slate-100 p-2 rounded transition-colors"
                      >
                        <input
                          type="radio"
                          name="selectedTemplate" // Group radio buttons by name
                          value={template.id}
                          checked={parameters.templateId === template.id}
                          onChange={() => handleTemplateSelect(template.id)}
                          className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
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

      {/* REMOVED: The parameter rendering section that was duplicating the main content area */}
      {/* This section has been removed to eliminate the duplicate parameter forms */}
    </div>
  );
}
// ====================================================================================
// ========================= Script Option Renderer ===================================
// ====================================================================================

/**
 * @description The "brain" that decides which options UI to render in the sidebar.
 * @param {object} props - Component props.
 */
function ScriptOptionsRenderer({
  script,
  parameters,
  setParameters,
  onTemplateSelected,
  onTemplateParamChange,
}) {
  if (!script) return null;
  if (script.capabilities?.dynamicDiscovery) {
    return (
      <DiscoverableTestOptions
        script={script}
        parameters={parameters}
        setParameters={setParameters}
      />
    );
  }
  if (script.capabilities?.templateGeneration) {
    // New condition for template generation
    return (
      <TemplateConfigurationOptions
        script={script}
        parameters={parameters}
        setParameters={setParameters}
        onTemplateSelected={onTemplateSelected}
        onTemplateParamChange={onTemplateParamChange}
      />
    );
  }
  return (
    <p className="text-xs text-slate-500 italic">
      This script has no additional sidebar options.
    </p>
  );
}

/**
 * @description The static sidebar component for filtering scripts and displaying script options.
 * @param {object} props - Component props.
 */
function ScriptFilterSidebar({
  allScripts,
  selectedCategories,
  onCategoryChange,
  selectedScript,
  scriptParameters,
  setParameters,
  onTemplateSelected,
  onTemplateParamChange,
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
          <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-200 pb-2 flex items-center">
            <Tag size={18} className="mr-2 text-slate-500" /> Filter by Category
          </h3>
          <div className="space-y-1">
            {uniqueCategories.map((category) => (
              <label
                key={category}
                className="flex items-center justify-between text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md p-2 cursor-pointer transition-colors"
              >
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(category)}
                    onChange={() => handleCheckboxChange(category)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
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
                Clear All Filters
              </button>
            )}
          </div>
        </div>

        {selectedScript && (
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-200 pb-2 flex items-center">
              <Layers size={18} className="mr-2 text-slate-500" /> Script
              Options
            </h3>
            <ScriptOptionsRenderer
              script={selectedScript}
              parameters={scriptParameters}
              setParameters={setParameters}
              onTemplateSelected={onTemplateSelected}
              onTemplateParamChange={onTemplateParamChange}
            />
          </div>
        )}
      </div>
    </aside>
  );
}

/**
 * @description A slide-in drawer component for displaying script run history.
 * @param {object} props - Component props.
 */
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
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 bottom-0 w-80 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="p-4 h-full flex flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center">
              <History size={18} className="mr-2 text-slate-500" /> Run History
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors"
            >
              <X size={20} />
            </button>
          </header>
          <div className="overflow-y-auto flex-1 pr-2">
            {isLoading ? (
              <p className="text-sm text-slate-500 p-2">Loading history...</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-slate-500 italic p-2">
                No recent runs found.
              </p>
            ) : (
              <ul className="space-y-1">
                {history.map((run) => (
                  <li key={run.runId}>
                    <button
                      onClick={() => {
                        onSelectHistoryItem(run.runId);
                        onClose();
                      }}
                      className={`w-full text-left p-2 rounded-md hover:bg-slate-100 transition-colors ${selectedHistoryId === run.runId ? "bg-blue-50" : ""}`}
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

// ====================================================================================
// === MAIN PAGE COMPONENT ============================================================
// ====================================================================================

function PythonScriptRunner() {
  const [allScripts, setAllScripts] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [scriptParameters, setScriptParameters] = useState({});
  const [scriptOutputs, setScriptOutputs] = useState({});
  const [error, setError] = useState(null);
  const [loadingScripts, setLoadingScripts] = useState(true);
  const [runningScripts, setRunningScripts] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);

  // NEW STATE: Store the full selected template object here
  const [selectedTemplateDetails, setSelectedTemplateDetails] = useState(null);

  // Added useTemplateGeneration hook here for global access if needed
  const {
    generateConfig,
    loading: generatingConfig,
    error: generationError,
  } = useTemplateGeneration();

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
        console.error("Failed to fetch initial history:", err);
      } finally {
        setLoadingHistory(false);
      }
    }
    fetchHistory();
  }, []);

  const filteredScripts = useMemo(() => {
    if (selectedCategories.length === 0) return allScripts;
    return allScripts.filter((s) => selectedCategories.includes(s.category));
  }, [allScripts, selectedCategories]);

  const selectedScript = useMemo(
    () => allScripts.find((s) => s.id === selectedScriptId),
    [allScripts, selectedScriptId],
  );

  const liveScriptParameters = useMemo(() => {
    if (!selectedScriptId) return {};
    return scriptParameters[selectedScriptId] || {};
  }, [selectedScriptId, scriptParameters]);

  const displayedOutput = useMemo(() => {
    if (selectedHistoryId) {
      const historicRun = historyItems.find(
        (h) => h.runId === selectedHistoryId,
      );
      return historicRun
        ? { output: historicRun.output, error: historicRun.error }
        : {};
    }
    return scriptOutputs[selectedScriptId] || {};
  }, [selectedHistoryId, historyItems, scriptOutputs, selectedScriptId]);

  const handleCategoryChange = (newCategories) => {
    setSelectedCategories(newCategories);
    const isStillVisible = allScripts.some(
      (s) =>
        s.id === selectedScriptId &&
        (newCategories.length === 0 || newCategories.includes(s.category)),
    );
    if (!isStillVisible) setSelectedScriptId("");
  };

  const handleScriptChange = (scriptId) => {
    setSelectedScriptId(scriptId);
    setSelectedHistoryId(null);
    setScriptOutputs({});
    setError(null);
    setSelectedTemplateDetails(null); // Clear selected template details when script changes
  };

  const updateCurrentScriptParameters = (newParams) => {
    if (!selectedScriptId) return;
    setScriptParameters((prev) => ({ ...prev, [selectedScriptId]: newParams }));
  };

  const handleSelectHistoryItem = (runId) => {
    setSelectedHistoryId(runId);
    setSelectedScriptId("");
    setScriptOutputs({});
    setError(null);
  };

  // NEW: Callback for TemplateConfigurationOptions to notify PythonScriptRunner of template selection
  const handleTemplateSelectedFromChild = (templateId, templateObject) => {
    updateCurrentScriptParameters({
      ...liveScriptParameters,
      templateId: templateId,
      templateParams: {}, // Clear params when a new template is selected
    });
    setSelectedTemplateDetails(templateObject); // Store the full template object
  };

  // NEW: handleTemplateParamChange moved to PythonScriptRunner
  const handleTemplateParamChange = (paramName, value) => {
    if (!selectedScriptId) return; // Ensure a script is selected
    setScriptParameters((prev) => ({
      ...prev,
      [selectedScriptId]: {
        ...(prev[selectedScriptId] || {}), // Preserve existing params for the selected script
        templateParams: {
          ...(prev[selectedScriptId]?.templateParams || {}), // Preserve existing template params
          [paramName]: value,
        },
      },
    }));
  };

  const runSingleScript = async () => {
    if (!selectedScriptId) return alert("Please select a script.");
    const params = scriptParameters[selectedScriptId] || {};
    let payload = {
      scriptId: selectedScriptId,
      parameters: {
        ...params,
        hostname: params.hostname,
        tests: Array.isArray(params.tests)
          ? params.tests.join(",")
          : params.tests,
      },
    };

    setRunningScripts(true);
    setError(null);
    setScriptOutputs({});

    try {
      // NEW: Handle template generation if the script has this capability
      if (
        selectedScript?.capabilities?.templateGeneration &&
        params.templateId
      ) {
        const genResult = await generateConfig(
          params.templateId,
          params.templateParams,
        );
        if (!genResult.success) {
          throw new Error(
            genResult.error ||
              "Failed to generate configuration from template.",
          );
        }
        // Add the rendered configuration to the script parameters
        payload.parameters.renderedConfig = genResult.rendered_config;
        payload.parameters.templateIdUsed = params.templateId; // Pass template ID for history
      }

      const res = await fetch(`${API_BASE_URL}/api/scripts/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || data.message || `Request failed`);
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
      setRunningScripts(false);
    }
  };

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
            onCategoryChange={handleCategoryChange}
            selectedScript={selectedScript}
            scriptParameters={liveScriptParameters}
            setParameters={updateCurrentScriptParameters}
            onTemplateSelected={handleTemplateSelectedFromChild} // Pass new callback
            onTemplateParamChange={handleTemplateParamChange} // Pass new param change handler
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
                  disabled={runningScripts || filteredScripts.length === 0}
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

              {/* Template Parameter Form */}
              {/* This component is rendered here, directly after the DeviceAuthFields,
                  only if the selected script supports template generation. */}
              {selectedScript?.capabilities?.templateGeneration && (
                <TemplateParameterForm
                  selectedTemplate={selectedTemplateDetails} // Use the new state variable
                  templateParams={liveScriptParameters.templateParams}
                  onParamChange={handleTemplateParamChange}
                />
              )}
              <button
                type="button"
                onClick={runSingleScript}
                disabled={
                  !selectedScriptId || runningScripts || generatingConfig
                } // Disable if generating config
                className={`mt-8 w-full flex items-center justify-center px-4 py-3 rounded-md text-white text-lg font-semibold transition-all ${!selectedScriptId || runningScripts || generatingConfig ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}
              >
                {runningScripts || generatingConfig ? ( // Show loader if running or generating config
                  <PulseLoader color={"#ffffff"} size={10} />
                ) : (
                  <>
                    <PlayCircle size={22} className="mr-2" />
                    Run Script
                  </>
                )}
              </button>
              {generationError && ( // Display template generation error
                <p className="text-red-500 text-sm mt-2">{`Configuration generation error: ${generationError}`}</p>
              )}
            </div>

            {(Object.keys(displayedOutput).length > 0 ||
              (error && runningScripts)) && (
              <div className="mt-10 border border-slate-200 rounded-lg p-6 lg:p-8 bg-white shadow-md">
                <h3 className="text-xl font-semibold mb-4 text-slate-800 flex items-center">
                  <FileCode size={20} className="mr-2 text-slate-500" />
                  Script Output
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
