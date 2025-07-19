// =============================================================================
// FILE: JsnapyRunner.jsx
// DESCRIPTION: Main UI component for the JSNAPy Runner tool. Renders the layout,
//              including test selection, device targeting, authentication fields,
//              and output display. Uses the useJsnapyWorkflow hook for state and logic.
// DEPENDENCIES:
//   - react: For building the UI components.
//   - react-spinners/PulseLoader: For loading animations.
//   - lucide-react: For icons (PlayCircle, Layers).
//   - useJsnapyWorkflow: Custom hook for state management and backend communication.
//   - ScriptOutputDisplay: Component for displaying script execution output.
//   - TestSelector: Component for selecting JSNAPy tests.
//   - DeviceAuthFields: Component for authentication inputs.
//   - DeviceTargetSelector: Component for device targeting inputs.
// =============================================================================

import React from 'react';
import PulseLoader from 'react-spinners/PulseLoader';
import { PlayCircle, Layers } from 'lucide-react';
import { useJsnapyWorkflow } from '../hooks/useJsnapyWorkflow';
import ScriptOutputDisplay from './ScriptOutputDisplay';
import TestSelector from './TestSelector';
import DeviceAuthFields from './DeviceAuthFields';
import DeviceTargetSelector from './DeviceTargetSelector';

// =============================================================================
// SECTION 1: COMPONENT DEFINITION
// =============================================================================
// Main component for the JSNAPy Runner UI, rendering sidebar and main content areas.
function JsnapyRunner({ wsContext, script }) {
  // =============================================================================
  // SECTION 2: HOOK INTEGRATION AND STATE MANAGEMENT
  // =============================================================================
  // Use custom hook to manage state and logic for the JSNAPy Runner.
  const {
    executionState, // Contains isRunning, isComplete, progress, result, error
    runJsnapyScript, // Function to trigger script execution
    categorizedTests, // Available tests grouped by category
    isDiscovering, // Flag for test discovery loading state
    discoveryError, // Error message for test discovery failures
    parameters, // User inputs (hostname, inventory_file, username, password, environment, tests)
    setParameters, // Function to update parameters
  } = useJsnapyWorkflow(wsContext);

  // =============================================================================
  // SECTION 3: EVENT HANDLERS
  // =============================================================================
  // Handle changes to input fields (e.g., hostname, username, environment).
  const handleParamChange = (name, value) => {
    setParameters(prev => ({ ...prev, [name]: value }));
  };

  // Toggle selection of a test in the tests array.
  const handleTestToggle = (testId) => {
    setParameters(prev => {
      const currentTests = prev.tests || [];
      const newSelection = currentTests.includes(testId)
        ? currentTests.filter(id => id !== testId)
        : [...currentTests, testId];
      return { ...prev, tests: newSelection };
    });
  };

  // Trigger script execution with validation for required fields.
  const handleRun = () => {
    // Validate device targeting (at least one of hostname or inventory_file)
    const hasDeviceTarget = parameters.hostname || parameters.inventory_file;
    // Validate authentication credentials
    const hasAuth = parameters.username && parameters.password;
    // Validate tests selection
    const hasTests = parameters.tests && parameters.tests.length > 0;
    if (!hasDeviceTarget || !hasAuth || !hasTests) {
      alert('Please provide either a hostname or inventory file, valid authentication credentials, and at least one test.');
      return;
    }
    runJsnapyScript(parameters);
  };

  // Determine if any operation (test discovery or script execution) is in progress.
  const isBusy = isDiscovering || executionState.isRunning;

  // =============================================================================
  // SECTION 4: RENDER LOGIC
  // =============================================================================
  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* SECTION 4.1: SIDEBAR FOR TEST SELECTION */}
      <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
        <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
          {/* Sidebar header */}
          <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
            <Layers size={18} className="mr-2 text-slate-500" /> JSNAPy Options
          </h3>

          {/* Environment Selector */}
          <div>
            <label htmlFor="jsnapy-environment" className="block text-sm font-medium text-gray-700">
              Environment
            </label>
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

          {/* Test Selector */}
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

      {/* SECTION 4.2: MAIN CONTENT AREA FOR INPUTS AND OUTPUT */}
      <main className="flex-1 space-y-8">
        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
          {/* Header */}
          <header className="border-b border-slate-200 pb-4 mb-6">
            <h2 className="text-2xl font-bold text-slate-800">{script.displayName}</h2>
            <p className="mt-1 text-slate-600">{script.description}</p>
          </header>

          {/* Input Fields */}
          <div className="space-y-6">
            {/* Device Targeting Inputs */}
            <DeviceTargetSelector
              parameters={parameters}
              onParamChange={handleParamChange}
              title={script.deviceTargeting?.title}
              description={script.deviceTargeting?.description}
            />
            {/* Authentication Inputs */}
            <DeviceAuthFields
              script={script}
              parameters={parameters}
              onParamChange={handleParamChange}
              title={script.deviceAuth?.title}
              description={script.deviceAuth?.description}
            />
          </div>

          {/* Run Button */}
          <div className="mt-8 border-t pt-6">
            <button
              type="button"
              onClick={handleRun}
              disabled={isBusy}
              className="w-full flex items-center justify-center p-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition-colors"
            >
              {isBusy ? (
                <PulseLoader color="#fff" size={8} />
              ) : (
                <>
                  <PlayCircle size={20} className="mr-2" /> Run JSNAPy
                </>
              )}
            </button>
          </div>
        </div>

        {/* Output Display */}
        {(executionState.isRunning || executionState.isComplete) && (
          <ScriptOutputDisplay
            script={script}
            progressEvents={executionState.progress}
            finalResult={executionState.result}
            error={executionState.error}
            isRunning={executionState.isRunning}
            isComplete={executionState.isComplete}
            showDebug={false}
          />
        )}
      </main>
    </div>
  );
}

export default JsnapyRunner;
