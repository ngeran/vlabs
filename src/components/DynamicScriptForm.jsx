// =================================================================================================
// COMPONENT: DynamicScriptForm.jsx
//
// PURPOSE:
//   - Renders form fields for parameters except those handled by RestoreForm.
//   - Supports layout grouping (horizontal/vertical).
//   - Injects dynamic options for select/enum fields.
//   - Respects `show_if` and `active` logic in metadata.yml for visibility.
//
// -------------------------------------------------------------------------------------------------
// SECTION 1: IMPORTS
// -------------------------------------------------------------------------------------------------
import React from "react";
import ScriptParameterInput from "./ScriptParameterInput";

/**
 * @description Renders form fields for the given list of parameters.
 *
 * @param {object} props
 * @param {Array<object>} props.parametersToRender - Parameters for rendering.
 * @param {object} props.formValues - State of all parameter values.
 * @param {(name: string, value: any) => void} props.onParamChange - Change handler.
 */
function DynamicScriptForm({ parametersToRender, formValues, onParamChange }) {
  if (!parametersToRender || parametersToRender.length === 0) return null;

  // -------------------------------------------------------------------------------------------------
  // SECTION 2: FILTER PARAMETERS BASED ON show_if AND active LOGIC
  // -------------------------------------------------------------------------------------------------
  const visibleParameters = parametersToRender.filter(param => {
    // Only render parameters that are active (active === undefined or active === true)
    if (param.active === false) return false;
    if (param.show_if) {
      const { name, value } = param.show_if;
      return formValues[name] === value;
    }
    return true;
  });

  // -------------------------------------------------------------------------------------------------
  // SECTION 3: GROUPING LOGIC FOR LAYOUT
  // -------------------------------------------------------------------------------------------------
  const formRows = [];
  let horizontalGroup = [];

  visibleParameters.forEach((param, index) => {
    // Inject dynamic options for select/enum fields if available in formValues
    if ((param.type === "select" || param.type === "enum") && formValues[`${param.name}_options`]) {
      param.options = formValues[`${param.name}_options`];
    }

    if (param.layout === "horizontal") {
      horizontalGroup.push(param);
    } else {
      if (horizontalGroup.length > 0) {
        formRows.push({ type: "horizontal", items: horizontalGroup });
        horizontalGroup = [];
      }
      formRows.push({ type: "vertical", items: [param] });
    }
    if (index === visibleParameters.length - 1 && horizontalGroup.length > 0) {
      formRows.push({ type: "horizontal", items: horizontalGroup });
    }
  });

  // -------------------------------------------------------------------------------------------------
  // SECTION 4: RENDERING EACH ROW OF THE FORM
  // -------------------------------------------------------------------------------------------------
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

// -------------------------------------------------------------------------------------------------
// SECTION 5: EXTENDING FOR NEW TYPES
// -------------------------------------------------------------------------------------------------
/**
 * To support new parameter types:
 * - Add new parameter in metadata.yml with type/layout/options.
 * - If you need a new input type, extend ScriptParameterInput.jsx.
 * - Use `show_if` for conditional visibility, `active: false` to hide.
 */
