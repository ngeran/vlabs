// ====================================================================================
//
// PAGE: PythonScriptRunner.jsx (FIXED - With Proper Error Handling)
//
// ====================================================================================

import React, { useEffect, useState, useMemo, useCallback } from "react";
import PulseLoader from "react-spinners/PulseLoader";
import toast from "react-hot-toast";
import { PlayCircle, Layers, History, X, Clock, CheckCircle, ServerCrash, FileCode, Wrench, Send } from "lucide-react";

// --- Local Custom Components ---
import RunnerNavBar from "./RunnerNavBar.jsx";
import ScriptOutputDisplay from "./ScriptOutputDisplay.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import DynamicScriptForm from "./DynamicScriptForm.jsx";
import DeviceAuthFields from "./DeviceAuthFields.jsx";
import TemplateApplyProgress from "./TemplateApplyProgress.jsx";
import TestSelector from "./TestSelector.jsx";

// --- Local Custom Hooks ---
import { useTestDiscovery } from "../hooks/useTestDiscovery.jsx";
import { useTemplateDiscovery, useTemplateGeneration } from "../hooks/useTemplateDiscovery.jsx";
import { useWebSocket, useTemplateApplication, useScriptRunnerStream } from "../hooks/useWebSocket.jsx";

// ====================================================================================
// HELPER FUNCTIONS
// ====================================================================================

/**
 * Safe JSON parse with intelligent debugging
 */
const safeJSONParse = (text, url = 'unknown') => {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.group(`🔍 JSON Parse Error Debug - ${url}`);
    console.error('❌ Parse Error:', error.message);
    console.log('📝 Response Length:', text.length);
    console.log('🔤 First 200 chars:', text.substring(0, 200));
    console.log('🔤 Last 200 chars:', text.substring(Math.max(0, text.length - 200)));
    console.log('🔍 Response Type Detection:');

    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      console.log('  📄 Response appears to be HTML (likely error page)');
    } else if (text.trim().startsWith('Cannot GET') || text.trim().startsWith('Cannot POST')) {
      console.log('  🚫 Response is Express.js "Cannot GET/POST" error');
    } else if (text.trim() === '') {
      console.log('  🫥 Response is completely empty');
    } else if (text.trim().startsWith('Error:') || text.trim().startsWith('TypeError:')) {
      console.log('  💥 Response appears to be a plain text error message');
    } else if (text.includes('nginx') || text.includes('Apache')) {
      console.log('  🌐 Response appears to be web server error page');
    } else {
      console.log('  ❓ Response type unknown - might be malformed JSON');
    }

    console.groupEnd();
    return null;
  }
};

/**
 * Safe fetch with comprehensive error handling and debugging
 */
const safeFetch = async (url, options = {}) => {
  console.group(`🌐 API Request Debug - ${url}`);
  console.log('📤 Request Options:', options);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    console.log('📥 Response Status:', response.status, response.statusText);
    console.log('📥 Response Headers:', Object.fromEntries(response.headers.entries()));

    // Check if response is ok
    if (!response.ok) {
      console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.log('❌ Error Response Body:', errorText);
      console.groupEnd();
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    // Get response text first
    const text = await response.text();
    console.log('📝 Raw Response Length:', text.length);

    // Check if response is empty
    if (!text.trim()) {
      console.warn('⚠️ Empty response received');
      console.groupEnd();
      return { success: false, message: 'Empty response' };
    }

    // Try to parse as JSON
    const data = safeJSONParse(text, url);
    if (data === null) {
      console.error('❌ Failed to parse JSON response');
      console.groupEnd();
      return { success: false, message: 'Invalid JSON response', rawResponse: text };
    }

    console.log('✅ Successfully parsed JSON:', data);
    console.groupEnd();
    return data;
  } catch (error) {
    console.error('💥 Fetch Error:', error);
    console.error('🔍 Error Details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });

    // Check if it's a network error
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('🌐 Network Error - Check if server is running and accessible');
    }

    console.groupEnd();
    return { success: false, message: error.message, error: error };
  }
};

// ====================================================================================
// CHILD COMPONENTS
// ====================================================================================

/**
 * @description Renders the appropriate options in the sidebar based on the script's capabilities.
 */
