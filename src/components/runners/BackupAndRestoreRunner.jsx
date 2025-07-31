// =========================================================================================
//
// FILE:               /src/components/runners/BackupAndRestoreRunner.jsx
//
// OVERVIEW:
//   This component serves as the primary user interface for the Juniper Backup and Restore
//   script. It provides a structured two-column layout, dynamically rendering the
//   appropriate form (`BackupForm` or `RestoreForm`) and managing the entire lifecycle
//   of a script execution, from validation to displaying final results.
//
// KEY FEATURES:
//   - Dynamic Form Rendering: Intelligently switches between the backup and restore UI
//     based on the 'command' parameter selected in the script options.
//   - Robust Form Validation: Implements comprehensive, real-time client-side validation.
//     The "Run Script" button is disabled until all required fields are complete.
//   - Enhanced Debugging Capabilities: Provides immediate user feedback via a tooltip
//     on the disabled button explaining what's missing, and logs detailed state changes
//     to the developer console for easy troubleshooting.
//   - Proactive Parameter Cleaning: Includes logic to prevent sending mutually exclusive
//     arguments (`hostname` vs. `inventory_file`) to the backend, avoiding script failures.
//   - Real-time Progress Visualization: Leverages the `useScriptRunnerStream` hook and
//     `useMemo` to efficiently process WebSocket events into meaningful UI metrics.
//
// DEPENDENCIES:
//   - React (useState, useMemo, useEffect)
//   - Child UI Components: `BackupForm`, `RestoreForm`, `ScriptOptionsRenderer`,
//     `RealTimeDisplay`, `DisplayResults`, `DebugDisplay`.
//   - Custom Hook: `useScriptRunnerStream` for all WebSocket and script lifecycle logic.
//   - Libraries: `lucide-react` for icons, `react-spinners` for loading animations.
//
// HOW-TO GUIDE:
//   This component is designed to be rendered by a parent runner component (e.g.,
//   `PythonScriptRunner.jsx`). The parent is responsible for providing the `script`
//   definition, the overall `parameters` state object, the `onParamChange` handler, and
//   the `wsContext` (WebSocket context). This component then manages its own internal
//   UI logic and script execution flow.
//
// =========================================================================================

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


// =========================================================================================
// SECTION 2: COMPONENT DEFINITION
// =========================================================================================
function BackupAndRestoreRunner({ script, parameters, onParamChange, wsContext }) {

  // =========================================================================================
  // SECTION 3: STATE & SCRIPT EXECUTION
  // =========================================================================================
  const scriptRunner = useScriptRunnerStream(wsContext);

  /**
   * Triggers the script run after PREVENTING the default form submission behavior.
   * @param {React.MouseEvent} event - The click event from the button.
   */
  // ========== START OF FIX ==========
  const handleRun = async (event) => {
    // This line prevents the browser's default behavior of reloading the page.
    if (event) event.preventDefault();
  // ========== END OF FIX ==========

    scriptRunner.resetState();
    const runParameters = { ...parameters };

    // Clean parameters to avoid sending mutually exclusive arguments.
    if (runParameters.inventory_file) {
      delete runParameters.hostname;
    } else {
      delete runParameters.inventory_file;
    }
    if (!runParameters.command) {
        runParameters.command = 'backup';
    }

    await scriptRunner.runScript({
      scriptId: script.id,
      parameters: runParameters,
    });
  };

  // =========================================================================================
  // SECTION 4: FORM VALIDATION & DEBUGGING
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
    return ''; // Form is valid.
  };

  const disabledReason = getDisabledReason();
  const isButtonDisabled = disabledReason !== '';

  useEffect(() => {
    console.log(
      `[DEBUG][BackupAndRestoreRunner] Button state changed. Is Disabled: ${isButtonDisabled}. Reason: '${disabledReason || 'Form is valid'}'`
    );
  }, [isButtonDisabled, parameters]);


  // =========================================================================================
  // SECTION 5: REAL-TIME PROGRESS CALCULATION
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
      currentStep = scriptRunner.error ? 'Operation failed. Please review the error logs.' : 'Operation completed successfully.';
    }

    return { totalSteps, completedSteps, progressPercentage, currentStep };
  }, [scriptRunner.progressEvents, scriptRunner.isComplete, scriptRunner.error, scriptRunner.isRunning]);


  // =========================================================================================
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
    <div className="flex flex-col md:flex-row gap-8">
      {/* Sidebar */}
      <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
        <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
            <Layers size={18} className="mr-2 text-slate-500" /> Script Options
          </h3>
          <ScriptOptionsRenderer script={script} parameters={parameters} onParamChange={onParamChange} />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 space-y-8">
        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
          <header className="border-b border-slate-200 pb-4 mb-6">
            <h2 className="text-2xl font-bold text-slate-800">{script.displayName}</h2>
            <p className="mt-1 text-slate-600">{script.description}</p>
          </header>

          <div className="space-y-6">
            {parameters.command === 'restore' ? (
              <RestoreForm parameters={parameters} onParamChange={onParamChange} />
            ) : (
              <BackupForm parameters={parameters} onParamChange={onParamChange} />
            )}
          </div>

          <div className="mt-8 border-t pt-6">
            {/* ========== START OF FIX ========== */}
            <button
              type="button"
              // Pass the event object 'e' to the handler.
              onClick={(e) => handleRun(e)}
              disabled={isButtonDisabled}
              title={disabledReason}
              className="w-full flex items-center justify-center p-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
            >
            {/* ========== END OF FIX ========== */}
              {scriptRunner.isRunning
                ? <PulseLoader color="#fff" size={8} />
                : <><PlayCircle size={20} className="mr-2" /> Run Script</>
              }
            </button>
          </div>
        </div>

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
