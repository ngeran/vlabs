// =============================================================================
// FILE:               src/components/BaselineScriptOptions.jsx
//
// DESCRIPTION:
//   Component for rendering standard sidebar form fields based on script metadata.
//
// OVERVIEW:
//   This component dynamically renders form inputs (radio, select, text, number)
//   based on script metadata. It supports dynamic options fetching and conditional
//   visibility for dependent fields.
//
// KEY FEATURES:
//   - Renders various input types (radio, select, text, number).
//   - Fetches dynamic options using JsnapyApiService.
//   - Handles conditional visibility with show_if metadata.
//   - Displays loading and error states for dynamic fields.
//
// DEPENDENCIES:
//   - react: For component rendering and hooks (useState, useEffect, useCallback).
//   - react-hot-toast: For error notifications.
//   - react-spinners: For loading indicators.
//   - JsnapyApiService: For fetching dynamic options.
//
// HOW TO USE:
//   Use this component in a parent component that provides script metadata and
//   parameter management:
//   ```javascript
//   import BaselineScriptOptions from '../components/BaselineScriptOptions';
//
//   function ParentComponent({ script, parameters, onParamChange }) {
//     return (
//       <BaselineScriptOptions script={script} parameters={parameters} onParamChange={onParamChange} />
//     );
//   }
//   ```
// =============================================================================

// =============================================================================
// SECTION 1: IMPORTS
// =============================================================================
import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import PulseLoader from "react-spinners/PulseLoader";
import JsnapyApiService from "../services/JsnapyApiService";

// =============================================================================
// SECTION 2: DYNAMIC OPTIONS FETCHER
// =============================================================================
/**
 * Fetches dynamic options for a form input from a backend API endpoint.
 * @param {string} endpoint - The API endpoint to query.
 * @param {object} parameters - Current form parameters for resolving dependencies.
 * @returns {Promise<Array<{value: string, label: string}>>} Array of options.
 */
async function fetchDynamicOptions(endpoint, parameters) {
  try {
    let finalEndpoint = endpoint;
    const dependencyMatch = endpoint.match(/\{\{(\w+)\}\}/);
    if (dependencyMatch) {
      const dependencyParamName = dependencyMatch[1];
      const dependencyValue = parameters[dependencyParamName];
      if (!dependencyValue) {
        return [];
      }
      finalEndpoint = endpoint.replace(dependencyMatch[0], dependencyValue);
    }

    const response = await fetch(finalEndpoint);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `Request failed with status ${response.status}`);
    }
    const data = await response.json();
    if (data.success) {
      return data.options || data.inventories || data.devices || data.backups || [];
    }
    throw new Error(data.message || "API returned success: false.");
  } catch (error) {
    toast.error(`Failed to fetch options: ${error.message}`);
    console.error(`[BaselineScriptOptions] Fetch error from endpoint ${endpoint}:`, error);
    return [];
  }
}

// =============================================================================
// SECTION 3: INPUT RENDERERS
// =============================================================================
/**
 * Renders a radio input field.
 * @param {Object} props - Component props.
 */
const RadioInput = ({ param, value, onChange }) => (
  <div className="mt-2 space-y-2">
    {param.options.map((option) => (
      <label
        key={option.value}
        className="flex items-center text-sm text-slate-700 cursor-pointer p-2 rounded-md hover:bg-slate-50"
      >
        <input
          type="radio"
          name={param.name}
          value={option.value}
          checked={value === option.value}
          onChange={(e) => onChange(param.name, e.target.value)}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300"
        />
        <span className="ml-3 font-medium">{option.label}</span>
      </label>
    ))}
  </div>
);

/**
 * Renders a select input field with dynamic or static options.
 * @param {Object} props - Component props.
 */
