// =============================================================================
// FILE: PythonDebugger.jsx
// DESCRIPTION: Python debugging component for displaying Python script output,
//              errors, variable states, and execution metrics. Perfect for
//              debugging Python automation scripts and API calls.
//
// OVERVIEW:
//   This component provides a comprehensive interface for debugging Python
//   scripts including stdout/stderr capture, variable inspection, execution
//   timing, error tracking, and log analysis. It can display real-time
//   Python debugging information in a clean, organized interface.
//
// DEPENDENCIES:
//   - react: For building the UI and managing state
//   - lucide-react: For icons (Code, Terminal, AlertCircle, Clock)
//
// HOW TO USE:
//   1. Add to your script metadata:
//      capabilities:
//        enablePythonDebug: true
//        pythonDebugSettings:
//          captureStdout: true
//          captureStderr: true
//          trackVariables: true
//          trackExecution: true
//
//   2. Use in your component:
//      import PythonDebugger from '../components/shared/PythonDebugger';
//
//      <PythonDebugger
//        scriptName="device_backup.py"
//        output={pythonOutput}
//        errors={pythonErrors}
//        variables={pythonVariables}
//        isVisible={script?.capabilities?.enablePythonDebug}
//      />
//
//   3. Data format:
//      const pythonOutput = {
//        stdout: ["Connected to device", "Backup started..."],
//        stderr: ["Warning: deprecated method"],
//        execution_time: 2.5,
//        variables: { device_count: 5, success_rate: 0.8 },
//        traceback: null
//      };
// =============================================================================

import React, { useState, useEffect } from "react";
import { Code, Terminal, AlertCircle, Clock, Variable, Play, Cpu, HardDrive } from "lucide-react";

