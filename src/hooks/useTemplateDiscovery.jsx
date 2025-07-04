// src/hooks/useTemplateDiscovery.js

import { useState, useEffect, useCallback } from "react"; // Added useCallback

// Define the base URL for your backend API
const API_BASE_URL = "http://localhost:3001";

/**
 * Custom hook for discovering and managing configuration templates available from the backend.
 * It fetches a list of templates, categorizes them, and provides state for loading and errors.
 *
 * @param {string} category - Optional category filter to narrow down the templates (e.g., "Interface", "Routing").
 * @param {string} environment - Target environment filter (e.g., "development", "lab", "staging", "production").
 * @returns {object} An object containing:
 * - categorizedTemplates: An object where keys are categories and values are arrays of templates.
 * - availableTemplates: A flat array of all discovered templates.
 * - loading: Boolean indicating if data is currently being fetched.
 * - error: String containing any error message if fetching fails.
 * - totalCount: Total number of templates discovered.
 * - discoverTemplates: A function to manually trigger template discovery with optional filters.
 * - refetch: A function to re-run template discovery with the hook's initial category and environment.
 */
export const useTemplateDiscovery = (
  category = null,
  environment = "development",
) => {
  // State to store templates categorized by their 'category' property
  const [categorizedTemplates, setCategorizedTemplates] = useState({});
  // State to store all available templates in a flat array
  const [availableTemplates, setAvailableTemplates] = useState([]);
  // State to track loading status
  const [loading, setLoading] = useState(false);
  // State to store any error messages
  const [error, setError] = useState(null);
  // State to store the total count of discovered templates
  const [totalCount, setTotalCount] = useState(0);

  /**
   * Asynchronously fetches templates from the backend API.
   * This function can be called internally by the useEffect or externally for manual refresh.
   *
   * Wrapped in useCallback to memoize the function, preventing unnecessary re-renders
   * when it's used as a dependency in useEffect.
   *
   * @param {string} [filterCategory=category] - Overrides the hook's default category filter for this fetch.
   * @param {string} [env=environment] - Overrides the hook's default environment filter for this fetch.
   */
  const discoverTemplates = useCallback(
    async (filterCategory = category, env = environment) => {
      setLoading(true); // Set loading to true when starting the fetch
      setError(null); // Clear any previous errors

      try {
        // Make a POST request to the template discovery API endpoint
        const response = await fetch(`${API_BASE_URL}/api/templates/discover`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json", // Specify content type as JSON
          },
          // Send the category and environment filters in the request body
          body: JSON.stringify({
            category: filterCategory,
            environment: env,
          }),
        });

        const data = await response.json(); // Parse the JSON response

        // Check if the HTTP response was not OK (e.g., 404, 500)
        if (!response.ok) {
          // Throw an error with the message from the backend or a generic HTTP error
          throw new Error(
            data.message || `HTTP error! status: ${response.status}`,
          );
        }

        // Check the 'success' flag in the backend's custom response
        if (data.success) {
          // Update state with the discovered templates and their counts
          setCategorizedTemplates(data.discovered_templates || {});
          setAvailableTemplates(data.available_templates || []);
          setTotalCount(data.total_count || 0);
        } else {
          // Throw an error if the backend indicates failure (even with a 2xx status)
          throw new Error(data.message || "Template discovery failed");
        }
      } catch (err) {
        // Catch any network or parsing errors
        console.error("Template discovery error:", err);
        setError(err.message); // Set the error state
        // Clear template data on error
        setCategorizedTemplates({});
        setAvailableTemplates([]);
        setTotalCount(0);
      } finally {
        setLoading(false); // Set loading to false once the fetch is complete (success or error)
      }
    },
    [category, environment], // Dependencies for useCallback: re-create discoverTemplates only if these change
  );

  // useEffect hook to automatically discover templates when the hook is first used
  // or when the 'discoverTemplates' function reference changes (which happens only if
  // 'category' or 'environment' change due to useCallback).
  useEffect(() => {
    discoverTemplates();
  }, [discoverTemplates]); // Dependency: re-run effect when discoverTemplates reference changes

  // Return the state and functions for components to consume
  return {
    categorizedTemplates,
    availableTemplates,
    loading,
    error,
    totalCount,
    discoverTemplates, // Allows external components to trigger discovery with new params
    refetch: () => discoverTemplates(category, environment), // Convenience function to re-fetch with current params
  };
};

/**
 * Custom hook for getting detailed information about a specific template.
 * It fetches the full details, including parameters and content, for a given template ID.
 *
 * @param {string} templateId - The unique ID of the template to fetch (e.g., "interface_config").
 * @returns {object} An object containing:
 * - template: The detailed template object, or null if not found/loading.
 * - loading: Boolean indicating if data is currently being fetched.
 * - error: String containing any error message if fetching fails.
 * - fetchTemplate: A function to manually trigger fetching a template by ID.
 * - refetch: A function to re-run the fetch for the hook's current templateId.
 */
