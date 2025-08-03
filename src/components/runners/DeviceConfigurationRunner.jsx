// src/components/DeviceConfigurationRunner.jsx
// =============================================================================
// DESCRIPTION
// =============================================================================
// DeviceConfigurationRunner.jsx is the central component for the entire device
// configuration workflow. It dynamically renders a user interface based on the
// capabilities defined in a script's metadata.yml file. It orchestrates template
// discovery, parameter input (including device authentication), configuration
// generation, and real-time deployment to a target device. It also now
// includes a dedicated section for displaying real-time progress of the
// configuration application.

// =============================================================================
// KEY FEATURES
// =============================================================================
// - Metadata-Driven UI: The entire workflow, including template selection,
//   device authentication, and parameter forms, is controlled by the `capabilities`
//   section of a metadata.yml file.
// - Dynamic Component Rendering: It conditionally renders components like
//   `ModernDropdown` for template selection, `SingleDeviceAuth` for credentials,
//   and `UniversalTemplateForm` for dynamic parameters.
// - State Orchestration: Manages the complete state of the configuration process,
//   from template selection to the final application status.
// - Real-Time Updates: Integrates with a WebSocket context (`useRealTimeUpdates`)
//   and the `RealTimeDisplay` component to provide live, detailed feedback during
//   the configuration application process.
// - Asynchronous Operations: Handles API calls for template discovery, detail
//   fetching, configuration generation, and application, with clear loading and
//   error states.
// - Interactive Workflow: Guides the user through selecting a template, filling in
//   parameters, previewing the generated configuration, and applying it.
//
// =============================================================================
// DEPENDENCIES
// =============================================================================
// - react, react-hot-toast, react-spinners, lucide-react
// - Custom Hooks:
//   - `useTemplateDiscovery`: Fetches and categorizes available templates.
//   - `useTemplateDetail`: Fetches details of a selected template.
//   - `useTemplateGeneration`: Handles the API call to generate a config preview.
//   - `useRealTimeUpdates`: Manages WebSocket communication for live progress.
// - Shared Components:
//   - `SingleDeviceAuth`: A self-contained form for hostname/username/password.
//   - `UniversalTemplateForm`: A form generated from template parameter metadata.
//   - `RealTimeDisplay`: Displays real-time progress and logs of the device configuration.
//   - `ModernDropdown`: A feature-rich dropdown for template selection.
//
// =============================================================================
// HOW-TO GUIDE
// =============================================================================
// 1. Integration:
//    - This component is typically rendered by a parent view that manages different
//      script-based tasks.
//    - It requires `script`, `parameters`, `onParamChange`, and `wsContext` props.
// 2. Metadata Configuration (metadata.yml):
//    - To enable template selection:
//      `capabilities: { templateSelection: true }`
//    - To enable device authentication:
//      `capabilities: { deviceAuth: true }`
//    - To enable config generation/preview:
//      `capabilities: { templateGeneration: true }`
//    - Configure the title and template source:
//      `capabilityConfiguration: { templateSelection: { title: "My Workflow", templateSource: "/api/my-templates" } }`
// 3. Operation:
//    - The component first checks for `templateSelection`. If enabled, it loads
//      templates into the `ModernDropdown`.
//    - Once a template is selected, it fetches its details.
//    - It then displays `SingleDeviceAuth` (if `deviceAuth` is true) and
//      `UniversalTemplateForm` (if the template has parameters).
//    - The user can then generate a preview and apply the configuration.
//    - Progress is shown via toast notifications and the new `RealTimeDisplay` component,
//      which provides live logs during the application process.

