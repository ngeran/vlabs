import React, { useEffect, useState, useCallback } from "react";
import JSNAPyForm from "./JSNAPyForm";

const API_BASE_URL = "http://localhost:3001";

function PythonScriptRunner() {
  const [scripts, setScripts] = useState([]);
  const [selectedSingleScriptId, setSelectedSingleScriptId] = useState("");
  const [scriptParameters, setScriptParameters] = useState({});
  const [scriptOutputs, setScriptOutputs] = useState({});
  const [error, setError] = useState(null);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [runningScripts, setRunningScripts] = useState(false);

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
          setSelectedSingleScriptId(data.scripts[0].id);
        }
        const initialParams = {};
        data.scripts.forEach((script) => {
          initialParams[script.id] = {};
          if (script.parameters) {
            script.parameters.forEach((param) => {
              initialParams[script.id][param.name] = param.default || "";
            });
          }
        });
        setScriptParameters(initialParams);
      } catch (err) {
        setError(`Error loading scripts: ${err.message}`);
      } finally {
        setLoadingScripts(false);
      }
    }
    fetchScripts();
  }, []);

  const updateScriptParameter = (scriptId, paramName, value) => {
    setScriptParameters((prev) => ({
      ...prev,
      [scriptId]: {
        ...prev[scriptId],
        [paramName]: value,
      },
    }));
  };

  // Stabilize the setParameters function for JSNAPyForm
  const updateJsnapyParameters = useCallback((newParams) => {
    setScriptParameters((prev) => ({
      ...prev,
      run_jsnapy_tests: newParams,
    }));
  }, []);

  const runSingleScript = async () => {
    const scriptId = selectedSingleScriptId;
    const script = scripts.find((s) => s.id === scriptId);
    if (!scriptId || !script) return alert("Please select a script.");

    const params = scriptParameters[scriptId];

    if (script.parameters) {
      for (const param of script.parameters) {
        if (param.required && !params[param.name]?.trim()) {
          return alert(`Missing required parameter: ${param.label}`);
        }
      }
    }

    const payload = {
      scriptId,
      parameters: {
        ...params,
        tests:
          scriptId === "run_jsnapy_tests" && Array.isArray(params.tests)
            ? params.tests.join(",")
            : params.tests,
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
      if (!data.success) throw new Error(data.message);
      setScriptOutputs({
        [scriptId]: {
          output: data.output,
          error: data.error || null,
        },
      });
    } catch (err) {
      setError(`Script error: ${err.message}`);
    } finally {
      setRunningScripts(false);
    }
  };

  return (
    <div className="bg-white shadow-sm border-b border-gray-200 py-12 sm:py-16 lg:py-20 min-h-[calc(100vh-140px)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-extrabold text-gray-900 mb-8 text-center">
          Python Script Runner
        </h1>
        <div className="max-w-4xl mx-auto">
          {loadingScripts && <p>Loading scripts...</p>}
          {error && (
            <div className="bg-red-100 text-red-800 p-3 rounded mb-6">
              {error}
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
                    {script.displayName} - {script.description}
                  </option>
                ))}
              </select>
              {/* Script-specific form */}
              {selectedSingleScriptId === "run_jsnapy_tests" ? (
                <JSNAPyForm
                  parameters={scriptParameters["run_jsnapy_tests"] || {}}
                  setParameters={updateJsnapyParameters}
                />
              ) : (
                scripts
                  .find((s) => s.id === selectedSingleScriptId)
                  ?.parameters?.map((param) => (
                    <div key={param.name} className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {param.label} {param.required ? "*" : ""}
                      </label>
                      <input
                        type={param.type === "password" ? "password" : "text"}
                        value={
                          scriptParameters[selectedSingleScriptId]?.[
                            param.name
                          ] || ""
                        }
                        placeholder={param.placeholder || ""}
                        onChange={(e) =>
                          updateScriptParameter(
                            selectedSingleScriptId,
                            param.name,
                            e.target.value,
                          )
                        }
                        className="block w-full border border-gray-300 rounded-md p-2"
                      />
                    </div>
                  ))
              )}
              <button
                onClick={runSingleScript}
                disabled={runningScripts}
                className={`mt-6 w-full px-4 py-3 rounded text-white text-lg font-semibold ${
                  runningScripts
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {runningScripts ? "Running..." : "Run Script"}
              </button>
            </div>
          )}
          {Object.keys(scriptOutputs).length > 0 && (
            <div className="mt-8 border border-gray-300 rounded-md p-6 bg-gray-50 overflow-auto max-h-[600px]">
              <h3 className="text-xl font-semibold mb-4 text-gray-800">
                Script Output
              </h3>
              {Object.entries(scriptOutputs).map(
                ([scriptId, { output, error }]) => (
                  <div
                    key={scriptId}
                    className="p-4 border border-gray-300 rounded bg-white shadow"
                  >
                    <h4 className="font-bold text-lg mb-2 text-gray-700">
                      {scripts.find((s) => s.id === scriptId)?.displayName ||
                        scriptId}
                    </h4>
                    <div className="bg-black text-green-300 text-sm p-3 rounded overflow-auto whitespace-pre-wrap font-mono">
                      <pre>
                        {error ? (
                          <span className="text-red-400">{error}</span>
                        ) : (
                          output
                        )}
                      </pre>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PythonScriptRunner;
