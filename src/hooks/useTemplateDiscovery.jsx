/**
 * @fileoverview Enhanced Template Discovery and Management React Hooks
 * @description A suite of robust, production-ready React hooks for fetching, caching, and managing
 *              template data from an API. These hooks are designed for resilience, performance, and
 *              full compatibility with consumer components like DeviceConfigurationRunner and UniversalTemplateForm.
 *
 * @author nikos-geranios_vgi
 * @created 2025-08-08
 * @lastModified 2025-08-08 15:10:00 UTC
 *
 * @section KEY_FEATURES
 * - Robust API Handling: Central `useApiCall` hook with request cancellation (AbortController) to prevent race conditions.
 * - Automatic Retries: `useTemplateDiscovery` automatically retries failed requests with exponential backoff.
 * - Smart Caching: `useTemplateDetail` implements an in-memory cache to reduce redundant API calls and improve UI speed.
 * - Data Integrity: Includes a `processTemplateData` utility to normalize and validate API responses, ensuring compatibility.
 * - Enhanced State Management: Provides rich state, including loading/error status, `refetch` functions, and request history.
 * - Developer-Friendly: Features a centralized configuration and a conditional debug logger for easier development and maintenance.
 *
 * @section HOW_TO_USE
 * 1. Import the hooks into your component:
 *    `import { useTemplateDiscovery, useTemplateDetail, useTemplateGeneration } from './useTemplateDiscovery';`
 *
 * 2. Use `useTemplateDiscovery` to fetch the list of all templates:
 *    `const { categorizedTemplates, loading, error, refetch } = useTemplateDiscovery('/api/templates/discover');`
 *
 * 3. Use `useTemplateDetail` to get data for a single selected template:
 *    `const { template, loading: isLoadingDetails } = useTemplateDetail(selectedTemplateId);`
 *
 * 4. Use `useTemplateGeneration` to generate a configuration from a template:
 *    `const { generateConfig, loading: isGenerating } = useTemplateGeneration();`
 *    `const handleGenerate = async () => {`
 *    `  const result = await generateConfig(templateId, { param1: 'value' });`
 *    `  if (result.success) { //... }`
 *    `}`
 */

import { useState, useEffect, useCallback, useRef } from "react";

// =============================================================================
// SECTION 1: CONFIGURATION AND CONSTANTS
// =============================================================================

const CONFIG = {
  // CORRECTED: Use import.meta.env for Vite environment variables
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || "http://localhost:3001",
  DEBUG_MODE: import.meta.env.VITE_DEBUG_MODE === "true",

  // Default cache duration for template details (5 minutes).
  DEFAULT_CACHE_TIME: 5 * 60 * 1000,
  // Maximum number of template details to keep in the cache.
  MAX_CACHE_ENTRIES: 50,
  // Default number of times to retry a failed API request.
  DEFAULT_RETRY_COUNT: 3,
  // Initial delay (in ms) before the first retry.
  DEFAULT_RETRY_DELAY: 1000,
  // Maximum number of generation results to store in history.
  MAX_HISTORY_ENTRIES: 10,
};

/**
 * A utility for logging debug messages only when DEBUG_MODE is enabled.
 * @param {string} prefix - A prefix to identify the source of the log (e.g., 'API Call').
 * @param {...any} args - The content to log.
 */
const debugLog = (prefix, ...args) => {
  if (CONFIG.DEBUG_MODE) {
    console.log(`[${prefix}]`, ...args);
  }
};

// =============================================================================
// SECTION 2: CORE API MANAGEMENT HOOK
// =============================================================================

/**
 * A centralized hook for making API calls with cancellation support.
 * This hook encapsulates the logic for `fetch` and `AbortController`.
 */
