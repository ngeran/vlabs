// src/components/DynamicScriptForm.jsx

import React from "react";
import ScriptParameterInput from "./ScriptParameterInput";

/**
 * @description Renders a form from a list of parameter definitions.
 * It now directly passes down the powerful onChange handler from its parent.
 *
 * @param {object} props - Component props.
 * @param {Array<object>} props.parametersToRender - The filtered list of parameters to display.
 * @param {object} props.formValues - The current state of all form values.
 * @param {(name: string, value: any) => void} props.onParamChange - The single, consistent handler for a parameter change.
 */
function DynamicScriptForm({ parametersToRender, formValues, onParamChange }) {
  if (!parametersToRender || parametersToRender.length === 0) {
    return null;
  }

  // --- Grouping logic for horizontal layout (this part remains correct) ---
  const formRows = [];
  let horizontalGroup = [];

  parametersToRender.forEach((param, index) => {
    if (param.layout === "horizontal") {
      horizontalGroup.push(param);
    } else {
      if (horizontalGroup.length > 0) {
        formRows.push({ type: "horizontal", items: horizontalGroup });
        horizontalGroup = [];
      }
      formRows.push({ type: "vertical", items: [param] });
    }

    if (index === parametersToRender.length - 1 && horizontalGroup.length > 0) {
      formRows.push({ type: "horizontal", items: horizontalGroup });
    }
  });

  return (
    <div className="space-y-4">
      {formRows.map((row, rowIndex) => {
        if (row.type === "horizontal") {
          return (
            <div
              key={rowIndex}
              className="flex flex-col md:flex-row md:gap-6 md:items-start"
            >
              {row.items.map((param) => (
                <div key={param.name} className="flex-1 w-full">
                  <ScriptParameterInput
                    param={param}
                    value={formValues[param.name]}
                    // ✨ FIX: Directly pass the powerful handler down
                    onChange={onParamChange}
                  />
                </div>
              ))}
            </div>
          );
        } else {
          const param = row.items[0];
          return (
            <div key={param.name}>
              <ScriptParameterInput
                param={param}
                value={formValues[param.name]}
                // ✨ FIX: Directly pass the powerful handler down
                onChange={onParamChange}
              />
            </div>
          );
        }
      })}
    </div>
  );
}

export default DynamicScriptForm;
