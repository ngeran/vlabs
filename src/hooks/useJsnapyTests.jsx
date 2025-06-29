import { useState, useEffect } from "react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export function useJsnapyTests() {
  const [categorizedTests, setCategorizedTests] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchAndCategorizeTests() {
      try {
        setLoading(true);
        setError(null);

        console.log("[useJsnapyTests] Fetching from /api/scripts/list...");
        const res = await fetch(`${API_BASE_URL}/api/scripts/list`);
        if (!res.ok) throw new Error(`API responded with status ${res.status}`);

        const data = await res.json();
        console.log("[useJsnapyTests] Received data from API:", data); // <-- DEBUG LINE 1

        if (!data.success)
          throw new Error(data.message || "API request failed");

        const jsnapyScript = data.scripts.find(
          (s) => s.id === "run_jsnapy_tests",
        );
        console.log(
          "[useJsnapyTests] Found JSNAPy script object:",
          jsnapyScript,
        ); // <-- DEBUG LINE 2

        if (!jsnapyScript || !jsnapyScript.available_tests) {
          const errorMessage =
            jsnapyScript?.discovery_error ||
            "JSNAPy 'available_tests' list not found in API response.";
          throw new Error(errorMessage);
        }

        const categories = jsnapyScript.available_tests.reduce((acc, test) => {
          const category = test.category || "General";
          if (!acc[category]) {
            acc[category] = [];
          }
          acc[category].push({ id: test.name, description: test.description });
          return acc;
        }, {});

        console.log("[useJsnapyTests] Setting categorized tests:", categories); // <-- DEBUG LINE 3
        setCategorizedTests(categories);
      } catch (err) {
        console.error("[useJsnapyTests] CATCH BLOCK ERROR:", err); // <-- DEBUG LINE 4
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchAndCategorizeTests();
  }, []);

  return { categorizedTests, loading, error };
}
