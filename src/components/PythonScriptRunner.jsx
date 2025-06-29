import React, { useEffect, useState, useCallback } from "react";
import JSNAPyForm from "./JSNAPyForm";
import ScriptOutputDisplay from "./ScriptOutputDisplay";
import ErrorBoundary from "./ErrorBoundary"; // It's good practice to keep this

const API_BASE_URL = "http://localhost:3001";

function PythonScriptRunner() {
  const [scripts, setScripts] = useState([]);
  const [selectedSingleScriptId, setSelectedSingleScriptId] = useState("");
  const [scriptParameters, setScriptParameters] = useState({});
  const [scriptOutputs, setScriptOutputs] = useState({});
  const [error, setError] = useState(null);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [runningScripts, setRunningScripts] = useState(false);

  // Effect to fetch the list of available scripts on component mount
  useEffect(() => {
    async function fetchScripts() {
      setLoadingScripts(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/api/scripts/list`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        setScripts(data.scripts || []);
        if (data.scripts.length > 0) {
          const jsnapyScript =
            data.scripts.find((s) => s.id === "run_jsnapy_tests") ||
            data.scripts[0];
          setSelectedSingleScriptId(jsnapyScript.id);
        }
      } catch (err) {
        setError(`Error loading scripts: ${err.message}`);
      } finally {
        setLoadingScripts(false);
      }
    }
    fetchScripts();
  }, []);

  // Callback to update parameters from the JSNAPyForm
  const updateJsnapyParameters = useCallback((newParams) => {
    setScriptParameters((prev) => ({ ...prev, run_jsnapy_tests: newParams }));
  }, []);

  // Main function to execute the selected script
  const runSingleScript = async () => {
    const scriptId = selectedSingleScriptId;
    if (!scriptId) return alert("Please select a script.");

    const params = scriptParameters[scriptId] || {};

    // Construct the payload for the backend API
    const payload = {
      scriptId,
      parameters: {
        ...params,
        // Convert the 'tests' array to a comma-separated string for the Python script
        tests: Array.isArray(params.tests)
          ? params.tests.join(",")
          : params.tests,
        hostname: params.hostname?.trim() || "",
      },
    };

    setRunningScripts(true);
    setError(null);
    setScriptOutputs({});

    try {
      const res = await fetch(`${API_BASE_URL}/api/scripts/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        // Handle backend errors (e.g., non-200 status or success:false)
        throw new Error(
          data.message || `Request failed with status ${res.status}`,
        );
      }

      // The Python script's output is a JSON string, which is what we store.
      setScriptOutputs({
        [scriptId]: { output: data.output, error: data.error || null },
      });
    } catch (err) {
      console.error("Script execution fetch error:", err);
      setError(`Script error: ${err.message}`);
    } finally {
      setRunningScripts(false);
    }
  };

  return (
    <div className="bg-white shadow-sm border-b border-gray-200 py-12 sm:py-16 lg:py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-extrabold text-gray-900 mb-8 text-center">
          Python Script Runner
        </h1>
        {loadingScripts && <p>Loading scripts...</p>}
        {error && !runningScripts && (
          <div className="bg-red-100 text-red-800 p-3 rounded mb-6">
            <strong>Error:</strong> {error}
          </div>
        )}

        {!loadingScripts && scripts.length > 0 && (
          <div className="mb-8 border border-gray-300 rounded-md p-6 shadow-sm bg-white">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Script
            </label>
            <select
              value={selectedSingleScriptId}
              onChange={(e) => setSelectedSingleScriptId(e.target.value)}
              className="block w-full border border-gray-300 rounded-md p-2 mb-6"
            >
              {scripts.map((script) => (
                <option key={script.id} value={script.id}>
                  {script.displayName}
                </option>
              ))}
            </select>

            {selectedSingleScriptId === "run_jsnapy_tests" ? (
              <JSNAPyForm
                parameters={scriptParameters["run_jsnapy_tests"] || {}}
                setParameters={updateJsnapyParameters}
              />
            ) : (
              <p className="text-sm text-gray-500">
                Form for this script is not yet implemented.
              </p>
            )}

            {/* --- THIS IS THE CRITICAL FIX FOR THE PAGE REFRESH BUG --- */}
            <button
              type="button" // This attribute prevents the button from submitting a form.
              onClick={runSingleScript}
              disabled={runningScripts}
              className={`mt-6 w-full px-4 py-3 rounded text-white text-lg font-semibold transition-colors ${
                runningScripts
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {runningScripts ? "Running..." : "Run Script"}
            </button>
          </div>
        )}

        {/* This output section will now correctly receive clean JSON from the backend */}
        {(Object.keys(scriptOutputs).length > 0 ||
          (error && runningScripts)) && (
          <div className="mt-8 border border-gray-300 rounded-md p-6 bg-gray-50">
            <h3 className="text-xl font-semibold mb-4 text-gray-800">
              Script Output
            </h3>
            <ErrorBoundary>
              {Object.entries(scriptOutputs).map(
                ([scriptId, { output, error: scriptError }]) => (
                  <ScriptOutputDisplay
                    key={scriptId}
                    output={output}
                    error={scriptError || error}
                  />
                ),
              )}
              {/* This handles the case where the top-level fetch fails */}
              {error && Object.keys(scriptOutputs).length === 0 && (
                <ScriptOutputDisplay error={error} />
              )}
            </ErrorBoundary>
          </div>
        )}
      </div>
    </div>
  );
}

export default PythonScriptRunner;
