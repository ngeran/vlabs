// src/components/FetchDynamicOptions.jsx
import React, { useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw } from "lucide-react";
import PulseLoader from "react-spinners/PulseLoader";

const API_BASE_URL = "http://localhost:3001";

// ====================================================================================
// SECTION 1: COMPONENT DEFINITION
// ====================================================================================

/**
 * A component that can fetch dynamic options (e.g., backup files) for a script.
 * This version is enhanced with defensive checks to prevent crashes when a script's
 * metadata does not conform to the expected structure.
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

  const [isLoading, setIsLoading] = useState(false);

  // ====================================================================================
  // SECTION 3: DEFENSIVE LOGIC & GUARD CLAUSES
  // ====================================================================================
  // This section contains the critical fixes. It validates the `script` prop
  // before any logic attempts to use it, preventing crashes.

  // FIX: Perform a series of checks to determine if this component should render at all.
  const shouldRender =
    // 1. Ensure the script object itself and its `capabilities` key exist.
    script &&
    script.capabilities?.dynamicOptions &&
    // 2. CRITICAL: Ensure `script.parameters` is an actual array.
    //    This directly fixes the "TypeError: script.parameters is undefined" crash.
    Array.isArray(script.parameters) &&
    // 3. Ensure the specific parameter that triggers the fetch (the "source")
    //    is actually defined in the script's metadata.
    script.parameters.some(p => p.name === script.capabilities.dynamicOptions.sourceParameter);

  // If any of the above checks fail, the component will render nothing.
  // This is the correct behavior for scripts that don't support this dynamic feature.
  if (!shouldRender) {
    return null;
  }

  // If we have passed the checks, it is now safe to destructure the configuration.
  const { sourceParameter, targetParameter, apiEndpoint } = script.capabilities.dynamicOptions;
  const sourceValue = parameters[sourceParameter];


  // ====================================================================================
  // SECTION 4: DATA FETCHING LOGIC
  // ====================================================================================

  /**
   * Fetches the dynamic options from the backend API.
   */
  const fetchOptions = async () => {
    // Don't attempt to fetch if the source parameter (e.g., a hostname) is empty.
    if (!sourceValue) {
      onParamChange(targetParameter, []); // Clear any existing options.
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}${apiEndpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [sourceParameter]: sourceValue }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || "Failed to fetch dynamic options from API.");
      }

      // Update the parent component's state with the fetched options.
      // Assumes the API returns an array of strings in a key named `options`.
      onParamChange(targetParameter, data.options || []);

      if ((data.options || []).length === 0) {
        toast.error(`No ${targetParameter.replace(/_/g, ' ')}s found for: ${sourceValue}`);
      } else {
        toast.success(`Successfully fetched ${data.options.length} ${targetParameter.replace(/_/g, ' ')}s.`);
      }

    } catch (err) {
      toast.error(err.message);
      onParamChange(targetParameter, []); // Clear options on any error to ensure clean state.
    } finally {
      setIsLoading(false);
    }
  };


  // ====================================================================================
  // SECTION 5: RENDER LOGIC
  // ====================================================================================
  // This JSX will only be rendered if the `shouldRender` check passed.

  return (
    <div className="flex items-end gap-2">
      {/* This container is a placeholder in case you want to add form fields
          (like a dropdown) associated with this feature in the future. */}
      <div className="flex-grow"></div>

      {/* The button that triggers the fetch action. */}
      <button
        type="button"
        onClick={fetchOptions}
        disabled={isLoading || !sourceValue}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed"
        title={`Fetch ${targetParameter.replace(/_/g, ' ')}s for ${sourceValue}`}
      >
        {isLoading ? (
          <PulseLoader size={6} color="#475569" />
        ) : (
          <RefreshCw size={14} />
        )}
        <span>Fetch {targetParameter.replace(/_/g, ' ')}</span>
      </button>
    </div>
  );
}

export default FetchDynamicOptions;