// =============================================================================
// SECTION 1: COMPONENT DEFINITION
// =============================================================================
export default function PythonDebugger({
  scriptName = "python_script.py",
  output = {},
  errors = [],
  variables = {},
  executionMetrics = {},
  isVisible = true,
  className = "",
  maxLines = 100
}) {
  const [selectedTab, setSelectedTab] = useState('console');
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  if (!isVisible) return null;

  const {
    stdout = [],
    stderr = [],
    execution_time = 0,
    traceback = null,
    exit_code = null
  } = output;

  const tabs = [
    { id: 'console', label: 'Console', icon: Terminal },
    { id: 'variables', label: 'Variables', icon: Variable },
    { id: 'errors', label: 'Errors', icon: AlertCircle },
    { id: 'metrics', label: 'Metrics', icon: Cpu }
  ];

  const renderConsole = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-600">Script Output</div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded"
          />
          Auto-scroll
        </label>
      </div>

      <div className="bg-slate-900 text-slate-200 p-4 rounded-lg font-mono text-xs overflow-auto max-h-80">
        {/* STDOUT */}
        {stdout.length > 0 && (
          <div className="mb-4">
            <div className="text-green-400 mb-2">STDOUT:</div>
            {stdout.slice(-maxLines).map((line, idx) => (
              <div key={idx} className="text-green-200">
                <span className="text-slate-500">{idx + 1:>3} |</span> {line}
              </div>
            ))}
          </div>
        )}

        {/* STDERR */}
        {stderr.length > 0 && (
          <div className="mb-4">
            <div className="text-red-400 mb-2">STDERR:</div>
            {stderr.slice(-maxLines).map((line, idx) => (
              <div key={idx} className="text-red-200">
                <span className="text-slate-500">{idx + 1:>3} |</span> {line}
              </div>
            ))}
          </div>
        )}

        {/* Traceback */}
        {traceback && (
          <div className="mb-4">
            <div className="text-red-400 mb-2">TRACEBACK:</div>
            <pre className="text-red-200 whitespace-pre-wrap">{traceback}</pre>
          </div>
        )}

        {/* Exit Code */}
        {exit_code !== null && (
          <div className="mt-4 pt-2 border-t border-slate-700">
            <span className={`text-xs ${exit_code === 0 ? 'text-green-400' : 'text-red-400'}`}>
              Exit Code: {exit_code}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  const renderVariables = () => (
    <div className="space-y-3">
      <div className="text-xs text-slate-600">Python Variables</div>
      <div className="bg-slate-900 text-slate-200 p-4 rounded-lg font-mono text-xs overflow-auto max-h-60">
        <pre>{JSON.stringify(variables, null, 2)}</pre>
      </div>
    </div>
  );

  const renderErrors = () => (
    <div className="space-y-3">
      <div className="text-xs text-slate-600">Error Analysis</div>
      {errors.length === 0 ? (
        <div className="bg-green-50 p-4 rounded-lg text-center">
          <div className="text-green-600 text-sm">No errors detected</div>
        </div>
      ) : (
        <div className="space-y-2 max-h-60 overflow-auto">
          {errors.map((error, idx) => (
            <div key={idx} className="bg-red-50 p-3 rounded-lg border border-red-200">
              <div className="text-red-800 font-medium text-sm">{error.type || 'Error'}</div>
              <div className="text-red-700 text-xs mt-1">{error.message}</div>
              {error.line && (
                <div className="text-red-600 text-xs mt-1">Line: {error.line}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderMetrics = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 p-3 rounded-lg">
          <div className="text-xs text-blue-600 font-medium">Execution Time</div>
          <div className="text-lg font-bold text-blue-900">{execution_time?.toFixed(2)}s</div>
        </div>
        <div className="bg-green-50 p-3 rounded-lg">
          <div className="text-xs text-green-600 font-medium">Exit Code</div>
          <div className={`text-lg font-bold ${exit_code === 0 ? 'text-green-900' : 'text-red-900'}`}>
            {exit_code ?? 'Running'}
          </div>
        </div>
        <div className="bg-purple-50 p-3 rounded-lg">
          <div className="text-xs text-purple-600 font-medium">STDOUT Lines</div>
          <div className="text-lg font-bold text-purple-900">{stdout.length}</div>
        </div>
        <div className="bg-orange-50 p-3 rounded-lg">
          <div className="text-xs text-orange-600 font-medium">STDERR Lines</div>
          <div className="text-lg font-bold text-orange-900">{stderr.length}</div>
        </div>
      </div>

      {executionMetrics && Object.keys(executionMetrics).length > 0 && (
        <div>
          <div className="text-xs text-slate-600 mb-2">Additional Metrics</div>
          <div className="bg-slate-50 p-3 rounded-lg">
            <pre className="text-xs">{JSON.stringify(executionMetrics, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className={`bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200/60 rounded-2xl shadow-sm ${className}`}>
      <div className="px-5 py-4 border-b border-green-100/80">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between gap-3 cursor-pointer hover:bg-green-100/50 rounded-xl p-2 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-green-100 to-emerald-100 rounded-xl shadow-sm">
              <Code className="h-4 w-4 text-green-600" />
            </div>
            <div className="text-left">
              <h3 className="text-base font-semibold text-green-900">Python Debugger</h3>
              <p className="text-xs text-green-600">{scriptName} • {execution_time?.toFixed(1)}s</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {exit_code === 0 && <div className="w-2 h-2 bg-green-500 rounded-full"></div>}
            {exit_code !== null && exit_code !== 0 && <div className="w-2 h-2 bg-red-500 rounded-full"></div>}
            {exit_code === null && <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>}
            <Play className={`h-4 w-4 text-green-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </button>
      </div>

      {isExpanded && (
        <div className="p-5">
          <div className="flex gap-1 mb-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  selectedTab === tab.id
                    ? 'bg-green-100 text-green-700 border border-green-200'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <tab.icon className="h-3 w-3" />
                {tab.label}
                {tab.id === 'errors' && errors.length > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 ml-1">
                    {errors.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div>
            {selectedTab === 'console' && renderConsole()}
            {selectedTab === 'variables' && renderVariables()}
            {selectedTab === 'errors' && renderErrors()}
            {selectedTab === 'metrics' && renderMetrics()}
          </div>
        </div>
      )}
    </div>
  );
}
