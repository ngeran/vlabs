// =============================================================================
// FILE:               src/services/ValidationApiService.js
//
// DESCRIPTION:
//   A centralized service for handling all backend API interactions for the
//   JSNAPy Validation Runner. It abstracts away the details of HTTP requests.
//
// KEY FEATURES:
//   - discoverTests: Fetches the list of available JSNAPy tests.
//   - runScript: Initiates a validation script execution on the backend.
//   - saveResults: Sends the final validation results to be saved as a report.
//
// DEPENDENCIES:
//   - Relies on the backend API endpoints defined in 'routes/scripts.js' and
//     'routes/reports.js'.
//
// HOW TO USE:
//   This service is intended to be used by the `useValidationWorkflow` hook to
//   decouple component logic from direct API calls.
// =============================================================================

// =============================================================================
// SECTION 1: CONFIGURATION
// =============================================================================
const API_BASE_URL = "http://localhost:3001";
// This ID must match the tool's directory name and its entry in scripts.yaml
const VALIDATION_SCRIPT_ID = "validation";

// =============================================================================
// SECTION 2: API SERVICE DEFINITION
// =============================================================================
const ValidationApiService = {
  /**
   * Fetches the list of discoverable validation tests from the backend.
   * @param {string} environment - The target environment (e.g., 'development').
   * @returns {Promise<object>} An object containing categorized tests.
   */
  async discoverTests(environment = "development") {
    console.log(`[ValidationApiService] Discovering tests for scriptId: ${VALIDATION_SCRIPT_ID}`);
    const response = await fetch(`${API_BASE_URL}/api/scripts/discover-tests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scriptId: VALIDATION_SCRIPT_ID, environment }),
    });
    if (!response.ok) throw new Error("Failed to discover validation tests from API.");
    const data = await response.json();
    if (!data.success) throw new Error(data.message || "API returned an error during test discovery.");
    return data.discovered_tests || {};
  },

  /**
   * Sends a request to the backend to execute the validation script.
   * @param {object} parameters - The parameters for the script, including targets and tests.
   * @param {string} wsClientId - The WebSocket client ID for real-time updates.
   */
  async runScript(parameters, wsClientId) {
    console.log(`[ValidationApiService] Initiating script execution for ${VALIDATION_SCRIPT_ID}`);
    const paramsToSend = {
      ...parameters,
      tests: Array.isArray(parameters.tests) ? parameters.tests.join(",") : "",
    };
    const response = await fetch(`${API_BASE_URL}/api/scripts/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scriptId: VALIDATION_SCRIPT_ID,
        parameters: paramsToSend,
        wsClientId,
      }),
    });
     if (!response.ok) throw new Error("Failed to initiate script run via API.");
  },

  /**
   * Sends the final results to the generic report-saving endpoint.
   * @param {object} resultsData - The final result object from the script execution.
   */
  async saveResults(resultsData) {
    console.log(`[ValidationApiService] Saving validation results.`);
    const response = await fetch(`${API_BASE_URL}/api/report/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        savePath: "validation_reports", // Matches the path in metadata.yml
        jsonData: resultsData,
      }),
    });
     if (!response.ok) throw new Error("Failed to save results via API.");
  },
};

export default ValidationApiService;