// =============================================================================
// SECTION 1: IMPORTS & CONFIGURATION
// =============================================================================
import React, { useState, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import PulseLoader from "react-spinners/PulseLoader";
import { Loader, AlertTriangle, Play, ShieldCheck, BookOpen, ChevronRight, Settings, Zap, Info } from "lucide-react";

// Custom Hooks for Template Management and WebSocket
import { useTemplateDiscovery, useTemplateDetail, useTemplateGeneration } from "../../hooks/useTemplateDiscovery";
import { useRealTimeUpdates } from "../../hooks/useRealTimeUpdates";

// Shared UI Components
import SingleDeviceAuth from "../shared/SingleDeviceAuth.jsx";
import UniversalTemplateForm from "../forms/UniversalTemplateForm.jsx";
import ModernDropdown from "../shared/ModernDropdown.jsx";
// NEW: Import RealTimeDisplay to show live logs
import RealTimeDisplay from "../RealTimeProgress/RealTimeDisplay";

// Base URL for API Requests
const API_BASE_URL = "http://localhost:3001";

// =============================================================================
// SECTION 2: COMPONENT DEFINITION
// =============================================================================
/**
 * Main component for the configuration template workflow, respecting capabilities from metadata.yml.
 * @param {object} props - Component props.
 * @param {object} props.script - Script metadata from metadata.yml.
 * @param {object} props.parameters - Current parameter values.
 * @param {function} props.onParamChange - Callback to update parameter values in the parent state.
 * @param {object} props.wsContext - WebSocket context for real-time updates.
 */
function DeviceConfigurationRunner({ script, parameters, onParamChange, wsContext }) {
  // =============================================================================
  // SECTION 3: STATE MANAGEMENT & CUSTOM HOOKS
  // =============================================================================
  // Local state for the workflow
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [generatedConfig, setGeneratedConfig] = useState(null);
  const [generationError, setGenerationError] = useState(null);
  const [dynamicParameters, setDynamicParameters] = useState({});
  const [showPreview, setShowPreview] = useState(false);

  // Read capabilities from script metadata, with fallbacks
  const hasTemplateSelection = script?.capabilities?.templateSelection || false;
  const hasTemplateGeneration = script?.capabilities?.templateGeneration || false;
  const hasDeviceAuth = script?.capabilities?.deviceAuth || false;
  const templateSource = script?.capabilityConfiguration?.templateSelection?.templateSource || "/api/templates/list";

  // Custom hooks for handling asynchronous operations
  const { categorizedTemplates, loading: loadingTemplates, error: templatesError } = useTemplateDiscovery(templateSource);
  const { template, loading: loadingTemplateDetails } = useTemplateDetail(selectedTemplateId);
  const { generateConfig, loading: isGenerating } = useTemplateGeneration();
  const templateApplicationState = useRealTimeUpdates(wsContext);

  // A derived state to determine if any major operation is in progress
  const isBusy = isGenerating || templateApplicationState.isRunning || loadingTemplates || loadingTemplateDetails;

  // =============================================================================
  // SECTION 4: DATA PROCESSING & MEMOIZATION
  // =============================================================================
  /**
   * Memoized conversion of categorized templates into a flat list suitable for the ModernDropdown component.
   * It adds non-selectable category headers.
   */
  const templateOptions = useMemo(() => {
    if (!categorizedTemplates || typeof categorizedTemplates !== 'object') {
      return [];
    }
    const options = [];
    Object.entries(categorizedTemplates).forEach(([category, templates]) => {
      if (Array.isArray(templates) && templates.length > 0) {
        options.push({ value: `__category_${category}`, label: `── ${category} ──`, disabled: true, isCategory: true });
        templates.forEach(template => {
          options.push({ value: template.id, label: template.name, description: template.description, category: category });
        });
      }
    });
    return options;
  }, [categorizedTemplates]);

  /**
   * Memoized lookup for the currently selected template object.
   * Avoids re-calculating on every render.
   */
  const selectedTemplate = useMemo(() => {
    if (!selectedTemplateId || !categorizedTemplates) return null;
    const allTemplates = Object.values(categorizedTemplates).flat();
    return allTemplates.find(t => t.id === selectedTemplateId);
  }, [selectedTemplateId, categorizedTemplates]);

  // =============================================================================
  // SECTION 5: EVENT HANDLERS
  // =============================================================================
  /**
   * Handles changes in the template selection dropdown.
   * Resets workflow state and sets default parameters from the new template.
   */
  const handleTemplateChange = useCallback((id) => {
    if (id.startsWith('__category_') || isBusy) return; // Ignore category headers and changes while busy

    // Reset state for the new workflow
    setSelectedTemplateId(id);
    setGeneratedConfig(null);
    setGenerationError(null);
    setDynamicParameters({});
    setShowPreview(false);
    templateApplicationState.resetState();

    // Set default values for the newly selected template
    const allTemplates = Object.values(categorizedTemplates).flat();
    const newTemplate = allTemplates.find(t => t.id === id);
    if (newTemplate?.parameters) {
      const defaults = {};
      newTemplate.parameters.forEach(p => {
        if (p.default_value !== undefined) defaults[p.name] = p.default_value;
      });
      setDynamicParameters(defaults);
      Object.entries(defaults).forEach(([name, value]) => onParamChange(name, value)); // Inform parent of defaults
    }
  }, [categorizedTemplates, templateApplicationState, isBusy, onParamChange]);

  /**
   * Handles changes to dynamic template parameters and updates the parent state.
   */
  const handleParamChange = useCallback((name, value) => {
    setDynamicParameters(prev => ({ ...prev, [name]: value }));
    onParamChange(name, value); // Propagate change to parent
  }, [onParamChange]);

  /**
   * Triggers the configuration generation process.
   * Validates required inputs before making the API call.
   */
  const handleGenerate = useCallback(async () => {
    if (!hasTemplateGeneration) {
      toast.error("Template generation is not enabled for this script.");
      return;
    }

    // Reset previous generation state
    setGeneratedConfig(null);
    setGenerationError(null);
    setShowPreview(false);
    templateApplicationState.resetState();

    // Input validation
    if (!selectedTemplateId) {
      toast.error("Please select a template.");
      return;
    }
    if (hasDeviceAuth && (!parameters.hostname || !parameters.username || !parameters.password)) {
      toast.error("Device connection details (host, username, password) are required.");
      return;
    }

    // Call generation hook
    const response = await generateConfig(selectedTemplateId, dynamicParameters);
    if (response && response.success && response.result.success) {
      setGeneratedConfig(response.result.rendered_config);
      setShowPreview(true);
      toast.success("Configuration preview generated!");
    } else {
      const errorMessage = response?.result?.error || response?.error || "An unknown error occurred during generation.";
      setGenerationError(errorMessage);
      toast.error(errorMessage);
    }
  }, [selectedTemplateId, parameters, dynamicParameters, generateConfig, templateApplicationState, hasTemplateGeneration, hasDeviceAuth]);

  /**
   * Triggers the configuration application process.
   * Validates that a config has been generated and that WebSocket context is available.
   */
  const handleApply = useCallback(async () => {
    // Input validation
    if (!generatedConfig) {
      toast.error("Please generate a configuration preview first.");
      return;
    }
    if (hasDeviceAuth && (!parameters.hostname || !parameters.username || !parameters.password)) {
      toast.error("Device connection details are required.");
      return;
    }
    if (!wsContext || !wsContext.clientId) {
      toast.error("WebSocket context is not initialized. Cannot apply config.");
      return;
    }

    // Use the real-time updates hook to manage the operation
    await templateApplicationState.startOperation(async () => {
      const response = await fetch(`${API_BASE_URL}/api/templates/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wsClientId: wsContext.clientId,
          templateId: selectedTemplateId,
          renderedConfig: generatedConfig,
          targetHostname: parameters.hostname,
          username: parameters.username,
          password: parameters.password,
        }),
      });

      if (!response.ok) {
        const errData = await response.text();
        throw new Error(errData || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    });
  }, [generatedConfig, parameters, wsContext, selectedTemplateId, templateApplicationState, hasDeviceAuth]);

  // =============================================================================
  // SECTION 6: RENDER LOGIC
  // =============================================================================

  // SECTION 6.1: Conditional Rendering (Loading/Error States)
  if (loadingTemplates && hasTemplateSelection) {
    return (
      <div className="flex items-center justify-center p-6 border rounded-lg bg-card">
        <Loader className="animate-spin mr-3 h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading templates...</span>
      </div>
    );
  }

  if (templatesError && hasTemplateSelection) {
    return (
      <div className="flex items-center gap-3 p-4 border rounded-lg bg-destructive/10 border-destructive/20">
        <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-destructive">Failed to load templates</p>
          <p className="text-xs text-destructive/80">{templatesError}</p>
        </div>
      </div>
    );
  }

  // SECTION 6.2: Main Component UI
  return (
    <div className="space-y-6">
      {/* Combined Header & Template Selection Card */}
      <section className="border rounded-lg bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted flex-shrink-0">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {script?.capabilityConfiguration?.templateSelection?.title || "Configuration Workflow"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {script?.description || "Configure and deploy templates"}
              </p>
            </div>
          </div>
          {selectedTemplate && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Selected</div>
              <div className="text-sm font-medium">{selectedTemplate.name}</div>
            </div>
          )}
        </div>
        {/* Template Selection Dropdown */}
        {hasTemplateSelection && (
          <div className="mt-6">
            <ModernDropdown
              id="template-selector"
              options={templateOptions}
              value={selectedTemplateId}
              onChange={handleTemplateChange}
              placeholder="Choose a template..."
              disabled={isBusy}
              required
              searchable
            />
          </div>
        )}
      </section>

      {/* Main Content Grid */}
      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Parameters */}
        <div className="lg:col-span-2 space-y-6">
          {/* Parameters Section (visible when a template is selected or no selection is needed) */}
          {(!hasTemplateSelection || selectedTemplateId) && (
            <div className="space-y-6">
              {loadingTemplateDetails ? (
                <div className="border rounded-lg bg-card p-6 text-center">
                  <Loader className="animate-spin mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading template details...</p>
                </div>
              ) : (
                <>
                  {/* Device Authentication Component */}
                  {hasDeviceAuth && (
                    <section>
                      <SingleDeviceAuth
                        parameters={parameters}
                        onParamChange={onParamChange}
                        title="Device Connection"
                        description="Enter credentials for the target device"
                        className={isBusy ? "pointer-events-none opacity-50" : ""}
                      />
                    </section>
                  )}

                  {/* Dynamic Template Parameters Form */}
                  {template?.parameters?.length > 0 && (
                    <section className="border rounded-lg bg-card p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Settings className="h-4 w-4 text-blue-600" />
                        <h3 className="text-base font-medium">Template Parameters</h3>
                      </div>
                      <UniversalTemplateForm
                        template={template}
                        parameters={dynamicParameters}
                        onParamChange={handleParamChange}
                        disabled={isBusy}
                      />
                    </section>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Actions & Info */}
        <aside className="space-y-6">
          {/* Action Buttons Card */}
          {hasTemplateGeneration && (!hasTemplateSelection || selectedTemplateId) && (
            <section className="border rounded-lg bg-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="h-4 w-4 text-orange-500" />
                <h3 className="text-base font-medium">Actions</h3>
              </div>
              <div className="space-y-3">
                <button
                  onClick={handleGenerate}
                  disabled={isBusy || (hasTemplateSelection && !selectedTemplateId)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  {isGenerating ? <PulseLoader color="currentColor" size={10} /> : <ShieldCheck className="h-4 w-4" />}
                  Generate Preview
                </button>
                <button
                  onClick={handleApply}
                  disabled={isBusy || !generatedConfig}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground shadow-sm hover:bg-secondary/80 disabled:pointer-events-none disabled:opacity-50"
                >
                  {templateApplicationState.isRunning ? <PulseLoader color="currentColor" size={10} /> : <Play className="h-4 w-4" />}
                  Apply to Device
                </button>
              </div>
              {/* Status & Error Messages */}
              <div className="mt-4 space-y-2">
                {generationError && (
                  <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <p>{generationError}</p>
                    </div>
                  </div>
                )}
                {generatedConfig && (
                  <div className="rounded-md bg-green-50 border border-green-200 p-3 text-xs text-green-700">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                      <p>Configuration ready for deployment</p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Moved Real-time progress to this section */}
          <RealTimeDisplay
            {...templateApplicationState}
            onReset={templateApplicationState.resetState}
          />
        </aside>
      </main>

      {/* Configuration Preview Section */}
      {showPreview && generatedConfig && (
        <section className="border rounded-lg bg-card overflow-hidden">
          <header className="flex items-center justify-between border-b bg-muted/50 px-6 py-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Configuration Preview</span>
            </div>
            <button onClick={() => setShowPreview(false)} className="text-xs text-muted-foreground hover:text-foreground">Hide</button>
          </header>
          <div className="bg-black text-green-400 p-4 text-xs font-mono overflow-auto max-h-64 leading-relaxed">
            <pre><code>{generatedConfig}</code></pre>
          </div>
        </section>
      )}

      {/* Empty State Placeholders */}
      {hasTemplateSelection && !selectedTemplateId && !loadingTemplates && (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Select a Template</h3>
          <p className="text-sm text-muted-foreground">Choose a configuration template to begin the workflow</p>
        </div>
      )}
      {!hasTemplateSelection && !hasDeviceAuth && !template?.parameters?.length && (
        <div className="text-center py-12 border rounded-lg bg-muted/30">
          <Zap className="mx-auto h-8 w-8 text-orange-500 mb-4" />
          <h3 className="text-lg font-medium mb-2">Ready to Execute</h3>
          <p className="text-sm text-muted-foreground">No additional configuration required</p>
        </div>
      )}
    </div>
  );
}

export default DeviceConfigurationRunner;
