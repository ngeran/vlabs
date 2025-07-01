// src/hooks/useTestDiscovery.js
import { useState, useEffect } from "react";

const API_BASE_URL = "http://localhost:3001";

/**
 * A generic, reusable hook to fetch discoverable tests for ANY script ID.
 * @param {string} scriptId The ID of the script for which to discover tests.
 * @param {string} [environment='development'] The target environment.
 * @returns {{categorizedTests: object, loading: boolean, error: string|null}}
 */
export function useTestDiscovery(scriptId, environment = "development") {
  const [categorizedTests, setCategorizedTests] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Don't try to fetch if there's no scriptId.
    if (!scriptId) {
      setCategorizedTests({});
      return;
    }

    const fetchTests = async () => {
      setLoading(true);
      setError(null);
      console.log(
        `[useTestDiscovery] Discovering tests for script: ${scriptId}`,
      );
      try {
        // Call the correct, modern API endpoint
        const response = await fetch(
          `${API_BASE_URL}/api/scripts/discover-tests`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scriptId, environment }),
          },
        );
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.message || "Failed to discover tests via API.");
        }

        console.log(
          `[useTestDiscovery] Successfully discovered tests for ${scriptId}:`,
          data.discovered_tests,
        );
        setCategorizedTests(data.discovered_tests || {});
      } catch (err) {
        console.error(
          `[useTestDiscovery] CATCH BLOCK ERROR for ${scriptId}:`,
          err,
        );
        setError(err.message);
        setCategorizedTests({});
      } finally {
        setLoading(false);
      }
    };

    fetchTests();
    // This effect re-runs whenever the user selects a different script or environment
  }, [scriptId, environment]);

  return { categorizedTests, loading, error };
}
