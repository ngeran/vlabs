// src/components/ScriptParameterInput.jsx
import React from "react";

/**
 * @description Renders a single input field for a script parameter based on its type.
 * Supports text, password, number, boolean (checkbox), enum (select), and now RADIO buttons.
 * @param {object} props - The component props.
 * @param {object} props.param - The parameter definition object (from script metadata).
 * @param {*} props.value - The current value of the parameter.
 * @param {(name: string, value: any) => void} props.onChange - Callback for when the parameter's value changes.
 */
function ScriptParameterInput({ param, value, onChange }) {
  const handleChange = (e) => {
    let newValue;
    switch (e.target.type) {
      case "checkbox":
        newValue = e.target.checked;
        break;
      case "number":
        newValue = e.target.value === "" ? "" : Number(e.target.value);
        break;
      default:
        newValue = e.target.value;
    }
    onChange(param.name, newValue);
  };

  const commonProps = {
    id: `param-${param.name}`,
    name: param.name,
    onChange: handleChange,
    required: param.required,
    className:
      "mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-slate-100",
  };

  const renderInput = () => {
    switch (param.type) {
      // --- NEW CASE FOR RADIO BUTTONS ---
      case "radio":
        return (
          <div className="mt-2 space-y-2">
            {param.options?.map((option) => (
              <label
                key={option.value}
                className="flex items-center text-sm text-slate-700 cursor-pointer p-2 rounded-md hover:bg-slate-50"
              >
                <input
                  type="radio"
                  name={param.name} // All radios in a group must have the same name
                  value={option.value}
                  checked={value === option.value} // Check if this option's value matches the current state
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <span className="ml-3 font-medium">{option.label}</span>
              </label>
            ))}
          </div>
        );
      // --- END OF NEW CASE ---

      case "boolean":
        return (
          <div className="flex items-center mt-2">
            <input
              type="checkbox"
              {...commonProps}
              checked={!!value}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label
              htmlFor={commonProps.id}
              className="ml-2 text-sm text-gray-700"
            >
              {param.description}
            </label>
          </div>
        );
      case "enum":
        return (
          <select {...commonProps} value={value ?? param.default ?? ""}>
            {param.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      case "password":
        return (
          <input
            type="password"
            {...commonProps}
            value={value ?? ""}
            placeholder={param.placeholder}
          />
        );
      case "number":
        return (
          <input
            type="number"
            {...commonProps}
            value={value ?? ""}
            placeholder={param.placeholder}
          />
        );
      case "text":
      default:
        return (
          <input
            type="text"
            {...commonProps}
            value={value ?? ""}
            placeholder={param.placeholder}
          />
        );
    }
  };

  return (
    <div className="mb-4">
      <label
        htmlFor={commonProps.id}
        className="block text-sm font-medium text-gray-700"
      >
        {param.label || param.name}
        {param.required && <span className="text-red-500">*</span>}
      </label>
      {renderInput()}
      {param.type !== "boolean" && param.description && (
        <p className="mt-1 text-xs text-slate-500">{param.description}</p>
      )}
    </div>
  );
}

export default ScriptParameterInput;
