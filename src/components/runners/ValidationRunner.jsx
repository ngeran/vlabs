/**
 * =============================================================================
 * FILE:               src/components/runners/ValidationRunner.jsx
 *
 * DESCRIPTION:
 *   A sophisticated React component for discovering, configuring, and running
 *   JSNAPy validation tests. It features a modern, responsive two-panel layout
 *   for an intuitive user experience.
 *
 * OVERVIEW:
 *   This component serves as the primary interface for the JSNAPy validation tool.
 *   It uses a collapsible sidebar for test selection and a tabbed main content
 *   area for configuration, execution progress, and results display. The component
 *   is powered by the `useValidationWorkflow` hook, which abstracts away all the
 *   complex state management and backend communication.
 *
 * KEY FEATURES:
 *   - Slick, Responsive UI: Two-panel layout with a collapsible sidebar.
 *   - Dynamic Test Discovery: Automatically populates with JSNAPy tests.
 *   - Tabbed Workflow: A clear three-step process (Configure, Execute, Results).
 *   - Real-Time Execution Feedback: Integrates with WebSockets for live updates.
 *   - Snapshot and Compare: Buttons for Pre-Change Snapshot and Post-Change Compare functionality.
 *
 * CRITICAL FIX IMPLEMENTED:
 *   - A significant bug was fixed where the application would crash and refresh
 *     upon the successful completion of a test.
 *   - ROOT CAUSE: The `RealTimeDisplay` component (on the "Execute" tab) was
 *     receiving the final, complex JSNAPy result object, which it was not
 *     designed to render, causing a fatal JavaScript error.
 *   - SOLUTION: We now explicitly pass `result={null}` to the `RealTimeDisplay`
 *     component. This isolates responsibilities: `RealTimeDisplay` only handles
 *     progress streams, while the `ValidationResultsViewer` component on the
 *     "Results" tab is solely responsible for rendering the final, complex result.
 * =============================================================================
 */

