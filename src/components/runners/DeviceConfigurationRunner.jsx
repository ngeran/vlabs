// src/components/DeviceConfigurationRunner.jsx
// =============================================================================
// DESCRIPTION
// =============================================================================
// A space-efficient, tab-based device configuration workflow component that
// dynamically renders UI based on script metadata capabilities. This modernized
// version uses shadcn/ui tabs to organize the workflow into logical sections,
// significantly reducing screen real estate while maintaining full functionality.
//
// The component orchestrates template discovery, parameter input, device
// authentication, configuration generation, and real-time deployment with an
// intuitive tabbed interface that guides users through each step of the process.

// =============================================================================
// OVERVIEW
// =============================================================================
// This component serves as the central orchestrator for device configuration
// workflows. It reads capabilities from metadata.yml files and dynamically
// renders appropriate UI components within an organized tab structure:
//
// Tab Structure:
// 1. "Setup" - Template selection and basic configuration
// 2. "Parameters" - Device authentication and template parameters
// 3. "Preview" - Configuration generation and preview
// 4. "Deploy" - Real-time deployment with progress tracking
//
// The tabs are intelligently shown/hidden based on the script's capabilities,
// ensuring users only see relevant sections for their specific workflow.

// =============================================================================
// KEY FEATURES
// =============================================================================
// ✨ Space-Efficient Design: Tabbed interface reduces vertical scroll
// 🎯 Metadata-Driven UI: Entire workflow controlled by metadata.yml capabilities
// 🔄 Dynamic Component Rendering: Conditional rendering based on capabilities
// 📊 Real-Time Progress: Live WebSocket updates during deployment
// 🎨 Modern Design: Clean, professional interface with shadcn/ui components
// 🔧 State Management: Comprehensive state orchestration across tabs
// ⚡ Async Operations: Handles all API calls with proper loading states
// 🛡️ Error Handling: Robust error handling with user-friendly messages
// 📱 Responsive: Adapts to different screen sizes seamlessly

// =============================================================================
// DEPENDENCIES
// =============================================================================
// External Libraries:
// - react (useState, useEffect, useCallback, useMemo)
// - react-hot-toast (toast notifications)
// - react-spinners (loading indicators)
// - lucide-react (icons)
// - @/components/ui/tabs (shadcn/ui tabs component)
//
// Custom Hooks:
// - useTemplateDiscovery: Fetches and categorizes available templates
// - useTemplateDetail: Fetches details of selected template
// - useTemplateGeneration: Handles configuration generation API calls
// - useRealTimeUpdates: Manages WebSocket communication for live progress
//
// Shared Components:
// - SingleDeviceAuth: Device credential input form
// - UniversalTemplateForm: Dynamic parameter form generator
// - ModernDropdown: Feature-rich template selection dropdown
// - RealTimeDisplay: Live progress and log display component

// =============================================================================
// DETAILED HOW-TO GUIDE
// =============================================================================
//
// 1. INTEGRATION SETUP:
//    Import and use in parent component:
//    ```jsx
//    <DeviceConfigurationRunner
//      script={scriptMetadata}
//      parameters={params}
//      onParamChange={handleParamChange}
//      wsContext={webSocketContext}
//    />
//    ```
//
// 2. METADATA CONFIGURATION (metadata.yml):
//    Enable capabilities as needed:
//    ```yaml
//    capabilities:
//      templateSelection: true    # Shows Setup tab with template dropdown
//      deviceAuth: true          # Shows device auth form in Parameters tab
//      templateGeneration: true  # Shows Preview tab with generation
//
//    capabilityConfiguration:
//      templateSelection:
//        title: "Network Configuration"
//        templateSource: "/api/network-templates"
//    ```
//
// 3. TAB VISIBILITY LOGIC:
//    - Setup tab: Always visible if templateSelection capability enabled
//    - Parameters tab: Visible if deviceAuth enabled OR template has parameters
//    - Preview tab: Visible if templateGeneration capability enabled
//    - Deploy tab: Visible if templateGeneration enabled (for applying configs)
//
// 4. WORKFLOW PROGRESSION:
//    a) User selects template in Setup tab
//    b) Fills parameters/auth in Parameters tab
//    c) Generates preview in Preview tab
//    d) Applies configuration in Deploy tab with real-time feedback
//
// 5. CUSTOMIZATION OPTIONS:
//    - Modify tab labels in TAB_CONFIG constant
//    - Adjust styling with Tailwind classes
//    - Extend capabilities by adding new metadata options

