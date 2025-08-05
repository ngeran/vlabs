// =============================================================================
// FILE:               src/components/runners/JsnapyRunner.jsx
//
// DESCRIPTION:
//   A React component for running JSNAPy scripts, modeled after the shadcn/ui
//   "sidebar-02" example. It features a collapsible sidebar for desktop and a
//   slide-in sheet for mobile, with a tabbed interface for configuration,
//   execution, and results display.
//
// OVERVIEW:
//   The component is designed to run JSNAPy scripts with a responsive layout
//   controlled by a parent CSS Grid. The sidebar collapses by clipping its
//   fixed-width content, ensuring a smooth transition. On mobile, a sheet
//   provides access to script options. The main content area uses shadcn/ui Tabs
//   to manage configuration, execution, and results, integrating with WebSocket
//   for real-time updates and JsnapyApiService for backend interactions.
//
// KEY FEATURES:
//   - Responsive parent-driven CSS Grid layout for sidebar and main content.
//   - Collapsible desktop sidebar with smooth overflow clipping.
//   - Mobile-friendly slide-in Sheet for script options.
//   - Tabbed interface (Config, Execute, Results) using shadcn/ui Tabs.
//   - Real-time execution feedback via WebSocket integration.
//   - Validation for configuration parameters before execution.
//   - Results display with toggleable table view and save functionality.
//   - Integration with useJsnapyWorkflow and JsnapyApiService.
//
// DEPENDENCIES:
//   - react: Core library for component rendering and state management.
//   - lucide-react: Icon library for UI elements.
//   - shadcn/ui: Tabs, Button, Sheet components for UI structure.
//   - useJsnapyWorkflow: Custom hook for managing JSNAPy execution state.
//   - useWebSocket: Custom hook for WebSocket connectivity.
//   - JsnapyApiService: Service for API interactions with JSNAPy backend.
//   - Custom UI components: JSNAPyForm, ScriptOptionsRenderer, RealTimeDisplay, UniversalTableViewer.
//   - cn: Utility function from shadcn/ui for conditional class names.
//
// HOW TO USE:
//   Render the component within a parent that provides script and parameter data:
//   ```jsx
//   <JsnapyRunner script={script} parameters={parameters} onParamChange={setParameters} />
//   ```
//   - `script`: Object containing script details (e.g., id, displayName).
//   - `parameters`: Object with JSNAPy configuration (username, password, hostname, tests, etc.).
//   - `onParamChange`: Callback to update parameters in the parent component.
//   Ensure WebSocket context and JsnapyApiService are properly configured in the app.
// =============================================================================

// =============================================================================
// SECTION 1: IMPORTS
// =============================================================================
// Importing React and necessary hooks for state and side-effect management
import React, { memo, useState, useEffect } from "react";
// Importing Lucide icons for UI elements
import {
  PlayCircle, Layers, Save, Table2, Menu, Wifi, WifiOff,
  CheckCircle2, XCircle, Clock, Cog, CheckSquare, XSquare,
  PanelLeftClose, PanelLeftOpen
} from "lucide-react";
// Importing custom hooks and services for JSNAPy functionality
import { useJsnapyWorkflow } from "../../hooks/useJsnapyWorkflow";
import { useWebSocket } from "../../hooks/useWebSocket";
import JsnapyApiService from "../../services/JsnapyApiService.js";
// Importing custom UI components
import JSNAPyForm from "../forms/JSNAPyForm";
import ScriptOptionsRenderer from "../ScriptOptionsRenderer";
import RealTimeDisplay from "../RealTimeProgress";
import UniversalTableViewer from "../shared/UniversalTableViewer";
// Importing shadcn/ui components for UI structure
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
// Importing utility for conditional class names
import { cn } from "@/lib/utils";

