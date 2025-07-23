// =========================================================================================
// FILE: /src/components/runners/BackupAndRestoreRunner.jsx
//
// OVERVIEW:
//   This component serves as the main user interface for the Juniper Backup and Restore
//   script. It provides a structured layout with script options in a sidebar and the main
//   interaction area in a content panel. The component dynamically renders either a
//   BackupForm or a RestoreForm based on user selection.
//
//   It utilizes a custom hook (`useScriptRunnerStream`) to manage the real-time
//   communication with the backend over WebSockets, handle script execution, and
//   receive progress updates. A key feature of this component is its ability to process
//   raw progress events and calculate meaningful metrics (e.g., percentage complete,
//   number of completed steps) to power the RealTimeDisplay component.
//
// DEPENDENCIES:
//   - React and its `useMemo` hook.
//   - UI components: `BackupForm`, `RestoreForm`, `ScriptOptionsRenderer`, `RealTimeDisplay`.
//   - Custom Hook: `useScriptRunnerStream` (from /hooks/useWebSocket.jsx) for script execution logic.
//   - Libraries: `lucide-react` for icons, `react-spinners` for loading animations.
// =========================================================================================

// =========================================================================================
// SECTION 1: IMPORTS & DEPENDENCIES
// =========================================================================================
import React, { useMemo } from 'react';
import { PlayCircle, Layers } from 'lucide-react';
import PulseLoader from 'react-spinners/PulseLoader';

// Import the specific form UIs for backup and restore operations.
import BackupForm from '../forms/BackupForm.jsx';
import RestoreForm from '../forms/RestoreForm.jsx';

// Import shared, reusable components for rendering options and progress.
import ScriptOptionsRenderer from '../ScriptOptionsRenderer.jsx';
import RealTimeDisplay from '../RealTimeProgress/RealTimeDisplay.jsx';
import DisplayResults from '../shared/DisplayResults.jsx';
import { useScriptRunnerStream } from '../../hooks/useWebSocket.jsx';
import DebugDisplay from '../shared/DebugDisplay';

