// src/hooks/useTemplateDiscovery.js
import { useState, useEffect, useCallback } from "react";

const API_BASE_URL = "http://localhost:3001";

// ====================================================================================
// HOOK 1: useTemplateDiscovery (WITH ENHANCED DEBUGGING)
// ====================================================================================
/**
 * Custom hook for discovering available configuration templates from the backend.
 * This version includes detailed logging to trace the data flow from the API.
 */
export const useTemplateDiscovery = (
  category = null,
  environment = "development",
) => {
  const [categorizedTemplates, setCategorizedTemplates] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // This async function contains the actual fetching logic.
    const discoverTemplates = async () => {
      setLoading(true);
      setError(null);

      // TROUBLESHOOTING: Log the exact request body being sent to the API.
      console.log(`[useTemplateDiscovery] STEP 1: Fetching templates with body:`, JSON.stringify({ category, environment }));

      try {
        const response = await fetch(`${API_BASE_URL}/api/templates/discover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, environment }),
        });

        // TROUBLESHOOTING: Log the raw HTTP response status.
        console.log(`[useTemplateDiscovery] STEP 2: API raw response status: ${response.status}`);

        const data = await response.json();

        // TROUBLESHOOTING: THIS IS THE MOST IMPORTANT LOG.
        // It shows us exactly what the backend sent back before any processing.
        console.log('%c[useTemplateDiscovery] STEP 3: Full API response data received:', 'color: lightblue; font-weight: bold;', data);

        if (!response.ok) {
          throw new Error(data.message || `HTTP error! status: ${response.status}`);
        }

        if (data.success) {
          // TROUBLESHOOTING: Log the data we are about to set into our React state.
          console.log('[useTemplateDiscovery] STEP 4: API call successful. Attempting to set state with:', data.discovered_templates);
          setCategorizedTemplates(data.discovered_templates || {});
        } else {
          // If the server says success: false, we MUST treat it as an error.
          throw new Error(data.message || "Template discovery failed according to API 'success: false' flag.");
        }
      } catch (err) {
        // TROUBLESHOOTING: If any part of the try block fails, this will log the error.
        console.error("[useTemplateDiscovery] CATCH BLOCK ERROR: An error occurred during fetch.", err);
        setError(err.message);
        setCategorizedTemplates({}); // Ensure state is cleared on error.
      } finally {
        setLoading(false);
      }
    };

    discoverTemplates();
  // This dependency array ensures the fetch runs again if category or environment changes.
  }, [category, environment]);

  return {
    categorizedTemplates,
    loading,
    error,
  };
};

// ====================================================================================
// HOOK 2: useTemplateDetail (Included for completeness)
// ====================================================================================
/**
 * Custom hook for getting detailed information about a specific template.
 */
export const useTemplateDetail = (templateId) => {
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTemplate = async () => {
      if (!templateId) {
        setTemplate(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/templates/${templateId}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || `HTTP error! status: ${response.status}`);
        }
        if (data.success) {
          setTemplate(data.template);
        } else {
          throw new Error(data.message || "Template fetch failed");
        }
      } catch (err) {
        console.error("Template detail error:", err);
        setError(err.message);
        setTemplate(null);
      } finally {
        setLoading(false);
      }
    };

    fetchTemplate();
  }, [templateId]);

  return { template, loading, error };
};

// =================================================================================
// HOOK 3: useTemplateGeneration (Included for completeness)
// =================================================================================
/**
 * Custom hook for the "action" of generating a configuration preview.
 */
export const useTemplateGeneration = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateConfig = useCallback(async (templateId, parameters = {}) => {
    if (!templateId) {
      return { success: false, error: "Template ID is required." };
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/templates/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, parameters }),
      });
      const data = await response.json();
      if (!response.ok) {
        const errorMessage = data.message || `HTTP error! Status: ${response.status}`;
        return { success: false, error: errorMessage };
      }
      return data;
    } catch (err) {
      console.error("Configuration generation error:", err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, generateConfig };
};
