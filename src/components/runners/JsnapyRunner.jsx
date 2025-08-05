// =============================================================================
// FILE:               src/components/runners/JsnapyRunner.jsx
//
// DESCRIPTION:
//   A space-efficient component for running the JSNAPy script, utilizing shadcn/ui
//   Tabs for organizing configuration, execution, and results, with a custom collapsible
//   sidebar on the left that collapses to icons. The sidebar is aligned with tabs,
//   shares the same height, and includes styled Select All/Clear All buttons with enhanced icons.
//
// OVERVIEW:
//   This component manages the JSNAPy Runner workflow using shadcn/ui Tabs to
//   separate concerns: Configuration (target and authentication), Execution (live
//   log), and Results (save/view functionality). It leverages the `useJsnapyWorkflow`
//   hook for execution state, `JsnapyApiService` for backend communication, and a
//   custom collapsible sidebar that collapses to icons with enhanced styling, aligns
//   with tabs, and sits below the header with a light gray gradient in the Config tab.
//
// KEY FEATURES:
//   - shadcn/ui Tabs with icons (Cog, PlayCircle, Table2) for Configuration, Execution, and Results views.
//   - Custom collapsible sidebar that collapses to icons (Layers, CheckSquare, XSquare) with enhanced styling (larger icons, hover effects, smooth transitions).
//   - Sidebar aligned vertically/horizontally with tabs, equal height, rounded corners.
//   - Sidebar positioned under the Script Runner header with styled Select All/Clear All buttons.
//   - Config tab uses light gray gradient background (from-gray-50 to-gray-100).
//   - Integrates `JSNAPyForm` for input and `ScriptOptionsRenderer` for options.
//   - Real-time progress display via `RealTimeDisplay` in the Execution tab.
//   - Structured results display with save/view functionality in the Results tab.
//   - Validates inputs and WebSocket connection for enabling the "Run" button.
//   - Auto-switches to Results tab upon successful execution completion.
//   - Saves results via `JsnapyApiService` and toggles table display with `UniversalTableViewer`.
//
// DEPENDENCIES:
//   - react, lucide-react, shadcn/ui (Tabs, Button, other components),
//   - useJsnapyWorkflow, useWebSocket, JsnapyApiService, and custom UI components.
//
// HOW TO USE:
//   Render within a parent managing script parameters:
//   ```jsx
//   <JsnapyRunner script={script} parameters={parameters} onParamChange={setParameters} />
//   ```
//   - Ensure shadcn/ui is installed and configured (Tabs, Button components).
//   - Provide a valid `script` object, `parameters` state, and `onParamChange` callback.
//   - The component assumes a WebSocket context via `useWebSocket` for real-time updates.
//   - Results are displayed in a table format after execution, with options to save or toggle visibility.
// =============================================================================

// =============================================================================
// SECTION 1: IMPORTS
// Importing necessary dependencies for React, shadcn/ui, hooks, and custom components.
// =============================================================================
import React, { memo, useState, useRef, useEffect } from "react";
import { PlayCircle, Layers, Save, Table2, Menu, X, Wifi, WifiOff, CheckCircle2, XCircle, Clock, Cog, CheckSquare, XSquare } from "lucide-react";
import { useJsnapyWorkflow } from "../../hooks/useJsnapyWorkflow";
import { useWebSocket } from "../../hooks/useWebSocket";
import JsnapyApiService from "../../services/JsnapyApiService.js";
import JSNAPyForm from "../forms/JSNAPyForm";
import ScriptOptionsRenderer from "../ScriptOptionsRenderer";
import RealTimeDisplay from "../RealTimeProgress";
import UniversalTableViewer from "../shared/UniversalTableViewer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// =============================================================================
// SECTION 2: SIDEBAR COMPONENT
// Custom collapsible sidebar for script options, collapses to icons with enhanced styling.
// =============================================================================
/**
 * Collapsible Sidebar for rendering script options, collapses to icons.
 * @param {Object} props - Component props.
 * @param {Object} props.script - Script metadata.
 * @param {Object} props.parameters - Current script parameters.
 * @param {Function} props.onParamChange - Callback to update parameters.
 * @param {boolean} props.isOpen - Sidebar open state.
 * @param {Function} props.setIsOpen - Setter for sidebar open state.
 * @param {Object} props.tabsRef - Ref to the tabs container for height synchronization.
 */
