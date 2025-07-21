// src/components/runners/BackupAndRestoreRunner.jsx

import React from 'react';
import { PlayCircle, Layers } from 'lucide-react';
import PulseLoader from 'react-spinners/PulseLoader';

// Import the specific form UIs we will create next
import BackupForm from '../forms/BackupForm.jsx';
import RestoreForm from '../forms/RestoreForm.jsx';

// Import shared, reusable components
import ScriptOptionsRenderer from '../ScriptOptionsRenderer.jsx';
import RealTimeDisplay from '../RealTimeProgress/RealTimeDisplay.jsx'; // Adjust path if needed
import { useScriptRunnerStream } from '../../hooks/useWebSocket.jsx'; // Adjust path if needed

function BackupAndRestoreRunner({ script, parameters, onParamChange, wsContext }) {
  const scriptRunner = useScriptRunnerStream(wsContext);

  const handleRun = async () => {
    scriptRunner.resetState();
    await scriptRunner.runScript({
      scriptId: script.id,
      parameters: { ...parameters },
    });
  };

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
  };

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Sidebar: Renders the options. It will automatically react to the 'command' parameter. */}
      <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
        <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
            <Layers size={18} className="mr-2 text-slate-500" /> Script Options
          </h3>
          <ScriptOptionsRenderer script={script} parameters={parameters} onParamChange={onParamChange} />
        </div>
      </aside>

      {/* Main Content: The runner controls what form is shown. */}
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
              {scriptRunner.isRunning ? <PulseLoader color="#fff" size={8} /> : <><PlayCircle size={20} className="mr-2" /> Run Script</>}
            </button>
          </div>
        </div>

        {(scriptRunner.isRunning || scriptRunner.isComplete) && (
          <RealTimeDisplay {...realTimeProps} />
        )}
      </main>
    </div>
  );
}

export default BackupAndRestoreRunner;
