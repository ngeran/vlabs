// src/hooks/useTestDiscovery.js
import { useState, useEffect } from "react";

const API_BASE_URL = "http://localhost:3001";

// A generic hook to fetch discoverable tests for ANY script.
export function useTestDiscovery(scriptId, environment = "development") {
  const [categorizedTests, setCategorizedTests] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Don't fetch if there's no scriptId
    if (!scriptId) {
      setCategorizedTests({});
      return;
    }

    const fetchTests = async () => {
      setLoading(true);
      setError(null);
      try {
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
          throw new Error(data.message || "Failed to discover tests.");
        }

        // The API returns tests in a flat structure, we can categorize them here if needed,
        // or assume the backend provides a categorized structure. For now, let's use the backend's structure.
        setCategorizedTests(data.discovered_tests || {});
      } catch (err) {
        console.error(`Error discovering tests for ${scriptId}:`, err);
        setError(err.message);
        setCategorizedTests({});
      } finally {
        setLoading(false);
      }
    };

    fetchTests();
    // Re-run this effect if the scriptId or environment changes
  }, [scriptId, environment]);

  return { categorizedTests, loading, error };
}
