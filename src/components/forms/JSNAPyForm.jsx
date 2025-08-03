// =========================================================================================
//
// COMPONENT:          JSNAPyForm.jsx
// FILE:               /src/components/forms/JSNAPyForm.jsx
//
// OVERVIEW:
//   A streamlined, presentational component that renders only the core input fields for
//   the JSNAPy Runner's main content area. Its single responsibility is to display
//   the device targeting and authentication fields.
//
// KEY FEATURES:
//   - Focused Responsibility: This component strictly adheres to the principle of single
//     responsibility. It does not handle any business logic or complex UI states like
//     test discovery.
//   - Reusability: It leverages the application's shared components, `DeviceTargetSelector`
//     and `DeviceAuthFields`, ensuring a consistent look and feel across different tools.
//   - Decoupled from Options: All script-specific *options*, like test selection and
//     environment choice, are handled by `ScriptOptionsRenderer` in the sidebar, driven
//     by the script's metadata. This component remains clean and reusable.
//
// HOW-TO GUIDE (INTEGRATION):
//   - This component is rendered by `JsnapyRunner.jsx`.
//   - It requires `parameters` and `onParamChange` props to be passed down from the
//     centralized state in `PythonScriptRunner`.
//   - It is intentionally simple; all complex option rendering is delegated elsewhere.
//
// DEPENDENCIES:
//   - Shared UI Components: `DeviceAuthFields`, `DeviceTargetSelector`.
//
// =========================================================================================

// ====================================================================================
// SECTION 1: IMPORTS
// ====================================================================================
import React from 'react';
import DeviceAuthFields from '../shared/DeviceAuthFields.jsx';
import DeviceTargetSelector from '../shared/DeviceTargetSelector.jsx';

// ====================================================================================
// SECTION 2: MAIN COMPONENT DEFINITION
// ====================================================================================
/**
 * @description Renders the main form inputs (targeting and auth) for the JSNAPy tool.
 * @param {object} props - Component props.
 * @param {object} props.parameters - The current parameter values for the form.
 * @param {(name: string, value: any) => void} props.onParamChange - The callback to handle changes.
 */
export default function JSNAPyForm({ parameters, onParamChange }) {
  // ====================================================================================
  // SECTION 3: JSX RENDER METHOD
  // ====================================================================================
  return (
    <div className="space-y-6">
      {/* Component for selecting a target device via hostname or inventory */}
      <DeviceTargetSelector parameters={parameters} onParamChange={onParamChange} />

      <div className="border-t border-slate-200 my-6"></div>

      {/* Component for entering device authentication credentials */}
      <DeviceAuthFields parameters={parameters} onParamChange={onParamChange} />
    </div>
  );
}
