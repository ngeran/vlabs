// src/components/ScriptOutputDisplay.jsx
import React from "react";
import { Loader2 } from "lucide-react"; // For the loading spinner

/**
 * @description Component for displaying the output, errors, and loading states of script execution.
 * @param {object} props - The component props.
 * @param {string} props.output - The successful output string from the script.
 * @param {string} props.error - The combined error message (data fetching or script execution).
 * @param {boolean} props.isLoading - True if a script execution is in progress.
 * @param {boolean} props.fetchingScripts - True if scripts data is being fetched.
 * @param {boolean} props.fetchingInventories - True if inventory data is being fetched.
 */
function ScriptOutputDisplay({
  output,
  error,
  isLoading,
  fetchingScripts,
  fetchingInventories,
}) {
  // Determine if there's any overall loading activity
  const anyLoading = isLoading || fetchingScripts || fetchingInventories;

  return (
    <div className="mt-8 pt-6 border-t border-gray-200">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">
        Script Output:
      </h2>
      {error && (
        <pre className="bg-red-50 text-red-700 p-4 rounded-md text-sm border border-red-200 whitespace-pre-wrap break-all overflow-x-auto">
          <span className="font-bold">ERROR:</span> {error}
        </pre>
      )}
      {output && (
        <pre className="bg-gray-100 p-4 rounded-md text-gray-800 text-sm border border-gray-200 whitespace-pre-wrap break-all overflow-x-auto">
          {output}
        </pre>
      )}
      {!output && !error && !anyLoading && (
        <p className="text-gray-600 text-sm">
          Run a script to see output here.
        </p>
      )}
      {isLoading && (
        <p className="text-blue-600 text-sm flex items-center">
          <Loader2 className="animate-spin h-4 w-4 mr-2" /> Running Script...
        </p>
      )}
      {fetchingScripts && ( // Redundant if anyLoading is true, but good for specific messages
        <p className="text-blue-600 text-sm flex items-center">
          <Loader2 className="animate-spin h-4 w-4 mr-2" /> Loading Scripts
          Data...
        </p>
      )}
      {fetchingInventories && ( // Redundant if anyLoading is true, but good for specific messages
        <p className="text-blue-600 text-sm flex items-center">
          <Loader2 className="animate-spin h-4 w-4 mr-2" /> Loading Inventory
          Data...
        </p>
      )}
    </div>
  );
}

export default ScriptOutputDisplay;
