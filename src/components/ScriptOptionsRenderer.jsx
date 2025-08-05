// =============================================================================
// FILE:               src/components/ScriptOptionsRenderer.jsx
//
// DESCRIPTION:
//   Component for rendering script-specific sidebar options, delegating to
//   specialized components or BaselineScriptOptions based on script capabilities.
//
// OVERVIEW:
//   This component acts as a router for rendering script-specific options. It
//   checks the script's capabilities to determine whether to render a custom
//   options component (e.g., JsnapyOptions) or the default BaselineScriptOptions.
//
// KEY FEATURES:
//   - Supports dynamic test discovery for scripts with the dynamicDiscovery capability.
//   - Extensible for custom sidebar components via sidebarComponent capability.
//   - Falls back to BaselineScriptOptions for standard inputs.
//
// DEPENDENCIES:
//   - react: For component rendering.
//   - BaselineScriptOptions: For rendering standard script options.
//   - JsnapyOptions: For rendering JSNAPy-specific options.
//
// HOW TO USE:
//   Use this component in a parent component that provides script metadata and
//   parameter management:
//   ```javascript
//   import ScriptOptionsRenderer from '../components/ScriptOptionsRenderer';
//
//   function ParentComponent({ script, parameters, onParamChange }) {
//     return (
//       <ScriptOptionsRenderer script={script} parameters={parameters} onParamChange={onParamChange} />
//     );
//   }
//   ```
// =============================================================================

// =============================================================================
// SECTION 1: IMPORTS
// =============================================================================
import React from "react";
import BaselineScriptOptions from "./BaselineScriptOptions";
import JsnapyOptions from "./tool_options/JsnapyOptions";

// =============================================================================
// SECTION 2: COMPONENT DEFINITION
// =============================================================================
/**
 * Renders script-specific sidebar options.
 * @param {Object} props - Component props.
 * @param {Object} props.script - Script metadata.
 * @param {Object} props.parameters - Current script parameters.
 * @param {Function} props.onParamChange - Callback to update parameters.
 */
function ScriptOptionsRenderer({ script, parameters, onParamChange }) {
  // =============================================================================
  // SECTION 3: RENDER LOGIC
  // =============================================================================
  if (!script) {
    return null;
  }

  // Handle scripts with dynamic test discovery (e.g., JSNAPy)
  if (script.capabilities?.dynamicDiscovery) {
    return (
      <JsnapyOptions script={script} parameters={parameters} onParamChange={onParamChange} />
    );
  }

  // Handle custom sidebar components
  if (script.capabilities?.sidebarComponent) {
    // Add custom component mappings here as needed
    return (
      <BaselineScriptOptions script={script} parameters={parameters} onParamChange={onParamChange} />
    );
  }

  // Default to baseline options
  return (
    <BaselineScriptOptions script={script} parameters={parameters} onParamChange={onParamChange} />
  );
}

// =============================================================================
// SECTION 4: EXPORT
// =============================================================================
export default ScriptOptionsRenderer;
