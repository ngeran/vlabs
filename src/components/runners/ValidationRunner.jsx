// =============================================================================
// FILE:               src/components/runners/ValidationRunner.jsx
//
// DESCRIPTION:
//   A sophisticated React component for discovering, configuring, and running
//   JSNAPy validation tests. It provides a highly intuitive user experience
//   modeled directly after the ReportsRunner component.
//
// OVERVIEW:
//   This component serves as the primary interface for the validation tool. It
//   features a collapsible sidebar for selecting tests and a tabbed main
//   content area for configuration, execution, and results display.
//
// KEY FEATURES:
//   - Slick, Responsive UI with a collapsible sidebar that fully collapses.
//   - Dynamic Test Discovery from the backend.
//   - Tabbed Workflow (Configure, Execute, Results).
//   - Real-Time Execution Feedback via WebSockets.
//   - Robust State Management via the `useValidationWorkflow` hook.
//
// DEPENDENCIES:
//   - react, lucide-react, shadcn/ui components.
//   - `useValidationWorkflow` for logic and state.
//   - `useWebSocket` for real-time connectivity.
//   - Shared components like `DeviceTargetSelector` and `UniversalTableViewer`.
//
// HOW TO USE:
//   This component is rendered by `PythonScriptRunner.jsx` when a script with
//   `runnerComponent: "ValidationRunner"` is selected.
// =============================================================================

