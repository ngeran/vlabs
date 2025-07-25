/**
 * =============================================================================
 * FILE:               src/components/runners/CodeUpgradeRunner.jsx
 *
 * DESCRIPTION:
 *   A specialized UI component that serves as the primary frontend for the
 *   "Device Code Upgrade" automation script.
 *
 * OVERVIEW:
 *   This component orchestrates the entire user experience for the code upgrade
 *   workflow. It presents a structured two-column layout:
 *   1.  A left sidebar for selecting the target software image via the
 *       `SelectImageRelease` component.
 *   2.  A main content area for specifying target devices (`DeviceTargetSelector`),
 *       entering credentials (`DeviceAuthFields`), and initiating the script.
 *
 *   It leverages the `useScriptRunnerStream` custom hook to manage all WebSocket
 *   communication with the backend, handling the script's execution lifecycle and
 *   processing real-time progress events to provide a rich, interactive status
 *   display to the user.
 *
 * DEPENDENCIES:
 *   - React (and hooks like `useMemo` for performance).
 *   - Lucide-react for UI icons.
 *   - react-spinners for loading animations.
 *   - Custom Components:
 *     - `SelectImageRelease.jsx`: For the multi-step image selection process.
 *     - `DeviceTargetSelector.jsx`: For choosing target hosts.
 *     - `DeviceAuthFields.jsx`: For username/password inputs.
 *     - `RealTimeDisplay.jsx`: For showing live progress and results.
 *     - `DisplayResults.jsx`: For showing the final formatted output.
 *     - `DebugDisplay.jsx`: For viewing raw event data for debugging.
 *   - Custom Hooks:
 *     - `useScriptRunnerStream`: Manages the entire script lifecycle via WebSockets.
 *
 * HOW IT INTEGRATES:
 *   This component is not used directly but is dynamically rendered by the main
 *   `PythonScriptRunner.jsx` component. The integration works as follows:
 *
 *   1.  The script's metadata file (`code_upgrade/metadata.yml`) must specify
 *       this component in its `runnerComponent` key:
 *       `runnerComponent: 'CodeUpgradeRunner'`
 *
 *   2.  This file (`CodeUpgradeRunner.jsx`) is imported into `PythonScriptRunner.jsx`.
 *
 *   3.  The component is added to the `RUNNER_MAP` in `PythonScriptRunner.jsx`,
 *       allowing the runner to dynamically select and render it when the
 *       "Code Upgrade" script is chosen from the UI.
 * =============================================================================
 */

// =============================================================================
// SECTION 1: IMPORTS & DEPENDENCIES
// -----------------------------------------------------------------------------
// All necessary libraries, hooks, and child components are imported here.
// =============================================================================
import React, { useMemo } from 'react';
import { PlayCircle } from 'lucide-react';
import PulseLoader from 'react-spinners/PulseLoader';

// Child components for UI composition
import SelectImageRelease from '../forms/SelectImageRelease.jsx';
import DeviceTargetSelector from '../shared/DeviceTargetSelector.jsx';
import DeviceAuthFields from '../shared/DeviceAuthFields.jsx';
import RealTimeDisplay from '../RealTimeProgress/RealTimeDisplay.jsx';
import DisplayResults from '../shared/DisplayResults.jsx';
import DebugDisplay from '../shared/DebugDisplay';

// Core custom hook for backend communication
import { useScriptRunnerStream } from '../../hooks/useWebSocket.jsx';

// =============================================================================
// SECTION 2: COMPONENT DEFINITION
// -----------------------------------------------------------------------------
// The main functional component for the Code Upgrade Runner.
// =============================================================================
/**
 * Orchestrates the user interface for the Device Code Upgrade script.
 * @param {object} props - Component props passed down from PythonScriptRunner.
 * @param {object} props.script - The metadata object for the Code Upgrade script.
 * @param {object} props.parameters - The current state of all script parameters.
 * @param {function} props.onParamChange - Callback to update parameters in the parent state.
 * @param {object} props.wsContext - The WebSocket context for communication.
 * @returns {JSX.Element} The rendered component for the Code Upgrade tool.
 */
