// =================================================================================================
// COMPONENT: ScriptParameterInput.jsx
//
// PURPOSE:
//   - Renders a single input field for a script parameter.
//   - Supports all standard types: text, password, number, boolean, select/enum, radio.
//
// -------------------------------------------------------------------------------------------------
// SECTION 1: IMPORTS
// -------------------------------------------------------------------------------------------------
import React from "react";

/**
 * @description Renders an input for a single parameter.
 *
 * @param {object} props
 * @param {object} props.param - Parameter config.
 * @param {*} props.value - Current value.
 * @param {(name: string, value: any) => void} props.onChange - Change handler.
 */
function ScriptParameterInput({ param, value, onChange }) {
  // -------------------------------------------------------------------------------------------------
  // SECTION 2: VALUE CHANGE HANDLER
  // -------------------------------------------------------------------------------------------------
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

  // Common props for all inputs
  const commonProps = {
    id: `param-${param.name}`,
    name: param.name,
    onChange: handleChange,
    required: param.required,
    className:
      "mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-slate-100",
  };

  // -------------------------------------------------------------------------------------------------
  // SECTION 3: INPUT RENDERING LOGIC
  // -------------------------------------------------------------------------------------------------
  const renderInput = () => {
    switch (param.type) {
      // --- RADIO BUTTONS ---
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
                  name={param.name}
                  value={option.value}
                  checked={value === option.value}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <span className="ml-3 font-medium">{option.label}</span>
              </label>
            ))}
          </div>
        );
      // --- BOOLEAN (CHECKBOX) ---
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
      // --- SELECT or ENUM (Dropdown) ---
      case "select":
      case "enum":
        return (
          <select {...commonProps} value={value ?? param.default ?? ""}>
            <option value="" disabled>Select an option</option>
            {param.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      // --- PASSWORD ---
      case "password":
        return (
          <input
            type="password"
            {...commonProps}
            value={value ?? ""}
            placeholder={param.placeholder}
          />
        );
      // --- NUMBER ---
      case "number":
        return (
          <input
            type="number"
            {...commonProps}
            value={value ?? ""}
            placeholder={param.placeholder}
          />
        );
      // --- TEXT (default) ---
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

  // -------------------------------------------------------------------------------------------------
  // SECTION 4: MAIN FIELD RENDER
  // -------------------------------------------------------------------------------------------------
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

// -------------------------------------------------------------------------------------------------
// SECTION 5: EXTENDING FOR NEW TYPES
// -------------------------------------------------------------------------------------------------
/**
 * To support new parameter types:
 * - Add logic for the new type in the switch above.
 * - Update metadata.yml with the new parameter and type.
 * - Use `show_if` for conditional visibility, `active: false` to hide.
 */
