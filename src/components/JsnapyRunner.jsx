// src/components/JsnapyRunner.jsx
import React from 'react';
import PulseLoader from 'react-spinners/PulseLoader';
import { PlayCircle, Layers } from 'lucide-react';

// Import our new, unified hook that manages the entire workflow for this component.
import { useJsnapyWorkflow } from '../hooks/useJsnapyWorkflow';

// Import reusable UI components that this runner will use.
import RealTimeDisplay from './RealTimeProgress/RealTimeDisplay';
import TestSelector from './TestSelector';
import DeviceAuthFields from './DeviceAuthFields';

// ====================================================================================
// SECTION 1: COMPONENT DEFINITION
// ====================================================================================

function JsnapyRunner({ wsContext, script }) {
  // This single, powerful hook provides ALL state and functions needed for this component.
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

  // --- EVENT HANDLERS ---
  // Generic handler to update any parameter in our state (e.g., hostname, password).
  const handleParamChange = (name, value) => {
    setParameters(prev => ({ ...prev, [name]: value }));
  };

  // Specific handler for toggling a test checkbox in the TestSelector component.
  const handleTestToggle = (testId) => {
    setParameters(prev => {
      const currentTests = prev.tests || [];
      const newSelection = currentTests.includes(testId)
        ? currentTests.filter(id => id !== testId)
        : [...currentTests, testId];
      return { ...prev, tests: newSelection };
    });
  };

  // Handler for the main "Run JSNAPy" button.
  const handleRun = () => {
    // The hook's `runJsnapyScript` function knows how to format parameters correctly.
    runJsnapyScript(parameters);
  };

  const isBusy = isDiscovering || executionState.isRunning;

  // ====================================================================================
  // SECTION 2: RENDER LOGIC
  // ====================================================================================

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Sidebar for Script Options */}
      <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
        <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
            <Layers size={18} className="mr-2 text-slate-500" /> JSNAPy Options
          </h3>
          {/* Environment Selector */}
          <div>
            <label htmlFor="jsnapy-environment" className="block text-sm font-medium text-gray-700">Environment</label>
            <select
              id="jsnapy-environment"
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
          {isDiscovering && <div className="text-center"><PulseLoader size={6} /></div>}
          {discoveryError && <p className="text-xs text-red-500">{discoveryError}</p>}
          <TestSelector
            categorizedTests={categorizedTests}
            selectedTests={parameters.tests || []}
            onTestToggle={handleTestToggle}
          />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 space-y-8">
        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
          {/* +++ THIS IS THE FIXED LINE +++ */}
          <header className="border-b border-slate-200 pb-4 mb-6">
            <h2 className="text-2xl font-bold text-slate-800">{script.displayName}</h2>
            <p className="mt-1 text-slate-600">{script.description}</p>
          </header>
          <div className="space-y-6">
            {/* The DeviceAuthFields component is reusable and gets its data from our hook's state. */}
            <DeviceAuthFields script={script} parameters={parameters} onParamChange={handleParamChange} />
          </div>
          <div className="mt-8 border-t pt-6">
            <button type="button" onClick={handleRun} disabled={isBusy}
              className="w-full flex items-center justify-center p-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-slate-400">
              {isBusy ? <PulseLoader color="#fff" size={8} /> : <><PlayCircle size={20} className="mr-2" /> Run JSNAPy</>}
            </button>
          </div>
        </div>

        {/* Real-time display, correctly driven by the unified hook's state. */}
        {/* TROUBLESHOOTING: If this display is stuck, the problem is inside the useJsnapyWorkflow hook. */}
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
