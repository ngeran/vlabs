// =============================================================================
// FILE:               src/services/ValidationApiService.js
//
// DESCRIPTION:
//   A centralized service for handling all backend API interactions for the
//   JSNAPy Validation Runner. It abstracts away the details of HTTP requests.
//
// KEY FEATURES:
//   - discoverTests: Fetches the list of available JSNAPy tests for a specific script.
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
// In a production app, this would ideally be handled by environment variables
// or a proxy, but this is fine for development.
const API_BASE_URL = "http://localhost:3001";

// =============================================================================
// SECTION 2: API SERVICE DEFINITION
// =============================================================================
const ValidationApiService = {
  /**
   * Fetches the list of discoverable validation tests from the backend.
   * @param {string} scriptId - The ID of the script (e.g., 'validation'). This is passed from the hook.
   * @param {string} environment - The target environment (e.g., 'development').
   * @returns {Promise<object>} An object containing categorized tests.
   */
  async discoverTests(scriptId, environment = "development") {
    // --- MODIFICATION: Uses the scriptId passed as an argument ---
    console.log(`[ValidationApiService] Discovering tests for scriptId: ${scriptId}`);
    const response = await fetch(`${API_BASE_URL}/api/scripts/discover-tests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The scriptId from the function argument is now used in the request body.
      body: JSON.stringify({ scriptId: scriptId, environment }),
    });
    if (!response.ok) throw new Error("Failed to discover validation tests from API.");
    const data = await response.json();
    if (!data.success) throw new Error(data.message || "API returned an error during test discovery.");
    // The hook expects the final object, which is correct here.
    return data.discovered_tests || {};
  },
    /**
   * Sends a request to the backend to execute the validation script.
   * @param {string} scriptId - The ID of the script to run (passed from the hook).
   * @param {object} parameters - The parameters for the script, including targets and tests.
   * @param {string} wsClientId - The WebSocket client ID for real-time updates.
   */
  async runScript(scriptId, parameters, wsClientId) {
    console.log(`[ValidationApiService] Initiating script execution for ${scriptId}`);

    // Create a copy to avoid mutating the original state.
    const paramsToSend = { ...parameters };

    // --- START OF FIX ---
    // Correctly map the 'validation_tests' array from the frontend state
    // to the 'tests' string expected by the Python script.
    if (Array.isArray(paramsToSend.validation_tests)) {
      paramsToSend.tests = paramsToSend.validation_tests.join(",");
    } else {
      paramsToSend.tests = "";
    }

    // Remove the original key to keep the payload clean for the backend.
    delete paramsToSend.validation_tests;
    // --- END OF FIX ---

    const response = await fetch(`${API_BASE_URL}/api/scripts/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scriptId: scriptId,
        parameters: paramsToSend, // Send the correctly formatted parameters
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
    // This function looks correct and does not need changes.
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