function ScriptOptionsRenderer({ script, parameters, onParamChange, onTemplateSelected }) {
  // Hook for Template Discovery
  const templateDiscovery = useTemplateDiscovery();
  // Hook for JSNAPy Test Discovery
  const testDiscovery = useTestDiscovery(script?.id, parameters?.environment);

  if (!script) return null;

  // --- Workflow #1: Template Generation ---
  if (script.capabilities?.templateGeneration) {
    if (templateDiscovery.loading) return <p className="text-sm text-slate-500 italic">Discovering templates...</p>;
    if (templateDiscovery.error) return <p className="text-sm font-semibold text-red-600">Error: {templateDiscovery.error.message}</p>;

    const handleTemplateSelect = (templateId) => {
      const templateObject = Object.values(templateDiscovery.categorizedTemplates).flat().find((t) => t.id === templateId);
      onTemplateSelected(templateId, templateObject);
    };

    return (
      <div className="space-y-2">
        {Object.entries(templateDiscovery.categorizedTemplates).map(([category, templates]) => (
          <div key={category}>
            <h4 className="font-semibold text-slate-600 text-sm mt-3 mb-1">{category}</h4>
            {templates.map(template => (
              <label key={template.id} className="flex items-center text-sm font-medium text-slate-700 cursor-pointer p-2 rounded hover:bg-slate-100">
                <input type="radio" name="selectedTemplate" value={template.id} checked={parameters.templateId === template.id} onChange={() => handleTemplateSelect(template.id)} className="h-4 w-4 text-blue-600"/>
                <span className="ml-2">{template.name}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // --- Workflow #2: JSNAPy Dynamic Test Discovery ---
  if (script.capabilities?.dynamicDiscovery) {
    if (testDiscovery.loading) return <p className="text-sm text-slate-500 italic">Discovering tests...</p>;
    if (testDiscovery.error) return <p className="text-sm font-semibold text-red-600">Error: {testDiscovery.error}</p>;

    const handleTestToggle = (testId) => {
      const currentTests = parameters.tests || [];
      const newSelection = currentTests.includes(testId)
        ? currentTests.filter((id) => id !== testId)
        : [...currentTests, testId];
      onParamChange("tests", newSelection);
    };

    return (
      <TestSelector
        categorizedTests={testDiscovery.categorizedTests}
        selectedTests={parameters.tests || []}
        onTestToggle={handleTestToggle}
      />
    );
  }

  // --- Default Case ---
  return <p className="text-xs text-slate-500 italic">This script has no additional options.</p>;
}

// ====================================================================================
// MAIN COMPONENT
// ====================================================================================

const API_BASE_URL = "http://localhost:3001";

function PythonScriptRunner() {
  // --- State Management ---
  const [allScripts, setAllScripts] = useState([]);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [scriptParameters, setScriptParameters] = useState({});
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [selectedTemplateDetails, setSelectedTemplateDetails] = useState(null);
  const [generatedConfig, setGeneratedConfig] = useState(null);
  const [topLevelError, setTopLevelError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // --- Hooks ---
  const wsContext = useWebSocket({ autoConnect: true });
  const { generateConfig, loading: isGenerating } = useTemplateGeneration();
  const templateRunner = useTemplateApplication(wsContext);
  const scriptRunner = useScriptRunnerStream(wsContext);
  const isActionInProgress = isGenerating || templateRunner.isApplying || scriptRunner.isRunning;

  // --- Data Fetching & Effects ---
  useEffect(() => {
    const fetchScripts = async () => {
      console.log('🚀 Starting script fetch process...');
      setIsLoading(true);
      setTopLevelError(null);

      try {
        console.log('🔍 Attempting to fetch from:', `${API_BASE_URL}/api/scripts/list`);
        const data = await safeFetch(`${API_BASE_URL}/api/scripts/list`);

        console.log('📊 Fetch result:', data);

        if (data && data.success && Array.isArray(data.scripts)) {
          console.log('✅ Successfully loaded scripts:', data.scripts.length);
          setAllScripts(data.scripts.filter(s => !s.hidden));
        } else {
          console.error('❌ Invalid scripts data structure:', data);
          const errorMsg = data?.message || "Failed to load scripts - invalid response format";
          toast.error(errorMsg);
          setTopLevelError(`API Error: ${errorMsg}`);
          setAllScripts([]);
        }
      } catch (error) {
        console.error('💥 Critical error during script fetch:', error);
        const errorMsg = "Failed to load scripts. Please check your connection and server status.";
        toast.error(errorMsg);
        setTopLevelError(`Connection Error: ${error.message}`);
        setAllScripts([]);
      } finally {
        setIsLoading(false);
        console.log('🏁 Script fetch process completed');
      }
    };

    fetchScripts();
  }, []);

  useEffect(() => {
    templateRunner.resetState();
    scriptRunner.resetState();
  }, []);

  // --- Memoized Derived State ---
  const selectedScript = useMemo(() => allScripts.find(s => s.id === selectedScriptId), [allScripts, selectedScriptId]);
  const isTemplateWorkflow = useMemo(() => selectedScript?.capabilities?.templateGeneration === true, [selectedScript]);
  const currentParameters = useMemo(() => scriptParameters[selectedScriptId] || {}, [selectedScriptId, scriptParameters]);

  const genericParametersToRender = useMemo(() => {
    if (!selectedScript?.parameters || isTemplateWorkflow) return [];
    const specialParams = ["hostname", "inventory_file", "username", "password", "tests", "templateId", "templateParams"];
    return selectedScript.parameters.filter(param => !specialParams.includes(param.name));
  }, [selectedScript, isTemplateWorkflow]);

  // --- Event Handlers ---
  const handleReset = useCallback(() => {
    setSelectedScriptId("");
    setScriptParameters({});
    setGeneratedConfig(null);
    setTopLevelError(null);
    setSelectedTemplateDetails(null);
    templateRunner.resetState();
    scriptRunner.resetState();
  }, [templateRunner, scriptRunner]);

  const handleScriptChange = useCallback((id) => {
    handleReset();
    setSelectedScriptId(id);
  }, [handleReset]);

  const handleParamChange = useCallback((name, value) => {
    if (!selectedScriptId) return;
    setScriptParameters(prev => ({
      ...prev,
      [selectedScriptId]: { ...(prev[selectedScriptId] || {}), [name]: value },
    }));
  }, [selectedScriptId]);

  const handleTemplateSelected = useCallback((templateId, templateObject) => {
    setGeneratedConfig(null);
    setScriptParameters(prev => ({ ...prev, [selectedScriptId]: { ...prev[selectedScriptId], templateId, templateParams: {} } }));
    setSelectedTemplateDetails(templateObject);
  }, [selectedScriptId]);

  const handleTemplateParamChange = useCallback((paramName, value) => {
    setGeneratedConfig(null);
    handleParamChange("templateParams", { ...(currentParameters.templateParams || {}), [paramName]: value });
  }, [currentParameters, handleParamChange]);

  // --- Action Handlers ---
  const handleGenerateConfig = async () => {
    setGeneratedConfig(null);
    setTopLevelError(null);
    templateRunner.resetState();
    const result = await generateConfig(currentParameters.templateId, currentParameters.templateParams || {});
    if (result.success) {
      setGeneratedConfig(result.rendered_config);
      toast.success("Configuration Preview Generated!");
    } else {
      setTopLevelError(`Generation Error: ${result.error || "Unknown error"}`);
    }
  };

  const handleApplyConfig = async () => {
    if (!generatedConfig) return toast.error("Please generate a config first.");
    setTopLevelError(null);
    await templateRunner.applyTemplate({
      templateId: selectedScript.id,
      renderedConfig: generatedConfig,
      targetHostname: currentParameters.hostname,
      username: currentParameters.username,
      password: currentParameters.password,
    });
  };

  const handleRunStandardScript = async () => {
    setTopLevelError(null);
    scriptRunner.resetState();
    const paramsToSend = { ...currentParameters };
    if (Array.isArray(paramsToSend.tests)) {
      paramsToSend.tests = paramsToSend.tests.join(',');
    }
    await scriptRunner.runScript({ scriptId: selectedScriptId, parameters: paramsToSend });
  };

  // --- Loading State ---
  if (isLoading) {
    return (
      <div className="bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <PulseLoader color="#3b82f6" size={12} />
          <p className="mt-4 text-slate-600">Loading scripts...</p>
        </div>
      </div>
    );
  }

  // --- Main Render ---
  return (
    <div className="bg-slate-50 min-h-screen">
      <RunnerNavBar
        allScripts={allScripts}
        selectedScriptId={selectedScriptId}
        onScriptChange={handleScriptChange}
        isActionInProgress={isActionInProgress}
        onReset={handleReset}
        onViewHistory={() => setIsHistoryDrawerOpen(true)}
        historyItemCount={historyItems.length}
        isWsConnected={wsContext.isConnected}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!selectedScriptId ? (
          <div className="text-center py-24">
            <h2 className="text-2xl font-semibold text-slate-600">Select a tool to begin.</h2>
            {allScripts.length === 0 && !isLoading && (
              <div className="mt-8 max-w-2xl mx-auto">
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-red-800 mb-4">🚨 No Scripts Available</h3>
                  <p className="text-red-700 mb-4">
                    Unable to load scripts from the API. This could be due to:
                  </p>
                  <ul className="text-left text-red-700 space-y-2 mb-4">
                    <li>• Server not running on <code className="bg-red-100 px-2 py-1 rounded">{API_BASE_URL}</code></li>
                    <li>• Network connectivity issues</li>
                    <li>• CORS configuration problems</li>
                    <li>• API endpoint returning invalid data</li>
                  </ul>
                  <p className="text-sm text-red-600">
                    Check the browser console for detailed debugging information.
                  </p>
                  {topLevelError && (
                    <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded">
                      <strong>Error Details:</strong> {topLevelError}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <ErrorBoundary>
            <div className="flex flex-col md:flex-row gap-8">
              <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
                <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
                  <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
                    <Layers size={18} className="mr-2 text-slate-500" /> Script Options
                  </h3>
                  <ScriptOptionsRenderer
                    script={selectedScript}
                    parameters={currentParameters}
                    onTemplateSelected={handleTemplateSelected}
                    onParamChange={handleParamChange}
                  />
                </div>
              </aside>

              <main className="flex-1 space-y-8">
                <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
                  <header className="border-b border-slate-200 pb-4 mb-6">
                    <h2 className="text-2xl font-bold text-slate-800">{selectedScript.displayName}</h2>
                    <p className="mt-1 text-slate-600">{selectedScript.description}</p>
                  </header>

                  <div className="space-y-6">
                    {selectedScript.capabilities?.deviceAuth && (
                      <DeviceAuthFields parameters={currentParameters} onParamChange={handleParamChange} />
                    )}

                    {!isTemplateWorkflow && (
                      <div className="border-t border-slate-200 pt-6">
                        <h3 className="text-lg font-semibold text-slate-800 mb-4">Action Details</h3>
                        <DynamicScriptForm parametersToRender={genericParametersToRender} formValues={currentParameters} onParamChange={handleParamChange}/>
                      </div>
                    )}

                    {isTemplateWorkflow && selectedTemplateDetails && (
                      <div className="border-t border-slate-200 pt-6">
                        <h3 className="text-lg font-semibold text-slate-800 mb-4">Template Variables for <span className="text-blue-600">{selectedTemplateDetails.name}</span></h3>
                        {selectedTemplateDetails.parameters.map(param => (
                          <div key={param.name} className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">{param.label || param.name} {param.required && <span className="text-red-500">*</span>}</label>
                            <input type={param.type || 'text'} placeholder={param.placeholder || ''} value={(currentParameters.templateParams || {})[param.name] || ""} onChange={(e) => handleTemplateParamChange(param.name, e.target.value)} className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm"/>
                            {param.description && <p className="mt-1 text-xs text-slate-500">{param.description}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-8 border-t pt-6">
                    {isTemplateWorkflow ? (
                      <div className="space-y-4">
                        <button type="button" onClick={handleGenerateConfig} disabled={isActionInProgress || !currentParameters.templateId} className="w-full flex items-center justify-center p-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:bg-slate-400">
                          {isGenerating ? <PulseLoader color="#fff" size={8} /> : <><Wrench size={20} className="mr-2" /> 1. Generate Config</>}
                        </button>
                        {generatedConfig && (
                          <button type="button" onClick={handleApplyConfig} disabled={isActionInProgress} className="w-full flex items-center justify-center p-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-slate-400">
                            {templateRunner.isApplying ? <PulseLoader color="#fff" size={8} /> : <><Send size={20} className="mr-2" /> 2. Apply to Device</>}
                          </button>
                        )}
                      </div>
                    ) : (
                      <button type="button" onClick={handleRunStandardScript} disabled={isActionInProgress} className="w-full flex items-center justify-center p-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-slate-400">
                        {scriptRunner.isRunning ? <PulseLoader color="#fff" size={8} /> : <><PlayCircle size={20} className="mr-2" /> Run Script</>}
                      </button>
                    )}
                  </div>
                  {topLevelError && (<div className="mt-4 p-3 bg-red-50 text-red-700 rounded text-sm">{topLevelError}</div>)}
                </div>

                {generatedConfig && !templateRunner.isApplying && !templateRunner.isComplete && (
                  <div className="mt-10 border border-green-300 rounded-lg p-6 lg:p-8 bg-green-50 shadow-md">
                    <h3 className="text-xl font-semibold mb-4 text-green-800 flex items-center"><FileCode size={20} className="mr-2" /> Generated Preview</h3>
                    <pre className="bg-slate-900 text-white p-4 rounded-md text-sm overflow-x-auto max-h-96"><code>{generatedConfig}</code></pre>
                  </div>
                )}

                <TemplateApplyProgress applicationState={templateRunner} onReset={templateRunner.resetState} />
                {(scriptRunner.isRunning || scriptRunner.isComplete) && <ScriptOutputDisplay {...scriptRunner} />}
              </main>
            </div>
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

export default PythonScriptRunner;
