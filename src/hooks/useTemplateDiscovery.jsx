// src/hooks/useTemplateDiscovery.js

import { useState, useEffect, useCallback } from "react";

// Define the base URL for your backend API
const API_BASE_URL = "http://localhost:3001";

/**
 * Custom hook for discovering available configuration templates from the backend.
 */
export const useTemplateDiscovery = (
  category = null,
  environment = "development",
) => {
  const [categorizedTemplates, setCategorizedTemplates] = useState({});
  const [availableTemplates, setAvailableTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);

  const discoverTemplates = useCallback(
    async (filterCategory = category, env = environment) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/templates/discover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: filterCategory, environment: env }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            data.message || `HTTP error! status: ${response.status}`,
          );
        }
        if (data.success) {
          setCategorizedTemplates(data.discovered_templates || {});
          setAvailableTemplates(data.available_templates || []);
          setTotalCount(data.total_count || 0);
        } else {
          throw new Error(data.message || "Template discovery failed");
        }
      } catch (err) {
        console.error("Template discovery error:", err);
        setError(err.message);
        setCategorizedTemplates({});
        setAvailableTemplates([]);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    },
    [category, environment],
  );

  useEffect(() => {
    discoverTemplates();
  }, [discoverTemplates]);

  return {
    categorizedTemplates,
    availableTemplates,
    loading,
    error,
    totalCount,
    discoverTemplates,
    refetch: () => discoverTemplates(category, environment),
  };
};

/**
 * Custom hook for getting detailed information about a specific template.
 */
export const useTemplateDetail = (templateId) => {
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTemplate = useCallback(
    async (id = templateId) => {
      if (!id) {
        setTemplate(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/templates/${id}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            data.message || `HTTP error! status: ${response.status}`,
          );
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
    },
    [templateId],
  );

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  return {
    template,
    loading,
    error,
    fetchTemplate,
    refetch: () => fetchTemplate(templateId),
  };
};

// =================================================================================
// === THIS IS THE HOOK THAT HAS BEEN CORRECTED ======================================
// =================================================================================

/**
 * Custom hook for generating configuration from a selected template and user-provided parameters.
 * This is now an "action" hook. It performs the API call and RETURNS the result to the
 * component that called it.
 */
export const useTemplateGeneration = () => {
  // This hook only needs to manage its own loading and error state for the API call.
  // It does not need to store the generatedConfig itself.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Asynchronously sends a request to the backend to generate configuration.
   *
   * @param {string} templateId - The ID of the template to use for generation.
   * @param {object} parameters - An object containing key-value pairs for the template parameters.
   * @returns {Promise<object>} A promise that resolves to the result object from the backend API.
   *                            (e.g., { success: true, rendered_config: "..." } or { success: false, error: "..." })
   */
  const generateConfig = useCallback(
    async (templateId, parameters = {}) => {
      // Basic validation.
      if (!templateId) {
        return {
          success: false,
          error: "Template ID is required to generate config.",
        };
      }

      setLoading(true);
      setError(null);

      try {
        // Make the POST request to the generation API endpoint.
        const response = await fetch(`${API_BASE_URL}/api/templates/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Send the templateId and parameters in the request body.
          body: JSON.stringify({
            templateId,
            parameters,
          }),
        });

        // Parse the JSON response from the server.
        const data = await response.json();

        // Check for HTTP-level errors (e.g., 500 Internal Server Error).
        if (!response.ok) {
          // Construct a failure object and return it.
          const errorMessage =
            data.message || `HTTP error! Status: ${response.status}`;
          return { success: false, error: errorMessage };
        }

        // --- THIS IS THE KEY FIX ---
        // Return the entire 'data' object received from the backend.
        // The calling component will check `data.success` and use `data.rendered_config`.
        return data;
      } catch (err) {
        // Catch network errors or other exceptions during the fetch.
        console.error("Configuration generation error:", err);
        setError(err.message); // Set the hook's internal error state for debugging.
        // Return a standard failure object so the calling component knows what happened.
        return { success: false, error: err.message };
      } finally {
        // This always runs, whether the call succeeded or failed.
        setLoading(false);
      }
    },
    [], // No dependencies means this function is created once and never changes.
  );

  // The hook returns the action function and its related loading/error states.
  return {
    loading,
    error,
    generateConfig,
  };
};
