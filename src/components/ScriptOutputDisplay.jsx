import React from "react";

// This is a simple table component
function SimpleTable({ title, headers, data }) {
  if (!data || data.length === 0) {
    return (
      <div className="mt-2">
        <h4 className="font-semibold text-gray-700">{title}</h4>
        <p className="text-sm text-gray-500 italic">
          No data returned for this check.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <h4 className="font-semibold text-gray-700 mb-2">{title}</h4>
      <div className="border rounded-lg shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-50">
                {headers.map((header) => (
                  <td
                    key={header}
                    className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 font-mono"
                  >
                    {row[header]}
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

// The main display component
export default function ScriptOutputDisplay({ output, error }) {
  if (error) {
    return (
      <div className="bg-red-100 text-red-700 p-4 rounded-md font-bold">
        ERROR: {error}
      </div>
    );
  }
  if (!output) return null;

  let parsedOutput;
  try {
    parsedOutput = JSON.parse(output);
  } catch (e) {
    // This handles the case where the output is plain text (like from your BGP reporter)
    return (
      <pre className="bg-gray-800 text-gray-200 p-4 rounded-md whitespace-pre-wrap font-mono text-sm">
        {output}
      </pre>
    );
  }

  // Handle top-level errors from the Python script
  if (parsedOutput.status === "error") {
    return (
      <div className="bg-red-100 text-red-700 p-4 rounded-md font-bold">
        ERROR: {parsedOutput.message}
      </div>
    );
  }

  // Render the results for each host
  return (
    <div className="space-y-6">
      {parsedOutput.results_by_host &&
        parsedOutput.results_by_host.map((hostResult, index) => (
          <div key={index} className="p-4 border rounded-md bg-white shadow-sm">
            <h3 className="text-lg font-bold text-gray-800">
              Results for:{" "}
              <span className="font-mono">{hostResult.hostname}</span>
            </h3>
            {hostResult.status === "error" ? (
              <p className="text-red-600 mt-2">{hostResult.message}</p>
            ) : (
              hostResult.test_results.map((testResult, testIndex) => (
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
    </div>
  );
}
