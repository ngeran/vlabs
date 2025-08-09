/**
 * @fileoverview Enhanced Device Configuration Runner
 * @description A comprehensive, two-panel workflow component for device configuration. It features a
 *              collapsible sidebar for template selection and a tabbed main content area. This version
 *              is fully integrated with the enhanced hook system (`useTemplateDiscovery`, etc.) to
 *              provide a highly resilient, performant, and user-friendly experience with robust validation
 *              and state management.
 *
 * @author nikos-geranios_vgi
 * @created 2025-08-08
 * @lastModified 2025-08-08 15:10:00 UTC
 *
 * @section KEY_FEATURES
 * - Resilient Data Fetching: Leverages hooks with built-in retry and caching for templates.
 * - Robust Front-End Validation: Provides real-time validation for device auth and template parameters before making API calls.
 * - Enhanced UI/UX: Debounced search, copy-to-clipboard, and more informative loading/error states.
 * - Superior State Management: Intelligently disables UI elements based on system state (`isSystemBusy`) and validation status.
 * - Maintainable & Configurable: Code is organized into logical sections with centralized constants for easy updates.
 * - Dynamic & Metadata-Driven: The entire UI adapts based on script capabilities defined in the metadata.
 *
 * @section HOW_TO_USE
 * 1. Ensure this component is placed within a context that provides `script`, `parameters`, `onParamChange`, and `wsContext` props.
 * 2. The `script` prop should contain the metadata (`capabilities`, `capabilityConfiguration`) that drives the UI.
 * 3. The `parameters` prop should be an object containing shared state, especially device auth details.
 * 4. The `onParamChange` function is used to lift state up from this component.
 * 5. The `wsContext` prop is required for real-time deployment updates.
 *
 * Example Usage (in a parent component):
 * `<DeviceConfigurationRunner
 *    script={currentScript}
 *    parameters={formState}
 *    onParamChange={handleParamChange}
 *    wsContext={webSocketContext}
 * />`
 */

// =============================================================================
// SECTION 1: IMPORTS & CONFIGURATION
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo, memo } from "react";
import toast from "react-hot-toast";
import PulseLoader from "react-spinners/PulseLoader";
import {
  Loader, AlertTriangle, ShieldCheck, BookOpen, Settings, Eye, Rocket,
  CheckCircle2, ChevronRight, PanelLeftClose, PanelRightClose, Search, X, Folder,
  FolderOpen, File as FileIcon, Code, RefreshCw, Copy, Zap
} from "lucide-react";

// shadcn/ui Components
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Enhanced Custom Hooks
import { useTemplateDiscovery, useTemplateDetail, useTemplateGeneration } from "../../hooks/useTemplateDiscovery";
import { useRealTimeUpdates } from "../../hooks/useRealTimeUpdates";

// Shared UI Components
import SingleDeviceAuth from "../shared/SingleDeviceAuth.jsx";
import UniversalTemplateForm from "../forms/UniversalTemplateForm.jsx";
import RealTimeDisplay from "../RealTimeProgress/RealTimeDisplay";

// =============================================================================
// SECTION 2: CONSTANTS & CONFIGURATION
// =============================================================================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

const TAB_CONFIG = {
  parameters: { id: "parameters", label: "Parameters", icon: Settings },
  preview: { id: "preview", label: "Preview", icon: Eye },
  deploy: { id: "deploy", label: "Deploy", icon: Rocket }
};

const UI_CONSTANTS = {
  SIDEBAR_WIDTH: 320,
  SEARCH_DEBOUNCE_MS: 300,
  SKELETON_COUNT: 8,
};

// =============================================================================
// SECTION 3: TEMPLATE SIDEBAR COMPONENT & HELPERS
// =============================================================================

/**
 * TreeItem: Renders a single node (folder or file) in the template tree.
 */
