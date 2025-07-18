// src/components/GenericScriptRunner.jsx
import React from 'react';
import PulseLoader from 'react-spinners/PulseLoader';
import { PlayCircle, Layers } from 'lucide-react';

// ====================================================================================
// SECTION 1: IMPORTS
// ====================================================================================
// Import all the reusable UI components that a generic script might need.

import ErrorBoundary from './ErrorBoundary.jsx';
import DynamicScriptForm from './DynamicScriptForm.jsx';
import DeviceAuthFields from './DeviceAuthFields.jsx';
import FetchDynamicOptions from './FetchDynamicOptions.jsx';
import ScriptOptionsRenderer from './ScriptOptionsRenderer.jsx';
import RealTimeDisplay from './RealTimeProgress/RealTimeDisplay.jsx';

// Import the specific hook for handling real-time updates for standard scripts.
// TROUBLESHOOTING: Ensure this path is correct and points to your main WebSocket hook file.
import { useScriptRunnerStream } from '../hooks/useWebSocket.jsx';

// ====================================================================================
// SECTION 2: COMPONENT DEFINITION
// ====================================================================================
/**
 * Renders a complete UI for a standard script, including its options,
 * parameters, and a real-time output display.
 * @param {object} props - The component props.
 * @param {object} props.script - The configuration object for the script to render.
 * @param {object} props.parameters - The current state of parameters for the script form.
 * @param {function} props.onParamChange - Callback function to update parameters in the parent.
 * @param {object} props.wsContext - The WebSocket context for real-time communication.
 */
function GenericScriptRunner({ script, parameters, onParamChange, wsContext }) {

  // ====================================================================================
  // SECTION 3: HOOKS & STATE MANAGEMENT
  // ====================================================================================

  // This hook provides the real-time state (isRunning, progress, result, etc.) for this script.
  const scriptRunner = useScriptRunnerStream(wsContext);

  // ====================================================================================
  // SECTION 4: DEFENSIVE LOGIC & MEMOIZATION
  // ====================================================================================
  // This section contains logic to prevent crashes from malformed script metadata.

  // --- Main Defensive Guard Clause ---
  // TROUBLESHOOTING: If the `script` object is not passed correctly from PythonScriptRunner,
  // this check prevents the entire component from crashing by exiting early.
  if (!script) {
    return (
      <div className="text-center py-10 text-red-500 font-semibold">
        Error: GenericScriptRunner was rendered without a valid script configuration.
      </div>
    );
  }

  // Memoized calculation to determine which form fields to render in the main content area.
  // `useMemo` prevents this array from being recalculated on every render.
  const mainParametersToRender = React.useMemo(() => {
    // FIX: This is a critical defensive check. If a script in the metadata has no
    // `parameters` key, this prevents a crash by returning an empty array, which is safe.
    if (!script.parameters) {
      return [];
    }

    const specialHandledParams = ["hostname", "username", "password", "inventory_file"];
    return script.parameters.filter((param) => {
      // Exclude parameters that are handled by dedicated components (like DeviceAuthFields).
      if (specialHandledParams.includes(param.name) || param.layout === "sidebar") {
        return false;
      }
      // Handle conditionally rendered parameters.
      if (param.show_if) {
        return parameters[param.show_if.name] === param.show_if.value;
      }
      return true;
    });
  }, [script, parameters]);


  // ====================================================================================
  // SECTION 5: EVENT HANDLERS
  // ====================================================================================

  /**
   * Initiates the script run when the user clicks the "Run Script" button.
   * It uses the `scriptRunner` hook, which communicates with the backend via WebSocket.
   */
  const handleRun = async () => {
    scriptRunner.resetState();
    await scriptRunner.runScript({
      scriptId: script.id,
      parameters: parameters,
    });
  };

  // ====================================================================================
  // SECTION 6: RENDER LOGIC
  // ====================================================================================

  return (
    <ErrorBoundary>
      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar for Script Options */}
        <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
          <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
              <Layers size={18} className="mr-2 text-slate-500" /> Script Options
            </h3>
            {/* The ScriptOptionsRenderer is a flexible component that can render different
                sidebar UIs based on script capabilities. It's perfect for generic scripts. */}
            <ScriptOptionsRenderer script={script} parameters={parameters} onParamChange={onParamChange} />
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 space-y-8">
          <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
            <header className="border-b border-slate-200 pb-4 mb-6">
              <h2 className="text-2xl font-bold text-slate-800">{script.displayName}</h2>
              <p className="mt-1 text-slate-600">{script.description}</p>
            </header>
            <div className="space-y-6">
              {/*
                FIX: Use optional chaining (`?.`) to safely access `capabilities`.
                This prevents a crash if a script has no `capabilities` object defined in its metadata.
                The `&&` ensures the components are only rendered if the capability is explicitly `true`.
              */}
              {script.capabilities?.deviceAuth && (
                <>
                  <DeviceAuthFields script={script} parameters={parameters} onParamChange={onParamChange} />
                  <FetchDynamicOptions script={script} parameters={parameters} onParamChange={onParamChange} />
                </>
              )}

              {/* Only render the "Action Details" section if there are parameters to show. */}
              {mainParametersToRender.length > 0 && (
                <div className="border-t border-slate-200 pt-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Action Details</h3>
                  <DynamicScriptForm parametersToRender={mainParametersToRender} formValues={parameters} onParamChange={onParamChange} />
                </div>
              )}
            </div>
            <div className="mt-8 border-t pt-6">
              <button type="button" onClick={handleRun} disabled={scriptRunner.isRunning}
                className="w-full flex items-center justify-center p-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition-colors">
                {scriptRunner.isRunning ? <PulseLoader color="#fff" size={8} /> : <><PlayCircle size={20} className="mr-2" /> Run Script</>}
              </button>
            </div>
          </div>

          {/* Real-time output display, correctly driven by the generic `useScriptRunnerStream` hook. */}
          {/* TROUBLESHOOTING: If this display is stuck, the problem is likely in `useScriptRunnerStream`. */}
          <RealTimeDisplay
            isActive={scriptRunner.isRunning || scriptRunner.isComplete}
            isRunning={scriptRunner.isRunning}
            isComplete={scriptRunner.isComplete}
            hasError={scriptRunner.hasError}
            progress={scriptRunner.progress}
            result={scriptRunner.result}
            error={scriptRunner.error}
            totalSteps={scriptRunner.totalSteps}
            completedSteps={scriptRunner.completedSteps}
            progressPercentage={scriptRunner.progressPercentage}
            latestMessage={scriptRunner.latestMessage}
            canReset={!scriptRunner.isRunning && scriptRunner.isComplete}
            onReset={scriptRunner.resetState}
          />
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default GenericScriptRunner;
