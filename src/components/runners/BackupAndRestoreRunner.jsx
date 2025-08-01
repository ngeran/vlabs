// =========================================================================================
//
// COMPONENT:          BackupAndRestoreRunner.jsx
// FILE:               /src/components/runners/BackupAndRestoreRunner.jsx
//
// OVERVIEW:
//   This component is the specialized UI for the Backup and Restore script. It has been
//   refactored to use the new, centralized Button component and to correctly consume
//   the WebSocket context for script execution.
//
// KEY FEATURES:
//   - Modern UI: Utilizes the Shadcn-based Button component for a clean,
//     modern user interface with a built-in loading state.
//   - Correct Context Consumption: Properly retrieves the WebSocket context and passes
//     it to the `useScriptRunnerStream` hook, enabling script execution.
//   - Self-Contained Logic: Manages its own `useScriptRunnerStream` hook, keeping
//     all execution state localized.
//   - Memoized for Performance: Wrapped in `React.memo` to prevent unnecessary
//     re-renders, which is critical for application stability.
//
// DEPENDENCIES:
//   - Custom Hooks: `useScriptRunnerStream`.
//   - UI Components: `BackupForm`, `RestoreForm`, and the shared `Button`.
//
// =========================================================================================

// SECTION 1: IMPORTS & CONFIGURATION
// ------------------------------------------------------------------------------------
import React, { useMemo, useEffect, memo } from 'react';
import { PlayCircle, Layers } from 'lucide-react';

// --- UI Component Imports ---
import BackupForm from '../forms/BackupForm.jsx';
// ========== START OF FIX ==========
// Corrected the typo in the import path for RestoreForm.
import RestoreForm from '../forms/RestoreForm.jsx';
// ========== END OF FIX ==========
import ScriptOptionsRenderer from '../ScriptOptionsRenderer.jsx';
import RealTimeDisplay from '../RealTimeProgress/RealTimeDisplay.jsx';
import DisplayResults from '../shared/DisplayResults.jsx';
import DebugDisplay from '../shared/DebugDisplay';
import { Button } from '../shared/Button.jsx';

// --- Custom Hook & Context Imports ---
// This assumes your original, reverted hook is in this location.
// If you implemented the context solution, this would be from '../contexts/WebSocketContext'
import { useWebSocket } from '../../hooks/useWebSocket.jsx';
import { useScriptRunnerStream } from '../../hooks/useWebSocket.jsx';

// SECTION 2: MAIN COMPONENT DEFINITION
// ------------------------------------------------------------------------------------
function BackupAndRestoreRunner({ script, parameters, onParamChange }) {
  // --- State Management & Context Consumption ---
  // 1. Get the WebSocket context directly inside the component.
  const wsContext = useWebSocket();

  // 2. Pass the retrieved context to the script runner hook.
  const scriptRunner = useScriptRunnerStream(wsContext);


  // --- Event Handlers & Logic ---
  const handleRun = async (event) => {
    if (event) event.preventDefault();
    scriptRunner.resetState();
    const runParameters = { ...parameters };
    if (runParameters.inventory_file) delete runParameters.hostname;
    else delete runParameters.inventory_file;
    if (!runParameters.command) runParameters.command = 'backup';
    await scriptRunner.runScript({ scriptId: script.id, parameters: runParameters });
  };

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
    return '';
  };

  const disabledReason = getDisabledReason();
  const isButtonDisabled = disabledReason !== '';

  // --- Memoized Derived State ---
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

  // --- Render Props ---
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

  // SECTION 3: RENDER METHOD
  // ------------------------------------------------------------------------------------
  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Sidebar for script-level options */}
      <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
        <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
            <Layers size={18} className="mr-2 text-slate-500" /> Script Options
          </h3>
          <ScriptOptionsRenderer script={script} parameters={parameters} onParamChange={onParamChange} />
        </div>
      </aside>

      {/* Main content area for forms and results */}
      <main className="flex-1 space-y-8">
        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
          <header className="border-b border-slate-200 pb-4 mb-6">
            <h2 className="text-2xl font-bold text-slate-800">{script.displayName}</h2>
            <p className="mt-1 text-slate-600">{script.description}</p>
          </header>
          <div className="space-y-6">
            {parameters.command === 'restore'
              ? <RestoreForm parameters={parameters} onParamChange={onParamChange} />
              : <BackupForm parameters={parameters} onParamChange={onParamChange} />
            }
          </div>
          <div className="mt-8 border-t pt-6">
            <Button
              type="button"
              onClick={handleRun}
              disabled={isButtonDisabled}
              isLoading={scriptRunner.isRunning}
              Icon={PlayCircle}
              className="w-full font-bold"
              title={disabledReason}
            >
              {scriptRunner.isRunning ? 'Running Script...' : 'Run Script'}
            </Button>
          </div>
        </div>

        {(scriptRunner.isRunning || scriptRunner.isComplete) && <RealTimeDisplay {...realTimeProps} />}
        {scriptRunner.isComplete && !scriptRunner.error && script.capabilities?.resultsDisplay && (
          <DisplayResults result={scriptRunner.finalResult} {...script.resultsDisplay} />
        )}
        <DebugDisplay isVisible={script?.capabilities?.enableDebug} progressEvents={scriptRunner.progressEvents} />
      </main>
    </div>
  );
}

// Export the memoized version of the component for performance.
export default memo(BackupAndRestoreRunner);