function CodeUpgradeRunner({ script, parameters, onParamChange, wsContext }) {

  // ===========================================================================
  // SECTION 3: STATE MANAGEMENT & SCRIPT EXECUTION
  // ---------------------------------------------------------------------------
  // Manages the script's lifecycle via a custom hook and defines the primary
  // execution trigger.
  // ===========================================================================

  // The `useScriptRunnerStream` hook abstracts all WebSocket logic.
  const scriptRunner = useScriptRunnerStream(wsContext);

  /**
   * Handles the "Run Script" button click. It logs the parameters for debugging,
   * resets any previous state, and sends the execution command to the backend.
   */
  const handleRun = async () => {
    // Log the exact parameters being sent for easier debugging.
    console.groupCollapsed(`[CodeUpgradeRunner] Preparing to run script: ${script.id}`);
    console.log("Final parameters being sent to backend:");
    console.table(parameters);
    console.groupEnd();

    // Clear state from any previous run (progress, results, errors).
    scriptRunner.resetState();

    // Trigger the script execution via WebSocket.
    await scriptRunner.runScript({
      scriptId: script.id,
      parameters: parameters,
    });
  };

  // ===========================================================================
  // SECTION 4: REAL-TIME PROGRESS CALCULATION
  // ---------------------------------------------------------------------------
  // Processes raw progress events from the backend into structured, UI-friendly
  // metrics. `useMemo` prevents unnecessary recalculations on every render.
  // ===========================================================================

  const progressMetrics = useMemo(() => {
    const events = scriptRunner.progressEvents || [];
    if (events.length === 0) {
      return { totalSteps: 0, completedSteps: 0, progressPercentage: 0, currentStep: 'Waiting to start...' };
    }

    const operationStartEvent = events.find(e => e.event_type === 'OPERATION_START');
    const totalSteps = operationStartEvent?.data?.total_steps || 6;

    const completedStepEvents = events.filter(e => e.event_type === 'STEP_COMPLETE' && e.data?.status === 'COMPLETED');
    const completedSteps = completedStepEvents.length;

    const progressPercentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    const lastStepStartEvent = [...events].reverse().find(e => e.event_type === 'STEP_START');
    const currentStep = lastStepStartEvent ? lastStepStartEvent.message : 'Initializing...';

    return { totalSteps, completedSteps, progressPercentage, currentStep };
  }, [scriptRunner.progressEvents]);

  // ===========================================================================
  // SECTION 5: JSX RENDERING & UI LAYOUT
  // ---------------------------------------------------------------------------
  // Defines the component's visual structure, including the sidebar, main
  // content area, and conditionally rendered displays for progress and results.
  // ===========================================================================

  // Consolidate all props needed by RealTimeDisplay for cleaner JSX.
  const realTimeProps = {
      isActive: scriptRunner.isRunning || scriptRunner.isComplete || !!scriptRunner.error,
      isRunning: scriptRunner.isRunning,
      isComplete: scriptRunner.isComplete,
      hasError: !!scriptRunner.error,
      progress: scriptRunner.progressEvents,
      result: scriptRunner.finalResult,
      error: scriptRunner.error,
      canReset: !scriptRunner.isRunning && (scriptRunner.isComplete || !!scriptRunner.error),
      onReset: scriptRunner.resetState,
      totalSteps: progressMetrics.totalSteps,
      completedSteps: progressMetrics.completedSteps,
      progressPercentage: progressMetrics.progressPercentage,
      currentStep: progressMetrics.currentStep,
      latestMessage: scriptRunner.progressEvents?.slice(-1)[0],
  };

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* 5.1: Sidebar for Script Options */}
      <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
        <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
          {/* Provides --image-filename and --target-version */}
          <SelectImageRelease
            parameters={parameters}
            onParamChange={onParamChange}
          />
        </div>
      </aside>

      {/* 5.2: Main Content Area */}
      <main className="flex-1 space-y-8">
        {/* Panel for target selection, auth, and execution */}
        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
          <header className="border-b border-slate-200 pb-4 mb-6">
            <h2 className="text-2xl font-bold text-slate-800">{script.displayName}</h2>
            <p className="mt-1 text-slate-600">{script.description}</p>
          </header>

          <div className="space-y-6">
            {/* Provides --hostname */}
            <DeviceTargetSelector
              parameters={parameters}
              onParamChange={onParamChange}
              title={script.targetSelector?.title || "Target Devices"}
              description={script.targetSelector?.description || "Select devices to upgrade"}
            />
            {/* Provides --username and --password */}
            <DeviceAuthFields
              parameters={parameters}
              onParamChange={onParamChange}
              script={script}
            />
          </div>

          {/* Execution Button */}
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

        {/* 5.3: Conditional Displays */}

        {/* Real-time progress and final status display */}
        <RealTimeDisplay {...realTimeProps} />

        {/* Final results display (only on success) */}
        {scriptRunner.isComplete && !scriptRunner.error && script.capabilities?.resultsDisplay && (
          <DisplayResults
            result={scriptRunner.finalResult}
            title={script.resultsDisplay?.title}
            description={script.resultsDisplay?.description}
          />
        )}

        {/* Debug display for raw event stream */}
        <DebugDisplay
            isVisible={script?.capabilities?.enableDebug}
            progressEvents={scriptRunner.progressEvents}
            title="Debug Event Stream"
        />
      </main>
    </div>
  );
}

export default CodeUpgradeRunner;