const useApiCall = () => {
  const abortControllerRef = useRef();

  /**
   * Makes a fetch request with automatic signal handling for cancellation.
   * @param {string} url - The full URL for the API request.
   * @param {object} options - Standard fetch options (method, headers, body, etc.).
   * @returns {Promise<object>} An object containing `{ success, data }` or throws an error.
   */
  const makeApiCall = useCallback(async (url, options = {}) => {
    // If a previous request is in flight, abort it.
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create a new AbortController for the current request.
    abortControllerRef.current = new AbortController();

    const requestConfig = {
      signal: abortControllerRef.current.signal,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...options.headers,
      },
      ...options,
    };

    try {
      debugLog('API Call', `${options.method || 'GET'} ${url}`, requestConfig);
      const response = await fetch(url, requestConfig);
      const data = await response.json();
      debugLog('API Call', `Response ${response.status}`, data);

      if (!response.ok) {
        throw new Error(data.message || `HTTP error! status: ${response.status}`);
      }

      return { success: true, data };
    } catch (error) {
      if (error.name === 'AbortError') {
        debugLog('API Call', 'Request aborted by user action.');
        return { success: false, aborted: true };
      }
      // Re-throw other errors to be caught by the calling hook.
      throw error;
    }
  }, []);

  // Cleanup function to abort any pending request when the component unmounts.
  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return { makeApiCall, cleanup };
};

// =============================================================================
// SECTION 3: DATA PROCESSING UTILITIES
// =============================================================================

/**
 * Processes and validates raw template data from an API to ensure a consistent
 * and compatible structure for UI components.
 * @param {Object} rawTemplates - The raw, categorized templates object from the API.
 * @returns {Object} A deeply processed and validated templates object.
 */
const processTemplateData = (rawTemplates) => {
  if (!rawTemplates || typeof rawTemplates !== 'object') {
    return {};
  }

  return Object.entries(rawTemplates).reduce((acc, [category, templates]) => {
    if (!Array.isArray(templates)) {
      debugLog('Template Processing', `Skipping invalid data for category: ${category}`);
      return acc;
    }

    acc[category] = templates.map(template => {
      // Ensure all required properties exist for DeviceConfigurationRunner and UniversalTemplateForm.
      const processedTemplate = {
        id: template.id,
        name: template.name || 'Unnamed Template',
        description: template.description || '',
        category: template.category || category,
        version: template.version || '1.0.0',
        type: 'file', // Required by the TreeItem component in the sidebar.

        // Deeply process parameters to ensure full compatibility.
        parameters: Array.isArray(template.parameters)
          ? template.parameters.map(param => ({
              name: param.name,
              label: param.label || param.name,
              type: param.type || 'text',
              required: param.required || false,
              default_value: param.default_value,
              placeholder: param.placeholder || '',
              description: param.description || '',
              options: param.options || [], // Ensure options array exists.
              dynamicOptionsEndpoint: param.dynamicOptionsEndpoint,
              ...param // Keep any additional, non-standard properties.
            }))
          : [],
        ...template // Preserve all original properties.
      };

      if (!processedTemplate.id || !processedTemplate.name) {
        debugLog('Template Processing', `Template missing required fields (id, name):`, processedTemplate);
      }
      return processedTemplate;
    });

    return acc;
  }, {});
};

// =============================================================================
// SECTION 4: TEMPLATE DISCOVERY HOOK
// =============================================================================

/**
 * Fetches and processes the main list of categorized templates.
 * @param {string} templateSource - The API endpoint to fetch templates from.
 * @param {object} options - Configuration options like `autoFetch` and retry settings.
 * @returns {object} State object with `categorizedTemplates`, `loading`, `error`, and `refetch`.
 */
