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
  if (!result || !result.details) {
    return null; // Don't render if there are no details to show
  }

  const { succeeded, failed } = result.details;
  const hasSuccesses = succeeded && Object.keys(succeeded).length > 0;
  const hasFailures = failed && Object.keys(failed).length > 0;

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
        {hasSuccesses && (
          <div>
            <h3 className="text-lg font-semibold text-slate-800 flex items-center">
              <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
              Successful Operations
            </h3>
            {Object.values(succeeded).map((hostResult, index) => (
              <div key={index} className="mt-4 p-4 border rounded-lg bg-white">
                <p className="font-semibold text-slate-800">
                  Device: <span className="font-mono text-sm text-indigo-600">{hostResult.hostname || hostResult.host}</span>
                </p>
                {/* Check if files exist for backup results */}
                {hostResult.files && (
                  <ResultsTable
                    title="Backup Files Created"
                    data={Object.entries(hostResult.files).map(([format, path]) => ({ format, path }))}
                  />
                )}
                {/* Check if a message exists for other results (like restore) */}
                {hostResult.message && (
                  <p className="mt-2 text-sm text-slate-600">{hostResult.message}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Failed Operations */}
        {hasFailures && (
          <div>
            <h3 className="text-lg font-semibold text-slate-800 flex items-center">
              <XCircle className="w-5 h-5 mr-2 text-red-500" />
              Failed Operations
            </h3>
            {Object.entries(failed).map(([host, errorMsg], index) => (
              <div key={index} className="mt-4 p-4 border border-red-200 rounded-lg bg-red-50">
                <p className="font-semibold text-red-800">
                  Device: <span className="font-mono text-sm text-red-600">{host}</span>
                </p>
                <p className="mt-2 text-sm text-red-700 font-mono bg-red-100 p-2 rounded">{errorMsg}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
