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
import React, { memo, useState, useEffect, useMemo } from "react";
import toast from "react-hot-toast";

// --- Icons and UI Components ---
import {
  PlayCircle, Layers, Save, Table2, Menu, Wifi, WifiOff,
  CheckCircle2, XCircle, Clock, Cog, CheckSquare, XSquare,
  PanelLeftClose, PanelRightOpen, FileText, ChevronDown, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  isOpen
}) => {
  const handleSelectAll = (reportsInCategory) => {
    const allReportIds = reportsInCategory.map(r => r.id);
    const newSelection = [...new Set([...selectedReports, ...allReportIds])];
    onSelectionChange('reports', newSelection);
  };

  const handleClearAll = (reportsInCategory) => {
    const reportIdsToClear = new Set(reportsInCategory.map(r => r.id));
    const newSelection = selectedReports.filter(id => !reportIdsToClear.has(id));
    onSelectionChange('reports', newSelection);
  };

  const renderContent = () => {
    if (isDiscovering) {
      return <div className="space-y-3 px-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>;
    }
    if (discoveryError) {
      return (
        <Alert variant="destructive" className="mx-4">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load reports. {discoveryError}</AlertDescription>
        </Alert>
      );
    }
    if (Object.keys(categorizedReports).length === 0) {
      return <p className="text-sm text-center text-gray-500 px-4">No reports available.</p>;
    }

    return (
      <div className="space-y-2">
        {Object.entries(categorizedReports).map(([category, reports]) => (
          <Collapsible key={category} defaultOpen className="px-4">
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2">
              <h3 className="font-semibold text-md">{category}</h3>
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pl-2">
              {reports.map((report) => (
                <div key={report.id} className="flex items-center space-x-3">
                  <Checkbox
                    id={report.id}
                    checked={selectedReports.includes(report.id)}
                    onCheckedChange={(checked) => {
                      const newSelection = checked
                        ? [...selectedReports, report.id]
                        : selectedReports.filter((id) => id !== report.id);
                      onSelectionChange('reports', newSelection);
                    }}
                  />
                  <Label htmlFor={report.id} className="font-normal text-sm cursor-pointer">{report.description}</Label>
                </div>
              ))}
               <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => handleSelectAll(reports)}>Select All</Button>
                <Button variant="outline" size="sm" onClick={() => handleClearAll(reports)}>Clear</Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    );
  };

  return (
    <div className={cn("hidden md:flex flex-col h-full bg-gray-50 border-r transition-all", isOpen ? "w-[280px]" : "w-[64px]")}>
      <div className="flex items-center h-16 border-b px-4 shrink-0">
        <FileText className="h-6 w-6 text-gray-700" />
        <div className={cn("transition-opacity duration-200 overflow-hidden", isOpen ? "w-48 ml-2 opacity-100" : "w-0 opacity-0")}>
          <h2 className="text-xl font-bold tracking-tight whitespace-nowrap">Available Reports</h2>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-4">
        <div className={cn("transition-all", isOpen ? "w-[270px]" : "w-[64px]")}>
            {renderContent()}
        </div>
      </div>
    </div>
  );
});

// =============================================================================
// SECTION 3: MAIN COMPONENT DEFINITION
// =============================================================================
function ReportsRunner({ script, parameters, onParamChange }) {
  // ===========================================================================
  // SUBSECTION 3.1: STATE AND HOOKS
  // ===========================================================================
  const wsContext = useWebSocket();
  const { executionState, runReportScript, resetExecution, categorizedReports, isDiscovering, discoveryError } = useReportsWorkflow(wsContext);

  const [activeTab, setActiveTab] = useState("config");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showResultsTable, setShowResultsTable] = useState(false);

  // ===========================================================================
  // SUBSECTION 3.2: DERIVED STATE AND VALIDATION
  // ===========================================================================
  const validateConfiguration = () => {
    if (!wsContext?.isConnected) return { isValid: false, reason: "WebSocket is not connected." };
    if (!parameters.username || !parameters.password) return { isValid: false, reason: "Username and password are required." };
    if (!parameters.hostname && !parameters.inventory_file) return { isValid: false, reason: "A target host or inventory file is required." };
    if (!parameters.reports || parameters.reports.length === 0) return { isValid: false, reason: "At least one report must be selected." };
    return { isValid: true, reason: "" };
  };

  const validation = validateConfiguration();
  const isRunDisabled = !validation.isValid || executionState.isRunning;
  const hasResults = executionState.isComplete && !executionState.hasError;

  // ===========================================================================
  // SUBSECTION 3.3: EVENT HANDLERS
  // ===========================================================================
  const handleRun = async (event) => {
    event.preventDefault();
    if (!validation.isValid) {
      toast.error(`Configuration Invalid: ${validation.reason}`);
      return;
    }
    resetExecution();
    setShowResultsTable(false);
    setActiveTab("execute");
    try {
      await runReportScript(parameters);
    } catch (error) {
      toast.error(`Error starting script: ${error.message}`);
    }
  };

  const handleSave = async () => {
    if (!executionState.result) {
      toast.error("No results available to save.");
      return;
    }
    try {
      await ReportsApiService.saveResults(executionState.result);
      toast.success("Report saved successfully!");
    } catch (error) {
      toast.error(`Error saving report: ${error.message}`);
    }
  };

  // Effect to auto-switch tabs on completion
  useEffect(() => {
    if (executionState.isComplete && !executionState.hasError) {
      setActiveTab("results");
      setShowResultsTable(true);
    }
  }, [executionState.isComplete, executionState.hasError]);

  // ===========================================================================
  // SUBSECTION 3.4: RENDER LOGIC
  // ===========================================================================
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
    <div className={cn("grid min-h-screen w-full transition-[grid-template-columns] duration-300 ease-in-out", isSidebarOpen ? "md:grid-cols-[280px_1fr]" : "md:grid-cols-[64px_1fr]")}>
      {/* --- Desktop Sidebar --- */}
      <ReportsSidebar
        categorizedReports={categorizedReports}
        isDiscovering={isDiscovering}
        discoveryError={discoveryError}
        selectedReports={parameters.reports || []}
        onSelectionChange={onParamChange}
        isOpen={isSidebarOpen}
      />

      {/* --- Main Content --- */}
      <div className="flex flex-col h-full">
        {/* --- Header --- */}
        <header className="flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 sticky top-0 z-10 bg-white">
          <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="hidden md:flex">
            {isSidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
          </Button>
          {/* Mobile Sheet Trigger */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0 md:hidden"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex flex-col w-[280px] p-0">
               <div className="flex items-center h-16 border-b px-4 shrink-0">
                  <FileText className="h-6 w-6 text-gray-700 mr-2" />
                  <h2 className="text-xl font-bold tracking-tight">Available Reports</h2>
              </div>
              <div className="flex-1 overflow-y-auto py-4">
                 <ReportsSidebar categorizedReports={categorizedReports} isDiscovering={isDiscovering} discoveryError={discoveryError} selectedReports={parameters.reports || []} onSelectionChange={onParamChange} isOpen={true} />
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

        {/* --- Tabbed Content Area --- */}
        <main className="flex-1 flex flex-col gap-4 p-4 md:p-8 bg-gray-100">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="config"><Cog className="h-4 w-4 mr-2" />Configure</TabsTrigger>
              <TabsTrigger value="execute"><PlayCircle className="h-4 w-4 mr-2" />Execute {getStatusIcon('execute')}</TabsTrigger>
              <TabsTrigger value="results"><Table2 className="h-4 w-4 mr-2" />Results {getStatusIcon('results')}</TabsTrigger>
            </TabsList>

            <div className="mt-6 bg-white p-6 rounded-lg border">
              {/* --- Configure Tab --- */}
              <TabsContent value="config" className="space-y-6">
                <div className="space-y-1">
                    <h3 className="text-lg font-semibold">Target & Authentication</h3>
                    <p className="text-sm text-gray-600">Provide device credentials and targeting information.</p>
                </div>
                <DeviceTargetSelector parameters={parameters} onParamChange={onParamChange} />
                <div className="border-t border-slate-200" />
                <DeviceAuthFields parameters={parameters} onParamChange={onParamChange} />
              </TabsContent>

              {/* --- Execute Tab --- */}
              <TabsContent value="execute">
                 <RealTimeDisplay
                    isRunning={executionState.isRunning}
                    isComplete={executionState.isComplete}
                    hasError={executionState.hasError}
                    progress={executionState.progress}
                    result={executionState.result?.data}
                    error={executionState.error}
                    onReset={resetExecution}
                    currentStep={executionState.latestMessage?.message}
                />
              </TabsContent>

              {/* --- Results Tab --- */}
              <TabsContent value="results" className="space-y-6">
                {hasResults ? (
                  <>
                    <div className="flex justify-between items-center p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div>
                            <h3 className="text-lg font-semibold text-green-800">Execution Completed</h3>
                            <p className="text-sm text-green-700">Report data is available below.</p>
                        </div>
                        <Button onClick={handleSave}><Save className="h-4 w-4 mr-2" />Save Report</Button>
                    </div>
                    {executionState.result?.results_by_host?.map((hostResult, hostIndex) => (
                      <div key={`host-${hostIndex}`} className="space-y-4">
                        {hostResult.test_results?.map((testResult, testIndex) => (
                          <UniversalTableViewer key={`test-result-${hostIndex}-${testIndex}`} tableData={testResult} />
                        ))}
                      </div>
                    ))}
                  </>
                ) : executionState.hasError ? (
                    <div className="text-center py-12 bg-red-50 border-red-200 rounded-lg">
                        <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-red-800">Execution Failed</h3>
                        <p className="text-red-700 mt-1">{executionState.error || "An unknown error occurred."}</p>
                    </div>
                ) : (
                    <div className="text-center py-12 bg-gray-50 border-2 border-dashed rounded-lg">
                        <Table2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium">No Results Yet</h3>
                        <p className="text-gray-600">Run one or more reports to see results here.</p>
                    </div>
                )}
              </TabsContent>
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
export default memo(ReportsRunner);