// =============================================================================
// SECTION 1: IMPORTS & CONFIGURATION
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import PulseLoader from "react-spinners/PulseLoader";
import {
  Loader,
  AlertTriangle,
  Play,
  ShieldCheck,
  BookOpen,
  Settings,
  Zap,
  Eye,
  Rocket,
  CheckCircle,
  ChevronRight
} from "lucide-react";

// shadcn/ui Components
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Custom Hooks for Template Management and WebSocket
import { useTemplateDiscovery, useTemplateDetail, useTemplateGeneration } from "../../hooks/useTemplateDiscovery";
import { useRealTimeUpdates } from "../../hooks/useRealTimeUpdates";

// Shared UI Components
import SingleDeviceAuth from "../shared/SingleDeviceAuth.jsx";
import UniversalTemplateForm from "../forms/UniversalTemplateForm.jsx";
import ModernDropdown from "../shared/ModernDropdown.jsx";
import RealTimeDisplay from "../RealTimeProgress/RealTimeDisplay";

// API Configuration
const API_BASE_URL = "http://localhost:3001";

// Tab Configuration - Centralized tab settings for easy customization
const TAB_CONFIG = {
  setup: { id: "setup", label: "Setup", icon: BookOpen },
  parameters: { id: "parameters", label: "Parameters", icon: Settings },
  preview: { id: "preview", label: "Preview", icon: Eye },
  deploy: { id: "deploy", label: "Deploy", icon: Rocket }
};

// =============================================================================
// SECTION 2: MAIN COMPONENT DEFINITION
// =============================================================================

/**
 * Space-efficient device configuration workflow component with tabbed interface.
 *
 * @param {Object} props - Component props
 * @param {Object} props.script - Script metadata containing capabilities and configuration
 * @param {Object} props.parameters - Current parameter values from parent state
 * @param {Function} props.onParamChange - Callback to update parameter values in parent
 * @param {Object} props.wsContext - WebSocket context for real-time updates
 * @returns {JSX.Element} Tabbed configuration interface
 */
