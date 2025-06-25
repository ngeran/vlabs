// src/components/FeaturedScripts.jsx
import React from "react";
import { Zap } from "lucide-react"; // Assuming lucide-react is installed for icons

/**
 * @description A presentational component for displaying a list of featured scripts in a table.
 * It allows users to select a featured script, which triggers a callback function.
 * @param {object} props - The component props.
 * @param {Array<object>} props.featuredScripts - An array of script objects marked as featured.
 * @param {(scriptId: string) => void} props.onSelectScript - Callback function when a script is selected.
 */
function FeaturedScripts({ featuredScripts, onSelectScript }) {
  if (!featuredScripts || featuredScripts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center mb-4">
          <Zap size={20} className="mr-2 text-blue-500" />
          Featured Scripts
        </h2>
        <p className="text-gray-600 text-center py-4">
          No featured scripts available. Add 'featured' tag in scripts.yaml.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center mb-4">
        <Zap size={20} className="mr-2 text-blue-500" />
        Featured Scripts
      </h2>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Script Display Name
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Category
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Select</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {featuredScripts.map((script) => (
              <tr key={script.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {script.displayName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {script.category}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => onSelectScript(script.id)}
                    className="text-blue-600 hover:text-blue-900 px-3 py-1 border border-blue-600 rounded-md hover:bg-blue-50 transition-colors duration-200"
                  >
                    Select
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default FeaturedScripts;
