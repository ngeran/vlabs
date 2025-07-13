// src/components/tool_options/BackupRestoreOptions.jsx
import React from 'react';
import ScriptParameterInput from '../ScriptParameterInput';

/**
 * A self-contained component that renders all UI options
 * specifically for the Backup & Restore tool's sidebar.
 */
function BackupRestoreOptions({ script, parameters, onParamChange }) {
  const commandParam = script.parameters.find(p => p.name === 'command');

  if (!commandParam) {
    return <p className="text-red-500 text-xs">Error: 'command' parameter not defined in metadata.</p>;
  }

  return (
    <ScriptParameterInput
      param={commandParam}
      value={parameters.command}
      onChange={onParamChange}
    />
  );
}

export default BackupRestoreOptions;
