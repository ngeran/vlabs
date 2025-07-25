// =========================================================================================
// FILE: src/components/runners/CodeUpgradeRunner.jsx
//
// DESCRIPTION:
//   A specialized UI component that serves as the front-end for the "Code Upgrade" script.
//   It orchestrates the user interaction for selecting a software image and target device,
//   executing the upgrade, and displaying real-time progress.
//
// OVERVIEW:
//   This component provides a structured two-column layout. The left sidebar, rendered by
//   ScriptOptionsRenderer, contains the custom MultiLevelSelect component for choosing a
//   firmware image. The main content area contains fields for device credentials and the
//   master "Run Script" button.
//
//   It utilizes the custom `useScriptRunnerStream` hook to manage all WebSocket
//   communication with the backend, handling script execution and receiving live progress
//   events. These events are processed to calculate metrics (e.g., percentage complete)
//   that power the RealTimeDisplay component, providing a rich user experience.
//
// DEPENDENCIES:
//   - react: For building the UI and managing component state (useMemo).
//   - lucide-react: For UI icons (PlayCircle, Layers).
//   - react-spinners: For loading animations (PulseLoader).
//   - ScriptOptionsRenderer.jsx: Renders the sidebar content based on script metadata.
//   - RealTimeDisplay.jsx: Displays live progress updates from the script.
//   - DisplayResults.jsx: Shows the final structured output upon completion.
//   - DebugDisplay.jsx: Provides a collapsible view of raw progress events for debugging.
//   - DeviceAuthFields.jsx: Renders standard username, password, and hostname inputs.
//   - useScriptRunnerStream (hook): Manages WebSocket connection and script lifecycle.
//
// HOW TO USE:
//   This component is not used directly. It is dynamically rendered by PythonScriptRunner.jsx.
//   The integration process is as follows:
//
//   1. Update the script's metadata file (e.g., code_upgrade/metadata.yml):
//      runnerComponent: 'CodeUpgradeRunner'
//
//   2. Import this component into `PythonScriptRunner.jsx`:
//      import CodeUpgradeRunner from './runners/CodeUpgradeRunner.jsx';
//
//   3. Add the component to the `RUNNER_MAP` in `PythonScriptRunner.jsx`:
//      const RUNNER_MAP = {
//        // ... other runners
//        CodeUpgradeRunner,
//      };
// =========================================================================================

// =========================================================================================
// FILE: src/components/runners/CodeUpgradeRunner.jsx
//
// DESCRIPTION:
//   A specialized UI component that serves as the front-end for the "Code Upgrade" script.
//   It orchestrates user interaction for selecting a software image and target device(s),
//   executing the upgrade, and displaying real-time progress.
//
// REFACTOR HIGHLIGHTS (v2.0):
//   - Replaced the generic `ScriptOptionsRenderer` with the specialized `SelectImageRelease`
//     component in the sidebar.
//   - The new selection component is driven by a structured `SoftwareVersions.yml` file,
//     providing a guided workflow: Vendor -> Platform -> Release -> Image.
//   - This change decouples the UI from hardcoded data and makes the selection process
//     more robust and user-friendly.
// =========================================================================================

// =========================================================================================
// SECTION 1: IMPORTS & DEPENDENCIES
// =========================================================================================
import React, { useMemo } from 'react';
import { PlayCircle, Layers } from 'lucide-react';
import PulseLoader from 'react-spinners/PulseLoader';

// Import the new, specialized component for image selection.
import SelectImageRelease from '../forms/SelectImageRelease.jsx';

// Import shared, reusable components for UI structure and functionality.
import RealTimeDisplay from '../RealTimeProgress/RealTimeDisplay.jsx';
import DisplayResults from '../shared/DisplayResults.jsx';
import DebugDisplay from '../shared/DebugDisplay';
import DeviceTargetSelector from '../shared/DeviceTargetSelector.jsx';
import DeviceAuthFields from '../shared/DeviceAuthFields.jsx'; // Standard host/credential fields

// Import the core custom hook for script execution via WebSockets.
import { useScriptRunnerStream } from '../../hooks/useWebSocket.jsx';

// =========================================================================================
// SECTION 2: COMPONENT DEFINITION
// =========================================================================================
/**
 * Orchestrates the UI for the Code Upgrade script.
 * @param {object} props - Component props passed down from PythonScriptRunner.
 * @param {object} props.script - The metadata object for the Code Upgrade script.
 * @param {object} props.parameters - The current state of all script parameters.
 * @param {function} props.onParamChange - Callback to update parameters in the parent state.
 * @param {object} props.wsContext - The WebSocket context for communication.
 * @returns {JSX.Element} The rendered component for the Code Upgrade tool.
 */
