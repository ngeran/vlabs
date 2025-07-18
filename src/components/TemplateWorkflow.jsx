// src/components/TemplateWorkflow.jsx
import React, { useState, useCallback, useEffect } from "react";
import toast from "react-hot-toast";
import PulseLoader from "react-spinners/PulseLoader";
import { Loader, AlertTriangle, Play, ShieldCheck, ChevronRight, BookOpen } from "lucide-react";

// ====================================================================================
// SECTION 1: IMPORTS
// ====================================================================================

import { useTemplateDiscovery, useTemplateDetail, useTemplateGeneration } from "../hooks/useTemplateDiscovery";
import { useRealTimeUpdates } from "../hooks/useRealTimeUpdates";
import RealTimeDisplay from "./RealTimeProgress/RealTimeDisplay";

const API_BASE_URL = "http://localhost:3001";

// ====================================================================================
// SECTION 2: TemplateAccordionMenu SUB-COMPONENT (WITH DEBUGGING & FIXES)
// ====================================================================================
/**
 * This "dumb" UI component is responsible for rendering the categorized list of templates.
 * @param {object} props
 */
function TemplateAccordionMenu({ categorizedTemplates, selectedTemplateId, onSelectTemplate, disabled }) {
  const [openCategories, setOpenCategories] = useState([]);

  // TROUBLESHOOTING: Log the props this component receives on every render.
  console.log('[TemplateAccordionMenu] STEP 6: Received props:', { categorizedTemplates });

  useEffect(() => {
    if (categorizedTemplates) {
      setOpenCategories(Object.keys(categorizedTemplates));
    }
  }, [categorizedTemplates]);

  if (!categorizedTemplates || typeof categorizedTemplates !== 'object') {
    return <p className="text-sm text-slate-500 italic">No templates available to display.</p>;
  }

  const entries = Object.entries(categorizedTemplates);

  // TROUBLESHOOTING: Log how many categories we are about to render.
  console.log(`%c[TemplateAccordionMenu] STEP 7: About to render ${entries.length} categories.`, 'color: lightgreen; font-weight: bold;');

  if (entries.length === 0) {
    return <p className="text-sm text-slate-500 italic">No templates were found.</p>
  }

  return (
    <div className="space-y-4">
      {entries.map(([category, templates]) => (
        <div key={category}>
          <button onClick={() => setOpenCategories(p => p.includes(category) ? p.filter(c => c !== category) : [...p, category])} disabled={disabled} className="w-full flex items-center justify-between text-left font-semibold text-slate-800">
            <span>{category}</span>
            <ChevronRight size={16} className={`transition-transform ${openCategories.includes(category) ? "rotate-90" : ""}`} />
          </button>
          {openCategories.includes(category) && (
            <div className="mt-2 space-y-1 pl-2 border-l-2 border-slate-200">
              {Array.isArray(templates) && templates.map(template => (
                <button
                  key={template.id}
                  onClick={() => onSelectTemplate(template.id)}
                  disabled={disabled}
                  title={template.description}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${selectedTemplateId === template.id ? "bg-blue-100 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  {template.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


// ====================================================================================
// SECTION 3: TemplateWorkflow MAIN COMPONENT (WITH DEBUGGING)
// ====================================================================================

function TemplateWorkflow({ wsContext }) {
  // --- STATE AND HOOKS ---
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [generatedConfig, setGeneratedConfig] = useState(null);
  const [generationError, setGenerationError] = useState(null);
  const [targetHost, setTargetHost] = useState("");
  const [username, setUsername] = useState("root");
  const [password, setPassword] = useState("");
  const [dynamicParameters, setDynamicParameters] = useState({});

  const { categorizedTemplates, loading: loadingTemplates, error: templatesError } = useTemplateDiscovery();
  const { template, loading: loadingTemplateDetails } = useTemplateDetail(selectedTemplateId);
  const { generateConfig, loading: isGenerating } = useTemplateGeneration();
  const templateApplicationState = useRealTimeUpdates(wsContext);

  // TROUBLESHOOTING: Log the state received from the discovery hook on every render.
  console.log('[TemplateWorkflow] STEP 5: State from useTemplateDiscovery hook:', { categorizedTemplates, loadingTemplates, templatesError });

  const isBusy = isGenerating || templateApplicationState.isRunning || loadingTemplates || loadingTemplateDetails;


  // --- EVENT HANDLERS ---
  const handleTemplateChange = useCallback((id) => {
    if (isBusy) return;
    setSelectedTemplateId(id);
    setGeneratedConfig(null);
    setGenerationError(null);
    setDynamicParameters({});
    templateApplicationState.resetState();

    const allTemplates = Object.values(categorizedTemplates).flat();
    const newTemplate = allTemplates.find(t => t.id === id);
    if (newTemplate?.parameters) {
      const defaults = {};
      newTemplate.parameters.forEach(p => {
        if (p.default_value !== undefined) defaults[p.name] = p.default_value;
      });
      setDynamicParameters(defaults);
    }
  }, [categorizedTemplates, templateApplicationState, isBusy]);

  const handleParamChange = useCallback((name, value) => {
    setDynamicParameters(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleGenerate = async () => {
    setGeneratedConfig(null);
    setGenerationError(null);
    templateApplicationState.resetState();

    if (!selectedTemplateId) return;
    if (!targetHost || !username || !password) {
      toast.error("Device Connection details (host, username, password) are required.");
      return;
    }

    const result = await generateConfig(selectedTemplateId, dynamicParameters);

    if (result && result.success) {
      setGeneratedConfig(result.rendered_config);
      toast.success("Configuration preview generated successfully!");
    } else {
      const errorMessage = result?.error || "An unknown error occurred during generation.";
      setGenerationError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const handleApply = async () => {
    if (!generatedConfig) {
      toast.error("Please generate a configuration preview first before applying.");
      return;
    }
    if (!targetHost || !username || !password) {
      toast.error("Device Connection details are required.");
      return;
    }
    if (!wsContext || !wsContext.clientId) {
      toast.error("WebSocket context is not initialized. Cannot apply config.");
      return;
    }

    await templateApplicationState.startOperation(async () => {
      const response = await fetch(`${API_BASE_URL}/api/templates/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wsClientId: wsContext.clientId,
          templateId: selectedTemplateId,
          renderedConfig: generatedConfig,
          targetHostname: targetHost,
          username,
          password,
        }),
      });

      if (!response.ok) {
        const errData = await response.text();
        throw new Error(errData || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    });
  };


  // --- RENDER LOGIC ---
  if (loadingTemplates) return <div className="p-8 text-center"><Loader className="animate-spin inline-block mr-2" /> Loading templates...</div>;
  if (templatesError) return <div className="p-8 text-red-600 flex items-center justify-center gap-2"><AlertTriangle /> Failed to load templates: {templatesError}</div>;

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Sidebar Area */}
      <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
        <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
            <BookOpen size={18} className="mr-2 text-slate-500" /> Template Library
          </h3>
          <TemplateAccordionMenu
            categorizedTemplates={categorizedTemplates}
            selectedTemplateId={selectedTemplateId}
            onSelectTemplate={handleTemplateChange}
            disabled={isBusy}
          />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 space-y-8">
        {!selectedTemplateId ? (
          <div className="text-center py-24 px-6 bg-white rounded-xl shadow-lg shadow-slate-200/50">
            <h2 className="text-2xl font-semibold text-slate-600">Select a template from the sidebar to begin.</h2>
            <p className="text-slate-500 mt-2">The required parameters and actions will appear here.</p>
          </div>
        ) : (
          <>
            {/* Form Section for Parameters */}
            <section className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
              <header className="border-b border-slate-200 pb-4 mb-6">
                <h2 className="text-2xl font-bold text-slate-800">{template?.name || "Loading..."}</h2>
                <p className="mt-1 text-slate-600">{template?.description}</p>
              </header>
              {loadingTemplateDetails ? (
                <div className="text-center py-4"><Loader className="animate-spin" /></div>
              ) : (
                <div className="space-y-6">
                  <fieldset className="border p-4 rounded-md">
                    <legend className="px-2 font-semibold text-slate-700">Device Connection</legend>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <input type="text" placeholder="Target Host IP/Hostname *" value={targetHost} onChange={e => setTargetHost(e.target.value)} disabled={isBusy} className="p-2 border rounded-md" />
                      <input type="text" placeholder="Username *" value={username} onChange={e => setUsername(e.target.value)} disabled={isBusy} className="p-2 border rounded-md" />
                      <input type="password" placeholder="Password *" value={password} onChange={e => setPassword(e.target.value)} disabled={isBusy} className="p-2 border rounded-md" />
                    </div>
                  </fieldset>
                  {template?.parameters?.length > 0 && (
                    <fieldset className="border p-4 rounded-md">
                      <legend className="px-2 font-semibold text-slate-700">Template Variables</legend>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {template.parameters.map(param => (
                          <div key={param.name}>
                            <label htmlFor={param.name} className="block text-sm text-slate-600 mb-1">{param.label || param.name} {param.required && '*'}</label>
                            <input id={param.name} type={param.type || "text"} placeholder={param.placeholder || ''} value={dynamicParameters[param.name] || ''} onChange={(e) => handleParamChange(param.name, e.target.value)} disabled={isBusy} className="w-full p-2 border border-slate-300 rounded-md" />
                            {param.description && <p className="text-xs text-slate-500 mt-1">{param.description}</p>}
                          </div>
                        ))}
                      </div>
                    </fieldset>
                  )}
                </div>
              )}
            </section>

            {/* Section for Workflow Actions (Generate and Apply buttons) */}
            <section className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Execute Workflow</h2>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <button onClick={handleGenerate} disabled={isBusy} className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-slate-400">
                  {isGenerating ? <PulseLoader color="#fff" size={8}/> : <ShieldCheck size={18}/>}
                  1. Generate Preview
                </button>
                <ChevronRight className="text-slate-400 hidden sm:block" />
                <button onClick={handleApply} disabled={isBusy || !generatedConfig} className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-slate-400">
                  {templateApplicationState.isRunning ? <PulseLoader color="#fff" size={8}/> : <Play size={18}/>}
                  2. Apply to Device
                </button>
              </div>
              <div className="mt-6">
                {generationError && <div className="p-3 my-4 bg-red-50 text-red-700 rounded-md">{generationError}</div>}
                {/* Only show the preview if a config is generated AND the apply step is NOT running or complete */}
                {generatedConfig && !templateApplicationState.isRunning && !templateApplicationState.isComplete && (
                  <div>
                    <h3 className="font-semibold mb-2">Configuration Preview:</h3>
                    <pre className="bg-slate-900 text-white p-4 rounded-md text-xs overflow-auto max-h-96">{generatedConfig}</pre>
                  </div>
                )}
              </div>
            </section>

            {/* Real-time Display for the Apply Step */}
            <RealTimeDisplay
              {...templateApplicationState}
              onReset={templateApplicationState.resetState}
            />
          </>
        )}
      </main>
    </div>
  );
}

export default TemplateWorkflow;
