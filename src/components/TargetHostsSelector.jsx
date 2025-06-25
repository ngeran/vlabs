// src/components/TargetHostsSelector.jsx
import React from "react";

/**
 * @description Component for selecting target hosts for scripts like 'get_device_facts'.
 * Allows selection via inventory file or manual host input.
 * @param {object} props - The component props.
 * @param {string} props.inventorySelectionMode - Current mode ('file' or 'manual').
 * @param {(mode: string) => void} props.onInventoryModeChange - Callback for changing inventory mode.
 * @param {Array<string>} props.availableInventories - List of available inventory file names.
 * @param {boolean} props.fetchingInventories - Whether inventory files are currently being fetched.
 * @param {string} props.currentInventoryFile - Currently selected inventory file.
 * @param {(value: string) => void} props.onInventoryFileChange - Callback for changing inventory file.
 * @param {string} props.currentHosts - Manually entered hosts (comma-separated).
 * @param {(value: string) => void} props.onHostsChange - Callback for changing manual hosts.
 */
function TargetHostsSelector({
  inventorySelectionMode,
  onInventoryModeChange,
  availableInventories,
  fetchingInventories,
  currentInventoryFile,
  onInventoryFileChange,
  currentHosts,
  onHostsChange,
}) {
  return (
    <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">
        Target Hosts:
      </h3>

      <div className="flex items-center space-x-4 mb-4">
        <label className="inline-flex items-center">
          <input
            type="radio"
            className="form-radio text-blue-600"
            name="inventoryMode"
            value="file"
            checked={inventorySelectionMode === "file"}
            onChange={() => onInventoryModeChange("file")}
          />
          <span className="ml-2 text-gray-700">Select Inventory File</span>
        </label>
        <label className="inline-flex items-center">
          <input
            type="radio"
            className="form-radio text-blue-600"
            name="inventoryMode"
            value="manual"
            checked={inventorySelectionMode === "manual"}
            onChange={() => onInventoryModeChange("manual")}
          />
          <span className="ml-2 text-gray-700">Manually Add Hosts</span>
        </label>
      </div>

      {inventorySelectionMode === "file" ? (
        <div className="mb-4">
          <label
            htmlFor="inventory-file-select"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Inventory File: <span className="text-red-500">*</span>
          </label>
          <select
            id="inventory-file-select"
            value={currentInventoryFile || ""}
            onChange={(e) => onInventoryFileChange(e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            required
            disabled={availableInventories.length === 0}
          >
            {availableInventories.length === 0 ? (
              <option value="">No inventory files found</option>
            ) : (
              availableInventories.map((file) => (
                <option key={file} value={file}>
                  {file}
                </option>
              ))
            )}
          </select>
          {availableInventories.length === 0 && !fetchingInventories && (
            <p className="text-red-500 text-xs mt-1">
              No inventory files found in `python_pipeline/data/`.
            </p>
          )}
        </div>
      ) : (
        <div className="mb-4">
          <label
            htmlFor="manual-hosts-input"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Hosts (comma-separated): <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="manual-hosts-input"
            value={currentHosts || ""}
            onChange={(e) => onHostsChange(e.target.value)}
            placeholder="e.g., device1.lab.com,10.0.0.1,device3"
            required
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
      )}
    </div>
  );
}

export default TargetHostsSelector;