// =============================================================================
// SECTION 2: SIDEBAR COMPONENT (FOR DESKTOP)
// =============================================================================
// Collapsible sidebar for desktop view, controlled by parent grid layout.
// Uses fixed-width content with overflow clipping to achieve smooth collapse.
const Sidebar = ({ script, parameters, onParamChange, isOpen }) => {
  // Common props for ScriptOptionsRenderer to avoid duplication
  const commonOptionsProps = {
    script,
    parameters,
    onParamChange,
    selectAllButtonProps: {
      variant: "outline",
      className: "w-full font-semibold",
      Icon: CheckSquare,
      iconProps: { className: cn("h-4 w-4", isOpen && "mr-2") },
      children: isOpen ? "Select All" : null
    },
    clearAllButtonProps: {
      variant: "outline",
      className: "w-full font-semibold",
      Icon: XSquare,
      iconProps: { className: cn("h-4 w-4", isOpen && "mr-2") },
      children: isOpen ? "Clear All" : null
    }
  };

  return (
    // Sidebar container with full height and border, hidden on mobile
    <div className="hidden md:flex flex-col h-full bg-gray-50 border-r">
      {/* Sidebar header with icon and title */}
      <div className="flex items-center h-16 border-b px-4">
        <Layers className="h-6 w-6 text-gray-700 flex-shrink-0" />
        <div
          className={cn(
            "transition-all duration-300 ease-in-out overflow-hidden",
            isOpen ? "w-48 ml-2" : "w-0"
          )}
        >
          <h2 className="text-xl font-bold tracking-tight whitespace-nowrap">
            Script Options
          </h2>
        </div>
      </div>

      {/* Content area with full height, using overflow clipping for collapse */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Fixed-width wrapper to ensure content doesn't shrink during collapse */}
        <div className="w-[250px] p-4 space-y-4">
          <ScriptOptionsRenderer {...commonOptionsProps} />
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// SECTION 3: MAIN COMPONENT
// =============================================================================
// Main JsnapyRunner component managing the entire UI and logic
function JsnapyRunner({ script, parameters, onParamChange }) {
  // =============================================================================
  // SUBSECTION 3.1: STATE MANAGEMENT
  // =============================================================================
  // WebSocket context for real-time communication
  const wsContext = useWebSocket();
  // Workflow hook for managing JSNAPy execution state
  const { executionState, runJsnapyScript, resetExecution } = useJsnapyWorkflow(wsContext);
  // State for controlling results table visibility
  const [showResultsTable, setShowResultsTable] = useState(false);
  // State for managing active tab (config, execute, results)
  const [activeTab, setActiveTab] = useState("config");
  // State for controlling sidebar open/closed state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // =============================================================================
  // SUBSECTION 3.2: VALIDATION AND STATUS HELPERS
  // =============================================================================
  // Validates configuration parameters before execution
  const validateConfiguration = () => {
    if (!wsContext?.isConnected) return { isValid: false, reason: "WebSocket is not connected." };
    if (!parameters.username || !parameters.password) return { isValid: false, reason: "Username and password are required." };
    if (!parameters.hostname && !parameters.inventory_file) return { isValid: false, reason: "A target host or inventory file is required." };
    if (!parameters.tests || parameters.tests.length === 0) return { isValid: false, reason: "At least one JSNAPy test must be selected." };
    return { isValid: true, reason: "" };
  };

  // Returns appropriate status icon based on execution state
  const getStatusIcon = () => {
    if (executionState.isRunning) return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
    if (executionState.hasError) return <XCircle className="h-4 w-4 text-red-500" />;
    if (executionState.isComplete) return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    return null;
  };

  // =============================================================================
  // SUBSECTION 3.3: EVENT HANDLERS
  // =============================================================================
  // Handles script execution with validation
  const handleRun = async (event) => {
    event.preventDefault();
    const validation = validateConfiguration();
    if (!validation.isValid) {
      alert(validation.reason);
      return;
    }
    resetExecution();
    setShowResultsTable(false);
    setActiveTab("execute");
    try {
      await runJsnapyScript(parameters);
    } catch (error) {
      console.error("[JsnapyRunner] Failed to initiate JSNAPy script:", error);
      alert(`Error starting script: ${error.message}`);
    }
  };

  // Handles saving execution results to the backend
  const handleSave = async () => {
    if (!executionState.result) {
      alert("No results to save.");
      return;
    }
    try {
      await JsnapyApiService.saveResults(script.id, executionState.result);
      alert("Results saved successfully!");
    } catch (error) {
      console.error("[JsnapyRunner] Failed to save results:", error);
      alert(`Error saving results: ${error.message}`);
    }
  };

  // Toggles visibility of results table
  const handleViewResults = () => setShowResultsTable(prev => !prev);

  // Effect to switch to results tab when execution completes successfully
  useEffect(() => {
    if (executionState.isComplete && !executionState.hasError) {
      setActiveTab("results");
      setShowResultsTable(true);
    }
  }, [executionState.isComplete, executionState.hasError]);

  // =============================================================================
  // SUBSECTION 3.4: RENDER METHODS FOR TABS
  // =============================================================================
  // Renders the configuration tab with form and validation feedback
  const renderConfigTab = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-gray-800">
          Target & Authentication
        </h3>
        <p className="text-sm text-gray-600">
          Configure target devices and authentication credentials for JSNAPy execution.
        </p>
      </div>
      <JSNAPyForm parameters={parameters} onParamChange={onParamChange} />
      {!validation.isValid && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            <strong>Configuration Issue:</strong> {validation.reason}
          </p>
        </div>
      )}
    </div>
  );

  // Renders the execution tab with real-time progress or ready state
  const renderExecuteTab = () => (
    <div className="space-y-6">
      {executionState.isRunning || executionState.isComplete ? (
        <RealTimeDisplay
          isRunning={executionState.isRunning}
          isComplete={executionState.isComplete}
          hasError={executionState.hasError}
          progress={executionState.progress}
          result={executionState.result?.data}
          error={executionState.error}
          onReset={resetExecution}
          currentStep={executionState.latestMessage?.message}
          totalSteps={executionState.totalSteps}
          completedSteps={executionState.completedSteps}
          progressPercentage={executionState.progressPercentage}
        />
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed">
          <PlayCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium">Ready to Execute</h3>
          <p className="text-gray-600">Click "Start Execution" in the header to begin.</p>
        </div>
      )}
    </div>
  );

  // Renders the results tab with table view or status messages
  const renderResultsTab = () => (
    <div className="space-y-6">
      {hasResults ? (
        <>
          <div className="flex flex-col sm:flex-row gap-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-green-800">Execution Completed</h3>
              <p className="text-sm text-green-700">Save the results or view them in the table below.</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} variant="outline">
                <Save className="h-4 w-4 mr-2" />Save
              </Button>
              <Button onClick={handleViewResults}>
                <Table2 className="h-4 w-4 mr-2" />{showResultsTable ? "Hide" : "View"} Table
              </Button>
            </div>
          </div>
          {showResultsTable && executionState.result?.results_by_host && (
            <div className="p-4 border rounded-lg space-y-6">
              {executionState.result.results_by_host.map((hostResult, hostIndex) => (
                <div key={`host-${hostIndex}`} className="space-y-4">
                  {hostResult.test_results?.map((testResult, testIndex) => (
                    <UniversalTableViewer key={`test-result-${hostIndex}-${testIndex}`} tableData={testResult} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      ) : executionState.hasError ? (
        <div className="text-center py-12 bg-red-50 border border-red-200 rounded-lg">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-900">Execution Failed</h3>
          <p className="text-red-700">{executionState.error || "An error occurred."}</p>
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed">
          <Table2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium">No Results Yet</h3>
          <p className="text-gray-600">Execute the script to see results here.</p>
        </div>
      )}
    </div>
  );

  // =============================================================================
  // SUBSECTION 3.5: COMPUTED VALUES
  // =============================================================================
  // Validate configuration for enabling/disabling run button
  const validation = validateConfiguration();
  // Disable run button if configuration is invalid or script is running
  const isRunDisabled = !validation.isValid || executionState.isRunning;
  // Check if there are valid results to display
  const hasResults = executionState.isComplete && !executionState.hasError;
  // Common props for sidebar and mobile sheet
  const commonOptionsProps = { script, parameters, onParamChange, isOpen: isSidebarOpen };

  // =============================================================================
  // SUBSECTION 3.6: RENDER LOGIC
  // =============================================================================
  return (
    // Main grid container controlling sidebar width
    <div
      className={cn(
        "grid min-h-screen w-full transition-[grid-template-columns] duration-300 ease-in-out",
        isSidebarOpen ? "md:grid-cols-[280px_1fr]" : "md:grid-cols-[64px_1fr]"
      )}
    >
      {/* Desktop Sidebar */}
      <Sidebar {...commonOptionsProps} isOpen={isSidebarOpen} />

      {/* Main Content Container */}
      <div className="flex flex-col h-full">
        {/* Header with controls and status */}
        <header className="flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 sticky top-0 z-10 bg-white">
          {/* Desktop Sidebar Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="hidden md:flex"
            aria-label="Toggle sidebar"
          >
            {isSidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
          </Button>

          {/* Mobile Sidebar Trigger */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0 md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex flex-col w-[280px]">
              <div className="flex items-center gap-2 border-b pb-4">
                <Layers className="h-6 w-6 text-gray-700" />
                <h2 className="text-xl font-bold tracking-tight text-gray-800">Script Options</h2>
              </div>
              <div className="flex-1 overflow-y-auto py-4">
                <ScriptOptionsRenderer script={script} parameters={parameters} onParamChange={onParamChange} isOpen={true} />
              </div>
            </SheetContent>
          </Sheet>

          {/* Script Title */}
          <div className="flex-1">
            <h1 className="font-semibold text-xl">{script.displayName}</h1>
          </div>

          {/* WebSocket Status Indicator */}
          <div className="flex items-center gap-2">
            {wsContext?.isConnected ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
          </div>

          {/* Run Button */}
          <Button onClick={handleRun} disabled={isRunDisabled}>
            <PlayCircle className="h-4 w-4 mr-2" />
            {executionState.isRunning ? "Running..." : "Start Execution"}
          </Button>
        </header>

        {/* Main Content Area with Tabs */}
        <main className="flex-1 flex flex-col gap-4 p-4 md:p-8 bg-gray-100">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="config">
                <Cog className="h-4 w-4 mr-2" /> Config
              </TabsTrigger>
              <TabsTrigger value="execute">
                <PlayCircle className="h-4 w-4 mr-2" /> Execute {getStatusIcon()}
              </TabsTrigger>
              <TabsTrigger value="results">
                <Table2 className="h-4 w-4 mr-2" /> Results {hasResults && <CheckCircle2 className="h-4 w-4 text-green-500 ml-2" />}
              </TabsTrigger>
            </TabsList>
            <div className="mt-6 bg-white p-6 rounded-lg border">
              <TabsContent value="config">{renderConfigTab()}</TabsContent>
              <TabsContent value="execute">{renderExecuteTab()}</TabsContent>
              <TabsContent value="results">{renderResultsTab()}</TabsContent>
            </div>
          </Tabs>
        </main>
      </div>
    </div>
  );
}

// =============================================================================
// SECTION 4: EXPORT
// =============================================================================
// Memoized component to prevent unnecessary re-renders
export default memo(JsnapyRunner);