const Sidebar = ({ script, parameters, onParamChange, isOpen, setIsOpen, tabsRef }) => {
  const sidebarRef = useRef(null);

  // Synchronize sidebar height with tabs container
  useEffect(() => {
    const updateHeight = () => {
      if (tabsRef.current && sidebarRef.current) {
        const tabsHeight = tabsRef.current.getBoundingClientRect().height;
        sidebarRef.current.style.height = `${tabsHeight}px`;
      }
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, [tabsRef]);

  return (
    <div
      ref={sidebarRef}
      className={cn(
        "fixed md:static inset-y-0 left-0 z-10 bg-white shadow-md transform transition-all duration-300 ease-in-out rounded-lg md:rounded-l-lg md:mt-6",
        isOpen ? "w-72" : "w-16"
      )}
    >
      <div className="h-full overflow-y-auto">
        <div className="p-4 space-y-4">
          <div className={cn(
            "flex items-center border-b border-gray-200 pb-3",
            isOpen ? "justify-between" : "justify-center"
          )}>
            <div className="flex items-center space-x-2">
              <Layers
                size={isOpen ? 18 : 24}
                className={cn(
                  "text-gray-500 transition-transform duration-300",
                  !isOpen && "hover:scale-110 hover:text-gray-700"
                )}
              />
              {isOpen && <span className="text-lg font-semibold text-gray-800">Script Options</span>}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(!isOpen)}
              className={cn(
                "transition-transform duration-300",
                !isOpen && "hover:bg-gray-200 hover:shadow-sm hover:scale-110"
              )}
              title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {isOpen ? (
                <X size={18} className="text-gray-500" />
              ) : (
                <Menu size={24} className="text-gray-500" />
              )}
            </Button>
          </div>
          <div className="space-y-2">
            <ScriptOptionsRenderer
              script={script}
              parameters={parameters}
              onParamChange={onParamChange}
              selectAllButtonProps={{
                variant: "outline",
                className: cn(
                  "w-full font-semibold hover:bg-gray-200 hover:shadow-sm transition-all duration-300",
                  !isOpen && "justify-center hover:scale-110"
                ),
                Icon: CheckSquare,
                iconProps: { className: cn("h-4 w-4", !isOpen && "h-6 w-6", isOpen && "mr-2") },
                children: isOpen ? "Select All" : null
              }}
              clearAllButtonProps={{
                variant: "outline",
                className: cn(
                  "w-full font-semibold hover:bg-gray-200 hover:shadow-sm transition-all duration-300",
                  !isOpen && "justify-center hover:scale-110"
                ),
                Icon: XSquare,
                iconProps: { className: cn("h-4 w-4", !isOpen && "h-6 w-6", isOpen && "mr-2") },
                children: isOpen ? "Clear All" : null
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// SECTION 3: MAIN COMPONENT
// Main JsnapyRunner component with tabbed interface and sidebar.
// =============================================================================
/**
 * Component for running the JSNAPy script with a tabbed interface and collapsible sidebar.
 * @param {Object} props - Component props.
 * @param {Object} props.script - Script metadata.
 * @param {Object} props.parameters - Current script parameters.
 * @param {Function} props.onParamChange - Callback to update parameters.
 */
function JsnapyRunner({ script, parameters, onParamChange }) {
  // =============================================================================
  // SECTION 3.1: STATE MANAGEMENT
  // Managing execution state, results visibility, and sidebar state.
  // =============================================================================
  const wsContext = useWebSocket();
  const { executionState, runJsnapyScript, resetExecution } = useJsnapyWorkflow(wsContext);
  const [showResultsTable, setShowResultsTable] = useState(false);
  const [activeTab, setActiveTab] = useState("config");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const tabsRef = useRef(null);

  // =============================================================================
  // SECTION 3.2: VALIDATION AND STATUS HELPERS
  // Helper functions for validation and status icon display.
  // =============================================================================
  /**
   * Validates current parameters and WebSocket connection.
   * @returns {Object} Validation result with isValid flag and reason.
   */
  const validateConfiguration = () => {
    if (!wsContext?.isConnected) {
      return { isValid: false, reason: "WebSocket is not connected." };
    }
    if (!parameters.username || !parameters.password) {
      return { isValid: false, reason: "Username and password are required." };
    }
    if (!parameters.hostname && !parameters.inventory_file) {
      return { isValid: false, reason: "A target host or inventory file is required." };
    }
    if (!parameters.tests || parameters.tests.length === 0) {
      return { isValid: false, reason: "At least one JSNAPy test must be selected." };
    }
    return { isValid: true, reason: "" };
  };

  /**
   * Gets the appropriate status icon based on execution state.
   * @returns {JSX.Element} Status icon component.
   */
  const getStatusIcon = () => {
    if (executionState.isRunning) {
      return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
    }
    if (executionState.hasError) {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    if (executionState.isComplete) {
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    }
    return null;
  };

  // =============================================================================
  // SECTION 3.3: EVENT HANDLERS
  // Functions for handling user interactions (run, save, view, toggle sidebar).
  // =============================================================================
  /**
   * Handles script execution initiation.
   * Validates configuration, resets state, and starts execution.
   * @param {Event} event - The triggering click event.
   */
  const handleRun = async (event) => {
    if (event) event.preventDefault();
    const validation = validateConfiguration();
    if (!validation.isValid) {
      alert(validation.reason);
      return;
    }
    resetExecution();
    setShowResultsTable(false);
    setActiveTab("execute");
    console.log("[JsnapyRunner] Starting script execution with parameters:", parameters);
    try {
      await runJsnapyScript(parameters);
    } catch (error) {
      console.error("[JsnapyRunner] Failed to initiate JSNAPy script:", error);
      alert(`Error starting script: ${error.message}`);
    }
  };

  /**
   * Handles saving execution results to backend.
   */
  const handleSave = async () => {
    if (!executionState.result) {
      alert("No results to save.");
      return;
    }
    console.log("[JsnapyRunner] Saving results:", executionState.result);
    try {
      await JsnapyApiService.saveResults(script.id, executionState.result);
      alert("Results saved successfully!");
    } catch (error) {
      console.error("[JsnapyRunner] Failed to save results:", error);
      alert(`Error saving results: ${error.message}`);
    }
  };

  /**
   * Toggles the visibility of structured results table.
   */
  const handleViewResults = () => {
    setShowResultsTable((prev) => !prev);
  };

  /**
   * Handles tab switching and auto-switches to results tab on completion.
   * @param {string} newTab - The selected tab.
   */
  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    if (executionState.isComplete && !executionState.hasError && newTab !== "results") {
      setTimeout(() => setActiveTab("results"), 1000);
    }
  };

  // =============================================================================
  // SECTION 3.4: RENDER METHODS
  // Methods for rendering individual tab contents.
  // =============================================================================
  /**
   * Renders the configuration tab content.
   */
  const renderConfigTab = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Target Configuration & Device Authentication
        </h3>
        <p className="text-sm text-gray-600 mb-6">
          Configure your target devices and authentication credentials for JSNAPy script execution.
        </p>
        <JSNAPyForm parameters={parameters} onParamChange={onParamChange} />
      </div>
      <div className="flex items-center justify-between p-4 bg-white border rounded-lg">
        <div className="flex items-center space-x-2">
          {wsContext?.isConnected ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-500" />
          )}
          <span className="text-sm font-medium">
            WebSocket: {wsContext?.isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <Button
          onClick={handleRun}
          disabled={isRunDisabled}
          className="px-6"
        >
          <PlayCircle className="h-4 w-4 mr-2" />
          {executionState.isRunning ? "Running..." : "Start Execution"}
        </Button>
      </div>
      {!validation.isValid && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            <strong>Configuration Issue:</strong> {validation.reason}
          </p>
        </div>
      )}
    </div>
  );

  /**
   * Renders the execution tab content.
   */
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
          isActive={executionState.isRunning || executionState.isComplete}
          canReset={true}
          compact={false}
        />
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <PlayCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Ready to Execute</h3>
          <p className="text-gray-600 mb-6">
            Configure your parameters in the Config tab, then click "Start Execution" to begin.
          </p>
          <Button
            onClick={handleRun}
            disabled={isRunDisabled}
            size="lg"
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            Start Execution
          </Button>
        </div>
      )}
    </div>
  );

  /**
   * Renders the results tab content.
   */
  const renderResultsTab = () => (
    <div className="space-y-6">
      {hasResults ? (
        <>
          <div className="flex flex-col sm:flex-row gap-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-green-800 mb-1">
                Execution Completed Successfully
              </h3>
              <p className="text-sm text-green-700">
                Your JSNAPy script has finished executing. You can now save the results or view them in a structured table.
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} variant="outline">
                <Save className="h-4 w-4 mr-2" />
                Save Results
              </Button>
              <Button onClick={handleViewResults}>
                <Table2 className="h-4 w-4 mr-2" />
                {showResultsTable ? "Hide Table" : "View Table"}
              </Button>
            </div>
          </div>
          {showResultsTable && executionState.result?.results_by_host && (
            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="p-4 bg-gray-50 border-b">
                <h3 className="text-lg font-semibold text-gray-800">Test Results</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Structured view of JSNAPy test results organized by host
                </p>
              </div>
              <div className="p-4 space-y-6">
                {executionState.result.results_by_host.map((hostResult, hostIndex) => (
                  <div key={`host-${hostIndex}`} className="space-y-4">
                    {hostResult.test_results?.map((testResult, testIndex) => (
                      <UniversalTableViewer
                        key={`test-result-${hostIndex}-${testIndex}`}
                        tableData={testResult}
                        className="border border-gray-200 rounded-lg"
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : executionState.hasError ? (
        <div className="text-center py-12 bg-red-50 rounded-lg border border-red-200">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-900 mb-2">Execution Failed</h3>
          <p className="text-red-700 mb-6">
            {executionState.error || "An error occurred during script execution."}
          </p>
          <Button onClick={resetExecution} variant="outline">
            Reset and Try Again
          </Button>
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <Table2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Yet</h3>
          <p className="text-gray-600">
            Execute your JSNAPy script to see results here. Results will include structured test data and analysis.
          </p>
        </div>
      )}
    </div>
  );

  // =============================================================================
  // SECTION 3.5: COMPUTED VALUES
  // Computed values for validation and result status.
  // =============================================================================
  const validation = validateConfiguration();
  const isRunDisabled = !validation.isValid || executionState.isRunning;
  const hasResults = executionState.isComplete && !executionState.hasError;

  // =============================================================================
  // SECTION 3.6: RENDER LOGIC
  // Rendering the header, sidebar, and tabbed interface.
  // =============================================================================
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header Section */}
      <header className="bg-white border-b p-6 sticky top-0 z-20">
        <div className="flex items-center space-x-3">
          <h1 className="text-2xl font-bold text-gray-900">{script.displayName}</h1>
          {getStatusIcon()}
        </div>
        <p className="text-gray-600 mt-1">{script.description}</p>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-col md:flex-row gap-4 relative">
        {/* Sidebar Toggle Button for Mobile */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="md:hidden fixed top-20 left-4 z-30 hover:bg-gray-200 hover:shadow-sm transition-all duration-300"
          title="Toggle sidebar"
        >
          <Menu size={24} className="text-gray-500" />
        </Button>

        {/* Collapsible Sidebar */}
        <Sidebar
          script={script}
          parameters={parameters}
          onParamChange={onParamChange}
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
          tabsRef={tabsRef}
        />

        {/* Tabs Section */}
        <main className="flex-1 p-4 md:p-6">
          <div ref={tabsRef} className="bg-white border rounded-lg overflow-hidden">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-gray-50 p-1 m-0 rounded-none border-b">
                <TabsTrigger
                  value="config"
                  className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <div className="flex items-center space-x-2">
                    <Cog className="h-3 w-3" />
                    <span>Config</span>
                  </div>
                </TabsTrigger>
                <TabsTrigger
                  value="execute"
                  className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <div className="flex items-center space-x-2">
                    <PlayCircle className="h-3 w-3" />
                    <span>Execute</span>
                    {executionState.isRunning && (
                      <Clock className="h-3 w-3 text-blue-500 animate-spin" />
                    )}
                  </div>
                </TabsTrigger>
                <TabsTrigger
                  value="results"
                  className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <div className="flex items-center space-x-2">
                    <Table2 className="h-3 w-3" />
                    <span>Results</span>
                    {hasResults && (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    )}
                  </div>
                </TabsTrigger>
              </TabsList>
              <div className="p-6">
                <TabsContent value="config" className="mt-0">
                  {renderConfigTab()}
                </TabsContent>
                <TabsContent value="execute" className="mt-0">
                  {renderExecuteTab()}
                </TabsContent>
                <TabsContent value="results" className="mt-0">
                  {renderResultsTab()}
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}

// =============================================================================
// SECTION 4: EXPORT
// Exporting the memoized component to prevent unnecessary re-renders.
// =============================================================================
export default memo(JsnapyRunner);