const SelectInput = ({ param, value, onChange, options, isLoading }) => (
  <>
    {isLoading ? (
      <div className="mt-2 flex items-center gap-2 text-sm text-slate-500 italic">
        <PulseLoader size={6} color="#475569" /> Loading...
      </div>
    ) : options.length === 0 ? (
      <p className="text-sm text-slate-500 italic mt-2">No options available.</p>
    ) : (
      <select
        value={value || ""}
        onChange={(e) => onChange(param.name, e.target.value)}
        className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
      >
        <option value="" disabled>
          Select {param.label}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )}
  </>
);

/**
 * Renders a text or number input field.
 * @param {Object} props - Component props.
 */
const TextOrNumberInput = ({ param, value, onChange }) => (
  <input
    type={param.type === "number" ? "number" : "text"}
    value={value || ""}
    onChange={(e) => onChange(param.name, e.target.value)}
    className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
    placeholder={param.placeholder || `Enter ${param.label}`}
  />
);

// =============================================================================
// SECTION 4: MAIN COMPONENT
// =============================================================================
/**
 * Renders standard sidebar form fields based on script metadata.
 * @param {Object} props - Component props.
 * @param {Object} props.script - Script metadata.
 * @param {Object} props.parameters - Current script parameters.
 * @param {Function} props.onParamChange - Callback to update parameters.
 */
function BaselineScriptOptions({ script, parameters, onParamChange }) {
  // State for dynamic options and loading states
  const [dynamicOptions, setDynamicOptions] = useState({});
  const [loadingStates, setLoadingStates] = useState({});

  // Memoized list of visible sidebar parameters
  const sidebarParameters = React.useMemo(() => {
    return (
      script.parameters?.filter((param) => {
        if (param.layout !== "sidebar") return false;
        if (param.show_if) {
          const controllingParameterValue = parameters[param.show_if.name];
          return (
            controllingParameterValue !== undefined &&
            String(controllingParameterValue) === String(param.show_if.value)
          );
        }
        return true;
      }) || []
    );
  }, [script.parameters, parameters]);

  // Memoized function to fetch options for a parameter
  const loadOptionsForParam = useCallback(
    async (param) => {
      if (!param.dynamicOptionsEndpoint) return;

      setLoadingStates((prev) => ({ ...prev, [param.name]: true }));
      const options = await fetchDynamicOptions(param.dynamicOptionsEndpoint, parameters);
      setDynamicOptions((prev) => ({ ...prev, [param.name]: options }));
      setLoadingStates((prev) => ({ ...prev, [param.name]: false }));
    },
    [parameters]
  );

  // Fetch dynamic options when sidebar parameters change
  useEffect(() => {
    sidebarParameters.forEach((param) => {
      if (param.dynamicOptionsEndpoint) {
        loadOptionsForParam(param);
      }
    });
  }, [sidebarParameters, loadOptionsForParam]);

  // Render message if no sidebar options are available
  if (sidebarParameters.length === 0) {
    return <p className="text-xs text-slate-500 italic">This script has no additional sidebar options.</p>;
  }

  // Render form fields
  return (
    <div className="space-y-6">
      {sidebarParameters.map((param) => (
        <div key={param.name}>
          <label className="block text-sm font-semibold text-slate-700">{param.label}</label>
          {param.description && <p className="text-xs text-slate-500 mt-1">{param.description}</p>}

          {param.type === "radio" && (
            <RadioInput param={param} value={parameters[param.name]} onChange={onParamChange} />
          )}

          {(param.type === "select" || param.type === "enum") && (
            <SelectInput
              param={param}
              value={parameters[param.name]}
              onChange={onParamChange}
              options={dynamicOptions[param.name] || param.options || []}
              isLoading={loadingStates[param.name] || false}
            />
          )}

          {(param.type === "text" || param.type === "number") && (
            <TextOrNumberInput param={param} value={parameters[param.name]} onChange={onParamChange} />
          )}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// SECTION 5: EXPORT
// =============================================================================
export default BaselineScriptOptions;
