/**
 * React component for rendering baseline script options in the sidebar.
 * Supports common input types (radio, checkbox, select, text, number) based on metadata.
 * Handles dynamic data fetching for inputs with a specified API endpoint.
 */

import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";

const API_BASE_URL = "http://localhost:3001";

// -----------------------------------
// Utility Functions
// -----------------------------------

/**
 * Fetch dynamic options for a parameter from the specified API endpoint.
 * @param {string} endpoint - API endpoint to fetch options.
 * @returns {Promise<Array>} Array of option objects { value, label }.
 */
async function fetchDynamicOptions(endpoint) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`);
    const data = await response.json();
    if (data.success) {
      return data.backups || data.options || []; // Adjust based on API response structure
    } else {
      toast.error(data.message || "Failed to fetch dynamic options.");
      return [];
    }
  } catch (error) {
    toast.error("Could not connect to server to fetch options.");
    return [];
  }
}

// -----------------------------------
// Input Renderers
// -----------------------------------

/**
 * Render a radio input group.
 * @param {Object} param - Parameter metadata.
 * @param {any} value - Current parameter value.
 * @param {Function} onChange - Callback to update parameter.
 */
function RadioInput({ param, value, onChange }) {
  return (
    <div className="space-y-2">
      {param.options.map(option => (
        <label key={option.value} className="flex items-center">
          <input
            type="radio"
            name={param.name}
            value={option.value}
            checked={value === option.value}
            onChange={(e) => onChange(param.name, e.target.value)}
            className="mr-2"
          />
          <span className="text-sm text-slate-600">{option.label}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * Render a checkbox input group.
 * @param {Object} param - Parameter metadata.
 * @param {Array} value - Current parameter values.
 * @param {Function} onChange - Callback to update parameter.
 */
function CheckboxInput({ param, value = [], onChange }) {
  const handleCheckboxChange = (optionValue) => {
    const newValue = value.includes(optionValue)
      ? value.filter(v => v !== optionValue)
      : [...value, optionValue];
    onChange(param.name, newValue);
  };

  return (
    <div className="space-y-2">
      {param.options.map(option => (
        <label key={option.value} className="flex items-center">
          <input
            type="checkbox"
            value={option.value}
            checked={value.includes(option.value)}
            onChange={() => handleCheckboxChange(option.value)}
            className="mr-2"
          />
          <span className="text-sm text-slate-600">{option.label}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * Render a select input with static or dynamic options.
 * @param {Object} param - Parameter metadata.
 * @param {any} value - Current parameter value.
 * @param {Function} onChange - Callback to update parameter.
 * @param {Array} dynamicOptions - Fetched dynamic options.
 * @param {boolean} isLoading - Loading state for dynamic options.
 */
function SelectInput({ param, value, onChange, dynamicOptions, isLoading }) {
  const options = param.dynamicOptionsEndpoint ? dynamicOptions : param.options || [];

  return (
    <>
      {isLoading ? (
        <p className="text-sm text-slate-500 italic">Loading options...</p>
      ) : options.length === 0 ? (
        <p className="text-sm text-red-600">No options available.</p>
      ) : (
        <select
          value={value || ""}
          onChange={(e) => onChange(param.name, e.target.value)}
          className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        >
          <option value="" disabled>Select an option</option>
          {options.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      )}
    </>
  );
}

/**
 * Render a text or number input.
 * @param {Object} param - Parameter metadata.
 * @param {any} value - Current parameter value.
 * @param {Function} onChange - Callback to update parameter.
 */
function TextOrNumberInput({ param, value, onChange }) {
  return (
    <input
      type={param.type === "number" ? "number" : "text"}
      value={value || ""}
      onChange={(e) => onChange(param.name, param.type === "number" ? Number(e.target.value) : e.target.value)}
      className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
      placeholder={param.description || `Enter ${param.label}`}
    />
  );
}

// -----------------------------------
// Main Baseline Script Options Component
// -----------------------------------

/**
 * Main component for rendering baseline script options based on metadata.
 * @param {Object} props - Component props.
 * @param {Object} props.script - Script metadata.
 * @param {Object} props.parameters - Current script parameters.
 * @param {Function} props.onParamChange - Callback to update parameters.
 */
function BaselineScriptOptions({ script, parameters, onParamChange }) {
  const [dynamicOptions, setDynamicOptions] = useState({});
  const [loadingOptions, setLoadingOptions] = useState({});

  // Fetch dynamic options for parameters with dynamicOptionsEndpoint
  useEffect(() => {
    const fetchAllDynamicOptions = async () => {
      const sidebarParams = script.parameters?.filter(p => p.layout === "sidebar") || [];
      for (const param of sidebarParams) {
        if (param.dynamicOptionsEndpoint) {
          setLoadingOptions(prev => ({ ...prev, [param.name]: true }));
          const options = await fetchDynamicOptions(param.dynamicOptionsEndpoint);
          setDynamicOptions(prev => ({ ...prev, [param.name]: options }));
          setLoadingOptions(prev => ({ ...prev, [param.name]: false }));
        }
      }
    };
    fetchAllDynamicOptions();
  }, [script]);

  // Filter sidebar parameters based on show_if conditions
  const sidebarParameters = script.parameters?.filter(param => {
    if (param.layout !== "sidebar") return false;
    if (param.show_if) {
      const controllingValue = parameters[param.show_if.name];
      return controllingValue !== undefined && controllingValue === param.show_if.value;
    }
    return true;
  }) || [];

  if (!script || sidebarParameters.length === 0) {
    return <p className="text-xs text-slate-500 italic">This script has no additional sidebar options.</p>;
  }

  return (
    <div className="space-y-4">
      {sidebarParameters.map(param => (
        <div key={param.name}>
          <h3 className="text-sm font-semibold text-slate-700">{param.label}</h3>
          {param.description && (
            <p className="text-xs text-slate-500 mt-1">{param.description}</p>
          )}
          {param.type === "radio" && (
            <RadioInput param={param} value={parameters[param.name]} onChange={onParamChange} />
          )}
          {param.type === "checkbox" && (
            <CheckboxInput param={param} value={parameters[param.name] || []} onChange={onParamChange} />
          )}
          {(param.type === "select" || param.type === "enum") && (
            <SelectInput
              param={param}
              value={parameters[param.name]}
              onChange={onParamChange}
              dynamicOptions={dynamicOptions[param.name] || []}
              isLoading={loadingOptions[param.name] || false}
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

export default BaselineScriptOptions;
