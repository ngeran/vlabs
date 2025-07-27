// =================================================================================================
// COMPONENT: FetchDynamicOptions.jsx
//
// PURPOSE:
//   - Handles dynamic fetching of options for parameters with dynamicOptionsEndpoint/apiEndpoint.
//   - Respects both `show_if` and `active` fields from metadata.yml for option visibility.
//   - Only parameters with active: true (or undefined) and matching show_if are rendered.
//
// -------------------------------------------------------------------------------------------------
// SECTION 1: IMPORTS AND CONSTANTS
// -------------------------------------------------------------------------------------------------
import React, { useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw, Database } from "lucide-react";
import PulseLoader from "react-spinners/PulseLoader";

const API_BASE_URL = "http://localhost:3001";

// -------------------------------------------------------------------------------------------------
// SECTION 2: MAIN COMPONENT LOGIC
// -------------------------------------------------------------------------------------------------
function FetchDynamicOptions({ script, parameters, onParamChange }) {
  // State for loading indicators per parameter
  const [loadingStates, setLoadingStates] = useState({});

  // Only render if there are parameters with dynamic options
  const shouldRender =
    script &&
    Array.isArray(script.parameters) &&
    script.parameters.some(param =>
      (param.apiEndpoint || param.dynamicOptionsEndpoint) && (param.active === undefined || param.active === true)
    );

  if (!shouldRender) return null;

  // Filter parameters that should show "Fetch" button, considering active and show_if logic
  const dynamicParameters = script.parameters.filter(param => {
    // Only show if active !== false
    if (param.active === false) return false;
    // Only show if dynamic endpoint present
    if (!(param.apiEndpoint || param.dynamicOptionsEndpoint)) return false;
    // Only show if show_if matches (or not present)
    if (param.show_if) {
      const { name, value } = param.show_if;
      if (parameters[name] !== value) return false;
    }
    return true;
  });

  // -------------------------------------------------------------------------------------------------
  // SECTION 3: FETCH LOGIC FOR DYNAMIC PARAMETERS
  // -------------------------------------------------------------------------------------------------
  /**
   * Fetches options for a parameter from its configured endpoint.
   */
  const fetchOptionsForParameter = async (paramConfig) => {
    const { name: paramName, apiEndpoint, dynamicOptionsEndpoint, dependsOn } = paramConfig;
    const endpoint = apiEndpoint || dynamicOptionsEndpoint;

    // Check dependencies if defined
    if (dependsOn) {
      const { field, value } = dependsOn;
      if (parameters[field] !== value) return;
    }

    setLoadingStates(prev => ({ ...prev, [paramName]: true }));

    try {
      // Compose request body for POST endpoints
      const requestBody = {
        ...Object.fromEntries(
          Object.entries(parameters).filter(([_, v]) => v !== undefined && v !== null && v !== "")
        )
      };

      // Use POST for /api/ endpoints, GET otherwise
      const response = endpoint.startsWith("/api/")
        ? await fetch(`${API_BASE_URL}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          })
        : await fetch(`${API_BASE_URL}${endpoint}`);

      const data = await response.json();
      if (!data.success) throw new Error(data.message || `Failed to fetch ${paramName} options`);

      // Standardize option extraction
      let options = [];
      if (Array.isArray(data.options)) options = data.options;
      else if (Array.isArray(data.data)) options = data.data;
      else if (Array.isArray(data[paramName])) options = data[paramName];
      else if (Array.isArray(data.backups)) options = data.backups;

      onParamChange(`${paramName}_options`, options);

      if (options.length === 0) {
        toast.error(`No ${paramName.replace(/_/g, ' ')}s found`);
      } else {
        toast.success(`Found ${options.length} ${paramName.replace(/_/g, ' ')}(s)`);
      }
    } catch (err) {
      console.error(`Error fetching ${paramName} options:`, err);
      toast.error(err.message || `Failed to fetch ${paramName} options`);
      onParamChange(`${paramName}_options`, []);
    } finally {
      setLoadingStates(prev => ({ ...prev, [paramName]: false }));
    }
  };

  // -------------------------------------------------------------------------------------------------
  // SECTION 4: UTILITY FUNCTIONS FOR UI
  // -------------------------------------------------------------------------------------------------
  const getParameterIcon = (paramConfig) => {
    const paramName = paramConfig.name.toLowerCase();
    if (paramName.includes('inventory') || paramName.includes('database')) return Database;
    return RefreshCw;
  };

  const shouldEnableFetch = (paramConfig) => {
    if (loadingStates[paramConfig.name]) return false;
    if (paramConfig.dependsOn) {
      const { field, value } = paramConfig.dependsOn;
      if (parameters[field] !== value) return false;
    }
    return true;
  };

  // -------------------------------------------------------------------------------------------------
  // SECTION 5: RENDER LOGIC
  // -------------------------------------------------------------------------------------------------
  return (
    <div className="space-y-3">
      {dynamicParameters.map((paramConfig) => {
        const Icon = getParameterIcon(paramConfig);
        const isLoading = loadingStates[paramConfig.name];
        const isEnabled = shouldEnableFetch(paramConfig);
        const paramDisplayName = paramConfig.label || paramConfig.name.replace(/_/g, ' ');

        return (
          <div key={paramConfig.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg border">
                <Icon className="h-4 w-4 text-gray-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Fetch {paramDisplayName}
                </p>
                <p className="text-xs text-gray-500">
                  {paramConfig.description || `Load available ${paramDisplayName.toLowerCase()} options`}
                </p>
                {paramConfig.dependsOn && (
                  <p className="text-xs text-orange-600 mt-1">
                    Requires: {paramConfig.dependsOn.field} = "{paramConfig.dependsOn.value}"
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => fetchOptionsForParameter(paramConfig)}
              disabled={!isEnabled}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                isEnabled
                  ? "text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200"
                  : "text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed"
              }`}
              title={
                !isEnabled && paramConfig.dependsOn
                  ? `Set ${paramConfig.dependsOn.field} to "${paramConfig.dependsOn.value}" first`
                  : `Fetch ${paramDisplayName.toLowerCase()}`
              }
            >
              {isLoading ? (
                <PulseLoader size={6} color="#1d4ed8" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              <span>
                {isLoading ? "Fetching..." : "Fetch"}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default FetchDynamicOptions;

// -------------------------------------------------------------------------------------------------
// SECTION 6: EXTENDING METADATA CAPABILITIES
// -------------------------------------------------------------------------------------------------
/**
 * To control option visibility:
 * - Use `active: false` in metadata.yml for any parameter you want hidden.
 * - Use `show_if` for conditional visibility (backup/restore).
 * - Only parameters with dynamicOptionsEndpoint/apiEndpoint and active: true get fetch buttons.
 */
