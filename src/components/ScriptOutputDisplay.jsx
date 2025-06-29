import React from "react";

// A helper to colorize common network statuses for table cells
const ColorizedCell = ({ value }) => {
  if (typeof value !== "string") return value;
  const lowerStatus = value.toLowerCase();

  if (lowerStatus === "up" || lowerStatus === "established") {
    return <span className="font-semibold text-green-600">{value}</span>;
  }
  if (lowerStatus === "down") {
    return <span className="font-semibold text-red-600">{value}</span>;
  }
  return value;
};

// A sub-component that renders a table if display_hints are provided
function DynamicResultTable({ result }) {
  // Destructure hints and the rest of the data from the details object
  const { display_hints, ...data } = result.details;

  // If there are no hints or the type isn't 'table', render nothing
  if (!display_hints || display_hints.type !== "table") {
    return null;
  }

  // Get the actual data array using the data_key from the hints
  const tableData = data[display_hints.data_key];

  if (!tableData || !Array.isArray(tableData) || tableData.length === 0) {
    return (
      <p className="text-sm text-gray-500 mt-2 italic">
        No detailed data available for this check.
      </p>
    );
  }

  const columns = display_hints.columns;

  return (
    <div className="mt-4 overflow-x-auto border rounded-lg shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.accessor}
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {tableData.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-gray-50">
              {columns.map((col) => (
                <td
                  key={col.accessor}
                  className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 font-mono"
                >
                  <ColorizedCell value={row[col.accessor]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The main display component that you will use in PythonScriptRunner.jsx
export default function ScriptOutputDisplay({ output, error }) {
  // --- ADD THE LOGGING BLOCK ---
  console.log("--- ScriptOutputDisplay Render ---");
  console.log("Received error prop:", error);
  console.log("Received output prop (type):", typeof output);
  console.log("Received output prop (value):", output);
  // -----------------------------
  if (error) {
    return (
      <div className="bg-red-100 text-red-800 p-4 rounded-md">
        <h4 className="font-bold">Execution Error</h4>
        <pre className="whitespace-pre-wrap font-mono text-sm">{error}</pre>
      </div>
    );
  }
  if (!output) return null;

  let parsedOutput;
  try {
    parsedOutput = JSON.parse(output);
    // --- ADD THIS LOG ---
    console.log("Successfully parsed JSON:", parsedOutput);
  } catch (e) {
    // Fallback for non-JSON or malformed output (e.g., from other scripts)
    return (
      <pre className="bg-gray-900 text-gray-200 p-4 rounded-md whitespace-pre-wrap font-mono text-sm">
        {output}
      </pre>
    );
  }

  const { results, summary, status, message } = parsedOutput;
  // --- ADD THIS CRITICAL LOG ---
  console.log("Destructured 'results' variable:", results);

  if (status === "error") {
    return (
      <div className="bg-red-100 text-red-800 p-4 rounded-md font-semibold">
        {message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* You can add an overall summary box here if you want */}

      {/* Map over each test result */}
      {results &&
        results.map((result, index) => (
          <div key={index} className="p-4 border rounded-md bg-white shadow-sm">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-gray-800">
                Test: <span className="font-mono">{result.test}</span> on{" "}
                <span className="font-mono">{result.host}</span>
              </h4>
              <span
                className={`px-3 py-1 text-xs font-bold rounded-full ${result.status === "PASS" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
              >
                {result.status}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">{result.message}</p>

            {/* This is where the magic happens! */}
            <DynamicResultTable result={result} />
          </div>
        ))}
    </div>
  );
}
