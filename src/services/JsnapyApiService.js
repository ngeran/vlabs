// =============================================================================
// FILE:               src/services/JsnapyApiService.js
//
// DESCRIPTION:
//   Centralized service for handling API calls related to the JSNAPy Runner.
//   Provides functions for discovering tests, executing scripts, and saving results.
//
// OVERVIEW:
//   This service encapsulates all HTTP API interactions for the JSNAPy Runner.
//   It ensures consistent error handling and response parsing, making it reusable
//   across components and hooks.
//
// KEY FEATURES:
//   - Fetches discoverable tests for a given script ID and environment.
//   - Initiates JSNAPy script execution with provided parameters.
//   - Saves script results to the backend.
//   - Standardized error handling with detailed logging.
//
// ... (rest of the file header)
// =============================================================================

// =============================================================================
// SECTION 1: CONFIGURATION
// =============================================================================
const API_BASE_URL = "http://localhost:3001";

// =============================================================================
// SECTION 2: API SERVICE DEFINITION
// =============================================================================
const JsnapyApiService = {
  /**
   * Fetches discoverable tests for a given script ID and environment.
   * @param {string} scriptId - The ID of the script (e.g., 'jsnapy_runner').
   * @param {string} environment - The target environment (e.g., 'development').
   * @returns {Promise<object>} Categorized tests or empty object on failure.
   * @throws {Error} If the API call fails.
   */
  async discoverTests(scriptId, environment = "development") {
    console.log(`[JsnapyApiService] Discovering tests for script: ${scriptId}, environment: ${environment}`);
    try {
      const response = await fetch(`${API_BASE_URL}/api/scripts/discover-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ scriptId, environment }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[JsnapyApiService] HTTP error: ${errorText}`);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || "Failed to discover tests.");
      }

      return data.discovered_tests || {};
    } catch (error) {
      console.error(`[JsnapyApiService] Error discovering tests for ${scriptId}:`, error);
      throw error;
    }
  },

  /**
   * Initiates execution of the JSNAPy script with provided parameters.
   * @param {string} scriptId - The ID of the script (e.g., 'jsnapy_runner').
   * @param {object} parameters - Script parameters (e.g., { hostname, tests }).
   * @param {string} wsClientId - WebSocket client ID for real-time updates.
   * @returns {Promise<void>} Resolves on successful initiation, throws on error.
   * @throws {Error} If the API call fails or WebSocket client ID is missing.
   */
  async runScript(scriptId, parameters, wsClientId) {
    console.log(`[JsnapyApiService] Initiating script execution for ${scriptId}`);
    if (!wsClientId) {
      throw new Error("WebSocket client ID is required.");
    }

    const paramsToSend = {
      ...parameters,
      tests: Array.isArray(parameters.tests) ? parameters.tests.join(",") : parameters.tests,
      hostname: parameters.hostname || undefined,
      inventory_file: parameters.inventory_file || undefined,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/scripts/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId,
          parameters: paramsToSend,
          wsClientId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          message: `HTTP ${response.status}: ${response.statusText}`,
        }));
        throw new Error(errorData.message);
      }

      const responseData = await response.json();
      if (!responseData.success) {
        throw new Error(responseData.message || "Script execution failed to start.");
      }

      console.log(`[JsnapyApiService] Script execution started successfully for ${scriptId}`);
    } catch (error) {
      console.error(`[JsnapyApiService] Error running script ${scriptId}:`, error);
      throw error;
    }
  },
  /**
 * Saves the script execution results.
 * @param {string} scriptId - The ID of the script being saved.
 * @param {Object} resultsData - The final results object from the execution state.
 * @returns {Promise<Object>} The JSON response from the server.
 * @throws {Error} If the API call fails.
 */
async saveResults(scriptId, resultsData) {
  console.log(`[JsnapyApiService] Saving results for script: ${scriptId}`);
  try {
    // Extract the actual results data (handle the double nesting)
    const actualResults = resultsData.data?.data || resultsData.data || resultsData;

    const payload = {
      savePath: "jsnapy_reports", // Add the required savePath
      jsonData: actualResults,    // Use the properly extracted data
    };

    // Use the correct endpoint: /api/reports/generate (not /save)
    const response = await fetch(`${API_BASE_URL}/api/report/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[JsnapyApiService] HTTP error: ${errorText}`);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    if (!responseData.success) {
      throw new Error(responseData.message || "Failed to save results");
    }

    console.log("[JsnapyApiService] Results saved successfully:", responseData);
    return responseData;
  } catch (error) {
    console.error(`[JsnapyApiService] Error saving results for ${scriptId}:`, error);
    throw error;
  }
  },
 }; // <-- This is now the one and only closing brace for the object.

// =============================================================================
// SECTION 3: EXPORT
// =============================================================================
export default JsnapyApiService;
