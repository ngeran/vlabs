// src/components/JsnapyRunner.jsx
import React from 'react';
import { useJsnapyWorkflow } from '../hooks/useJsnapyWorkflow'; // <-- IMPORT THE NEW HOOK
import RealTimeDisplay from './RealTimeProgress/RealTimeDisplay'; // Your working display component
import TestSelector from './TestSelector'; // Assuming you have this component from the prompt
import DeviceAuthFields from './DeviceAuthFields'; // Assuming you have this
import PulseLoader from 'react-spinners/PulseLoader';
import { PlayCircle, Layers } from 'lucide-react';

function JsnapyRunner({ wsContext, script }) { // script prop for displayName, etc.
  // ONE HOOK to rule them all!
  const {
    executionState,
    runJsnapyScript,
    resetExecution,
    categorizedTests,
    isDiscovering,
    discoveryError,
    parameters,
    setParameters,
  } = useJsnapyWorkflow(wsContext);

  const handleParamChange = (name, value) => {
    setParameters(prev => ({ ...prev, [name]: value }));
  };

  // Handler for the TestSelector component
  const handleTestToggle = (testId) => {
    setParameters(prev => {
      const newSelection = prev.tests.includes(testId)
        ? prev.tests.filter(id => id !== testId)
        : [...prev.tests, testId];
      return { ...prev, tests: newSelection };
    });
  };

  const handleRun = () => {
    // Pass all current parameters to the execution function
    runJsnapyScript(parameters);
  };

  const isBusy = isDiscovering || executionState.isRunning;

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Sidebar for Script Options */}
      <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
        <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
            <Layers size={18} className="mr-2 text-slate-500" /> JSNAPy Options
          </h3>
          {/* Environment Selector can be a simple input or a dedicated component */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Environment</label>
            <select
              value={parameters.environment}
              onChange={(e) => handleParamChange('environment', e.target.value)}
              disabled={isBusy}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
            >
              <option value="development">Development</option>
              <option value="lab">Lab</option>
              <option value="production">Production</option>
            </select>
          </div>
          <h4 className="text-sm font-semibold text-slate-600 uppercase pt-4 border-t">Tests</h4>
          {isDiscovering && <PulseLoader size={6} />}
          {discoveryError && <p className="text-xs text-red-500">{discoveryError}</p>}
          <TestSelector
            categorizedTests={categorizedTests}
            selectedTests={parameters.tests}
            onTestToggle={handleTestToggle}
          />
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
            {/* Assuming DeviceAuthFields takes parameters and onParamChange */}
            <DeviceAuthFields script={script} parameters={parameters} onParamChange={handleParamChange} />
          </div>

          <div className="mt-8 border-t pt-6">
            <button type="button" onClick={handleRun} disabled={isBusy}
              className="w-full flex items-center justify-center p-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-slate-400">
              {isBusy ? <PulseLoader color="#fff" size={8} /> : <><PlayCircle size={20} className="mr-2" /> Run Script</>}
            </button>
          </div>
        </div>

        {/* The Real-Time Display, now correctly driven by our unified hook */}
        <RealTimeDisplay
          isActive={executionState.isRunning || executionState.isComplete}
          isRunning={executionState.isRunning}
          isComplete={executionState.isComplete}
          hasError={executionState.hasError}
          progress={executionState.progress}
          result={executionState.result}
          error={executionState.error}
          totalSteps={executionState.totalSteps}
          completedSteps={executionState.completedSteps}
          progressPercentage={executionState.progressPercentage}
          latestMessage={executionState.latestMessage}
          canReset={!executionState.isRunning && executionState.isComplete}
          onReset={resetExecution}
        />
      </main>
    </div>
  );
}

export default JsnapyRunner;
