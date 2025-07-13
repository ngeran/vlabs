// =================================================================================================
//
// COMPONENT: TemplateWorkflow.jsx
//
// ROLE: A self-contained, specialized UI for the Configuration Templating tool.
//
// DESCRIPTION: This component orchestrates the entire workflow for discovering, generating, and
//              applying device configurations from templates. This version restores the
//              original, correct logic by using the specialized `useTemplateApplication` hook
//              for the apply step, rather than the generic script runner.
//
// =================================================================================================

// =================================================================================================
// SECTION 1: IMPORTS & DEPENDENCIES
// =================================================================================================

import React, { useState, useCallback, useEffect } from "react";
import toast from "react-hot-toast";
import PulseLoader from "react-spinners/PulseLoader";
import { Loader, AlertTriangle, Play, ShieldCheck, ChevronRight, BookOpen, Info } from "lucide-react";

// --- Local Custom Hooks ---
// These hooks handle the API calls for template discovery and generation.
import { useTemplateDiscovery, useTemplateDetail, useTemplateGeneration } from "../hooks/useTemplateDiscovery";
// This is the specialized hook for the real-time "Apply to Device" step.
import { useTemplateApplication } from "../hooks/useWebSocket";
// This is the specialized UI component for displaying the apply progress.
import TemplateApplyProgress from "./TemplateApplyProgress";

// =================================================================================================
// SECTION 2: HELPER COMPONENT - The Accordion Menu for Template Selection
// =================================================================================================

