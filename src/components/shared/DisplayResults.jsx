// src/components/shared/DisplayResults.jsx
// =============================================================================
// FILE: DisplayResults.jsx
// DESCRIPTION: A reusable component to display the final results of a script
//              execution, particularly for operations that return lists of
//              successful and failed targets.
// =============================================================================

import React from 'react';
import { ClipboardList, CheckCircle, XCircle } from 'lucide-react';

// =============================================================================
// SECTION 1: HELPER COMPONENT - ResultsTable
// =============================================================================
// A simple, reusable table for displaying key-value data.
const ResultsTable = ({ title, data }) => {
  if (!data || data.length === 0) return null;

  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
      <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-slate-600">Format</th>
              <th className="px-4 py-2 text-left font-medium text-slate-600">File Path</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {data.map(({ format, path }, index) => (
              <tr key={index}>
                <td className="px-4 py-2 font-mono text-xs text-slate-700">{format}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500 break-all">{path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};


// =============================================================================
// SECTION 2: MAIN COMPONENT - DisplayResults
// =============================================================================
export default function DisplayResults({
  result, // The finalResult object from the script
  title = "Operation Results",
  description = "Summary of the script execution.",
  className = ""
}) {

  // --- MODIFICATION START ---
  // Check for the new, simple log format first.
  const isSimpleLogFormat = result && result.summary && result.details;

  // Check for the original, structured format.
  const hasStructuredDetails = result && result.details;
  const succeeded = hasStructuredDetails ? result.details.succeeded : null;
  const failed = hasStructuredDetails ? result.details.failed : null;
  const hasSuccesses = succeeded && Object.keys(succeeded).length > 0;
  const hasFailures = failed && Object.keys(failed).length > 0;

  // If we have neither format, don't render.
  if (!isSimpleLogFormat && !hasStructuredDetails) {
    return null;
  }
  // --- MODIFICATION END ---
    //
  return (
    <div className={`bg-gradient-to-br from-slate-50 to-white border border-slate-200/60 rounded-2xl shadow-sm backdrop-blur-sm ${className}`}>
      {/* SECTION 2.1: HEADER */}
      <div className="px-5 py-4 border-b border-slate-100/80">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl shadow-sm">
              <ClipboardList className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-900 truncate">{title}</h3>
              <p className="text-xs text-slate-500 truncate">{description}</p>
            </div>
          </div>
          {/* Overall Status Badge */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
            result.success
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}>
            {result.success ? (
              <CheckCircle className="h-3 w-3 text-green-500" />
            ) : (
              <XCircle className="h-3 w-3 text-red-500" />
            )}
            <span className={`text-xs font-medium ${
              result.success ? 'text-green-700' : 'text-red-700'
            }`}>
              {result.success ? 'Success' : 'Failed'}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 2.2: RESULTS CONTENT */}
      <div className="p-5 space-y-6">
        {/* Successful Operations */}
        {/* --- MODIFICATION START: Conditional Rendering --- */}
        {/* RENDER PATH 1: If it's the simple log format, show this UI. */}
        {isSimpleLogFormat && (
          <div>
            <h3 className="text-lg font-semibold text-slate-800 flex items-center mb-4">
              <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
              Execution Log
            </h3>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-slate-700">Summary:</h4>
                <p className="mt-2 text-slate-800 bg-slate-50 p-4 rounded-lg border">{result.summary}</p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-700">Full Log Details:</h4>
                <pre className="mt-2 bg-slate-900 text-slate-200 p-4 rounded-md text-xs whitespace-pre-wrap break-all overflow-auto max-h-[400px]">
                  {result.details}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* RENDER PATH 2: If it's the original structured format, show the old UI. */}
        {!isSimpleLogFormat && hasStructuredDetails && (
          <>
            {/* Successful Operations */}
            {hasSuccesses && (
              <div>
                <h3 className="text-lg font-semibold text-slate-800 flex items-center">
                  <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                  Successful Operations
                </h3>
                {/* ... (rest of the original success rendering logic) ... */}
              </div>
            )}

            {/* Failed Operations */}
            {hasFailures && (
              <div>
                <h3 className="text-lg font-semibold text-slate-800 flex items-center">
                  <XCircle className="w-5 h-5 mr-2 text-red-500" />
                  Failed Operations
                </h3>
                {/* ... (rest of the original failure rendering logic) ... */}
              </div>
            )}
          </>
        )}
        {/* --- MODIFICATION END --- */}
      </div>
    </div>
  );
}
