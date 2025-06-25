// src/hooks/useScriptData.js
import { useState, useEffect } from "react";

export function useScriptData() {
  const [availableScripts, setAvailableScripts] = useState([]);
  const [availableInventories, setAvailableInventories] = useState([]);
  const [fetchingScripts, setFetchingScripts] = useState(true);
  const [fetchingInventories, setFetchingInventories] = useState(true);
  const [error, setError] = useState(""); // Renamed for clarity within the hook's context

  // Effect to fetch available scripts
  useEffect(() => {
    const fetchScripts = async () => {
      try {
        const response = await fetch("http://localhost:3001/api/scripts/list");
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
  }, []); // Empty dependency array means this runs once on mount

  // Effect to fetch available inventories
  useEffect(() => {
    const fetchInventories = async () => {
      try {
        const response = await fetch(
          "http://localhost:3001/api/inventories/list",
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

    // This condition means inventories are only fetched AFTER scripts are no longer fetching.
    // This is okay for now, as inventories often depend on the context of available scripts.
    if (!fetchingScripts) {
      // Removed availableScripts.length > 0 from dependency as it might not be strictly necessary for just *triggering* fetchInventories, but fetchingScripts is crucial.
      fetchInventories();
    }
  }, [fetchingScripts]); // Dependency on fetchingScripts

  return {
    availableScripts,
    availableInventories,
    fetchingScripts,
    fetchingInventories,
    error, // This is the error related to data fetching
  };
}