// =============================================================================
// SECTION 1: IMPORTS
// =============================================================================
import React, { memo, useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";

// --- Icons and UI Components ---
// Imports from the 'lucide-react' library for icons and from a custom UI library
// (e.g., shadcn/ui) for pre-built components like Buttons, Tabs, etc.
import {
  PlayCircle, Save, Table2, Menu, Wifi, WifiOff,
  CheckCircle2, XCircle, Clock, Cog, CheckSquare, XSquare,
  PanelLeftClose, PanelRightClose, Shield, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils"; // A utility for conditionally joining class names.

// --- Custom Hooks, Services, and Components ---
import { useValidationWorkflow } from "../../hooks/useValidationWorkflow";
import { useWebSocket } from "../../hooks/useWebSocket";
import ValidationApiService from "../../services/ValidationApiService";
import DeviceTargetSelector from "../shared/DeviceTargetSelector";
import DeviceAuthFields from "../shared/DeviceAuthFields";
import RealTimeDisplay from "../RealTimeProgress";
import BulletproofValidationResultsViewer from "../shared/ValidationResultsViewer";

// =============================================================================
// SECTION 2: SIDEBAR COMPONENT (FOR VALIDATION TEST SELECTION)
//
// DESCRIPTION:
//   A memoized component that displays the list of discoverable JSNAPy tests.
//   It handles its own display logic, including loading skeletons and error states,
//   and communicates selections back to the parent `ValidationRunner` component.
// =============================================================================
const ValidationSidebar = memo(({
  categorizedTests,
  isDiscovering,
  discoveryError,
  selectedTests,
  onSelectionChange,
  isCollapsed
}) => {
  // --- Memoized Handlers for global selection ---
  const handleSelectAllGlobal = useCallback(() => {
    // Flattens all tests from all categories into a single array of IDs.
    const allTestIds = Object.values(categorizedTests).flat().map(test => test.id);
    onSelectionChange('validation_tests', allTestIds);
  }, [categorizedTests, onSelectionChange]);

  const handleClearAllGlobal = useCallback(() => {
    onSelectionChange('validation_tests', []);
  }, [onSelectionChange]);

  // --- Renders the main content of the sidebar based on discovery state ---
  const renderCategorizedList = () => {
    // Show a loading state while tests are being discovered.
    if (isDiscovering) {
      return <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>;
    }
    // Show an error message if the discovery process failed.
    if (discoveryError) {
      return (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load tests: {discoveryError}</AlertDescription>
        </Alert>
      );
    }
    const testCategories = Object.entries(categorizedTests);
    // Show a message if no tests were found.
    if (testCategories.length === 0) {
      return <p className="text-sm text-center text-gray-500">No validation tests available.</p>;
    }
    // Render the categorized list of tests.
    return (
      <div className="space-y-2">
        {testCategories.map(([category, tests]) => (
          <Collapsible key={category} defaultOpen className="space-y-2 border-b last:border-b-0 py-2">
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2 hover:bg-gray-100 rounded-md px-2 -mx-2">
              <h3 className="font-semibold text-md">{category}</h3>
              <ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pl-2 pt-2">
              {tests.map((test) => (
                <div key={test.id} className="flex items-center space-x-3">
                  <Checkbox
                    id={test.id}
                    checked={selectedTests.includes(test.id)}
                    onCheckedChange={(checked) => {
                      const newSelection = checked
                        ? [...selectedTests, test.id]
                        : selectedTests.filter((id) => id !== test.id);
                      onSelectionChange('validation_tests', newSelection);
                    }}
                  />
                  <Label htmlFor={test.id} className="font-normal text-sm cursor-pointer">
                    <div>
                      <div className="font-medium">{test.title}</div>
                      <div className="text-xs text-gray-500">{test.description}</div>
                    </div>
                  </Label>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    );
  };

  return (
    <aside className={cn("relative bg-card border-r transition-all duration-300 flex flex-col", isCollapsed ? 'w-0 p-0 border-none' : 'w-[320px]')}>
      <div className={cn("flex flex-col h-full transition-opacity duration-200", isCollapsed ? "opacity-0" : "opacity-100")}>
        <div className="flex items-center h-16 border-b px-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100"><Shield className="h-5 w-5 text-blue-600" /></div>
            <div><h2 className="text-lg font-semibold">JSNAPy Tests</h2><p className="text-sm text-muted-foreground">Select validation tests</p></div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{renderCategorizedList()}</div>
        <div className="p-4 border-t shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={handleSelectAllGlobal}><CheckSquare className="h-4 w-4 mr-2"/> Select All</Button>
            <Button variant="outline" size="sm" onClick={handleClearAllGlobal}><XSquare className="h-4 w-4 mr-2"/> Clear All</Button>
          </div>
        </div>
      </div>
    </aside>
  );
});

// =============================================================================
// SECTION 3: MAIN COMPONENT DEFINITION
// =============================================================================
/**
 * The main runner component for JSNAPy validations.
 * @param {object} props - The component props.
 * @param {object} props.script - The script metadata object.
 * @param {object} props.parameters - The current state of script parameters.
 * @param {function} props.onParamChange - Callback to update parameters in the parent state.
 */
function ValidationRunner({ script, parameters, onParamChange }) {
  // --- Hooks ---
  const wsContext = useWebSocket(); // Hook for WebSocket connectivity.
  // The main workflow hook that manages all state and logic for the validation run.
  const { executionState, runValidationScript, resetExecution, categorizedTests, isDiscovering, discoveryError } = useValidationWorkflow(wsContext, script?.id);

  // --- Local UI State ---
  const [activeTab, setActiveTab] = useState("config");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // =======================================================================
  // DEBUGGING HOOK
  // This hook logs the entire execution state to the browser console
  // every time it changes. This is an invaluable tool for debugging, as it
  // allows us to see the exact state of the application right before a
  // potential crash or unexpected behavior.
  // =======================================================================
  useEffect(() => {
    // We use a deep copy to ensure the logged object is a snapshot in time.
    console.log("EXECUTION STATE CHANGED:", JSON.parse(JSON.stringify(executionState)));
  }, [executionState]);

  // --- Derived State & Validation ---
  // A function to check if all necessary parameters are provided before running a test.
  const validateConfiguration = () => {
    if (!wsContext?.isConnected) return { isValid: false, reason: "WebSocket is not connected." };
    if (!parameters.username || !parameters.password) return { isValid: false, reason: "Username and password are required." };
    if (!parameters.hostname) return { isValid: false, reason: "A target hostname is required." };
    if (!parameters.validation_tests || parameters.validation_tests.length === 0) return { isValid: false, reason: "At least one validation test must be selected." };
    return { isValid: true, reason: "" };
  };

  const validation = validateConfiguration();
  // The "Run" button should be disabled if the configuration is invalid or if a test is already running.
  const isRunDisabled = !validation.isValid || executionState.isRunning;
  // A boolean flag to determine if there are valid results to display or save.
  const hasResults = executionState.isComplete && !executionState.hasError && executionState.result;

  // --- Event Handlers ---
  const handleRunCurrent = async (event) => {
    event.preventDefault();
    if (!validation.isValid) {
      toast.error(`Configuration Invalid: ${validation.reason}`);
      return;
    }
    resetExecution(); // Clear any previous results.
    setActiveTab("execute"); // Switch to the execute tab.
    try {
      // Run in 'current' mode (backend default)
      await runValidationScript(parameters);
    } catch (error) {
      toast.error(`Error starting validation: ${error.message}`);
    }
  };

  const handlePreChangeSnapshot = async (event) => {
    event.preventDefault();
    if (!validation.isValid) {
      toast.error(`Configuration Invalid: ${validation.reason}`);
      return;
    }
    resetExecution();
    setActiveTab("execute");
    try {
      const snapshotParams = {
        ...parameters,
        mode: 'snapshot',
        snapshot_name: 'pre_change'
      };
      await runValidationScript(snapshotParams);
      toast.success("Starting Pre-Change Snapshot...");
    } catch (error) {
      toast.error(`Error starting snapshot: ${error.message}`);
    }
  };

  const handlePostChangeCompare = async (event) => {
    event.preventDefault();
    if (!validation.isValid) {
      toast.error(`Configuration Invalid: ${validation.reason}`);
      return;
    }
    resetExecution();
    setActiveTab("execute");
    try {
      const compareParams = {
        ...parameters,
        mode: 'compare',
        snapshot_name: 'post_change',
        compare_with: 'pre_change'
      };
      await runValidationScript(compareParams);
      toast.success("Starting Post-Change Comparison...");
    } catch (error) {
      toast.error(`Error starting comparison: ${error.message}`);
    }
  };

  const handleSave = async () => {
    if (!hasResults) {
      toast.error("No results available to save.");
      return;
    }
    try {
      await ValidationApiService.saveResults(executionState.result);
      toast.success("Validation results saved successfully!");
    } catch (error) {
      toast.error(`Error saving results: ${error.message}`);
    }
  };

  // --- Effect for UI automation ---
  // This effect watches for the completion of a successful run and automatically
  // switches the UI to the "Results" tab for a seamless user experience.
  useEffect(() => {
    if (hasResults) {
      setActiveTab("results");
    }
  }, [hasResults]); // Dependency array ensures this only runs when `hasResults` changes.

  // --- Helper function for rendering status icons on tabs ---
  const getStatusIcon = (tab) => {
    if (tab === 'execute') {
      if (executionState.isRunning) return <Clock className="h-4 w-4 text-blue-500 animate-spin ml-2" />;
      if (executionState.isComplete && executionState.hasError) return <XCircle className="h-4 w-4 text-red-500 ml-2" />;
      if (executionState.isComplete) return <CheckCircle2 className="h-4 w-4 text-green-500 ml-2" />;
    }
    if (tab === 'results' && hasResults) {
      return <CheckCircle2 className="h-4 w-4 text-green-500 ml-2" />;
    }
    return null;
  };

  return (
    <div className="flex h-full w-full bg-muted/40 rounded-lg border overflow-hidden">
      <TooltipProvider delayDuration={150}>
        <ValidationSidebar categorizedTests={categorizedTests} isDiscovering={isDiscovering} discoveryError={discoveryError} selectedTests={parameters.validation_tests || []} onSelectionChange={onParamChange} isCollapsed={isSidebarCollapsed} />
        <main className="flex-1 flex flex-col min-w-0 relative">
          {/* Sidebar Collapse Toggle Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="absolute left-4 top-4 h-9 w-9 z-20" onClick={() => setIsSidebarCollapsed(v => !v)}>
                {isSidebarCollapsed ? <PanelRightClose className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{isSidebarCollapsed ? 'Show' : 'Hide'} Sidebar</TooltipContent>
          </Tooltip>

          <div className="flex-1 flex flex-col">
            <header className="flex h-16 items-center gap-4 border-b bg-background px-4 md:pl-20 md:px-6 sticky top-0 z-10">
              {/* Responsive Sidebar for Mobile */}
              <Sheet>
                <SheetTrigger asChild><Button variant="outline" size="icon" className="shrink-0 md:hidden"><Menu className="h-5 w-5" /></Button></SheetTrigger>
                <SheetContent side="left" className="flex flex-col w-[320px] p-0">
                  <ValidationSidebar categorizedTests={categorizedTests} isDiscovering={isDiscovering} discoveryError={discoveryError} selectedTests={parameters.validation_tests || []} onSelectionChange={onParamChange} isCollapsed={false} />
                </SheetContent>
              </Sheet>

              <h1 className="font-semibold text-xl flex-1">{script.displayName}</h1>
              {/* WebSocket Connection Status Indicator */}
              <div className="flex items-center gap-2" title={wsContext?.isConnected ? "WebSocket Connected" : "WebSocket Disconnected"}>
                {wsContext?.isConnected ? <Wifi className="h-4 w-4 text-green-500" /> : <WifiOff className="h-4 w-4 text-red-500" />}
              </div>
              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                  <Tooltip>
                      <TooltipTrigger asChild>
                          <Button onClick={handleRunCurrent} disabled={isRunDisabled}>
                              <PlayCircle className="h-4 w-4 mr-2" />
                              {executionState.isRunning ? "Running..." : "Run Test"}
                          </Button>
                      </TooltipTrigger>
                      <TooltipContent>Run a standard, real-time validation test.</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                      <TooltipTrigger asChild>
                          <Button variant="outline" onClick={handlePreChangeSnapshot} disabled={isRunDisabled}>
                              <Save className="h-4 w-4 mr-2" />
                              Pre-Change Snap
                          </Button>
                      </TooltipTrigger>
                      <TooltipContent>Take a 'pre_change' snapshot of the current state.</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                      <TooltipTrigger asChild>
                          <Button variant="outline" onClick={handlePostChangeCompare} disabled={isRunDisabled}>
                              <Table2 className="h-4 w-4 mr-2" />
                              Post-Change & Compare
                          </Button>
                      </TooltipTrigger>
                      <TooltipContent>Take a 'post_change' snapshot and compare it with the 'pre_change' snapshot.</TooltipContent>
                  </Tooltip>
              </div>
            </header>

            {/* UI IMPROVEMENT: Padding reduced from p-4 md:p-8 to p-2 md:p-4 for a more space-efficient layout. */}
            <div className="flex-1 overflow-y-auto p-2 md:p-4 md:pl-4">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="config"><Cog className="h-4 w-4 mr-2" />Configure</TabsTrigger>
                  <TabsTrigger value="execute"><PlayCircle className="h-4 w-4 mr-2" />Execute {getStatusIcon('execute')}</TabsTrigger>
                  <TabsTrigger value="results"><Table2 className="h-4 w-4 mr-2" />Results {getStatusIcon('results')}</TabsTrigger>
                </TabsList>

                {/* UI IMPROVEMENT: Padding reduced from p-6 to p-4 and margin from mt-6 to mt-4. */}
                <div className="mt-4 bg-white p-4 rounded-lg border">
                  {/* CONFIGURATION TAB */}
                  <TabsContent value="config" className="space-y-6">
                    <div className="space-y-1"><h3 className="text-lg font-semibold">Device Target & Authentication</h3><p className="text-sm text-gray-600">Provide Juniper device credentials and target hostname.</p></div>
                    <DeviceTargetSelector parameters={parameters} onParamChange={onParamChange} showInventoryFile={false} />
                    <div className="border-t border-slate-200" />
                    <DeviceAuthFields parameters={parameters} onParamChange={onParamChange} />
                  </TabsContent>

                  {/* EXECUTE TAB */}
                  <TabsContent value="execute">
                    {/**
                      * ================================================================
                      * CRITICAL FIX IMPLEMENTATION
                      * ================================================================
                      * The `result` prop is explicitly set to `null`.
                      * This prevents the complex final result object from being passed
                      * to `RealTimeDisplay`, which was the source of the crash.
                      * This component will now only display progress messages and the
                      * final error message if one occurs, but it will not attempt
                      * to render the successful result structure.
                      */}
                    <RealTimeDisplay
                      isRunning={executionState.isRunning}
                      isComplete={executionState.isComplete}
                      hasError={executionState.hasError}
                      progress={executionState.progress}
                      result={null}
                      error={executionState.error}
                      onReset={resetExecution}
                      currentStep={executionState.latestMessage?.message}
                    />
                  </TabsContent>

                  {/* RESULTS TAB */}
                  <TabsContent value="results" className="space-y-6">
                    {/* Conditionally render content based on the execution state. */}
                    {hasResults ? (
                      // If the run is complete and successful, show the results.
                      <>
                        <div className="flex justify-between items-center p-4 bg-green-50 border border-green-200 rounded-lg">
                          <div><h3 className="text-lg font-semibold text-green-800">Validation Complete</h3><p className="text-sm text-green-700">JSNAPy validation results are available below.</p></div>
                          <Button onClick={handleSave}><Save className="h-4 w-4 mr-2" />Save Results</Button>
                        </div>
                        {/* The ResultsViewer is designed to handle the complex result object. */}
                        <BulletproofValidationResultsViewer validationResults={executionState.result} />
                      </>
                    ) : executionState.hasError ? (
                      // If the run completed with an error, show an error message.
                      <div className="text-center py-12 bg-red-50 border-red-200 rounded-lg">
                        <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-red-800">Validation Failed</h3>
                        <p className="text-red-700 mt-1">{executionState.error || "An unknown error occurred."}</p>
                      </div>
                    ) : (
                      // If there are no results yet, show a placeholder.
                      <div className="text-center py-12 bg-gray-50 border-2 border-dashed rounded-lg">
                        <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium">No Results Yet</h3>
                        <p className="text-gray-600">Run validation tests to see results here.</p>
                      </div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        </main>
      </TooltipProvider>
    </div>
  );
}

// =============================================================================
// SECTION 4: EXPORT
// =============================================================================
export default memo(ValidationRunner);