function DeviceConfigurationRunner({ script, parameters, onParamChange, wsContext }) {

  // =============================================================================
  // SECTION 3: STATE MANAGEMENT & INITIALIZATION
  // =============================================================================

  // Core workflow state
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [generatedConfig, setGeneratedConfig] = useState(null);
  const [generationError, setGenerationError] = useState(null);
  const [dynamicParameters, setDynamicParameters] = useState({});
  const [activeTab, setActiveTab] = useState(TAB_CONFIG.setup.id);

  // Extract capabilities from script metadata with safe defaults
  const capabilities = useMemo(() => ({
    templateSelection: script?.capabilities?.templateSelection || false,
    templateGeneration: script?.capabilities?.templateGeneration || false,
    deviceAuth: script?.capabilities?.deviceAuth || false
  }), [script?.capabilities]);

  // Extract configuration from script metadata
  const config = useMemo(() => ({
    title: script?.capabilityConfiguration?.templateSelection?.title || "Configuration Workflow",
    description: script?.description || "Configure and deploy templates",
    templateSource: script?.capabilityConfiguration?.templateSelection?.templateSource || "/api/templates/list"
  }), [script]);

  // =============================================================================
  // SECTION 4: CUSTOM HOOKS & ASYNC OPERATIONS
  // =============================================================================

  // Template management hooks
  const {
    categorizedTemplates,
    loading: loadingTemplates,
    error: templatesError
  } = useTemplateDiscovery(config.templateSource);

  const {
    template,
    loading: loadingTemplateDetails
  } = useTemplateDetail(selectedTemplateId);

  const {
    generateConfig,
    loading: isGenerating
  } = useTemplateGeneration();

  // Real-time updates for deployment progress
  const templateApplicationState = useRealTimeUpdates(wsContext);

  // Combined loading state for UI feedback
  const isBusy = useMemo(() =>
    isGenerating ||
    templateApplicationState.isRunning ||
    loadingTemplates ||
    loadingTemplateDetails
  , [isGenerating, templateApplicationState.isRunning, loadingTemplates, loadingTemplateDetails]);

  // =============================================================================
  // SECTION 5: DATA PROCESSING & MEMOIZATION
  // =============================================================================

  /**
   * Convert categorized templates into dropdown-compatible format
   * Adds non-selectable category headers for better organization
   */
  const templateOptions = useMemo(() => {
    if (!categorizedTemplates || typeof categorizedTemplates !== 'object') {
      console.log('No categorized templates available:', categorizedTemplates);
      return [];
    }

    const options = [];
    Object.entries(categorizedTemplates).forEach(([category, templates]) => {
      if (Array.isArray(templates) && templates.length > 0) {
        // Add category header (non-selectable)
        options.push({
          value: `__category_${category}`,
          label: `── ${category} ──`,
          disabled: true,
          isCategory: true
        });

        // Add template options
        templates.forEach(template => {
          options.push({
            value: template.id,
            label: template.name,
            description: template.description,
            category: category
          });
        });
      }
    });

    console.log('Generated template options:', options);
    return options;
  }, [categorizedTemplates]);

  /**
   * Find currently selected template object
   * Optimized with memoization to prevent unnecessary recalculations
   */
  const selectedTemplate = useMemo(() => {
    if (!selectedTemplateId || !categorizedTemplates) {
      console.log('No selected template:', { selectedTemplateId, categorizedTemplates });
      return null;
    }

    const allTemplates = Object.values(categorizedTemplates).flat();
    const found = allTemplates.find(t => t.id === selectedTemplateId);
    console.log('Selected template found:', found);
    return found;
  }, [selectedTemplateId, categorizedTemplates]);

  // =============================================================================
  // SECTION 6: TAB VISIBILITY & NAVIGATION LOGIC
  // =============================================================================

  /**
   * Determine which tabs should be visible based on capabilities and current state
   */
  const visibleTabs = useMemo(() => {
    const tabs = [];

    // Setup tab - shown if template selection is enabled
    if (capabilities.templateSelection) {
      tabs.push(TAB_CONFIG.setup);
    }

    // Parameters tab - shown if device auth or template parameters exist
    if (capabilities.deviceAuth || (template?.parameters?.length > 0)) {
      tabs.push(TAB_CONFIG.parameters);
    }

    // Preview tab - shown if template generation is enabled
    if (capabilities.templateGeneration) {
      tabs.push(TAB_CONFIG.preview);
    }

    // Deploy tab - shown if template generation is enabled (for applying configs)
    if (capabilities.templateGeneration) {
      tabs.push(TAB_CONFIG.deploy);
    }

    return tabs;
  }, [capabilities, template?.parameters?.length]);

  /**
   * Auto-navigate to appropriate tab based on workflow state
   */
  useEffect(() => {
    // If current tab is not visible, switch to first visible tab
    if (!visibleTabs.find(tab => tab.id === activeTab)) {
      if (visibleTabs.length > 0) {
        setActiveTab(visibleTabs[0].id);
      }
    }
  }, [visibleTabs, activeTab]);

  // =============================================================================
  // SECTION 7: EVENT HANDLERS & BUSINESS LOGIC
  // =============================================================================

  /**
   * Handle template selection from dropdown
   * Resets workflow state and sets default parameter values
   */
  const handleTemplateChange = useCallback((templateId) => {
    console.log('Template selected:', templateId); // Debug log

    // Ignore category headers and prevent changes while busy
    if (!templateId || templateId.startsWith('__category_') || isBusy) {
      console.log('Ignoring template change:', { templateId, isBusy }); // Debug log
      return;
    }

    // Reset workflow state for new template
    setSelectedTemplateId(templateId);
    setGeneratedConfig(null);
    setGenerationError(null);
    setDynamicParameters({});
    templateApplicationState.resetState();

    // Set default parameter values from template metadata
    const allTemplates = Object.values(categorizedTemplates || {}).flat();
    const newTemplate = allTemplates.find(t => t.id === templateId);

    console.log('Found template:', newTemplate); // Debug log

    if (newTemplate?.parameters) {
      const defaults = {};
      newTemplate.parameters.forEach(param => {
        if (param.default_value !== undefined) {
          defaults[param.name] = param.default_value;
        }
      });

      setDynamicParameters(defaults);

      // Propagate defaults to parent component
      Object.entries(defaults).forEach(([name, value]) => {
        onParamChange(name, value);
      });
    }

    // Auto-navigate to parameters tab if template is selected and parameters tab is visible
    if (visibleTabs.find(tab => tab.id === TAB_CONFIG.parameters.id)) {
      setTimeout(() => setActiveTab(TAB_CONFIG.parameters.id), 100);
    }
  }, [categorizedTemplates, templateApplicationState, isBusy, onParamChange, visibleTabs]);

  /**
   * Handle dynamic parameter changes
   * Updates local state and propagates to parent
   */
  const handleParamChange = useCallback((name, value) => {
    setDynamicParameters(prev => ({ ...prev, [name]: value }));
    onParamChange(name, value);
  }, [onParamChange]);

  /**
   * Generate configuration preview
   * Validates inputs and calls generation API, then navigates to preview tab
   */
  const handleGenerate = useCallback(async () => {
    if (!capabilities.templateGeneration) {
      toast.error("Template generation is not enabled for this script.");
      return;
    }

    // Reset previous generation state
    setGeneratedConfig(null);
    setGenerationError(null);
    templateApplicationState.resetState();

    // Validate required inputs
    if (!selectedTemplateId) {
      toast.error("Please select a template first.");
      setActiveTab(TAB_CONFIG.setup.id);
      return;
    }

    if (capabilities.deviceAuth && (!parameters.hostname || !parameters.username || !parameters.password)) {
      toast.error("Device connection details are required.");
      return;
    }

    // Call generation API
    const response = await generateConfig(selectedTemplateId, dynamicParameters);

    if (response?.success && response.result?.success) {
      setGeneratedConfig(response.result.rendered_config);
      toast.success("Configuration preview generated successfully!");

      // Auto-navigate to preview tab to show the generated config
      setTimeout(() => setActiveTab(TAB_CONFIG.preview.id), 100);
    } else {
      const errorMessage = response?.result?.error || response?.error || "Unknown error during generation";
      setGenerationError(errorMessage);
      toast.error(`Generation failed: ${errorMessage}`);
    }
  }, [selectedTemplateId, parameters, dynamicParameters, generateConfig, templateApplicationState, capabilities]);

  /**
   * Apply configuration to target device
   * Validates inputs and initiates deployment, then navigates to deploy tab
   */
  const handleApply = useCallback(async () => {
    // Validate prerequisites
    if (!generatedConfig) {
      toast.error("Please generate a configuration preview first.");
      setActiveTab(TAB_CONFIG.parameters.id);
      return;
    }

    if (capabilities.deviceAuth && (!parameters.hostname || !parameters.username || !parameters.password)) {
      toast.error("Device connection details are required.");
      setActiveTab(TAB_CONFIG.parameters.id);
      return;
    }

    if (!wsContext?.clientId) {
      toast.error("WebSocket connection not available. Cannot apply configuration.");
      return;
    }

    // Navigate to deploy tab to show progress
    setTimeout(() => setActiveTab(TAB_CONFIG.deploy.id), 100);

    // Start deployment operation with real-time updates
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
        const errorData = await response.text();
        throw new Error(errorData || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    });
  }, [generatedConfig, parameters, wsContext, selectedTemplateId, templateApplicationState, capabilities]);

  // =============================================================================
  // SECTION 8: RENDER HELPER FUNCTIONS
  // =============================================================================

  /**
   * Render loading state for template discovery
   */
  const renderLoadingState = () => (
    <div className="flex items-center justify-center p-8 border rounded-lg bg-card">
      <Loader className="animate-spin mr-3 h-5 w-5 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Loading templates...</span>
    </div>
  );

  /**
   * Render error state for template loading failure
   */
  const renderErrorState = () => (
    <div className="flex items-center gap-3 p-4 border rounded-lg bg-destructive/10 border-destructive/20">
      <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
      <div>
        <p className="text-sm font-medium text-destructive">Failed to load templates</p>
        <p className="text-xs text-destructive/80 mt-1">{templatesError}</p>
      </div>
    </div>
  );

  /**
   * Render tab content header with icon and title
   */
  const renderTabHeader = (icon, title, description) => {
    const IconComponent = icon;
    return (
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <IconComponent className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
    );
  };

  // =============================================================================
  // SECTION 9: MAIN RENDER LOGIC
  // =============================================================================

  // Handle loading and error states
  if (loadingTemplates && capabilities.templateSelection) {
    return renderLoadingState();
  }

  if (templatesError && capabilities.templateSelection) {
    return renderErrorState();
  }

  // Main component render
  return (
    <div className="space-y-6">
      {/* Header Section - Always visible */}
      <header className="border rounded-lg bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{config.title}</h1>
              <p className="text-muted-foreground mt-1">{config.description}</p>
            </div>
          </div>

          {/* Status indicator */}
          {selectedTemplate && (
            <div className="text-right">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>Template Selected</span>
              </div>
              <div className="text-sm font-medium">{selectedTemplate.name}</div>
            </div>
          )}
        </div>
      </header>

      {/* Tabbed Interface - Main content area */}
      <div className="border rounded-lg bg-card">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Tab Navigation */}
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 h-auto p-1 bg-muted/50">
            {visibleTabs.map((tab) => {
              const IconComponent = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex items-center gap-2 py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  disabled={isBusy && activeTab !== tab.id}
                >
                  <IconComponent className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Setup Tab Content */}
          <TabsContent value={TAB_CONFIG.setup.id} className="p-6 space-y-6 relative">
            {renderTabHeader(BookOpen, "Template Selection", "Choose a configuration template")}

            <div className="space-y-6">
              {/* Template Selection Dropdown */}
              <div className="space-y-2 relative z-50">
                <label htmlFor="template-selector" className="text-sm font-medium text-slate-700">
                  Configuration Template *
                </label>
                <div className="relative">
                  <ModernDropdown
                    id="template-selector"
                    options={templateOptions}
                    value={selectedTemplateId || ""}
                    onChange={handleTemplateChange}
                    placeholder="Select a template to begin..."
                    disabled={isBusy || loadingTemplates}
                    required={true}
                    searchable={true}
                    size="lg"
                    maxHeight={320}
                    className="w-full"
                  />
                  {/* Debug Info */}
                  {process.env.NODE_ENV === 'development' && (
                    <div className="mt-1 text-xs text-slate-400">
                      Debug: {templateOptions.length} options, Selected: {selectedTemplateId || 'none'}
                    </div>
                  )}
                </div>
                {templateOptions.length > 0 && !selectedTemplateId && (
                  <p className="text-xs text-slate-500">
                    {templateOptions.filter(opt => !opt.isCategory).length} templates available
                  </p>
                )}
              </div>

              {/* Selected Template Info Card */}
              {selectedTemplate && (
                <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 to-indigo-50">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5"></div>
                  <div className="relative p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-200/50">
                        <CheckCircle className="h-6 w-6 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-slate-900 mb-1">
                          {selectedTemplate.name}
                        </h3>
                        <p className="text-sm text-slate-600 leading-relaxed mb-3">
                          {selectedTemplate.description || "No description available"}
                        </p>

                        {/* Template Metadata */}
                        <div className="flex flex-wrap gap-4 text-xs">
                          {selectedTemplate.category && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                              <span className="text-slate-600 font-medium">Category:</span>
                              <span className="text-slate-800">{selectedTemplate.category}</span>
                            </div>
                          )}
                          {selectedTemplate.parameters?.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                              <span className="text-slate-600 font-medium">Parameters:</span>
                              <span className="text-slate-800">{selectedTemplate.parameters.length} required</span>
                            </div>
                          )}
                          {selectedTemplate.version && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-green-500"></div>
                              <span className="text-slate-600 font-medium">Version:</span>
                              <span className="text-slate-800">{selectedTemplate.version}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="mt-4 pt-4 border-t border-blue-200/30">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-slate-600">
                          Template ready for configuration
                        </div>
                        <button
                          onClick={() => setActiveTab(TAB_CONFIG.parameters.id)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          Configure Parameters
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Template Loading State */}
              {loadingTemplates && (
                <div className="flex items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-lg">
                  <div className="text-center">
                    <Loader className="animate-spin mx-auto mb-3 h-6 w-6 text-slate-400" />
                    <p className="text-sm text-slate-600 font-medium">Loading Templates</p>
                    <p className="text-xs text-slate-500 mt-1">Discovering available configurations...</p>
                  </div>
                </div>
              )}

              {/* No Templates Available */}
              {!loadingTemplates && templateOptions.length === 0 && (
                <div className="text-center p-8 border-2 border-dashed border-slate-200 rounded-lg">
                  <AlertTriangle className="mx-auto h-8 w-8 text-slate-400 mb-3" />
                  <h3 className="text-sm font-medium text-slate-900 mb-1">No Templates Available</h3>
                  <p className="text-xs text-slate-500">
                    No configuration templates were found at the specified source.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Parameters Tab Content */}
          <TabsContent value={TAB_CONFIG.parameters.id} className="p-6 space-y-6">
            {renderTabHeader(Settings, "Configuration Parameters", "Set up device connection and template parameters")}

            <div className="space-y-6">
              {loadingTemplateDetails ? (
                <div className="text-center py-8">
                  <Loader className="animate-spin mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading template details...</p>
                </div>
              ) : (
                <>
                  {/* Device Authentication Section */}
                  {capabilities.deviceAuth && (
                    <div className="space-y-4">
                      <h3 className="text-base font-medium flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-blue-600" />
                        Device Connection
                      </h3>
                      <SingleDeviceAuth
                        parameters={parameters}
                        onParamChange={onParamChange}
                        className={isBusy ? "pointer-events-none opacity-50" : ""}
                      />
                    </div>
                  )}

                  {/* Template Parameters Section */}
                  {template?.parameters?.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-base font-medium flex items-center gap-2">
                        <Settings className="h-4 w-4 text-orange-500" />
                        Template Parameters
                      </h3>
                      <UniversalTemplateForm
                        template={template}
                        parameters={dynamicParameters}
                        onParamChange={handleParamChange}
                        disabled={isBusy}
                      />
                    </div>
                  )}

                  {/* Generate Preview Section */}
                  {capabilities.templateGeneration && (
                    <div className="border-t pt-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-base font-medium flex items-center gap-2">
                              <Zap className="h-4 w-4 text-purple-600" />
                              Generate Configuration
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              Create a preview of the configuration before deployment
                            </p>
                          </div>
                        </div>

                        {/* Generate Button */}
                        <div className="flex gap-4">
                          <button
                            onClick={handleGenerate}
                            disabled={isBusy || (capabilities.templateSelection && !selectedTemplateId)}
                            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-3 text-sm font-medium text-white shadow-lg hover:from-purple-700 hover:to-blue-700 disabled:pointer-events-none disabled:opacity-50 transition-all duration-200"
                          >
                            {isGenerating ? (
                              <PulseLoader color="currentColor" size={8} />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                            Generate Preview
                          </button>
                        </div>

                        {/* Generation Status */}
                        {generationError && (
                          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                            <div className="flex items-start gap-3">
                              <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                              <div>
                                <h4 className="text-sm font-medium text-red-800">Generation Failed</h4>
                                <p className="text-sm text-red-700 mt-1">{generationError}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {generatedConfig && (
                          <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-5 w-5 text-green-600" />
                              <div>
                                <p className="text-sm font-medium text-green-800">Configuration Generated Successfully</p>
                                <p className="text-xs text-green-700 mt-1">Ready for review and deployment</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          {/* Preview Tab Content */}
          <TabsContent value={TAB_CONFIG.preview.id} className="p-6 space-y-6">
            {renderTabHeader(Eye, "Configuration Preview", "Review the generated configuration before deployment")}

            <div className="space-y-6">
              {!generatedConfig ? (
                /* No Configuration Generated Yet */
                <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg">
                  <Eye className="mx-auto h-12 w-12 text-slate-400 mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No Configuration Generated</h3>
                  <p className="text-sm text-slate-500 mb-4">
                    Generate a configuration preview in the Parameters tab first
                  </p>
                  <button
                    onClick={() => setActiveTab(TAB_CONFIG.parameters.id)}
                    className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4 rotate-180" />
                    Back to Parameters
                  </button>
                </div>
              ) : (
                <>
                  {/* Configuration Preview Display */}
                  <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
                    <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4 border-b border-slate-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </div>
                          <div>
                            <h3 className="text-base font-semibold text-slate-900">Generated Configuration</h3>
                            <p className="text-xs text-slate-600">Ready for deployment to target device</p>
                          </div>
                        </div>
                        {selectedTemplate && (
                          <div className="text-right">
                            <div className="text-xs text-slate-500">Template</div>
                            <div className="text-sm font-medium text-slate-700">{selectedTemplate.name}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Configuration Content */}
                    <div className="relative">
                      <div className="bg-slate-900 text-green-400 p-6 text-sm font-mono overflow-auto max-h-96 leading-relaxed">
                        <pre><code>{generatedConfig}</code></pre>
                      </div>
                      <div className="absolute top-4 right-4">
                        <div className="bg-slate-800/80 backdrop-blur-sm rounded-md px-2 py-1 text-xs text-slate-300 border border-slate-700">
                          {generatedConfig.split('\n').length} lines
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Apply to Device Section */}
                  <div className="border rounded-lg p-6 bg-gradient-to-br from-green-50 to-emerald-50">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                        <Rocket className="h-5 w-5 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-slate-900 mb-2">Deploy Configuration</h3>
                        <p className="text-sm text-slate-600 mb-4">
                          Apply this configuration to your target device. The deployment will be monitored in real-time.
                        </p>

                        <button
                          onClick={handleApply}
                          disabled={isBusy}
                          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-3 text-sm font-medium text-white shadow-lg hover:from-green-700 hover:to-emerald-700 disabled:pointer-events-none disabled:opacity-50 transition-all duration-200"
                        >
                          {templateApplicationState.isRunning ? (
                            <PulseLoader color="currentColor" size={8} />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          Apply to Device
                        </button>

                        {/* Prerequisites Check */}
                        {capabilities.deviceAuth && (!parameters.hostname || !parameters.username || !parameters.password) && (
                          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
                              <span className="text-sm text-yellow-800">
                                Device connection details required before deployment
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {/* Deploy Tab Content */}
          <TabsContent value={TAB_CONFIG.deploy.id} className="p-6 space-y-6">
            {renderTabHeader(Rocket, "Deploy Configuration", "Apply configuration to target device")}

            <div className="space-y-6">
              {/* Deploy Button */}
              <div className="flex gap-4">
                <button
                  onClick={handleApply}
                  disabled={isBusy || !generatedConfig}
                  className="inline-flex items-center gap-2 rounded-md bg-green-600 px-6 py-3 text-sm font-medium text-white shadow hover:bg-green-700 disabled:pointer-events-none disabled:opacity-50"
                >
                  {templateApplicationState.isRunning ? (
                    <PulseLoader color="currentColor" size={8} />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Apply to Device
                </button>
              </div>

              {/* Prerequisites Check */}
              {!generatedConfig && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-800">
                      Configuration preview required before deployment
                    </span>
                  </div>
                </div>
              )}

              {/* Real-time Progress Display */}
              <RealTimeDisplay
                {...templateApplicationState}
                onReset={templateApplicationState.resetState}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default DeviceConfigurationRunner;
