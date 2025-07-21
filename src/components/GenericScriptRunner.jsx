// src/components/GenericScriptRunner.jsx

import React from 'react';
import PulseLoader from 'react-spinners/PulseLoader';
import { PlayCircle, Layers } from 'lucide-react';
import ErrorBoundary from './ErrorBoundary.jsx';
import DeviceAuthFields from './DeviceAuthFields.jsx';
import DeviceTargetSelector from './DeviceTargetSelector.jsx';
import RestoreForm from './forms/RestoreForm.jsx'; // Make sure this is imported
import ScriptOptionsRenderer from './ScriptOptionsRenderer.jsx'; // This handles the sidebar
import RealTimeDisplay from './RealTimeProgress/RealTimeDisplay.jsx';
import { useScriptRunnerStream } from '../hooks/useWebSocket.jsx';

function GenericScriptRunner({ script, parameters, onParamChange, wsContext }) {
  const scriptRunner = useScriptRunnerStream(wsContext);

  if (!script) {
    return (
      <div className="text-center py-10 text-red-500 font-semibold">
        Error: GenericScriptRunner was rendered without a valid script configuration.
      </div>
    );
  }

  const handleRun = async () => {
    scriptRunner.resetState();
    // Ensure all parameters, including the command, are sent
    await scriptRunner.runScript({
      scriptId: script.id,
      parameters: { ...parameters },
    });
  };

  // RealTimeDisplay props mapping remains the same
  const realTimeProps = {
    isActive: scriptRunner.isRunning,
    isRunning: scriptRunner.isRunning,
    isComplete: scriptRunner.isComplete,
    hasError: !!scriptRunner.error,
    progress: scriptRunner.progressEvents,
    result: scriptRunner.finalResult,
    error: scriptRunner.error,
    canReset: !scriptRunner.isRunning && (scriptRunner.isComplete || !!scriptRunner.error),
    onReset: scriptRunner.resetState
    //... add other progress props if needed
  };

  return (
    <ErrorBoundary>
      <div className="flex flex-col md:flex-row gap-8">
        {/* ==================================================================== */}
        {/* SIDEBAR - This part is correct and will update automatically        */}
        {/* ==================================================================== */}
        <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
          <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
              <Layers size={18} className="mr-2 text-slate-500" /> Script Options
            </h3>
            {/* ScriptOptionsRenderer uses your metadata's `show_if` rules correctly for the sidebar */}
            <ScriptOptionsRenderer script={script} parameters={parameters} onParamChange={onParamChange} />
          </div>
        </aside>

        {/* ==================================================================== */}
        {/* MAIN CONTENT - This section contains the critical fix               */}
        {/* ==================================================================== */}
        <main className="flex-1 space-y-8">
          <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
            <header className="border-b border-slate-200 pb-4 mb-6">
              <h2 className="text-2xl font-bold text-slate-800">{script.displayName}</h2>
              <p className="mt-1 text-slate-600">{script.description}</p>
            </header>

            <div className="space-y-6">
              {/* --- THIS IS THE FIX --- */}
              {/* We explicitly check the 'command' parameter to decide which form to render. */}

              {parameters.command === 'restore' ? (
                // --- RENDER RESTORE UI ---
                // If 'restore' is selected, only show the RestoreForm and authentication fields.
                <>
                  <RestoreForm
                    parameters={parameters}
                    onParamChange={onParamChange}
                  />
                  {script.capabilities?.deviceAuth && (
                    <DeviceAuthFields script={script} parameters={parameters} onParamChange={onParamChange} />
                  )}
                </>
              ) : (
                // --- RENDER BACKUP UI (DEFAULT) ---
                // Otherwise, show the original backup form, which includes the DeviceTargetSelector.
                <>
                  {script.capabilities?.deviceTargeting && (
                    <DeviceTargetSelector parameters={parameters} onParamChange={onParamChange} />
                  )}
                  {script.capabilities?.deviceAuth && (
                    <DeviceAuthFields script={script} parameters={parameters} onParamChange={onParamChange} />
                  )}
                </>
              )}
            </div>

            <div className="mt-8 border-t pt-6">
              <button
                type="button"
                onClick={handleRun}
                disabled={scriptRunner.isRunning}
                className="w-full flex items-center justify-center p-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition-colors"
              >
                {scriptRunner.isRunning ? <PulseLoader color="#fff" size={8} /> : <><PlayCircle size={20} className="mr-2" /> Run Script</>}
              </button>
            </div>
          </div>
          {(scriptRunner.isRunning || scriptRunner.isComplete) && (
            <RealTimeDisplay {...realTimeProps} />
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default GenericScriptRunner;
