// =================================================================================================
//
// FILE:               src/components/forms/UniversalTemplateForm.jsx
//
// DESCRIPTION:
//   This component dynamically renders a form for template parameters based on Jinja2 template
//   metadata (from templates.yml). It is designed to be used within DeviceConfigurationRunner.jsx
//   to handle template-specific inputs, supporting various field types (text, number, enum/select)
//   with validation and real-time feedback. It aligns with the structure and styling of
//   BackupForm.jsx and RestoreForm.jsx for consistency across the application.
//
// OVERVIEW:
//   The UniversalTemplateForm takes template metadata and renders input fields based on parameter
//   definitions, including labels, descriptions, and validation rules (e.g., required, regex,
//   min/max). It uses ModernDropdown for enum/select fields and supports dynamic options fetched
//   from API endpoints. The component ensures accessibility and provides user-friendly error
//   messages via react-hot-toast.
//
// KEY FEATURES:
//   - Dynamic Field Rendering: Generates form fields based on template parameters (text, number, enum/select).
//   - Validation Support: Enforces required fields, regex patterns, and min/max constraints.
//   - Dynamic Options: Fetches options for select fields from dynamicOptionsEndpoint (if specified).
//   - Consistent Styling: Matches Tailwind CSS styles used in BackupForm.jsx and RestoreForm.jsx.
//   - Error Handling: Displays validation errors via toast notifications.
//   - Disabled State: Supports disabling inputs during busy operations (e.g., generation or application).
//   - Integration Ready: Designed for seamless integration with DeviceConfigurationRunner.jsx.
//
// HOW-TO GUIDE (INTEGRATION):
//   - Place this component in `src/components/forms/`.
//   - Use within DeviceConfigurationRunner.jsx to replace the current template parameters section.
//   - Pass `template` (from useTemplateDetail), `parameters`, `onParamChange`, and `disabled` props.
//   - Ensure backend API at `http://localhost:3001` supports dynamicOptionsEndpoint for select fields.
//   - Update DeviceConfigurationRunner.jsx to import and render UniversalTemplateForm.jsx:
//     ```jsx
//     import UniversalTemplateForm from "../forms/UniversalTemplateForm.jsx";
//     // In render:
//     <UniversalTemplateForm
//       template={template}
//       parameters={dynamicParameters}
//       onParamChange={handleParamChange}
//       disabled={isBusy}
//     />
//     ```
//   - Verify `templates.yml` includes parameter metadata (type, label, required, etc.).
//   - Test with templates having diverse parameter types (text, number, enum, select with dynamic options).
//
// DEPENDENCIES:
//   - React Core Hooks: useState, useEffect, useCallback.
//   - Custom Components: ModernDropdown (for enum/select fields).
//   - External Libraries: react-hot-toast, lucide-react.
//   - Backend API: Supports dynamicOptionsEndpoint for fetching select options.
//
// =================================================================================================

// SECTION 1: IMPORTS & CONFIGURATION
// -------------------------------------------------------------------------------------------------
import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { AlertTriangle } from "lucide-react";

// Custom Components
import ModernDropdown from "../shared/ModernDropdown.jsx";

// Base URL for API Requests
const API_BASE_URL = "http://localhost:3001";

// SECTION 2: MAIN COMPONENT - UniversalTemplateForm
// -------------------------------------------------------------------------------------------------
/**
 * Dynamically renders a form for template parameters based on Jinja2 template metadata.
 * @param {Object} props - Component props
 * @param {Object} props.template - Template metadata from templates.yml (via useTemplateDetail)
 * @param {Object} props.parameters - Current parameter values
 * @param {Function} props.onParamChange - Callback to update parameter values
 * @param {boolean} props.disabled - Whether the form is disabled
 */