export const useTemplateDiscovery = (templateSource, options = {}) => {
  const {
    category = null,
    environment = "development",
    autoFetch = true,
    retryCount = CONFIG.DEFAULT_RETRY_COUNT,
    retryDelay = CONFIG.DEFAULT_RETRY_DELAY
  } = options;

  const [categorizedTemplates, setCategorizedTemplates] = useState({});
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(null);

  const { makeApiCall, cleanup } = useApiCall();
  const retryCountRef = useRef(0);

  const discoverTemplates = useCallback(async (params = {}) => {
    if (!templateSource) {
      debugLog('Template Discovery', 'No template source provided, aborting fetch.');
      setLoading(false);
      return;
    }

    const requestParams = { category, environment, ...params };
    setLoading(true);
    setError(null);
    debugLog('Template Discovery', `Fetching from ${templateSource}`, requestParams);

    try {
      const result = await makeApiCall(`${CONFIG.API_BASE_URL}${templateSource}`, {
        method: "POST",
        body: JSON.stringify(requestParams),
      });

      if (result.aborted) return; // Stop if the request was cancelled.

      if (result.success) {
        // Handle various possible successful response formats gracefully.
        const templatesData = result.data?.discovered_templates || result.data?.templates || result.data || {};
        const processedTemplates = processTemplateData(templatesData);

        setCategorizedTemplates(processedTemplates);
        setLastFetchTime(new Date().toISOString());
        retryCountRef.current = 0; // Reset retry count on success.
        debugLog('Template Discovery', 'Successfully fetched and processed templates.');
      }
    } catch (err) {
      console.error("[useTemplateDiscovery] Error:", err);
      // Implement retry logic with exponential backoff.
      if (retryCountRef.current < retryCount) {
        retryCountRef.current += 1;
        const delay = retryDelay * Math.pow(2, retryCountRef.current - 1);
        debugLog('Template Discovery', `Retrying in ${delay}ms... Attempt ${retryCountRef.current}/${retryCount}`);
        setTimeout(() => discoverTemplates(params), delay);
        return; // Exit to avoid setting final error state yet.
      }
      // If all retries fail, set the final error state.
      setError(err.message);
      setCategorizedTemplates({});
      retryCountRef.current = 0;
    } finally {
      // Ensure loading is set to false only after all retries are exhausted.
      if (retryCountRef.current === 0 || retryCountRef.current >= retryCount) {
         setLoading(false);
      }
    }
  }, [templateSource, category, environment, makeApiCall, retryCount, retryDelay]);

  // Effect to trigger the initial fetch.
  useEffect(() => {
    if (autoFetch && templateSource) {
      discoverTemplates();
    }
    // Return the cleanup function from useApiCall to abort on unmount.
    return cleanup;
  }, [templateSource, autoFetch, discoverTemplates, cleanup]);

  /** Manually trigger a refetch of templates. */
  const refetch = useCallback(() => {
    retryCountRef.current = 0; // Reset retries for manual refetch.
    return discoverTemplates();
  }, [discoverTemplates]);

  return { categorizedTemplates, loading, error, refetch, lastFetchTime };
};


// =============================================================================
// SECTION 5: TEMPLATE GENERATION HOOK
// =============================================================================

/**
 * Handles the API call to generate a configuration from a template and its parameters.
 * @returns {object} State object with `loading`, `error`, `generateConfig`, and generation history.
 */
