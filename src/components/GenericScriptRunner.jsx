import React from 'react';
import PulseLoader from 'react-spinners/PulseLoader';
import { PlayCircle, Layers } from 'lucide-react';
import ErrorBoundary from './ErrorBoundary.jsx';
import DynamicScriptForm from './DynamicScriptForm.jsx';
import DeviceAuthFields from './DeviceAuthFields.jsx';
import DeviceTargetSelector from './DeviceTargetSelector.jsx'; // EXISTING COMPONENT
import FetchDynamicOptions from './FetchDynamicOptions.jsx';
import ScriptOptionsRenderer from './ScriptOptionsRenderer.jsx';
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

  const mainParametersToRender = React.useMemo(() => {
    if (!script.parameters) {
      return [];
    }
    const specialHandledParams = ["hostname", "username", "password", "inventory_file"];
    return script.parameters.filter((param) => {
      if (specialHandledParams.includes(param.name) || param.layout === "sidebar") {
        return false;
      }
      if (param.show_if) {
        return parameters[param.show_if.name] === param.show_if.value;
      }
      return true;
    });
  }, [script, parameters]);

  const handleRun = async () => {
    scriptRunner.resetState();
    await scriptRunner.runScript({
      scriptId: script.id,
      parameters: parameters,
    });
  };

  // Map useScriptRunnerStream state to RealTimeDisplay props
  const realTimeProps = {
    isActive: scriptRunner.isRunning,
    isRunning: scriptRunner.isRunning,
    isComplete: scriptRunner.isComplete,
    hasError: !!scriptRunner.error,
    progress: scriptRunner.progressEvents,
    progressLength: scriptRunner.progressEvents.length,
    progressPercentage: scriptRunner.progressEvents.length > 0
      ? (scriptRunner.progressEvents.filter(e => e.event_type === 'STEP_COMPLETE').length /
         scriptRunner.progressEvents.filter(e => e.event_type === 'STEP_START').length * 100)
      : undefined,
    currentStep: scriptRunner.progressEvents.length > 0
      ? scriptRunner.progressEvents[scriptRunner.progressEvents.length - 1].message
      : undefined,
    totalSteps: scriptRunner.progressEvents.filter(e => e.event_type === 'STEP_START').length,
    completedSteps: scriptRunner.progressEvents.filter(e => e.event_type === 'STEP_COMPLETE').length,
    latestMessage: scriptRunner.progressEvents.length > 0
      ? scriptRunner.progressEvents[scriptRunner.progressEvents.length - 1]
      : undefined,
    result: scriptRunner.finalResult,
    error: scriptRunner.error,
    canReset: !scriptRunner.isRunning && (scriptRunner.isComplete || !!scriptRunner.error),
    onReset: scriptRunner.resetState
  };

  console.log('[DIAG][GenericScriptRunner] Passing props to RealTimeDisplay:', realTimeProps);

  return (
    <ErrorBoundary>
      <div className="flex flex-col md:flex-row gap-8">
        <aside className="w-full md:w-72 lg:w-80 flex-shrink-0">
          <div className="sticky top-24 space-y-6 bg-white p-6 rounded-xl shadow-lg shadow-slate-200/50">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center border-b border-slate-200 pb-3">
              <Layers size={18} className="mr-2 text-slate-500" /> Script Options
            </h3>
            <ScriptOptionsRenderer script={script} parameters={parameters} onParamChange={onParamChange} />
          </div>
        </aside>
        <main className="flex-1 space-y-8">
          <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg shadow-slate-200/50">
            <header className="border-b border-slate-200 pb-4 mb-6">
              <h2 className="text-2xl font-bold text-slate-800">{script.displayName}</h2>
              <p className="mt-1 text-slate-600">{script.description}</p>
            </header>
            <div className="space-y-6">
              {/* Device Targeting Section - Using existing DeviceTargetSelector */}
              {script.capabilities?.deviceTargeting && (
                <DeviceTargetSelector
                  parameters={parameters}
                  onParamChange={onParamChange}
                  title={script.deviceTargeting?.title || "Target Device Selection"}
                  description={script.deviceTargeting?.description || "Choose target devices for this operation"}
                />
              )}

              {/* Device Authentication Section */}
              {script.capabilities?.deviceAuth && (
                <DeviceAuthFields
                  script={script}
                  parameters={parameters}
                  onParamChange={onParamChange}
                />
              )}

              {/* Dynamic Options - Only show if deviceAuth is enabled */}
              {script.capabilities?.deviceAuth && (
                <FetchDynamicOptions
                  script={script}
                  parameters={parameters}
                  onParamChange={onParamChange}
                />
              )}

              {/* Main Parameters Section */}
              {mainParametersToRender.length > 0 && (
                <div className="border-t border-slate-200 pt-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Action Details</h3>
                  <DynamicScriptForm
                    parametersToRender={mainParametersToRender}
                    formValues={parameters}
                    onParamChange={onParamChange}
                  />
                </div>
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
