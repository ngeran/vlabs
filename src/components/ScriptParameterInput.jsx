// src/components/ScriptParameterInput.jsx
import React from "react";

/**
 * @description Renders a single input field for a script parameter based on its type.
 * Supports text, number, boolean (checkbox), and enum (select dropdown) types.
 * @param {object} props - The component props.
 * @param {object} props.param - The parameter definition object (from script metadata).
 * @param {*} props.value - The current value of the parameter.
 * @param {(name: string, value: any) => void} props.onChange - Callback for when the parameter's value changes.
 */
function ScriptParameterInput({ param, value, onChange }) {
  const handleChange = (e) => {
    let newValue = e.target.value;
    if (param.type === "boolean") {
      newValue = e.target.checked;
    } else if (param.type === "number") {
      newValue = Number(newValue); // Convert to number if type is number
    }
    onChange(param.name, newValue);
  };

  return (
    <div className="mb-4">
      {param.type === "boolean" ? (
        <div className="flex items-center mt-1">
          <input
            type="checkbox"
            id={`param-${param.name}`}
            checked={value === true} // Ensure boolean check
            onChange={handleChange}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label
            htmlFor={`param-${param.name}`}
            className="ml-2 block text-sm font-medium text-gray-700"
          >
            {param.label || param.name}
            {param.required && <span className="text-red-500">*</span>}
            {param.description && (
              <span className="font-normal text-xs text-gray-500 ml-1">
                ({param.description})
              </span>
            )}
          </label>
        </div>
      ) : (
        <>
          <label
            htmlFor={`param-${param.name}`}
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {param.label || param.name}{" "}
            {param.required && <span className="text-red-500">*</span>}:
            {param.description && (
              <span className="font-normal text-xs text-gray-500 ml-1">
                ({param.description})
              </span>
            )}
          </label>
          {param.type === "enum" ? (
            <select
              id={`param-${param.name}`}
              value={value || ""}
              onChange={handleChange}
              required={param.required}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              {/* --- FIX START: Use option.value for key/value and option.label for display --- */}
              {param.options &&
                param.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              {/* --- FIX END --- */}
            </select>
          ) : (
            <input
              type={param.type === "number" ? "number" : "text"}
              id={`param-${param.name}`}
              value={value || ""}
              onChange={handleChange}
              placeholder={
                param.placeholder || `Enter ${param.label || param.name}`
              }
              required={param.required}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          )}
        </>
      )}
    </div>
  );
}

export default ScriptParameterInput;
