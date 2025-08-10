// =============================================================================
// FILE:               src/services/ReportsApiService.js
//
// DESCRIPTION:
//   Centralized service for handling API calls related to the Reports Runner.
//   Provides functions for discovering available reports, executing the report
//   generation script, and saving the final report data.
//
// OVERVIEW:
//   This service abstracts all HTTP API interactions for the Reports Runner,
//   ensuring consistent error handling and response parsing. It's designed to
//   be used by the `useReportsWorkflow` hook.
//
// KEY FEATURES:
//   - Fetches discoverable reports for the reporting script.
//   - Initiates the report generation script with selected parameters.
//   - Saves final report data to the backend via a dedicated endpoint.
//   - Provides standardized error handling and logging.
//
// =============================================================================

// =============================================================================
// SECTION 1: CONFIGURATION
// =============================================================================
const API_BASE_URL = "http://localhost:3001";
const REPORTS_SCRIPT_ID = "reporting";

// =============================================================================
// SECTION 2: API SERVICE DEFINITION
// =============================================================================
const ReportsApiService = {
  async discoverReports(environment = "development") {
    console.log(`[ReportsApiService] Discovering reports for scriptId: ${REPORTS_SCRIPT_ID} in environment: ${environment}`);
    try {
      const response = await fetch(`${API_BASE_URL}/api/scripts/discover-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ scriptId: REPORTS_SCRIPT_ID, environment }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || "API failed to discover reports.");
      }
      return data.discovered_tests || {};
    } catch (error) {
      console.error(`[ReportsApiService] Error discovering reports:`, error);
      throw error;
    }
  },

  async runScript(parameters, wsClientId) {
    console.log(`[ReportsApiService] Initiating report script execution.`);
    if (!wsClientId) {
      throw new Error("WebSocket client ID is required for real-time updates.");
    }

    // ==========================================================================
    // MODIFICATION: Package the selected items under the 'tests' key, as this
    // is what the generic backend service expects.
    // ==========================================================================
    const paramsToSend = {
      ...parameters,
      tests: Array.isArray(parameters.tests) ? parameters.tests.join(",") : parameters.tests,
    };
    // The 'reports' key, if it exists, will now be ignored by the backend, which is correct.
    delete paramsToSend.reports;

    try {
      const response = await fetch(`${API_BASE_URL}/api/scripts/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId: REPORTS_SCRIPT_ID,
          parameters: paramsToSend,
          wsClientId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
        throw new Error(errorData.message);
      }
      const responseData = await response.json();
      if (!responseData.success) {
        throw new Error(responseData.message || "Backend failed to start script execution.");
      }
    } catch (error) {
      console.error(`[ReportsApiService] Error running report script:`, error);
      throw error;
    }
  },

  async saveResults(resultsData) {
    console.log(`[ReportsApiService] Saving report results.`);
    try {
      const payload = {
        savePath: "generated_reports",
        jsonData: resultsData,
      };
      const response = await fetch(`${API_BASE_URL}/api/report/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`[ReportsApiService] Error saving results:`, error);
      throw error;
    }
  },
};

// =============================================================================
// SECTION 3: EXPORT
// =============================================================================
export default ReportsApiService;
