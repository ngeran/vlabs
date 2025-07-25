// =========================================================================================
// FILE: src/components/forms/CodeUpgradeForm.jsx
//
// DESCRIPTION:
//   A dedicated form component that assembles the necessary user input fields for the
//   Code Upgrade script.
//
// OVERVIEW:
//   This component acts as a clean, reusable container for the main content area of the
//   CodeUpgradeRunner. It follows the established architectural pattern of the application
//   by composing shared components (`DeviceTargetSelector` and `DeviceAuthFields`) into a
//   single, tool-specific form. This approach keeps the primary runner component's logic
//   focused on state management and execution, rather than UI layout.
//
// DEPENDENCIES:
//   - React: For building the UI.
//   - DeviceTargetSelector.jsx: The shared component for selecting a target device by
//     hostname or from an inventory file.
//   - DeviceAuthFields.jsx: The shared component for capturing device credentials
//     (username and password).
//
// HOW TO USE:
//   This component is not meant to be used directly in multiple places. It is designed
//   specifically to be rendered inside the `CodeUpgradeRunner.jsx` component.
//
//   Example usage in `CodeUpgradeRunner.jsx`:
//   <CodeUpgradeForm
//     script={script}
//     parameters={parameters}
//     onParamChange={onParamChange}
//   />
// =========================================================================================

// =========================================================================================
// SECTION 1: IMPORTS & DEPENDENCIES
// =========================================================================================
import React from 'react';

// Import the shared components that make up the form's structure.
import DeviceTargetSelector from '../shared/DeviceTargetSelector.jsx';
import DeviceAuthFields from '../shared/DeviceAuthFields.jsx';

// =========================================================================================
// SECTION 2: COMPONENT DEFINITION
// =========================================================================================
/**
 * Renders the complete set of input fields required for the Code Upgrade script.
 * @param {object} props - Component props passed from the parent runner.
 * @param {object} props.script - The script metadata, used to check capabilities and pass titles/descriptions.
 * @param {object} props.parameters - The current state of script parameters (e.g., hostname, username).
 * @param {function} props.onParamChange - The callback function to update parameters in the parent state.
 * @returns {JSX.Element} A container div with all necessary form fields.
 */
function CodeUpgradeForm({ script, parameters, onParamChange }) {
  // =========================================================================================
  // SECTION 3: RENDER LOGIC
  // =========================================================================================
  return (
    <div className="space-y-6">
      {/* Renders the Hostname vs. Inventory file selection UI. */}
      {/* This component reads the `deviceTargeting` capability from the script metadata. */}
      <DeviceTargetSelector
        parameters={parameters}
        onParamChange={onParamChange}
        script={script}
        // Pass title and description from metadata for customization
        title={script.deviceTargeting?.title || "Target Device Selection"}
        description={script.deviceTargeting?.description || "Select target for the upgrade"}
      />

      {/* Renders the Username and Password input fields. */}
      {/* This component reads the `deviceAuth` capability from the script metadata. */}
      <DeviceAuthFields
        parameters={parameters}
        onParamChange={onParamChange}
        script={script}
        // Pass title and description from metadata for customization
        title={script.deviceAuth?.title || "Device Authentication"}
        description={script.deviceAuth?.description || "Provide credentials for device access"}
      />
    </div>
  );
}

export default CodeUpgradeForm;