const TreeItem = memo(({ item, level = 0, selectedTemplateId, onTemplateSelect, searchTerm, isDisabled }) => {
    const [isExpanded, setIsExpanded] = useState(level === 0);
    const isFolder = item.type === 'folder';
    const isSelected = !isFolder && item.id === selectedTemplateId;
    const hasSearchMatch = searchTerm && item.name.toLowerCase().includes(searchTerm.toLowerCase());

    const handleSelect = () => {
        if (isFolder) setIsExpanded(!isExpanded);
        else onTemplateSelect(item.id);
    };

    return (
        <div>
            <div
                onClick={handleSelect}
                role="button"
                tabIndex={isDisabled ? -1 : 0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSelect()}
                aria-selected={isSelected}
                aria-disabled={isDisabled}
                className={`flex items-center space-x-2 py-2 px-3 rounded-md transition-all duration-150 group
                    ${isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/60'}
                    ${isSelected ? 'bg-blue-100 dark:bg-blue-900/30 font-semibold' : ''}
                    ${hasSearchMatch ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}`}
                style={{ paddingLeft: `${level * 1.25 + 0.5}rem` }}
            >
                {isFolder ? <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} /> : <FileIcon className="h-4 w-4 text-slate-500" />}
                <span className={`select-none truncate text-sm ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-800 dark:text-slate-200'}`}>
                    {item.name}
                </span>
                {/* The version badge has been removed as per the request */}
                {isSelected && <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />}
            </div>
            {isFolder && isExpanded && (
                <div className="relative pl-5 border-l border-slate-200 dark:border-slate-700 ml-[1.05rem]">
                    {item.children.map(child => (
                        <TreeItem key={child.id} item={child} level={level + 1} {...{ selectedTemplateId, onTemplateSelect, searchTerm, isDisabled }} />
                    ))}
                </div>
            )}
        </div>
    );
});
TreeItem.displayName = 'TreeItem';

/**
 * TemplateSidebar: The main sidebar component for browsing and selecting templates.
 */
