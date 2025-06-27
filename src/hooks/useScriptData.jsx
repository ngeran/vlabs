import { useState, useEffect } from "react";

/**
 * Custom React hook to fetch and manage script/inventory lists,
 * and to support dynamic test discovery for JSNAPy (or similar) scripts.
 */
export function useScriptData() {
  // --- Script and inventory state management ---
  const [availableScripts, setAvailableScripts] = useState([]);              // List of available scripts (from backend)
  const [availableInventories, setAvailableInventories] = useState([]);      // List of available inventories (from backend)
  const [fetchingScripts, setFetchingScripts] = useState(true);              // Loading state for scripts
  const [fetchingInventories, setFetchingInventories] = useState(true);      // Loading state for inventories
  const [error, setError] = useState("");                                    // Error state for scripts/inventories

  // --- NEW: State for dynamic JSNAPy test discovery ---
  const [availableTests, setAvailableTests] = useState({});                  // Map: environment => {tests, metadata}
  const [fetchingTests, setFetchingTests] = useState(false);                 // Loading state for test discovery
  const [testDiscoveryError, setTestDiscoveryError] = useState("");          // Error state for test discovery

  // --- Fetch available scripts from backend on mount ---
  useEffect(() => {
    const fetchScripts = async () => {
      try {
        // Query backend for script definitions
        const response = await fetch("http://10.177.102.200:3001/api/scripts/list");
        if (!response.ok) {
          throw new Error("Failed to fetch script list from backend.");
        }
        const data = await response.json();
        if (data.success && Array.isArray(data.scripts)) {
          setAvailableScripts(data.scripts);
        } else {
          setError(data.message || "Malformed script list received.");
        }
      } catch (err) {
        console.error("Error fetching script list:", err);
        setError(`Failed to load scripts: ${err.message}`);
      } finally {
        setFetchingScripts(false);
      }
    };

    fetchScripts();
  }, []);

  // --- Fetch inventories list AFTER script list is loaded (ensures scripts appear first in UI) ---
  useEffect(() => {
    const fetchInventories = async () => {
      try {
        // Query backend for inventory (host/group) files
        const response = await fetch(
          "http://10.177.102.200:3001/api/inventories/list",
        );
        if (!response.ok) {
          throw new Error("Failed to fetch inventory list from backend.");
        }
        const data = await response.json();
        if (data.success && Array.isArray(data.inventories)) {
          setAvailableInventories(data.inventories);
        } else {
          setError(data.message || "Malformed inventory list received.");
        }
      } catch (err) {
        console.error("Error fetching inventory list:", err);
        setError(`Failed to load inventories: ${err.message}`);
      } finally {
        setFetchingInventories(false);
      }
    };

    // Only fetch inventories after scripts are loaded (optional, but smoother UX)
    if (!fetchingScripts) {
      fetchInventories();
    }
  }, [fetchingScripts]);

  // --- NEW: Fetch available tests for JSNAPy for a given environment ---
  /**
   * @param {string} environment - The environment to query for test discovery (e.g. 'development')
   * @returns {Array} Array of test option objects with metadata
   */
  const fetchAvailableTests = async (environment = 'development') => {
    setFetchingTests(true);
    setTestDiscoveryError("");
    
    try {
      console.log(`[FRONTEND] Discovering tests for environment: ${environment}`);
      
      // POST to backend's test discovery endpoint
      const response = await fetch("http://10.177.102.200:3001/api/scripts/discover-tests", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: 'run_jsnapy_tests',
          environment: environment,
          listTests: true
        })
      });

      if (!response.ok) {
        throw new Error(`Test discovery failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success && data.discovered_tests) {
        console.log(`[FRONTEND] Discovered ${Object.keys(data.discovered_tests).length} tests for ${environment}`);
        
        // Transform discovered_tests into an array suitable for checkbox UI
        const testOptions = Object.entries(data.discovered_tests).map(([testName, testConfig]) => ({
          id: testName,
          label: testName.replace('test_', '').replace(/_/g, ' ').toUpperCase(), // Human-friendly name
          description: testConfig.description || `JSNAPy test: ${testName}`,
          environment_classification: testConfig.environment_classification || 'development',
          safety_level: testConfig.safety_level || 'safe',
          production_approved: testConfig.production_approved || false,
          max_impact_level: testConfig.max_impact_level || 'low'
        }));

        setAvailableTests({
          [environment]: {
            tests: testOptions,
            metadata: data.backend_metadata || {},
            discovery_time: new Date().toISOString(),
            discovered_by: "nikos-geranios_vgi"
          }
        });

        return testOptions;
      } else {
        throw new Error(data.message || "Failed to discover tests");
      }
    } catch (err) {
      console.error("Error discovering tests:", err);
      setTestDiscoveryError(`Failed to discover tests: ${err.message}`);
      return [];
    } finally {
      setFetchingTests(false);
    }
  };

  // --- NEW: Clear backend and local test discovery cache (optional utility) ---
  /**
   * @param {string} scriptId - The script for which to clear discovery cache (default: 'run_jsnapy_tests')
   */
  const clearTestCache = async (scriptId = 'run_jsnapy_tests') => {
    try {
      const response = await fetch("http://10.177.102.200:3001/api/scripts/clear-discovery-cache", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId })
      });

      const data = await response.json();
      if (data.success) {
        console.log(`[FRONTEND] Test cache cleared: ${data.message}`);
        setAvailableTests({}); // Also clear local cache
      }
    } catch (err) {
      console.error("Error clearing test cache:", err);
    }
  };

  // --- Return all state and utilities to consumers (e.g., your runner form) ---
  return {
    availableScripts,         // List of all scripts for runner dropdown
    availableInventories,     // List of all inventories for selection
    fetchingScripts,          // Loading state for scripts
    fetchingInventories,      // Loading state for inventories
    error,                    // Any error in scripts/inventories

    // --- NEW: Test discovery exports ---
    availableTests,           // { [environment]: { tests, metadata, ...} }
    fetchingTests,            // Loading state for discovery
    testDiscoveryError,       // Error state for test discovery
    fetchAvailableTests,      // Function to fetch tests for a given environment
    clearTestCache            // Function to clear discovery cache
  };
}