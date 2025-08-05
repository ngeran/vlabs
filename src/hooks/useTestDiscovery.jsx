// =============================================================================
// FILE:               src/hooks/useTestDiscovery.jsx
//
// DESCRIPTION:
//   A reusable React hook for fetching discoverable tests for any script.
//
// OVERVIEW:
//   This hook fetches categorized tests from the backend API for a given script ID
//   and environment. It manages loading and error states, making it suitable for
//   use in components that need dynamic test discovery, such as the JSNAPy Runner.
//
// KEY FEATURES:
//   - Fetches tests using the JsnapyApiService.
//   - Handles loading and error states.
//   - Automatically re-fetches when scriptId or environment changes.
//   - Logs detailed debugging information.
//
// DEPENDENCIES:
//   - react: For useState and useEffect hooks.
//   - JsnapyApiService: For making API calls to discover tests.
//
// HOW TO USE:
//   Import and use the hook in a component:
//   ```javascript
//   import { useTestDiscovery } from '../hooks/useTestDiscovery';
//
//   function MyComponent({ scriptId, environment }) {
//     const { categorizedTests, loading, error } = useTestDiscovery(scriptId, environment);
//     // Use categorizedTests, loading, error in your component
//   }
//   ```
// =============================================================================

// =============================================================================
// SECTION 1: IMPORTS
// =============================================================================
import { useState, useEffect } from "react";
import JsnapyApiService from "../services/JsnapyApiService";

// =============================================================================
// SECTION 2: HOOK DEFINITION
// =============================================================================
/**
 * Fetches discoverable tests for a given script ID and environment.
 * @param {string} scriptId - The ID of the script (e.g., 'jsnapy_runner').
 * @param {string} [environment='development'] - The target environment.
 * @returns {{categorizedTests: object, loading: boolean, error: string|null}}
 */
export function useTestDiscovery(scriptId, environment = "development") {
  // State for storing categorized tests
  const [categorizedTests, setCategorizedTests] = useState({});
  // State for tracking loading status
  const [loading, setLoading] = useState(false);
  // State for storing errors
  const [error, setError] = useState(null);

  // =============================================================================
  // SECTION 3: EFFECT FOR FETCHING TESTS
  // =============================================================================
  useEffect(() => {
    // Skip fetching if no scriptId is provided
    if (!scriptId) {
      console.log("[useTestDiscovery] No scriptId provided, skipping fetch");
      setCategorizedTests({});
      return;
    }

    console.log(`[useTestDiscovery] Starting fetch for scriptId: ${scriptId}, environment: ${environment}`);

    const fetchTests = async () => {
      setLoading(true);
      setError(null);

      try {
        const tests = await JsnapyApiService.discoverTests(scriptId, environment);
        setCategorizedTests(tests);
        console.log("[useTestDiscovery] Successfully set categorized tests:", tests);
      } catch (err) {
        console.error(`[useTestDiscovery] Error discovering tests for ${scriptId}:`, err);
        setError(err.message);
        setCategorizedTests({});
      } finally {
        setLoading(false);
      }
    };

    fetchTests();
  }, [scriptId, environment]);

  // =============================================================================
  // SECTION 4: RETURN VALUES
  // =============================================================================
  return { categorizedTests, loading, error };
}