const TemplateSidebar = memo(({ categorizedTemplates, loading, error, selectedTemplateId, onTemplateSelect, isCollapsed, isBusy, onRefresh }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearchTerm(searchTerm), UI_CONSTANTS.SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    const templateTree = useMemo(() => {
        if (!categorizedTemplates) return [];
        const term = debouncedSearchTerm.toLowerCase();
        return Object.entries(categorizedTemplates)
            .map(([category, templates]) => ({
                id: `category-${category}`, name: category, type: 'folder',
                children: templates
                    .filter(t => t.name.toLowerCase().includes(term))
                    .map(t => ({ ...t, type: 'file' }))
            }))
            .filter(folder => folder.children.length > 0);
    }, [categorizedTemplates, debouncedSearchTerm]);

    const renderContent = () => {
        if (loading) {
            return <div className="space-y-3 px-2">{Array.from({ length: UI_CONSTANTS.SKELETON_COUNT }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>;
        }
        if (error) {
            return <div className="p-4"><Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                    <p className="font-medium">Failed to load templates</p>
                    <p className="text-xs mt-1">{String(error)}</p>
                    <Button variant="outline" size="sm" onClick={onRefresh} className="mt-3"><RefreshCw className="h-3 w-3 mr-1" /> Retry</Button>
                </AlertDescription>
            </Alert></div>;
        }
        if (templateTree.length === 0) {
            return <div className="p-4 text-center text-slate-500"><Search className="mx-auto h-8 w-8 mb-2 opacity-50" /><p className="text-sm">{debouncedSearchTerm ? 'No templates match your search' : 'No templates found'}</p></div>;
        }
        return templateTree.map(item => <TreeItem key={item.id} item={item} {...{ selectedTemplateId, onTemplateSelect, searchTerm: debouncedSearchTerm, isBusy }} />);
    };

    return (
        <aside className={`relative bg-card border-r transition-all duration-300 flex flex-col ${isCollapsed ? 'w-0 p-0 border-none' : 'w-80 p-4'} ${isBusy ? 'pointer-events-none opacity-70' : ''}`}>
            <div className={`flex-shrink-0 transition-opacity ${isCollapsed ? 'opacity-0' : 'opacity-100'}`}>
                <div className="flex items-center gap-3 mb-4"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><BookOpen className="h-5 w-5 text-primary" /></div><div><h2 className="text-lg font-semibold">Templates</h2><p className="text-sm text-muted-foreground">Select a template</p></div></div>
                <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input placeholder="Search templates..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 h-9" />
                    {searchTerm && <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearchTerm('')}><X className="h-3 w-3" /></Button>}
                </div>
            </div>
            <div className={`flex-1 overflow-y-auto pr-1 transition-opacity ${isCollapsed ? 'opacity-0' : 'opacity-100'}`}>{renderContent()}</div>
        </aside>
    );
});
TemplateSidebar.displayName = 'TemplateSidebar';


// =============================================================================
// SECTION 4: MAIN COMPONENT DEFINITION
// =============================================================================

function DeviceConfigurationRunner({ script, parameters, onParamChange, wsContext }) {

  // =============================================================================
  // SECTION 5: STATE MANAGEMENT
  // =============================================================================
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [generatedConfig, setGeneratedConfig] = useState(null);
  const [generationError, setGenerationError] = useState(null);
  const [dynamicParameters, setDynamicParameters] = useState({});
  const [activeTab, setActiveTab] = useState(TAB_CONFIG.parameters.id);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [formValidation, setFormValidation] = useState({ isValid: true, errors: {} });

  // =============================================================================
  // SECTION 6: METADATA & CAPABILITY CONFIGURATION
  // =============================================================================
  const { capabilities, config } = useMemo(() => {
    const caps = {
      templateSelection: script?.capabilities?.templateSelection || false,
      templateGeneration: script?.capabilities?.templateGeneration || false,
      deviceAuth: script?.capabilities?.deviceAuth || false,
    };
    const cfg = {
      templateSource: script?.capabilityConfiguration?.templateSelection?.templateSource || "/api/templates/discover",
    };
    return { capabilities: caps, config: cfg };
  }, [script]);

  // =============================================================================
  // SECTION 7: CUSTOM HOOKS & ASYNC OPERATIONS
  // =============================================================================
  const { categorizedTemplates, loading: loadingTemplates, error: templatesError, refetch: refetchTemplates } = useTemplateDiscovery(config.templateSource);
  const { template, loading: loadingTemplateDetails, refetch: refetchTemplateDetails } = useTemplateDetail(selectedTemplateId);
  const { generateConfig, loading: isGenerating } = useTemplateGeneration();
  const templateApplicationState = useRealTimeUpdates(wsContext);

  // =============================================================================
  // SECTION 8: DERIVED STATE & VALIDATION LOGIC
  // =============================================================================
  const isBusy = useMemo(() => isGenerating || templateApplicationState.isRunning, [isGenerating, templateApplicationState.isRunning]);
  const isSystemBusy = useMemo(() => isBusy || loadingTemplates || loadingTemplateDetails, [isBusy, loadingTemplates, loadingTemplateDetails]);

  const isAuthValid = useMemo(() => {
      if (!capabilities.deviceAuth) return true;
      return !!(parameters.hostname && parameters.username && parameters.password);
  }, [capabilities.deviceAuth, parameters]);

  const isReadyToGenerate = useMemo(() => !isSystemBusy && isAuthValid && formValidation.isValid && !!selectedTemplateId, [isSystemBusy, isAuthValid, formValidation.isValid, selectedTemplateId]);
  const isReadyToApply = useMemo(() => !isSystemBusy && !!generatedConfig && isAuthValid, [isSystemBusy, generatedConfig, isAuthValid]);

  // =============================================================================
  // SECTION 9: EVENT HANDLERS & BUSINESS LOGIC
  // =============================================================================
  const handleTemplateChange = useCallback((templateId) => {
    if (isSystemBusy) return;
    setSelectedTemplateId(templateId);
    setGeneratedConfig(null);
    setGenerationError(null);
    setDynamicParameters({});
    templateApplicationState.resetState();
    // Auto-navigate to the first tab.
    setActiveTab(TAB_CONFIG.parameters.id);
  }, [isSystemBusy, templateApplicationState]);

  const handleParamChange = useCallback((name, value) => {
    setDynamicParameters(prev => ({ ...prev, [name]: value }));
    onParamChange(name, value);
  }, [onParamChange]);

  const handleGenerate = useCallback(async () => {
    if (!isReadyToGenerate) {
      toast.error("Please fill all required fields before generating.");
      return;
    }
    setGenerationError(null);
    const response = await generateConfig(selectedTemplateId, { ...parameters, ...dynamicParameters });
    if (response?.success && response.rendered_config) {
      setGeneratedConfig(response.rendered_config);
      toast.success("Configuration generated successfully!");
      setActiveTab(TAB_CONFIG.preview.id);
    } else {
      const errorMsg = response?.error || "Unknown error during generation.";
      setGenerationError(errorMsg);
      toast.error(`Generation failed: ${errorMsg}`);
    }
  }, [isReadyToGenerate, selectedTemplateId, parameters, dynamicParameters, generateConfig]);

  const handleApply = useCallback(async () => {
    if (!isReadyToApply) {
        toast.error("Please provide valid auth details and generate a config first.");
        return;
    }
    setActiveTab(TAB_CONFIG.deploy.id);
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
      if (!response.ok) throw new Error((await response.json()).message || 'Deployment failed');
      return await response.json();
    });
  }, [isReadyToApply, generatedConfig, parameters, wsContext, selectedTemplateId, templateApplicationState]);

  const handleCopyToClipboard = useCallback(() => {
    if (generatedConfig) {
        navigator.clipboard.writeText(generatedConfig)
            .then(() => toast.success("Configuration copied to clipboard!"))
            .catch(() => toast.error("Failed to copy configuration."));
    }
  }, [generatedConfig]);

  // =============================================================================
  // SECTION 10: RENDER LOGIC
  // =============================================================================
  return (
    <div className="flex h-full w-full bg-muted/40 rounded-lg border overflow-hidden">
      <TooltipProvider delayDuration={150}>
        {capabilities.templateSelection && (
          <TemplateSidebar {...{ categorizedTemplates, loading: loadingTemplates, error: templatesError, selectedTemplateId, onTemplateSelect: handleTemplateChange, isCollapsed: isSidebarCollapsed, isBusy: isSystemBusy, onRefresh: refetchTemplates }} />
        )}

        <main className="flex-1 flex flex-col min-w-0 relative">
          {capabilities.templateSelection && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="absolute left-4 top-4 h-9 w-9 z-20" onClick={() => setIsSidebarCollapsed(v => !v)}>
                  {/* THIS IS THE CORRECTED LINE */}
                  {isSidebarCollapsed ? <PanelRightClose className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {isSidebarCollapsed ? 'Show' : 'Hide'} Sidebar
              </TooltipContent>
            </Tooltip>
          )}

          <div className="flex-1 p-6 lg:p-8 lg:pl-20 overflow-y-auto">
            {!selectedTemplateId ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-card rounded-lg border-2 border-dashed"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 mb-6"><Code className="h-8 w-8 text-white" /></div><h2 className="text-2xl font-bold mb-2">Configuration Runner</h2><p className="text-muted-foreground mb-6 max-w-md">Please select a template from the sidebar to begin.</p><Button onClick={() => setIsSidebarCollapsed(false)}><PanelRightClose className="mr-2 h-4 w-4 -rotate-180" /> Select Template</Button></div>
            ) : (
              <div className="space-y-6">
                <header>
                  <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">{template?.name || 'Loading...'}{template?.version && <Badge variant="outline">v{template.version}</Badge>}</h1>
                  <p className="text-muted-foreground mt-1 max-w-xl">{template?.description || 'Loading template details...'}</p>
                </header>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    {Object.values(TAB_CONFIG).map(tab => <TabsTrigger key={tab.id} value={tab.id} disabled={isSystemBusy && activeTab !== tab.id}><tab.icon className="h-4 w-4 mr-2" />{tab.label}</TabsTrigger>)}
                  </TabsList>

                  {/* Parameters Tab */}
                  <TabsContent value={TAB_CONFIG.parameters.id} className="pt-6 space-y-6">
                    {loadingTemplateDetails ? <div className="text-center py-8"><Loader className="animate-spin mx-auto h-6 w-6 text-muted-foreground" /></div> : <>
                      {capabilities.deviceAuth && <SingleDeviceAuth parameters={parameters} onParamChange={onParamChange} disabled={isSystemBusy} />}
                      {template?.parameters?.length > 0 && <UniversalTemplateForm template={template} parameters={dynamicParameters} onParamChange={handleParamChange} disabled={isSystemBusy} onValidationChange={setFormValidation} />}
                      <div className="border-t pt-6 flex justify-end">
                        <Button onClick={handleGenerate} disabled={!isReadyToGenerate} size="lg">
                          {isGenerating ? <PulseLoader color="white" size={8} /> : <><Zap className="mr-2 h-4 w-4" />Generate Preview</>}
                        </Button>
                      </div>
                      {generationError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{generationError}</AlertDescription></Alert>}
                    </>}
                  </TabsContent>

                  {/* Preview Tab */}
                  <TabsContent value={TAB_CONFIG.preview.id} className="pt-6">
                    {!generatedConfig ? <div className="text-center py-12 border-2 border-dashed rounded-lg"><h3 className="font-medium">No Preview Available</h3><p className="text-sm text-muted-foreground">Generate a configuration in the Parameters tab first.</p></div> : <div className="space-y-6">
                      <div className="relative bg-slate-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-auto max-h-[60vh]">
                        <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7" onClick={handleCopyToClipboard}><Copy className="h-4 w-4" /></Button>
                        <pre><code>{generatedConfig}</code></pre>
                      </div>
                      <div className="border-t pt-6 flex justify-end">
                        <Button onClick={handleApply} disabled={!isReadyToApply} size="lg" className="bg-green-600 hover:bg-green-700">
                          {templateApplicationState.isRunning ? <PulseLoader color="white" size={8} /> : <><Rocket className="mr-2 h-4 w-4" />Apply to Device</>}
                        </Button>
                      </div>
                    </div>}
                  </TabsContent>

                  {/* Deploy Tab */}
                  <TabsContent value={TAB_CONFIG.deploy.id} className="pt-6">
                    <RealTimeDisplay {...templateApplicationState} onReset={templateApplicationState.resetState} />
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </main>
      </TooltipProvider>
    </div>
  );
}

export default memo(DeviceConfigurationRunner);
