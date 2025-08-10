// =============================================================================
// FILE:               src/components/runners/ReportsRunner.jsx
//
// DESCRIPTION:
//   A sophisticated React component for discovering, configuring, and running
//   network reports. It uses a modern, two-panel layout inspired by the
//   shadcn/ui "sidebar-08" example, providing a highly intuitive user experience.
//
// OVERVIEW:
//   This component serves as the primary interface for the reporting tool. It
//   features a collapsible sidebar for selecting from a list of available
//   reports and a tabbed main content area for configuration, execution, and
//   results display. The component is designed for modularity and reusability,
//   leveraging custom hooks for state management and API services for backend
//   communication, ensuring a clean separation of concerns.
//
// KEY FEATURES:
//   - Slick, Responsive UI: Two-panel layout with a collapsible sidebar for desktop
//     and a slide-in sheet for mobile.
//   - Dynamic Report Discovery: The sidebar automatically populates with available
//     reports fetched from the backend.
//   - Multi-Select Functionality: Users can select multiple reports to run at
//     once using checkboxes.
//   - Tabbed Workflow: A clear, three-step process (Configure, Execute, Results)
//     guides the user through the workflow.
//   - Real-Time Execution Feedback: Integrates with WebSockets to provide a live
//     log of the report generation process.
//   - Robust State Management: Utilizes the `useReportsWorkflow` hook to handle
//     all application state, ensuring predictable and maintainable logic.
//
// DEPENDENCIES:
//   - react: Core library for component rendering and state management.
//   - lucide-react: Icon library for a consistent and clean look.
//   - shadcn/ui: Button, Tabs, Sheet, Checkbox, Label, etc., for the UI foundation.
//   - custom hooks: `useReportsWorkflow` for logic, `useWebSocket` for connectivity.
//   - custom services: `ReportsApiService` for backend interactions.
//   - shared components: `DeviceTargetSelector`, `DeviceAuthFields`, `RealTimeDisplay`,
//     `UniversalTableViewer`.
//
// HOW TO USE:
//   This component is designed to be rendered by a parent router like `PythonScriptRunner.jsx`.
//   Ensure the parent provides the necessary props:
//   <ReportsRunner
//     script={scriptMetadata}
//     parameters={currentParameters}
//     onParamChange={updateParametersCallback}
//   />
//   - `script`: Object containing script metadata.
//   - `parameters`: State object for all form inputs (e.g., hostname, selected reports).
//   - `onParamChange`: A callback function to update the `parameters` state in the parent.
// =============================================================================

