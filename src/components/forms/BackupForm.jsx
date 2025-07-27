// src/components/forms/BackupForm.jsx

import React from 'react';
// Assuming you move these to a 'shared' folder as suggested
import DeviceAuthFields from '../shared/DeviceAuthFields.jsx';
import DeviceTargetSelector from '../shared/DeviceTargetSelector.jsx';

function BackupForm({ parameters, onParamChange }) {
  return (
    <div className="space-y-6">
      <DeviceTargetSelector parameters={parameters} onParamChange={onParamChange} />
      <DeviceAuthFields parameters={parameters} onParamChange={onParamChange} />
    </div>
  );
}

export default BackupForm;
