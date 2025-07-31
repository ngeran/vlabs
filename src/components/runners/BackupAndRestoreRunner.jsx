// =========================================================================================
//
// COMPONENT:          BackupAndRestoreRunner.jsx
// FILE:               /src/components/runners/BackupAndRestoreRunner.jsx
//
// OVERVIEW:
//   This component serves as the primary user interface for the Juniper Backup and Restore
//   script. It provides a structured two-column layout, dynamically rendering the
//   appropriate form (`BackupForm` or `RestoreForm`) and managing the entire lifecycle
//   of a script execution.
//
// KEY FEATURES:
//   - Two-Column Layout: Features a sticky sidebar for script-level options and a main
//     content area for command-specific forms and results.
//   - Dynamic Form Rendering: Switches between backup/restore UI based on parameters.
//   - Robust Form Validation: Implements client-side validation and disables the run
//     button until all requirements are met, providing clear user feedback.
//   - Prevents Page Reloads: Explicitly calls `event.preventDefault()` on button click
//     to stop default browser form submission behavior.
//   - Real-time Progress Visualization: Leverages the `useScriptRunnerStream` hook to
//     efficiently process and display live progress from the backend.
//
// DEPENDENCIES:
//   - React Core: (useMemo, useEffect).
//   - Child UI Components: `BackupForm`, `RestoreForm`, `ScriptOptionsRenderer`,
//     `RealTimeDisplay`, `DisplayResults`.
//   - Custom Hook: `useScriptRunnerStream` for WebSocket and script lifecycle logic.
//
// =========================================================================================

// SECTION 1: IMPORTS & DEPENDENCIES
// =========================================================================================
import React, { useMemo, useEffect } from 'react';
import { PlayCircle, Layers } from 'lucide-react';
import PulseLoader from 'react-spinners/PulseLoader';

import BackupForm from '../forms/BackupForm.jsx';
import RestoreForm from '../forms/RestoreForm.jsx';
import ScriptOptionsRenderer from '../ScriptOptionsRenderer.jsx';
import RealTimeDisplay from '../RealTimeProgress/RealTimeDisplay.jsx';
import DisplayResults from '../shared/DisplayResults.jsx';
import DebugDisplay from '../shared/DebugDisplay';
import { useScriptRunnerStream } from '../../hooks/useWebSocket.jsx';