function TemplateAccordionMenu({ categorizedTemplates, selectedTemplateId, onSelectTemplate, disabled }) {
  const [openCategories, setOpenCategories] = useState([]);

  // Automatically open all categories when templates are first loaded.
  useEffect(() => {
    setOpenCategories(Object.keys(categorizedTemplates));
  }, [categorizedTemplates]);

  const toggleCategory = (category) => {
    setOpenCategories(prev => prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]);
  };

  return (
    <div className="space-y-4">
      {Object.entries(categorizedTemplates).map(([category, templates]) => (
        <div key={category}>
          <button onClick={() => toggleCategory(category)} disabled={disabled} className="w-full flex items-center justify-between text-left font-semibold text-slate-800">
            <span>{category}</span>
            <ChevronRight size={16} className={`transition-transform ${openCategories.includes(category) ? "rotate-90" : ""}`} />
          </button>
          {openCategories.includes(category) && (
            <div className="mt-2 space-y-1 pl-2 border-l-2 border-slate-200">
              {templates.map(template => (
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

// =================================================================================================
// SECTION 3: MAIN WORKFLOW COMPONENT
// =================================================================================================

function TemplateWorkflow({ wsContext }) {
  // -----------------------------------------------------------------------------------------------
  // Subsection 3.1: State Management
  // -----------------------------------------------------------------------------------------------
  // State for tracking which template is selected from the sidebar.
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  // State to hold the configuration text after it's been generated.
  const [generatedConfig, setGeneratedConfig] = useState(null);
  // State to hold any errors that occur during the generation step.
  const [generationError, setGenerationError] = useState(null);
  // State for the connection and credential form fields.
  const [targetHost, setTargetHost] = useState("");
  const [username, setUsername] = useState("root");
  const [password, setPassword] = useState("");
  // State to hold the values for the template's dynamic variables.
  const [dynamicParameters, setDynamicParameters] = useState({});

  // -----------------------------------------------------------------------------------------------
  // Subsection 3.2: Custom Hooks
  // -----------------------------------------------------------------------------------------------
  // Hook for discovering the list of all available templates.
  const { categorizedTemplates, loading: loadingTemplates, error: templatesError } = useTemplateDiscovery();
  // Hook for fetching the detailed parameters of the currently selected template.
  const { template, loading: loadingTemplateDetails } = useTemplateDetail(selectedTemplateId);
  // Hook that provides the function to generate a config preview.
  const { generateConfig, loading: isGenerating } = useTemplateGeneration();

  // ✨ THE FIX: Use the correct, specialized hook for the "Apply" action.
  // This hook is designed to handle the WebSocket events for template application progress.
  const templateRunner = useTemplateApplication(wsContext);

  // A single, reliable flag to know if ANY background process is active.
  const isBusy = isGenerating || templateRunner.isApplying || loadingTemplates || loadingTemplateDetails;

  // -----------------------------------------------------------------------------------------------
  // Subsection 3.3: Callbacks and Event Handlers
  // -----------------------------------------------------------------------------------------------

  // Called when the user selects a new template from the sidebar.
  const handleTemplateChange = useCallback((id) => {
    if (isBusy) return;
    setSelectedTemplateId(id);
    setGeneratedConfig(null);
    setGenerationError(null);
    setDynamicParameters({});
    templateRunner.resetState(); // Reset the progress display from the previous run.

    // Pre-fill the form with default values from the template's metadata.
    const newTemplate = Object.values(categorizedTemplates).flat().find(t => t.id === id);
    if (newTemplate?.parameters) {
      const defaults = {};
      newTemplate.parameters.forEach(p => {
        if (p.default_value !== undefined) defaults[p.name] = p.default_value;
      });
      setDynamicParameters(defaults);
    }
  }, [categorizedTemplates, templateRunner, isBusy]);

  // Called whenever a dynamic template parameter value changes.
  const handleParamChange = useCallback((name, value) => {
    setDynamicParameters(prev => ({ ...prev, [name]: value }));
  }, []);

  // Called when the "1. Generate Preview" button is clicked.
  const handleGenerate = async () => {
    setGeneratedConfig(null);
    setGenerationError(null);
    templateRunner.resetState(); // Ensure the old progress is cleared.

    if (!selectedTemplateId) {
      toast.error("Please select a template first.");
      return;
    }
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

  // ✨ THE FIX: Called when the "2. Apply to Device" button is clicked.
  // This function now uses the correct `applyTemplate` function from the `useTemplateApplication` hook.
  const handleApply = async () => {
    if (!generatedConfig) {
        toast.error("Please generate a configuration preview first before applying.");
        return;
    }
    if (!targetHost || !username || !password) {
        toast.error("Device Connection details (host, username, password) are required.");
        return;
    }

    // This calls the specialized function which the backend understands for this workflow.
    // It does NOT use the generic `runScript`.
    await templateRunner.applyTemplate({
      templateId: selectedTemplateId,
      renderedConfig: generatedConfig,
      targetHostname: targetHost,
      username: username,
      password: password,
    });
  };

  // -----------------------------------------------------------------------------------------------
  // Subsection 3.4: Main Render Logic
  // -----------------------------------------------------------------------------------------------

  if (loadingTemplates) return <div className="p-8 text-center"><Loader className="animate-spin inline-block mr-2" /> Loading templates...</div>;
  if (templatesError) return <div className="p-8 text-red-600 flex items-center justify-center gap-2"><AlertTriangle /> Failed to load templates: {templatesError}</div>;

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* --- LEFT SIDEBAR FOR TEMPLATE SELECTION --- */}
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

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 space-y-8">
        {!selectedTemplateId ? (
          <div className="text-center py-24 px-6 bg-white rounded-xl shadow-lg shadow-slate-200/50">
            <h2 className="text-2xl font-semibold text-slate-600">Select a template from the sidebar to begin.</h2>
            <p className="text-slate-500 mt-2">The required parameters and actions will appear here.</p>
          </div>
        ) : (
          <>
            {/* SECTION FOR PARAMETERS & CONNECTION FORM */}
            <section className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
              <header className="border-b border-slate-200 pb-4 mb-6">
                <h2 className="text-2xl font-bold text-slate-800">{template?.name || "Loading..."}</h2>
                <p className="mt-1 text-slate-600">{template?.description}</p>
              </header>
              {loadingTemplateDetails ? (
                <Loader className="animate-spin" />
              ) : (
                <div className="space-y-6">
                  {/* Fieldset for Connection Details */}
                  <fieldset className="border p-4 rounded-md">
                    <legend className="px-2 font-semibold text-slate-700">Device Connection</legend>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <input type="text" placeholder="Target Host IP/Hostname *" value={targetHost} onChange={e => setTargetHost(e.target.value)} disabled={isBusy} className="p-2 border rounded-md" />
                      <input type="text" placeholder="Username *" value={username} onChange={e => setUsername(e.target.value)} disabled={isBusy} className="p-2 border rounded-md" />
                      <input type="password" placeholder="Password *" value={password} onChange={e => setPassword(e.target.value)} disabled={isBusy} className="p-2 border rounded-md" />
                    </div>
                  </fieldset>

                  {/* Fieldset for Dynamic Template Variables */}
                  {template?.parameters?.length > 0 ? (
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
                  ) : (
                    <div className="text-center p-3 bg-slate-50 rounded-md text-slate-500 flex items-center justify-center gap-2">
                        <Info size={16} /> This template has no configurable variables.
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* SECTION FOR ACTION BUTTONS & PREVIEW */}
            <section className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Execute Workflow</h2>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <button onClick={handleGenerate} disabled={isBusy} className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-slate-400">
                  {isGenerating ? <PulseLoader color="#fff" size={8}/> : <ShieldCheck size={18}/>}
                  1. Generate Preview
                </button>
                <ChevronRight className="text-slate-400 hidden sm:block" />
                <button onClick={handleApply} disabled={isBusy || !generatedConfig} className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-slate-400">
                  {/* The loading indicator for this button is now correctly tied to the templateRunner's state. */}
                  {templateRunner.isApplying ? <PulseLoader color="#fff" size={8}/> : <Play size={18}/>}
                  2. Apply to Device
                </button>
              </div>
              <div className="mt-6">
                {generationError && <div className="p-3 my-4 bg-red-50 text-red-700 rounded-md">{generationError}</div>}
                {/* Only show the preview if the apply step is NOT running. */}
                {generatedConfig && !templateRunner.isApplying && !templateRunner.isComplete && (
                  <div>
                    <h3 className="font-semibold mb-2">Configuration Preview:</h3>
                    <pre className="bg-slate-900 text-white p-4 rounded-md text-xs overflow-auto max-h-96">{generatedConfig}</pre>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {/* ✨ THE FIX: The output display is now the specialized progress component. */}
        {/* It is driven by the state from the `useTemplateApplication` hook. */}
        <TemplateApplyProgress
            applicationState={templateRunner}
            onReset={templateRunner.resetState}
        />
      </main>
    </div>
  );
}

export default TemplateWorkflow;