export const useTemplateGeneration = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastGenerated, setLastGenerated] = useState(null);
  const [generationHistory, setGenerationHistory] = useState([]);

  const { makeApiCall, cleanup } = useApiCall();

  /**
   * Generates a configuration by posting a template ID and parameters to the API.
   * @param {string} templateId - The ID of the template to use.
   * @param {object} parameters - The user-provided parameters for the template.
   * @returns {Promise<object>} The result of the generation from the API.
   */
  const generateConfig = useCallback(async (templateId, parameters = {}) => {
    if (!templateId) {
      const errorMsg = "Template ID is required for generation.";
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    setLoading(true);
    setError(null);
    debugLog('Template Generation', `Generating config for template: ${templateId}`);

    try {
      const result = await makeApiCall(`${CONFIG.API_BASE_URL}/api/templates/generate`, {
        method: "POST",
        body: JSON.stringify({ templateId, parameters }),
      });

      if (result.aborted) return { success: false, error: "Request was cancelled" };

      // Handle both successful formats: { success: true, result: { ... } } and direct result.
      const responseData = result.data?.result || result.data;
      const generationResult = { ...responseData, templateId, parameters, timestamp: new Date().toISOString() };

      setLastGenerated(generationResult);
      // Add to history, ensuring we don't exceed the max entry limit.
      setGenerationHistory(prev => [generationResult, ...prev.slice(0, CONFIG.MAX_HISTORY_ENTRIES - 1)]);
      debugLog('Template Generation', 'Successfully generated configuration.');
      return responseData;

    } catch (err) {
      console.error("Configuration generation error:", err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [makeApiCall]);

  useEffect(() => cleanup, [cleanup]);

  return { loading, error, lastGenerated, generationHistory, generateConfig };
};


// =============================================================================
// SECTION 6: TEMPLATE DETAIL HOOK
// =============================================================================

/**
 * Fetches details for a single template, with caching to improve performance.
 * @param {string} templateId - The ID of the template to fetch.
 * @param {object} options - Configuration options like `autoFetch` and `cacheTime`.
 * @returns {object} State object with `template`, `loading`, `error`, and `refetch`.
 */
export const useTemplateDetail = (templateId, options = {}) => {
  const { autoFetch = true, cacheTime = CONFIG.DEFAULT_CACHE_TIME } = options;

  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { makeApiCall, cleanup } = useApiCall();

  // Use a ref to hold the cache, so it persists across re-renders without causing them.
  const cacheRef = useRef(new Map());

  const fetchTemplate = useCallback(async (id = templateId) => {
    if (!id) {
      setTemplate(null);
      return;
    }

    const cachedData = cacheRef.current.get(id);
    // Check if valid, non-expired cached data exists.
    if (cachedData && (Date.now() - cachedData.timestamp) < cacheTime) {
      debugLog('Template Detail', `Using cached data for template ${id}`);
      setTemplate(cachedData.template);
      return;
    }

    setLoading(true);
    setError(null);
    debugLog('Template Detail', `Fetching details for template: ${id}`);

    try {
      const result = await makeApiCall(`${CONFIG.API_BASE_URL}/api/templates/${id}`);
      if (result.aborted) return;

      const templateData = result.data?.template || result.data;
      if (templateData) {
        // Use the same processing function to ensure consistency.
        const processedTemplate = processTemplateData({ temp: [templateData] }).temp[0];
        setTemplate(processedTemplate);
        // Store the new data and a timestamp in the cache.
        cacheRef.current.set(id, { template: processedTemplate, timestamp: Date.now() });

        // Simple cache eviction strategy: if cache is too big, clear it.
        // A more advanced LRU strategy could be used if needed.
        if (cacheRef.current.size > CONFIG.MAX_CACHE_ENTRIES) {
          const oldestKey = cacheRef.current.keys().next().value;
          cacheRef.current.delete(oldestKey);
          debugLog('Template Detail Cache', `Evicted oldest entry: ${oldestKey}`);
        }

      } else {
        throw new Error("Invalid template data received from API.");
      }
    } catch (err) {
      console.error("Template detail error:", err);
      setError(err.message);
      setTemplate(null);
    } finally {
      setLoading(false);
    }
  }, [templateId, makeApiCall, cacheTime]);

  useEffect(() => {
    if (autoFetch && templateId) {
      fetchTemplate();
    }
    return cleanup;
  }, [templateId, autoFetch, fetchTemplate, cleanup]);

  /**
   * Manually refetches template details, optionally bypassing the cache.
   * @param {boolean} forceRefresh - If true, clears the cache for this ID before fetching.
   */
  const refetch = useCallback((forceRefresh = false) => {
    if (forceRefresh && templateId) {
      cacheRef.current.delete(templateId);
      debugLog('Template Detail Cache', `Force cleared cache for ${templateId}`);
    }
    return fetchTemplate();
  }, [fetchTemplate, templateId]);

  return { template, loading, error, refetch };
};