// SECTION 2: COMPONENT DEFINITION
// =========================================================================================
function BackupAndRestoreRunner({ script, parameters, onParamChange, wsContext }) {

  // SECTION 3: STATE & SCRIPT EXECUTION
  // =========================================================================================
  const scriptRunner = useScriptRunnerStream(wsContext);

  /**
   * Triggers the script run after PREVENTING the default form submission behavior.
   * @param {React.MouseEvent} event - The click event from the button.
   */
  const handleRun = async (event) => {
    // This line prevents the browser's default behavior of reloading the page
    // when a button inside a form-like structure is clicked.
    if (event) event.preventDefault();

    scriptRunner.resetState();
    const runParameters = { ...parameters };

    // Clean parameters to avoid sending mutually exclusive arguments.
    if (runParameters.inventory_file) delete runParameters.hostname;
    else delete runParameters.inventory_file;
    if (!runParameters.command) runParameters.command = 'backup';

    await scriptRunner.runScript({
      scriptId: script.id,
      parameters: runParameters,
    });
  };


  // SECTION 4: FORM VALIDATION
  // =========================================================================================
  const getDisabledReason = () => {
    if (scriptRunner.isRunning) return 'A script is currently running.';
    if (!parameters.username || !parameters.password) return 'Username and password are required.';
    if (parameters.command === 'backup' && !parameters.hostname && !parameters.inventory_file) {
      return 'A target host or inventory file must be selected for the backup operation.';
    }
    if (parameters.command === 'restore') {
      if (!parameters.restore_hostname) return 'A target device must be selected for the restore operation.';
      if (!parameters.backup_file) return 'A backup file must be selected for the restore operation.';
    }
    return ''; // An empty string means the form is valid.
  };

  const disabledReason = getDisabledReason();
  const isButtonDisabled = disabledReason !== '';


  // SECTION 5: REAL-TIME PROGRESS CALCULATION (Memoized)
  // =========================================================================================
  const progressMetrics = useMemo(() => {
    const events = scriptRunner.progressEvents || [];
    if (!scriptRunner.isRunning && events.length === 0) {
      return { totalSteps: 0, completedSteps: 0, progressPercentage: 0, currentStep: 'Waiting to start...' };
    }
    const operationStartEvent = events.find(e => e.event_type === 'OPERATION_START');
    const totalSteps = operationStartEvent?.data?.total_steps || 0;
    const completedSteps = events.filter(e => e.event_type === 'STEP_COMPLETE').length;
    const progressPercentage = totalSteps > 0 ? Math.min(100, Math.round((completedSteps / totalSteps) * 100)) : 0;
    let currentStep = [...events].reverse().find(e => e.event_type === 'STEP_START')?.message || 'Initializing...';
    if (scriptRunner.isComplete) {
      currentStep = scriptRunner.error ? 'Operation failed. Please review logs.' : 'Operation completed successfully.';
    }
    return { totalSteps, completedSteps, progressPercentage, currentStep };
  }, [scriptRunner.progressEvents, scriptRunner.isComplete, scriptRunner.error, scriptRunner.isRunning]);


  // SECTION 6: COMPONENT RENDERING & LAYOUT
  // =========================================================================================
  const realTimeProps = {
    isRunning: scriptRunner.isRunning,
    isComplete: scriptRunner.isComplete,
    hasError: !!scriptRunner.error,
    progress: scriptRunner.progressEvents,
    result: scriptRunner.finalResult,
    error: scriptRunner.error,
    onReset: scriptRunner.resetState,
    ...progressMetrics,
  };

  return (
    // Establishes the two-column layout for medium screens and up.
    <div className="flex flex-col md:flex-row gap-8">

      {/* ========== START OF FIX ========== */}
      {/* Sidebar for Global Script Options. It is sticky on larger screens. */}
      <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
        <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
            <Layers size={18} className="mr-2 text-slate-500" /> Script Options
          </h3>
          {/* This component renders the dropdowns for 'command', 'type', etc. */}
          <ScriptOptionsRenderer
            script={script}
            parameters={parameters}
            onParamChange={onParamChange}
          />
        </div>
      </aside>
      {/* ========== END OF FIX ========== */}


      {/* Main Content Area */}
      <main className="flex-1 space-y-8">
        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
          <header className="border-b border-slate-200 pb-4 mb-6">
            <h2 className="text-2xl font-bold text-slate-800">{script.displayName}</h2>
            <p className="mt-1 text-slate-600">{script.description}</p>
          </header>

          <div className="space-y-6">
            {/* Dynamically render the correct form based on the selected command */}
            {parameters.command === 'restore'
              ? <RestoreForm parameters={parameters} onParamChange={onParamChange} />
              : <BackupForm parameters={parameters} onParamChange={onParamChange} />
            }
          </div>

          <div className="mt-8 border-t pt-6">
            <button
              type="button"
              onClick={(e) => handleRun(e)}
              disabled={isButtonDisabled}
              title={disabledReason}
              className="w-full flex items-center justify-center p-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
            >
              {scriptRunner.isRunning
                ? <PulseLoader color="#fff" size={8} />
                : <><PlayCircle size={20} className="mr-2" /> Run Script</>
              }
            </button>
          </div>
        </div>

        {/* These components only appear when a script is running or has completed */}
        {(scriptRunner.isRunning || scriptRunner.isComplete) && (
          <RealTimeDisplay {...realTimeProps} />
        )}

        {scriptRunner.isComplete && !scriptRunner.error && script.capabilities?.resultsDisplay && (
          <DisplayResults result={scriptRunner.finalResult} {...script.resultsDisplay} />
        )}

        <DebugDisplay isVisible={script?.capabilities?.enableDebug} progressEvents={scriptRunner.progressEvents} />
      </main>
    </div>
  );
}

export default BackupAndRestoreRunner;
