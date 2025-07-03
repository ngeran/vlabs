// src/components/ScriptOutputDisplay.jsx

import React, { useState } from "react";
import { ChevronDown, AlertTriangle, Info, Save } from "lucide-react";
import toast from "react-hot-toast"; // Import the toast library for notifications

const API_BASE_URL = "http://localhost:3001";

/**
 * @description A simple, reusable component for rendering structured data in a table.
 * @param {object} props - Component props.
 * @param {string} props.title - The title to display above the table.
 * @param {string[]} props.headers - An array of strings for the table headers.
 * @param {object[]} props.data - An array of data objects to render as rows.
 */
function SimpleTable({ title, headers, data }) {
  if (!data || data.length === 0) {
    return (
      <div className="mt-2">
        <h4 className="font-semibold text-slate-700">{title}</h4>
        <p className="text-sm text-slate-500 italic">
          No data returned for this check.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <h4 className="font-semibold text-slate-700 mb-2">{title}</h4>
      <div className="border rounded-lg shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {data.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-slate-50">
                {headers.map((header) => (
                  <td
                    key={header}
                    className="px-4 py-3 whitespace-nowrap text-sm text-slate-800 font-mono"
                  >
                    {String(row[header])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * @description The main display component for script results. It intelligently renders
 *              structured JSON output, handles errors, provides a collapsible raw log view,
 *              and uses toast notifications for user feedback on the save action.
 * @param {object} props - Component props.
 * @param {string} props.output - The content from the script's stdout, expected to be JSON.
 * @param {string} props.error - The content from the script's stderr, treated as a raw log.
 */
export default function ScriptOutputDisplay({ output, error }) {
  // State is now minimal, only tracking the saving status of the button.
  const [isSaving, setIsSaving] = useState(false);

  // --- Parse the raw output to prepare for rendering ---
  let parsedOutput;
  let renderError = null;

  if (output) {
    try {
      parsedOutput = JSON.parse(output);
    } catch (e) {
      renderError = `Failed to parse script output as JSON. Raw output: ${output}`;
    }
  }

  if (parsedOutput && parsedOutput.status === "error") {
    renderError = parsedOutput.message;
  }

  if (!output && error && !error.includes("---")) {
    renderError = error;
  }

  /**
   * @description Handles the "Save Report" button click. Sends the parsed JSON data
   *              to the report generation endpoint and shows a toast notification on completion.
   */
  const handleSaveReport = async () => {
    if (!parsedOutput) {
      toast.error("Cannot generate report: Output data is not valid JSON.");
      return;
    }

    setIsSaving(true);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const defaultFilename = `report-${timestamp}.txt`;

    try {
      const response = await fetch(`${API_BASE_URL}/api/report/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: defaultFilename,
          jsonData: parsedOutput,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Failed to generate report on the server.",
        );
      }

      toast.success(data.message || "Report saved successfully!");
    } catch (err) {
      toast.error(err.message || "An unknown error occurred.");
      console.error("Save report error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!output && !error) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Save Button Area */}
      <div className="flex items-center p-3">
        <button
          onClick={handleSaveReport}
          disabled={isSaving || !parsedOutput}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:bg-slate-200 disabled:cursor-not-allowed transition-colors"
          title={
            !parsedOutput
              ? "Cannot generate report from non-JSON or error output"
              : "Save Formatted Report"
          }
        >
          <Save size={16} />
          {isSaving ? "Saving..." : "Save Formatted Report"}
        </button>
        {/* The old saveMessage/saveError <p> tags are now removed. */}
      </div>

      {/* Primary Output Display (Error or Structured Data) */}
      {renderError ? (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">
          <div className="flex items-center font-bold">
            <AlertTriangle size={20} className="mr-2" />
            SCRIPT ERROR
          </div>
          <p className="mt-2 text-sm font-mono whitespace-pre-wrap">
            {renderError}
          </p>
        </div>
      ) : (
        parsedOutput && (
          <div className="space-y-6">
            {parsedOutput.results_by_host?.map((hostResult, index) => (
              <div
                key={index}
                className="p-4 border rounded-md bg-white shadow-sm"
              >
                <h3 className="text-lg font-bold text-slate-800">
                  Results for:{" "}
                  <span className="font-mono">{hostResult.hostname}</span>
                </h3>
                {hostResult.status === "error" ? (
                  <p className="text-red-600 mt-2">{hostResult.message}</p>
                ) : (
                  hostResult.test_results?.map((testResult, testIndex) => (
                    <div key={testIndex} className="mt-2">
                      {testResult.error ? (
                        <p className="text-yellow-600">{testResult.error}</p>
                      ) : (
                        <SimpleTable
                          title={testResult.title}
                          headers={testResult.headers}
                          data={testResult.data}
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            ))}
            {parsedOutput.message && !parsedOutput.results_by_host && (
              <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg">
                <div className="flex items-center font-bold">
                  <Info size={20} className="mr-2" />
                  Status
                </div>
                <p className="mt-2 text-sm">{parsedOutput.message}</p>
              </div>
            )}
          </div>
        )
      )}

      {/* Collapsible Raw Log (stderr) Display */}
      {error && (
        <details className="border rounded-lg bg-white" open>
          <summary className="cursor-pointer p-3 font-semibold text-slate-700 flex items-center justify-between list-none hover:bg-slate-50 transition-colors">
            <span>Raw Console Log (stderr)</span>
            <ChevronDown
              className="transition-transform duration-200 group-open:rotate-180"
              size={20}
            />
          </summary>
          <div className="border-t border-slate-200 p-4">
            <pre className="bg-slate-800 text-slate-200 p-4 rounded-md whitespace-pre-wrap font-mono text-xs overflow-x-auto">
              {error.trim()}
            </pre>
          </div>
        </details>
      )}
    </div>
  );
}
