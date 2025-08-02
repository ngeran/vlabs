// =========================================================================================
//
// COMPONENT:          BackupAndRestoreRunner.jsx (DEFINITIVELY FIXED)
// FILE:               /src/components/runners/BackupAndRestoreRunner.jsx
//
// OVERVIEW:
//   This component provides the specialized UI for the Backup and Restore script. It has
//   been fully refactored and corrected to integrate with the new, centralized WebSocket
//   architecture, ensuring stable and predictable script execution.
//
// KEY FIXES IMPLEMENTED:
//   - Correct API Invocation: The `handleRun` function now correctly calls the `runScript`
//     method on the `websocketService` instance (provided by the `wsContext`) instead of
//     the state hook (`scriptRunner`), resolving the `TypeError: scriptRunner.runScript is
//     not a function` crash.
//   - Robust Error Handling: Added a try/catch block around the API call in `handleRun` to
//     gracefully handle network errors or backend rejections when initiating a script run.
//   - Clear Separation of Concerns: The component now perfectly demonstrates the intended
//     pattern: the `websocketService` is used for ACTIONS (starting a script), and the
//     `useScriptRunnerStream` hook is used for STATE (reacting to the results of that action).
//
// DEPENDENCIES:
//   - Custom Hooks: `useWebSocket`, `useScriptRunnerStream`.
//   - UI Components: `BackupForm`, `RestoreForm`, and the shared `Button`.
//
// =========================================================================================

// ====================================================================================
// SECTION 1: IMPORTS & CONFIGURATION
// ====================================================================================
import React, { useMemo, memo } from 'react';
import { PlayCircle, Layers } from 'lucide-react';

// --- UI Component Imports ---
import BackupForm from '../forms/BackupForm.jsx';
import RestoreForm from '../forms/RestoreForm.jsx';
import ScriptOptionsRenderer from '../ScriptOptionsRenderer.jsx';
import RealTimeDisplay from '../RealTimeProgress/RealTimeDisplay.jsx';
import DisplayResults from '../shared/DisplayResults.jsx';
import DebugDisplay from '../shared/DebugDisplay';
import { Button } from '../shared/Button.jsx';

// --- Custom Hook Imports ---
import { useWebSocket, useScriptRunnerStream } from '../../hooks/useWebSocket.jsx';

// ====================================================================================
// SECTION 2: MAIN COMPONENT DEFINITION
// ====================================================================================
function BackupAndRestoreRunner({ script, parameters, onParamChange }) {
  // ------------------------------------------------------------------------------------
  // Subsection 2.1: State Management & Context Consumption
  // ------------------------------------------------------------------------------------
  // Establishes the connection to the WebSocket and gets the context.
  const wsContext = useWebSocket();
  // Subscribes to script-related WebSocket events and manages the UI state.
  const scriptRunner = useScriptRunnerStream(wsContext);

  // ------------------------------------------------------------------------------------
  // Subsection 2.2: Event Handlers & Business Logic
  // ------------------------------------------------------------------------------------

  /**
   * Initiates the script run. This is the primary action handler for the component.
   */
  const handleRun = async (event) => {
    if (event) event.preventDefault();

    // 1. Reset the state of the UI from any previous run.
    scriptRunner.resetState();

    // 2. Prepare the parameters for the backend, ensuring only one targeting
    //    method (hostname or inventory) is sent.
    const runParameters = { ...parameters };
    if (runParameters.inventory_file) {
      delete runParameters.hostname;
    } else {
      delete runParameters.inventory_file;
    }
    // Default to 'backup' if no command is specified.
    if (!runParameters.command) {
      runParameters.command = 'backup';
    }

    // --- ### THE FIX IS HERE ### ---
    // 3. Call `runScript` on the SERVICE instance, which is responsible for making the API call.
    try {
      if (wsContext && wsContext.websocketService) {
        // The `websocketService` contains the methods that actually communicate with the backend.
        await wsContext.websocketService.runScript({
          scriptId: script.id,
          parameters: runParameters
        });
      } else {
        // This is a defensive check in case the WebSocket context is not yet available.
        throw new Error("WebSocket service is not ready.");
      }
    } catch (error) {
      // Gracefully handle failures in the initial API call (e.g., network error, server down).
      console.error("Failed to initiate the backup/restore script:", error);
      // It's good practice to show this error to the user.
      alert(`Error starting script: ${error.message}`);
      // Optionally, you could set the scriptRunner's error state here as well.
    }
  };

  /**
   * A helper function to determine if the main action button should be disabled,
   * and provides a user-friendly tooltip message explaining why.
   */
  const getDisabledReason = () => {
    if (scriptRunner.isRunning) return 'A script is currently running.';
    if (!parameters.username || !parameters.password) return 'Username and password are required.';
    if (parameters.command === 'backup' && !parameters.hostname && !parameters.inventory_file) {
      return 'A target host or inventory file must be selected for the backup operation.';
    }
    if (parameters.command === 'restore') {
      if (!parameters.hostname) return 'A target device must be selected for the restore operation.';
      if (!parameters.backup_file) return 'A backup file must be selected for the restore operation.';
    }
    return ''; // Return an empty string if the button should be enabled.
  };

  const disabledReason = getDisabledReason();
  const isButtonDisabled = disabledReason !== '';

  // ------------------------------------------------------------------------------------
  // Subsection 2.3: Memoized Derived State for UI
  // ------------------------------------------------------------------------------------
  // This calculation is wrapped in `useMemo` to prevent re-running it on every single
  // component render, optimizing performance.
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

  // Props object to pass down to the real-time display component.
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

  // ====================================================================================
  // SECTION 3: JSX RENDER METHOD
  // ====================================================================================
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
            {/* Conditionally render the correct form based on the selected command */}
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

        {/* Conditionally render the results display */}
        {(scriptRunner.isRunning || scriptRunner.isComplete) && <RealTimeDisplay {...realTimeProps} />}
        {scriptRunner.isComplete && !scriptRunner.error && script.capabilities?.resultsDisplay && (
          <DisplayResults result={scriptRunner.finalResult} {...script.resultsDisplay} />
        )}
        <DebugDisplay isVisible={script?.capabilities?.enableDebug} progressEvents={scriptRunner.progressEvents} />
      </main>
    </div>
  );
}

// Export the memoized version of the component for performance optimization.
export default memo(BackupAndRestoreRunner);