function UniversalTemplateForm({ template, parameters, onParamChange, disabled }) {
  // SECTION 3: STATE AND HOOKS
  // -----------------------------------------------------------------------------------------------
  const [dynamicOptions, setDynamicOptions] = useState({});

  // Fetch dynamic options for select fields
  const fetchDynamicOptions = useCallback(async (endpoint, paramName) => {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch options for ${paramName}`);
      }
      const data = await response.json();
      setDynamicOptions(prev => ({
        ...prev,
        [paramName]: data.options || data, // Adjust based on API response structure
      }));
    } catch (error) {
      toast.error(`Error fetching options for ${paramName}: ${error.message}`);
      setDynamicOptions(prev => ({ ...prev, [paramName]: [] }));
    }
  }, []);

  // Load dynamic options when template changes
  useEffect(() => {
    if (template?.parameters) {
      template.parameters.forEach(param => {
        if (param.dynamicOptionsEndpoint) {
          fetchDynamicOptions(param.dynamicOptionsEndpoint, param.name);
        }
      });
    }
  }, [template, fetchDynamicOptions]);

  // SECTION 4: VALIDATION LOGIC
  // -----------------------------------------------------------------------------------------------
  /**
   * Validates a parameter value based on its metadata.
   * @param {Object} param - Parameter metadata
   * @param {string|number} value - Current value
   * @returns {string|null} Error message if invalid, null if valid
   */
  const validateParameter = useCallback((param, value) => {
    if (param.required && (value === undefined || value === "")) {
      return `${param.label || param.name} is required.`;
    }
    if (param.regex && value && !new RegExp(param.regex).test(value)) {
      return `${param.label || param.name} does not match the required pattern.`;
    }
    if (param.type === "number") {
      const num = Number(value);
      if (isNaN(num)) return `${param.label || param.name} must be a valid number.`;
      if (param.min !== undefined && num < param.min) return `${param.label || param.name} must be at least ${param.min}.`;
      if (param.max !== undefined && num > param.max) return `${param.label || param.name} cannot exceed ${param.max}.`;
    }
    return null;
  }, []);

  // SECTION 5: EVENT HANDLERS
  // -----------------------------------------------------------------------------------------------
  // Handle input changes with validation
  const handleInputChange = useCallback((param, value) => {
    const error = validateParameter(param, value);
    if (error) {
      toast.error(error);
    } else {
      onParamChange(param.name, value);
    }
  }, [onParamChange, validateParameter]);

  // SECTION 6: RENDER LOGIC
  // -----------------------------------------------------------------------------------------------
  // Handle empty or invalid template parameters
  if (!template?.parameters || template.parameters.length === 0) {
    return (
      <div className="text-center py-4 text-slate-600">
        No parameters required for this template.
      </div>
    );
  }

  // Render dynamic form fields
  return (
    <fieldset className="border p-4 rounded-md">
      <legend className="px-2 font-semibold text-slate-700">Template Variables</legend>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {template.parameters.map(param => (
          <div key={param.name} className="space-y-1">
            <label htmlFor={param.name} className="block text-sm text-slate-600 font-medium">
              {param.label || param.name} {param.required && <span className="text-red-500">*</span>}
            </label>
            {param.type === "enum" || param.type === "select" ? (
              <ModernDropdown
                id={param.name}
                options={
                  param.dynamicOptionsEndpoint
                    ? dynamicOptions[param.name] || []
                    : param.options?.map(opt => ({ value: opt.value, label: opt.label })) || []
                }
                value={parameters[param.name] || ""}
                onChange={value => handleInputChange(param, value)}
                placeholder={param.placeholder || `Select ${param.label || param.name}`}
                disabled={disabled || (param.dynamicOptionsEndpoint && !dynamicOptions[param.name])}
                className="w-full"
              />
            ) : (
              <input
                id={param.name}
                type={param.type === "number" ? "number" : "text"}
                placeholder={param.placeholder || ""}
                value={parameters[param.name] || ""}
                onChange={e => handleInputChange(param, e.target.value)}
                disabled={disabled}
                className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                min={param.min}
                max={param.max}
              />
            )}
            {param.description && (
              <p className="text-xs text-slate-500 mt-1">{param.description}</p>
            )}
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export default UniversalTemplateForm;
