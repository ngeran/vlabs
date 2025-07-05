// src/components/DynamicForm.jsx
import React from "react";

const DynamicForm = ({ parameters, values, onChange }) => {
  if (!parameters || parameters.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No parameters defined for this item.
      </p>
    );
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    // Basic type conversion, add more as needed (e.g., for boolean, array)
    let newValue = value;
    if (type === "number") {
      newValue = parseFloat(value);
      if (isNaN(newValue)) newValue = ""; // Handle empty string for numbers
    } else if (type === "checkbox") {
      newValue = checked;
    }
    onChange(name, newValue);
  };

  return (
    <div className="space-y-4">
      {parameters.map((param) => (
        <div key={param.name} className="flex flex-col">
          <label
            htmlFor={param.name}
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            {param.label}{" "}
            {param.required && <span className="text-red-500">*</span>}
          </label>
          {param.type === "text" || param.type === "number" ? (
            <input
              type={param.type}
              id={param.name}
              name={param.name}
              value={values[param.name] || (param.type === "number" ? "" : "")}
              onChange={handleChange}
              placeholder={param.placeholder}
              required={param.required}
              min={param.min}
              max={param.max}
              pattern={param.validation} // For client-side pattern validation
              className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          ) : (
            // Add more input types (e.g., select, textarea, checkbox) as needed
            <p className="text-red-500 text-sm">
              Unsupported parameter type: {param.type}
            </p>
          )}
          {param.description && (
            <p className="text-xs text-slate-500 mt-1">{param.description}</p>
          )}
        </div>
      ))}
    </div>
  );
};

export default DynamicForm;