// =============================================================================
// SECTION 1: IMPORTS
// =============================================================================
import React, { memo, useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  PlayCircle,
  Save,
  Table2,
  Menu,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  Clock,
  Cog,
  CheckSquare,
  XSquare,
  PanelLeftClose,
  PanelRightClose,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// --- Custom Hooks, Services, and Components ---
import { useValidationWorkflow } from "../../hooks/useValidationWorkflow";
import ValidationApiService from "../../services/ValidationApiService";
import { useWebSocket } from "../../hooks/useWebSocket";
import DeviceTargetSelector from "../shared/DeviceTargetSelector";
import DeviceAuthFields from "../shared/DeviceAuthFields";
import RealTimeDisplay from "../RealTimeProgress";
import UniversalTableViewer from "../shared/UniversalTableViewer";

// =============================================================================
// SECTION 2: SIDEBAR COMPONENT (WITH ROBUST RENDERING)
// =============================================================================
const ValidationSidebar = memo(
  ({
    categorizedTests,
    isDiscovering,
    discoveryError,
    selectedTests,
    onSelectionChange,
    isCollapsed,
  }) => {
    const handleSelectAllGlobal = useCallback(() => {
      // --- MODIFICATION: Ensure categorizedTests is a valid object before processing ---
      if (!categorizedTests || typeof categorizedTests !== "object") return;
      const allTestIds = Object.values(categorizedTests)
        .flat()
        .map((test) => test.id);
      onSelectionChange("tests", allTestIds);
    }, [categorizedTests, onSelectionChange]);

    const handleClearAllGlobal = useCallback(() => {
      onSelectionChange("tests", []);
    }, [onSelectionChange]);

    const renderCategorizedList = () => {
      if (isDiscovering)
        return (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        );
      if (discoveryError)
        return (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{discoveryError}</AlertDescription>
          </Alert>
        );

      // --- MODIFICATION: Add robust checks to prevent crashes ---
      // Check if categorizedTests is a valid, non-empty object.
      if (
        !categorizedTests ||
        typeof categorizedTests !== "object" ||
        Object.keys(categorizedTests).length === 0
      ) {
        return (
          <p className="text-sm text-center text-gray-500">
            No validations available.
          </p>
        );
      }

      const testCategories = Object.entries(categorizedTests);

      return (
        <div className="space-y-2">
          {testCategories.map(([category, tests]) => {
            // --- MODIFICATION: Ensure that `tests` is an array before mapping it ---
            // If the data for a category is not an array, skip rendering it to prevent a crash.
            if (!Array.isArray(tests)) {
              return null;
            }

            return (
              <Collapsible
                key={category}
                defaultOpen
                className="space-y-2 border-b last:border-b-0 py-2"
              >
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
                          onSelectionChange("tests", newSelection);
                        }}
                      />
                      <Label
                        htmlFor={test.id}
                        className="font-normal text-sm cursor-pointer"
                      >
                        {test.description}
                      </Label>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      );
    };

    return (
      <aside
        className={cn(
          "relative bg-card border-r transition-all duration-300 flex flex-col",
          isCollapsed ? "w-0 p-0 border-none" : "w-[280px]",
        )}
      >
        <div
          className={cn(
            "flex flex-col h-full transition-opacity duration-200",
            isCollapsed ? "opacity-0" : "opacity-100",
          )}
        >
          <div className="flex items-center h-16 border-b px-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Validations</h2>
                <p className="text-sm text-muted-foreground">
                  Select tests to run
                </p>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {renderCategorizedList()}
          </div>
          <div className="p-4 border-t shrink-0">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAllGlobal}
              >
                <CheckSquare className="h-4 w-4 mr-2" /> Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAllGlobal}
              >
                <XSquare className="h-4 w-4 mr-2" /> Clear All
              </Button>
            </div>
          </div>
        </div>
      </aside>
    );
  },
);

// =============================================================================
// SECTION 3: MAIN COMPONENT DEFINITION (No changes needed here)
// =============================================================================
function ValidationRunner({ script, parameters, onParamChange }) {
  const wsContext = useWebSocket();
  const {
    executionState,
    runValidationScript,
    resetExecution,
    categorizedTests,
    isDiscovering,
    discoveryError,
  } = useValidationWorkflow(wsContext);

  const [activeTab, setActiveTab] = useState("config");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showResultsTable, setShowResultsTable] = useState(false);

  const validateConfiguration = () => {
    if (!wsContext?.isConnected)
      return { isValid: false, reason: "WebSocket is not connected." };
    if (!parameters.username || !parameters.password)
      return { isValid: false, reason: "Username and password are required." };
    if (!parameters.hostname && !parameters.inventory_file)
      return {
        isValid: false,
        reason: "A target host or inventory file is required.",
      };
    if (!parameters.tests || parameters.tests.length === 0)
      return {
        isValid: false,
        reason: "At least one validation must be selected.",
      };
    return { isValid: true, reason: "" };
  };

  const validation = validateConfiguration();
  const isRunDisabled = !validation.isValid || executionState.isRunning;
  const hasResults = executionState.isComplete && !executionState.hasError;

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
      await runValidationScript(parameters);
    } catch (error) {
      toast.error(`Error starting script: ${error.message}`);
    }
  };

  const handleSave = async () => {
    if (!executionState.result) {
      toast.error("No results to save.");
      return;
    }
    try {
      await ValidationApiService.saveResults(executionState.result);
      toast.success("Validation Report saved successfully!");
    } catch (error) {
      toast.error(`Error saving report: ${error.message}`);
    }
  };

  useEffect(() => {
    if (executionState.isComplete && !executionState.hasError) {
      setActiveTab("results");
      setShowResultsTable(true);
    }
  }, [executionState.isComplete, executionState.hasError]);

  const getStatusIcon = (tab) => {
    if (tab === "execute") {
      if (executionState.isRunning)
        return <Clock className="h-4 w-4 text-blue-500 animate-spin ml-2" />;
      if (executionState.isComplete && executionState.hasError)
        return <XCircle className="h-4 w-4 text-red-500 ml-2" />;
      if (executionState.isComplete)
        return <CheckCircle2 className="h-4 w-4 text-green-500 ml-2" />;
    }
    if (tab === "results" && hasResults) {
      return <CheckCircle2 className="h-4 w-4 text-green-500 ml-2" />;
    }
    return null;
  };

  return (
    <div className="flex h-full w-full bg-muted/40 rounded-lg border overflow-hidden">
      <TooltipProvider delayDuration={150}>
        <ValidationSidebar
          categorizedTests={categorizedTests}
          isDiscovering={isDiscovering}
          discoveryError={discoveryError}
          selectedTests={parameters.tests || []}
          onSelectionChange={onParamChange}
          isCollapsed={isSidebarCollapsed}
        />
        <main className="flex-1 flex flex-col min-w-0 relative">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="absolute left-4 top-4 h-9 w-9 z-20"
                onClick={() => setIsSidebarCollapsed((v) => !v)}
              >
                {isSidebarCollapsed ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isSidebarCollapsed ? "Show" : "Hide"} Sidebar
            </TooltipContent>
          </Tooltip>
          <div className="flex-1 flex flex-col">
            <header className="flex h-16 items-center gap-4 border-b bg-background px-4 md:pl-20 md:px-6 sticky top-0 z-10">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 md:hidden"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="flex flex-col w-[280px] p-0"
                >
                  <div className="flex-1 overflow-y-auto">
                    <ValidationSidebar
                      categorizedTests={categorizedTests}
                      isDiscovering={isDiscovering}
                      discoveryError={discoveryError}
                      selectedTests={parameters.tests || []}
                      onSelectionChange={onParamChange}
                      isCollapsed={false}
                    />
                  </div>
                </SheetContent>
              </Sheet>
              <h1 className="font-semibold text-xl flex-1">
                {script.displayName}
              </h1>
              <div
                className="flex items-center gap-2"
                title={
                  wsContext?.isConnected
                    ? "WebSocket Connected"
                    : "WebSocket Disconnected"
                }
              >
                {wsContext?.isConnected ? (
                  <Wifi className="h-4 w-4 text-green-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-red-500" />
                )}
              </div>
              <Button onClick={handleRun} disabled={isRunDisabled}>
                <PlayCircle className="h-4 w-4 mr-2" />
                {executionState.isRunning ? "Running..." : "Run Validations"}
              </Button>
            </header>
            <div className="flex-1 overflow-y-auto p-4 md:p-8 md:pl-20">
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="config">
                    <Cog className="h-4 w-4 mr-2" />
                    Configure
                  </TabsTrigger>
                  <TabsTrigger value="execute">
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Execute {getStatusIcon("execute")}
                  </TabsTrigger>
                  <TabsTrigger value="results">
                    <Table2 className="h-4 w-4 mr-2" />
                    Results {getStatusIcon("results")}
                  </TabsTrigger>
                </TabsList>
                <div className="mt-6 bg-white p-6 rounded-lg border">
                  <TabsContent value="config" className="space-y-6">
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold">
                        Target & Authentication
                      </h3>
                      <p className="text-sm text-gray-600">
                        Provide device credentials and targeting information.
                      </p>
                    </div>
                    <DeviceTargetSelector
                      parameters={parameters}
                      onParamChange={onParamChange}
                    />
                    <div className="border-t border-slate-200" />
                    <DeviceAuthFields
                      parameters={parameters}
                      onParamChange={onParamChange}
                    />
                  </TabsContent>
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
                  <TabsContent value="results" className="space-y-6">
                    {hasResults ? (
                      <>
                        <div className="flex justify-between items-center p-4 bg-green-50 border border-green-200 rounded-lg">
                          <div>
                            <h3 className="text-lg font-semibold text-green-800">
                              Execution Completed
                            </h3>
                            <p className="text-sm text-green-700">
                              Validation results are available below.
                            </p>
                          </div>
                          <Button onClick={handleSave}>
                            <Save className="h-4 w-4 mr-2" />
                            Save Report
                          </Button>
                        </div>
                        {executionState.result?.results_by_host?.map(
                          (hostResult, hostIndex) => (
                            <div
                              key={`host-${hostIndex}`}
                              className="space-y-4"
                            >
                              {hostResult.test_results?.map(
                                (testResult, testIndex) => (
                                  <UniversalTableViewer
                                    key={`test-result-${hostIndex}-${testIndex}`}
                                    tableData={testResult}
                                  />
                                ),
                              )}
                            </div>
                          ),
                        )}
                      </>
                    ) : executionState.hasError ? (
                      <div className="text-center py-12 bg-red-50 border-red-200 rounded-lg">
                        <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-red-800">
                          Execution Failed
                        </h3>
                        <p className="text-red-700 mt-1">
                          {executionState.error || "An unknown error occurred."}
                        </p>
                      </div>
                    ) : (
                      <div className="text-center py-12 bg-gray-50 border-2 border-dashed rounded-lg">
                        <Table2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium">No Results Yet</h3>
                        <p className="text-gray-600">
                          Run one or more validations to see results here.
                        </p>
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