// =============================================================================
// SECTION 1: IMPORTS
// =============================================================================
import React, { memo, useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";

// --- Icons and UI Components ---
import {
  PlayCircle, Save, Table2, Menu, Wifi, WifiOff,
  CheckCircle2, XCircle, Clock, Cog, CheckSquare, XSquare,
  PanelLeftClose, PanelRightClose, FileText, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// --- Custom Hooks, Services, and Components ---
import { useReportsWorkflow } from "../../hooks/useReportsWorkflow";
import { useWebSocket } from "../../hooks/useWebSocket";
import ReportsApiService from "../../services/ReportsApiService";
import DeviceTargetSelector from "../shared/DeviceTargetSelector";
import DeviceAuthFields from "../shared/DeviceAuthFields";
import RealTimeDisplay from "../RealTimeProgress";
import UniversalTableViewer from "../shared/UniversalTableViewer";

// =============================================================================
// SECTION 2: SIDEBAR COMPONENT (FOR REPORT SELECTION)
// =============================================================================
const ReportsSidebar = memo(({
  categorizedReports,
  isDiscovering,
  discoveryError,
  selectedReports,
  onSelectionChange,
  isCollapsed
}) => {
  const handleSelectAllGlobal = useCallback(() => {
    const allReportIds = Object.values(categorizedReports).flat().map(report => report.id);
    onSelectionChange('tests', allReportIds);
  }, [categorizedReports, onSelectionChange]);

  const handleClearAllGlobal = useCallback(() => {
    onSelectionChange('tests', []);
  }, [onSelectionChange]);

  const renderCategorizedList = () => {
    if (isDiscovering) {
      return <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>;
    }
    if (discoveryError) {
      return (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load reports. {discoveryError}</AlertDescription>
        </Alert>
      );
    }
    const reportCategories = Object.entries(categorizedReports);
    if (reportCategories.length === 0) {
      return <p className="text-sm text-center text-gray-500">No reports available.</p>;
    }
    return (
      <div className="space-y-2">
        {reportCategories.map(([category, reports]) => (
          <Collapsible key={category} defaultOpen className="space-y-2 border-b last:border-b-0 py-2">
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2 hover:bg-gray-100 rounded-md px-2 -mx-2">
              <h3 className="font-semibold text-md">{category}</h3>
              <ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pl-2 pt-2">
              {reports.map((report) => (
                <div key={report.id} className="flex items-center space-x-3">
                  <Checkbox
                    id={report.id}
                    checked={selectedReports.includes(report.id)}
                    onCheckedChange={(checked) => {
                      const newSelection = checked
                        ? [...selectedReports, report.id]
                        : selectedReports.filter((id) => id !== report.id);
                      onSelectionChange('tests', newSelection);
                    }}
                  />
                  <Label htmlFor={report.id} className="font-normal text-sm cursor-pointer">{report.description}</Label>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    );
  };

  // --- MODIFICATION: The component is restructured into Header, Content, and Footer sections ---
  return (
    <aside className={cn("relative bg-card border-r transition-all duration-300 flex flex-col", isCollapsed ? 'w-0 p-0 border-none' : 'w-[280px]')}>
      {/* This wrapper div handles the fade out/in transition for all content */}
      <div className={cn("flex flex-col h-full transition-opacity duration-200", isCollapsed ? "opacity-0" : "opacity-100")}>

        {/* 1. Sidebar Header: Fixed height to align with the main content's header */}
        <div className="flex items-center h-16 border-b px-4 shrink-0">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold">Reports</h2>
                    <p className="text-sm text-muted-foreground">Select reports to run</p>
                </div>
            </div>
        </div>

        {/* 2. Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {renderCategorizedList()}
        </div>

        {/* 3. "Sticky" Footer with Action Buttons */}
        <div className="p-4 border-t shrink-0">
            <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={handleSelectAllGlobal}>
                    <CheckSquare className="h-4 w-4 mr-2"/> Select All
                </Button>
                <Button variant="outline" size="sm" onClick={handleClearAllGlobal}>
                    <XSquare className="h-4 w-4 mr-2"/> Clear All
                </Button>
            </div>
        </div>

      </div>
    </aside>
  );
});


// =============================================================================
// SECTION 3: MAIN COMPONENT DEFINITION (No changes needed below this line)
// =============================================================================
function ReportsRunner({ script, parameters, onParamChange }) {
  const wsContext = useWebSocket();
  const { executionState, runReportScript, resetExecution, categorizedReports, isDiscovering, discoveryError } = useReportsWorkflow(wsContext);

  const [activeTab, setActiveTab] = useState("config");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showResultsTable, setShowResultsTable] = useState(false);

  const validateConfiguration = () => {
    if (!wsContext?.isConnected) return { isValid: false, reason: "WebSocket is not connected." };
    if (!parameters.username || !parameters.password) return { isValid: false, reason: "Username and password are required." };
    if (!parameters.hostname && !parameters.inventory_file) return { isValid: false, reason: "A target host or inventory file is required." };
    if (!parameters.tests || parameters.tests.length === 0) return { isValid: false, reason: "At least one report must be selected." };
    return { isValid: true, reason: "" };
  };

  const validation = validateConfiguration();
  const isRunDisabled = !validation.isValid || executionState.isRunning;
  const hasResults = executionState.isComplete && !executionState.hasError;

  const handleRun = async (event) => {
    event.preventDefault();
    if (!validation.isValid) { toast.error(`Configuration Invalid: ${validation.reason}`); return; }
    resetExecution();
    setShowResultsTable(false);
    setActiveTab("execute");
    try { await runReportScript(parameters); } catch (error) { toast.error(`Error starting script: ${error.message}`); }
  };

  const handleSave = async () => {
    if (!executionState.result) { toast.error("No results available to save."); return; }
    try { await ReportsApiService.saveResults(executionState.result); toast.success("Report saved successfully!"); } catch (error) { toast.error(`Error saving report: ${error.message}`); }
  };

  useEffect(() => {
    if (executionState.isComplete && !executionState.hasError) { setActiveTab("results"); setShowResultsTable(true); }
  }, [executionState.isComplete, executionState.hasError]);

  const getStatusIcon = (tab) => {
    if (tab === 'execute') {
      if (executionState.isRunning) return <Clock className="h-4 w-4 text-blue-500 animate-spin ml-2" />;
      if (executionState.isComplete && executionState.hasError) return <XCircle className="h-4 w-4 text-red-500 ml-2" />;
      if (executionState.isComplete) return <CheckCircle2 className="h-4 w-4 text-green-500 ml-2" />;
    }
    if (tab === 'results' && hasResults) { return <CheckCircle2 className="h-4 w-4 text-green-500 ml-2" />; }
    return null;
  };

  return (
    <div className="flex h-full w-full bg-muted/40 rounded-lg border overflow-hidden">
      <TooltipProvider delayDuration={150}>
        <ReportsSidebar
          categorizedReports={categorizedReports}
          isDiscovering={isDiscovering}
          discoveryError={discoveryError}
          selectedReports={parameters.tests || []}
          onSelectionChange={onParamChange}
          isCollapsed={isSidebarCollapsed}
        />

        <main className="flex-1 flex flex-col min-w-0 relative">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="absolute left-4 top-4 h-9 w-9 z-20" onClick={() => setIsSidebarCollapsed(v => !v)}>
                {isSidebarCollapsed ? <PanelRightClose className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isSidebarCollapsed ? 'Show' : 'Hide'} Sidebar
            </TooltipContent>
          </Tooltip>

          <div className="flex-1 flex flex-col">
            <header className="flex h-16 items-center gap-4 border-b bg-background px-4 md:pl-20 md:px-6 sticky top-0 z-10">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="shrink-0 md:hidden"><Menu className="h-5 w-5" /></Button>
                </SheetTrigger>
                <SheetContent side="left" className="flex flex-col w-[280px] p-0">
                  <div className="flex-1 overflow-y-auto">
                    <ReportsSidebar categorizedReports={categorizedReports} isDiscovering={isDiscovering} discoveryError={discoveryError} selectedReports={parameters.tests || []} onSelectionChange={onParamChange} isCollapsed={false} />
                  </div>
                </SheetContent>
              </Sheet>
              <h1 className="font-semibold text-xl flex-1">{script.displayName}</h1>
              <div className="flex items-center gap-2" title={wsContext?.isConnected ? "WebSocket Connected" : "WebSocket Disconnected"}>
                {wsContext?.isConnected ? <Wifi className="h-4 w-4 text-green-500" /> : <WifiOff className="h-4 w-4 text-red-500" />}
              </div>
              <Button onClick={handleRun} disabled={isRunDisabled}>
                <PlayCircle className="h-4 w-4 mr-2" />
                {executionState.isRunning ? "Running..." : "Run Reports"}
              </Button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 md:pl-20">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="config"><Cog className="h-4 w-4 mr-2" />Configure</TabsTrigger>
                    <TabsTrigger value="execute"><PlayCircle className="h-4 w-4 mr-2" />Execute {getStatusIcon('execute')}</TabsTrigger>
                    <TabsTrigger value="results"><Table2 className="h-4 w-4 mr-2" />Results {getStatusIcon('results')}</TabsTrigger>
                    </TabsList>
                    <div className="mt-6 bg-white p-6 rounded-lg border">
                    <TabsContent value="config" className="space-y-6">
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold">Target & Authentication</h3>
                            <p className="text-sm text-gray-600">Provide device credentials and targeting information.</p>
                        </div>
                        <DeviceTargetSelector parameters={parameters} onParamChange={onParamChange} />
                        <div className="border-t border-slate-200" />
                        <DeviceAuthFields parameters={parameters} onParamChange={onParamChange} />
                    </TabsContent>
                    <TabsContent value="execute">
                        <RealTimeDisplay isRunning={executionState.isRunning} isComplete={executionState.isComplete} hasError={executionState.hasError} progress={executionState.progress} result={executionState.result?.data} error={executionState.error} onReset={resetExecution} currentStep={executionState.latestMessage?.message} />
                    </TabsContent>
                    <TabsContent value="results" className="space-y-6">
                        {hasResults ? (
                        <>
                            <div className="flex justify-between items-center p-4 bg-green-50 border border-green-200 rounded-lg">
                                <div><h3 className="text-lg font-semibold text-green-800">Execution Completed</h3><p className="text-sm text-green-700">Report data is available below.</p></div>
                                <Button onClick={handleSave}><Save className="h-4 w-4 mr-2" />Save Report</Button>
                            </div>
                            {executionState.result?.results_by_host?.map((hostResult, hostIndex) => (
                            <div key={`host-${hostIndex}`} className="space-y-4">
                                {hostResult.test_results?.map((testResult, testIndex) => (<UniversalTableViewer key={`test-result-${hostIndex}-${testIndex}`} tableData={testResult} />))}
                            </div>
                            ))}
                        </>
                        ) : executionState.hasError ? (
                            <div className="text-center py-12 bg-red-50 border-red-200 rounded-lg"><XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" /><h3 className="text-lg font-medium text-red-800">Execution Failed</h3><p className="text-red-700 mt-1">{executionState.error || "An unknown error occurred."}</p></div>
                        ) : (
                            <div className="text-center py-12 bg-gray-50 border-2 border-dashed rounded-lg"><Table2 className="h-12 w-12 text-gray-400 mx-auto mb-4" /><h3 className="text-lg font-medium">No Results Yet</h3><p className="text-gray-600">Run one or more reports to see results here.</p></div>
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
export default memo(ReportsRunner);