function CodeUpgradeRunner({ script, parameters, onParamChange, wsContext }) {

  // =========================================================================================
  // SECTION 3: STATE & SCRIPT EXECUTION
  // =========================================================================================
  const scriptRunner = useScriptRunnerStream(wsContext);

  const handleRun = async () => {
    scriptRunner.resetState();
    await scriptRunner.runScript({
      scriptId: script.id,
      parameters: parameters, // Pass all current parameters (including those from SelectImageRelease)
    });
  };

  // =========================================================================================
  // SECTION 4: REAL-TIME PROGRESS CALCULATION
  // =========================================================================================
  const progressMetrics = useMemo(() => {
    // This logic remains the same, processing events from the backend.
    const events = scriptRunner.progressEvents || [];
    if (events.length === 0) {
      return { totalSteps: 0, completedSteps: 0, progressPercentage: 0, currentStep: 'Waiting to start...' };
    }
    const operationStartEvent = events.find(e => e.event_type === 'OPERATION_START');
    const totalSteps = operationStartEvent?.data?.total_steps || 8;
    const completedStepEvents = events.filter(e => e.event_type === 'STEP_COMPLETE' && e.data?.status === 'COMPLETED');
    const completedSteps = completedStepEvents.length;
    const progressPercentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    const lastStepStartEvent = [...events].reverse().find(e => e.event_type === 'STEP_START');
    const currentStep = lastStepStartEvent ? lastStepStartEvent.message : 'Initializing...';
    return { totalSteps, completedSteps, progressPercentage, currentStep };
  }, [scriptRunner.progressEvents]);

  // =========================================================================================
  // SECTION 5: COMPONENT RENDERING & LAYOUT
  // =========================================================================================
  const realTimeProps = {
    isActive: scriptRunner.isRunning,
    isRunning: scriptRunner.isRunning,
    isComplete: scriptRunner.isComplete,
    hasError: !!scriptRunner.error,
    progress: scriptRunner.progressEvents,
    result: scriptRunner.finalResult,
    error: scriptRunner.error,
    canReset: !scriptRunner.isRunning && (scriptRunner.isComplete || !!scriptRunner.error),
    onReset: scriptRunner.resetState,
    // Pass calculated metrics to the display
    totalSteps: progressMetrics.totalSteps,
    completedSteps: progressMetrics.completedSteps,
    progressPercentage: progressMetrics.progressPercentage,
    currentStep: progressMetrics.currentStep,
  };

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* 5.1: Sidebar - Now uses the specialized SelectImageRelease component */}
      <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
        <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
            <Layers size={18} className="mr-2 text-slate-500" /> Script Options
          </h3>
          {/* REFACTOR: The generic renderer is replaced with our specific component. */}
          <SelectImageRelease
            parameters={parameters}
            onParamChange={onParamChange}
          />
        </div>
      </aside>

      {/* 5.2: Main Content */}
      <main className="flex-1 space-y-8">
        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
          <header className="border-b border-slate-200 pb-4 mb-6">
            <h2 className="text-2xl font-bold text-slate-800">{script.displayName}</h2>
            <p className="mt-1 text-slate-600">{script.description}</p>
          </header>

          {/* Renders Hostname, Username, and Password fields */}
          <div className="space-y-6">
             {/* It provides the --hostname parameter */}
            <DeviceTargetSelector
              parameters={parameters}
              onParamChange={onParamChange}
              title={script.targetSelector?.title || "Target Devices"}
              description={script.targetSelector?.description || "Select devices to upgrade"}
            />
            {/* This component provides --username and --password */}
            <DeviceAuthFields
              parameters={parameters}
              onParamChange={onParamChange}
              script={script}
            />
          </div>

          {/* Execution button */}
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
        {(scriptRunner.isRunning || scriptRunner.isComplete || scriptRunner.error) && (
          <RealTimeDisplay {...realTimeProps} />
        )}

        {scriptRunner.isComplete && !scriptRunner.error && script.capabilities?.resultsDisplay && (
          <DisplayResults
            result={scriptRunner.finalResult}
            title={script.resultsDisplay?.title}
            description={script.resultsDisplay?.description}
          />
        )}

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
