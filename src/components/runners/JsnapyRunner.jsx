// =========================================================================================
//
// COMPONENT:          JsnapyRunner.jsx
// FILE:               /src/components/runners/JsnapyRunner.jsx
//
// OVERVIEW:
//   This component provides the specialized UI for the JSNAPy Runner script, integrating
//   with the centralized WebSocket architecture.
//
// KEY FIXES IMPLEMENTED:
//   - Delegated Output Rendering: This component no longer handles the logic for displaying
//     progress or results directly. It now passes all relevant state (isRunning, isComplete,
//     progressEvents, finalResult, etc.) to the `ScriptOutputDisplay` component.
//     This centralizes the output UI logic and ensures a consistent experience.
//
// DEPENDENCIES:
//   - Custom Hooks: `useWebSocket`, `useScriptRunnerStream`.
//   - UI Components: `JSNAPyForm`, `ScriptOptionsRenderer`, `ScriptOutputDisplay`,
//     and the shared `Button`.
//
// =========================================================================================

// ====================================================================================
// SECTION 1: IMPORTS & CONFIGURATION
// ====================================================================================
import React, { memo } from 'react';
import { PlayCircle, Layers } from 'lucide-react';

// --- UI Component Imports ---
import JSNAPyForm from '../forms/JSNAPyForm.jsx';
import ScriptOptionsRenderer from '../ScriptOptionsRenderer.jsx';
import ScriptOutputDisplay from '../shared/ScriptOutputDisplay.jsx'; // Use the enhanced, centralized display
import { Button } from '../shared/Button.jsx';

// --- Custom Hook Imports ---
import { useWebSocket, useScriptRunnerStream } from '../../hooks/useWebSocket.jsx';

// ====================================================================================
// SECTION 2: MAIN COMPONENT DEFINITION
// ====================================================================================
function JsnapyRunner({ script, parameters, onParamChange }) {
  // ------------------------------------------------------------------------------------
  // Subsection 2.1: State Management & Context Consumption
  // ------------------------------------------------------------------------------------
  const wsContext = useWebSocket();
  const scriptRunner = useScriptRunnerStream(wsContext);

  // ------------------------------------------------------------------------------------
  // Subsection 2.2: Event Handlers & Business Logic
  // ------------------------------------------------------------------------------------
  const handleRun = async (event) => {
    if (event) event.preventDefault();
    scriptRunner.resetState();

    const runParameters = {
      ...parameters,
      tests: Array.isArray(parameters.tests) ? parameters.tests.join(',') : parameters.tests,
    };

    try {
      if (wsContext && wsContext.websocketService) {
        await wsContext.websocketService.runScript({
          scriptId: script.id,
          parameters: runParameters
        });
      } else {
        throw new Error("WebSocket service is not ready.");
      }
    } catch (error) {
      console.error("Failed to initiate the JSNAPy script:", error);
      alert(`Error starting script: ${error.message}`);
    }
  };

  const getDisabledReason = () => {
    if (scriptRunner.isRunning) return 'A script is currently running.';
    if (!parameters.username || !parameters.password) return 'Username and password are required.';
    if (!parameters.hostname && !parameters.inventory_file) return 'A target host or inventory file is required.';
    if (!parameters.tests || parameters.tests.length === 0) return 'At least one JSNAPy test must be selected.';
    return '';
  };

  const disabledReason = getDisabledReason();
  const isButtonDisabled = disabledReason !== '';

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
            <JSNAPyForm parameters={parameters} onParamChange={onParamChange} />
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
              {scriptRunner.isRunning ? 'Running JSNAPy...' : 'Run JSNAPy'}
            </Button>
          </div>
        </div>

        {/*
          FIX: All output rendering is now delegated to the ScriptOutputDisplay component.
          We pass the entire script object and all relevant state from the hook.
          This component will internally handle progress, results, errors, and the save button.
        */}
        {(scriptRunner.isRunning || scriptRunner.isComplete) && (
          <ScriptOutputDisplay
            script={script}
            isRunning={scriptRunner.isRunning}
            isComplete={scriptRunner.isComplete}
            progressEvents={scriptRunner.progressEvents}
            finalResult={scriptRunner.finalResult}
            error={scriptRunner.error}
            showDebug={script?.capabilities?.enableDebug}
          />
        )}
      </main>
    </div>
  );
}

export default memo(JsnapyRunner);
