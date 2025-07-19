// src/components/FetchDynamicOptions.jsx
import React, { useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw, Download, Database } from "lucide-react";
import PulseLoader from "react-spinners/PulseLoader";

const API_BASE_URL = "http://localhost:3001";

// ====================================================================================
// SECTION 1: COMPONENT DEFINITION
// ====================================================================================

/**
 * Enhanced FetchDynamicOptions component that works with the new capability-based system.
 * Supports multiple dynamic option types and integrates with device targeting capabilities.
 *
 * @param {object} props
 * @param {object} props.script - The configuration object for the currently selected script.
 * @param {object} props.parameters - The current state of script parameters.
 * @param {function} props.onParamChange - Callback to update a parameter in the parent component.
 */
function FetchDynamicOptions({ script, parameters, onParamChange }) {
  // ====================================================================================
  // SECTION 2: STATE MANAGEMENT
  // ====================================================================================

  const [loadingStates, setLoadingStates] = useState({});

  // ====================================================================================
  // SECTION 3: DEFENSIVE LOGIC & ENHANCED GUARD CLAUSES
  // ====================================================================================

  // Enhanced validation for the new capability system
  const shouldRender =
    script &&
    script.capabilities &&
    Array.isArray(script.parameters) &&
    // Check if any parameters have dynamic options configured
    script.parameters.some(param => param.apiEndpoint || param.dynamicOptions);

  if (!shouldRender) {
    return null;
  }

  // Find all parameters that support dynamic fetching
  const dynamicParameters = script.parameters.filter(param =>
    param.apiEndpoint || param.dynamicOptions
  );

  // ====================================================================================
  // SECTION 4: ENHANCED DATA FETCHING LOGIC
  // ====================================================================================

  /**
   * Generic function to fetch dynamic options for any parameter
   */
  const fetchOptionsForParameter = async (paramConfig) => {
    const { name: paramName, apiEndpoint, dependsOn, dynamicOptions } = paramConfig;

    // Determine the API endpoint - could be direct or from dynamicOptions
    const endpoint = apiEndpoint || dynamicOptions?.apiEndpoint;
    if (!endpoint) return;

    // Check dependencies if they exist
    if (dependsOn) {
      const { field: depField, value: depValue } = dependsOn;
      if (parameters[depField] !== depValue) {
        return; // Don't fetch if dependency condition isn't met
      }
    }

    // For device targeting, check if we have the required source parameter
    if (script.capabilities?.deviceTargeting) {
      const hasHostname = parameters.hostname && parameters.hostname.trim();
      const hasInventoryFile = parameters.inventory_file && parameters.inventory_file.trim();

      if (!hasHostname && !hasInventoryFile) {
        toast.error("Please specify a target device (hostname or inventory file) first");
        return;
      }
    }

    const loadingKey = paramName;
    setLoadingStates(prev => ({ ...prev, [loadingKey]: true }));

    try {
      // Prepare request body with relevant parameters
      const requestBody = {
        // Include device targeting info if available
        ...(parameters.hostname && { hostname: parameters.hostname }),
        ...(parameters.inventory_file && { inventory_file: parameters.inventory_file }),
        // Include auth info if available (for authenticated requests)
        ...(parameters.username && { username: parameters.username }),
        // Include any other relevant parameters
        ...Object.fromEntries(
          Object.entries(parameters).filter(([key, value]) =>
            value !== undefined && value !== null && value !== ""
          )
        )
      };

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || `Failed to fetch ${paramName} options`);
      }

      // Handle different response formats
      let options = [];
      if (Array.isArray(data.options)) {
        options = data.options;
      } else if (Array.isArray(data.data)) {
        options = data.data;
      } else if (data[paramName]) {
        options = Array.isArray(data[paramName]) ? data[paramName] : [data[paramName]];
      }

      // Update the parameter with fetched options
      const optionsKey = `${paramName}_options`;
      onParamChange(optionsKey, options);

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
      setLoadingStates(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  /**
   * Get appropriate icon for parameter type
   */
  const getParameterIcon = (paramConfig) => {
    const paramName = paramConfig.name.toLowerCase();
    if (paramName.includes('backup') || paramName.includes('file')) {
      return Download;
    }
    if (paramName.includes('inventory') || paramName.includes('database')) {
      return Database;
    }
    return RefreshCw;
  };

  /**
   * Check if a fetch button should be enabled
   */
  const shouldEnableFetch = (paramConfig) => {
    // Check if currently loading
    if (loadingStates[paramConfig.name]) {
      return false;
    }

    // Check dependencies
    if (paramConfig.dependsOn) {
      const { field: depField, value: depValue } = paramConfig.dependsOn;
      if (parameters[depField] !== depValue) {
        return false;
      }
    }

    // For device-dependent fetches, ensure device targeting is configured
    if (script.capabilities?.deviceTargeting) {
      const hasHostname = parameters.hostname && parameters.hostname.trim();
      const hasInventoryFile = parameters.inventory_file && parameters.inventory_file.trim();
      return hasHostname || hasInventoryFile;
    }

    return true;
  };

  // ====================================================================================
  // SECTION 5: ENHANCED RENDER LOGIC
  // ====================================================================================

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
                  : !isEnabled && script.capabilities?.deviceTargeting
                  ? "Configure device targeting first"
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