export const useTemplateDetail = (templateId) => {
  // State to store the fetched detailed template object
  const [template, setTemplate] = useState(null);
  // State to track loading status
  const [loading, setLoading] = useState(false);
  // State to store any error messages
  const [error, setError] = useState(null);

  /**
   * Asynchronously fetches detailed template information from the backend API.
   *
   * @param {string} [id=templateId] - Overrides the hook's default template ID for this fetch.
   */
  const fetchTemplate = useCallback(
    async (id = templateId) => {
      // If no template ID is provided, clear existing template data and return
      if (!id) {
        setTemplate(null);
        return;
      }

      setLoading(true); // Set loading to true
      setError(null); // Clear any previous errors

      try {
        // Make a GET request to the template detail API endpoint
        const response = await fetch(`${API_BASE_URL}/api/templates/${id}`);
        const data = await response.json(); // Parse the JSON response

        // Check if the HTTP response was not OK
        if (!response.ok) {
          throw new Error(
            data.message || `HTTP error! status: ${response.status}`,
          );
        }

        // Check the 'success' flag in the backend's custom response
        if (data.success) {
          setTemplate(data.template); // Update state with the fetched template
        } else {
          throw new Error(data.message || "Template fetch failed");
        }
      } catch (err) {
        // Catch any network or parsing errors
        console.error("Template detail error:", err);
        setError(err.message); // Set the error state
        setTemplate(null); // Clear template data on error
      } finally {
        setLoading(false); // Set loading to false once complete
      }
    },
    [templateId], // Dependency for useCallback
  );

  // useEffect hook to automatically fetch template details when the hook is first used
  // or when the 'fetchTemplate' function reference changes (due to useCallback).
  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]); // Dependency: re-run effect if fetchTemplate changes

  // Return the state and functions for components to consume
  return {
    template,
    loading,
    error,
    fetchTemplate, // Allows external components to trigger fetch with a new ID
    refetch: () => fetchTemplate(templateId), // Convenience function to re-fetch with current ID
  };
};

/**
 * Custom hook for generating configuration from a selected template and user-provided parameters.
 * It sends the template ID and parameters to the backend for rendering.
 *
 * @returns {object} An object containing:
 * - generatedConfig: The string of the generated configuration, or null.
 * - loading: Boolean indicating if generation is in progress.
 * - error: String containing any error message if generation fails.
 * - generateConfig: A function to trigger the configuration generation process.
 */
export const useTemplateGeneration = () => {
  // State to store the generated configuration string
  const [generatedConfig, setGeneratedConfig] = useState(null);
  // State to track loading status
  const [loading, setLoading] = useState(false);
  // State to store any error messages
  const [error, setError] = useState(null);

  /**
   * Asynchronously sends a request to the backend to generate configuration.
   *
   * Wrapped in useCallback to memoize the function.
   *
   * @param {string} templateId - The ID of the template to use for generation.
   * @param {object} parameters - An object containing key-value pairs for the template parameters.
   */
  const generateConfig = useCallback(
    async (templateId, parameters = {}) => {
      // Basic validation: Template ID is required
      if (!templateId) {
        setError("Template ID is required");
        return;
      }

      setLoading(true); // Set loading to true
      setError(null); // Clear any previous errors
      setGeneratedConfig(null); // Clear previous generated config

      try {
        // Make a POST request to the template generation API endpoint
        const response = await fetch(`${API_BASE_URL}/api/templates/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json", // Specify content type as JSON
          },
          // Send the templateId and the parameters in the request body
          body: JSON.stringify({
            templateId,
            parameters, // This line was previously incomplete, now correctly passes 'parameters'
          }),
        });

        const data = await response.json(); // Parse the JSON response

        // Check if the HTTP response was not OK
        if (!response.ok) {
          throw new Error(
            data.message || `HTTP error! status: ${response.status}`,
          );
        }

        // Check the 'success' flag in the backend's custom response
        if (data.success) {
          setGeneratedConfig(data.generated_config); // Update state with the generated configuration
        } else {
          throw new Error(data.message || "Configuration generation failed");
        }
      } catch (err) {
        // Catch any network or parsing errors
        console.error("Configuration generation error:", err);
        setError(err.message); // Set the error state
        setGeneratedConfig(null); // Clear generated config on error
      } finally {
        setLoading(false); // Set loading to false once complete
      }
    },
    [], // No dependencies for generateConfig as it doesn't depend on external props/state that change frequently
  );

  // This hook typically doesn't need a useEffect to auto-generate on mount,
  // as generation is usually triggered by a user action (e.g., form submission).

  // Return the state and the generation function for components to consume
  return {
    generatedConfig,
    loading,
    error,
    generateConfig, // Function to trigger configuration generation
    // No 'refetch' concept here as it's an action, not a data fetch that re-runs.
  };
};