// =========================================================================================
// SECTION 2: COMPONENT DEFINITION
// =========================================================================================
function BackupAndRestoreRunner({ script, parameters, onParamChange, wsContext }) {

  // =========================================================================================
  // SECTION 3: STATE & SCRIPT EXECUTION
  // Description: Manages the script's lifecycle, including state and execution trigger.
  // =========================================================================================

  // The `useScriptRunnerStream` hook abstracts all WebSocket logic. It provides:
  // - `runScript`: A function to start the script execution.
  // - `resetState`: A function to clear progress and results for a new run.
  // - State variables: `isRunning`, `isComplete`, `error`, `progressEvents`, `finalResult`.
  const scriptRunner = useScriptRunnerStream(wsContext);

  /**
   * Handles the "Run Script" button click. It prepares the parameters and initiates
   * the script run with the current script ID.
   */
  const handleRun = async () => {
    scriptRunner.resetState();

    // ============================================================================
    // CRITICAL FIX #1: The backend Python script uses a mutually exclusive
    // group for target selection (--hostname vs --inventory_file). To prevent
    // an 'exit code 2' error, we must ensure only one of these parameters is
    // sent to the backend.
    // ============================================================================
    const runParameters = { ...parameters };

    if (runParameters.inventory_file) {
      // If inventory_file is present, delete the hostname key to avoid conflict.
      delete runParameters.hostname;
    } else {
      // Otherwise, assume hostname is the target and delete the inventory_file key.
      delete runParameters.inventory_file;
    }

    // ============================================================================
    // CRITICAL FIX #2: The `command` argument ('backup' or 'restore') is required
    // by the Python script. If it's not present for any reason, we default it
    // to 'backup', matching the default UI form. This prevents a different
    // 'exit code 2' error related to missing required arguments.
    // ============================================================================
    if (!runParameters.command) {
        runParameters.command = 'backup';
    }

    await scriptRunner.runScript({
      scriptId: script.id,
      // Use the newly cleaned and validated `runParameters` object for execution.
      parameters: runParameters,
    });
  };

  // =========================================================================================
  // SECTION 4: REAL-TIME PROGRESS CALCULATION
  // Description: Processes raw progress events from the WebSocket stream into structured
  //              metrics suitable for the RealTimeDisplay component.
  // =========================================================================================

  // `useMemo` is used to efficiently calculate progress metrics. The calculation only
  // re-runs when the `progressEvents` array changes, preventing unnecessary re-renders.
  const progressMetrics = useMemo(() => {
    const events = scriptRunner.progressEvents || [];
    if (events.length === 0) {
      return { totalSteps: 0, completedSteps: 0, progressPercentage: 0, currentStep: 'Waiting to start...' };
    }

    // Determine the total number of steps from the initial operation event.
    // Fallback to default steps if total_steps is missing or 0.
    const operationStartEvent = events.find(e => e.event_type === 'OPERATION_START');
    const totalSteps = operationStartEvent?.data?.total_steps || (parameters.command === 'restore' ? 5 : 4);

    // Count how many steps have successfully completed.
    const completedStepEvents = events.filter(
      e => e.event_type === 'STEP_COMPLETE' && (e.data?.status === 'COMPLETED' || e.level === 'SUCCESS')
    );
    const completedSteps = completedStepEvents.length;

    // Calculate the overall progress percentage.
    const progressPercentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    // Find the message from the most recent "STEP_START" event to show as the current status.
    const lastStepStartEvent = [...events].reverse().find(e => e.event_type === 'STEP_START');
    const currentStep = lastStepStartEvent ? lastStepStartEvent.message : 'Initializing...';

    return { totalSteps, completedSteps, progressPercentage, currentStep };
  }, [scriptRunner.progressEvents, parameters.command]);

  // =========================================================================================
  // SECTION 5: COMPONENT RENDERING & LAYOUT
  // Description: Defines the JSX structure of the component, including conditional rendering
  //              of forms and the real-time progress display.
  // =========================================================================================

  // This object aggregates all props needed by the RealTimeDisplay component,
  // including both state flags from the hook and the calculated metrics from `useMemo`.
  const realTimeProps = {
    isActive: scriptRunner.isRunning,
    isRunning: scriptRunner.isRunning,
    isComplete: scriptRunner.isComplete,
    hasError: !!scriptRunner.error,
    progress: scriptRunner.progressEvents, // Pass raw events for detailed logging if needed
    result: scriptRunner.finalResult,
    error: scriptRunner.error,
    canReset: !scriptRunner.isRunning && (scriptRunner.isComplete || !!scriptRunner.error),
    onReset: scriptRunner.resetState,
    // Pass the calculated metrics to drive the progress bar and step counts.
    totalSteps: progressMetrics.totalSteps,
    completedSteps: progressMetrics.completedSteps,
    progressPercentage: progressMetrics.progressPercentage,
    currentStep: progressMetrics.currentStep,
  };

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Sidebar: Displays script options. It's sticky for easy access on long pages. */}
      <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
        <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
            <Layers size={18} className="mr-2 text-slate-500" /> Script Options
          </h3>
          <ScriptOptionsRenderer script={script} parameters={parameters} onParamChange={onParamChange} />
        </div>
      </aside>

      {/* Main Content: Contains the primary interaction area for the script. */}
      <main className="flex-1 space-y-8">
        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
          <header className="border-b border-slate-200 pb-4 mb-6">
            <h2 className="text-2xl font-bold text-slate-800">{script.displayName}</h2>
            <p className="mt-1 text-slate-600">{script.description}</p>
          </header>

          <div className="space-y-6">
            {/* --- CORE LOGIC: Render the correct form based on the 'command' parameter --- */}
            {parameters.command === 'restore' ? (
              <RestoreForm parameters={parameters} onParamChange={onParamChange} />
            ) : (
              // Default to BackupForm if command is not 'restore' or is undefined.
              <BackupForm parameters={parameters} onParamChange={onParamChange} />
            )}
          </div>

          <div className="mt-8 border-t pt-6">
            <button
              type="button"
              onClick={handleRun}
              disabled={scriptRunner.isRunning}
              className="w-full flex items-center justify-center p-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition-colors"
            >
              {scriptRunner.isRunning
                ? <PulseLoader color="#fff" size={8} />
                : <><PlayCircle size={20} className="mr-2" /> Run Script</>
              }
            </button>
          </div>
        </div>

        {/* Conditionally render the RealTimeDisplay only when a script is running or has completed. */}
        {(scriptRunner.isRunning || scriptRunner.isComplete) && (
          <RealTimeDisplay {...realTimeProps} />
        )}

        {/* Display final results if the script is complete and the capability is enabled */}
        {scriptRunner.isComplete && script.capabilities?.resultsDisplay && (
          <DisplayResults
            result={scriptRunner.finalResult}
            title={script.resultsDisplay?.title}
            description={script.resultsDisplay?.description}
          />
        )}

        {/* Conditionally render the DebugDisplay if the capability is enabled */}
        <DebugDisplay
            isVisible={script?.capabilities?.enableDebug}
            progressEvents={scriptRunner.progressEvents}
            title="Debug Event Stream"
        />
      </main>
    </div>
  );
}

export default BackupAndRestoreRunner;
