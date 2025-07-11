// ====================================================================================
// COMPONENT: DeviceAuthFields.jsx - ENHANCED WITH BETTER ERROR HANDLING
// ====================================================================================

import React, { useState, useEffect } from "react";
import { List, Keyboard } from "lucide-react";

const API_BASE_URL = "http://localhost:3001";

export default function DeviceAuthFields({ parameters, onParamChange }) {
  const [inputMode, setInputMode] = useState("manual");
  const [inventories, setInventories] = useState([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [errorInv, setErrorInv] = useState(null);

  // Initialize input mode based on existing parameters
  useEffect(() => {
    if (parameters.inventory_file) {
      setInputMode("inventory");
    } else if (parameters.hostname) {
      setInputMode("manual");
    }
  }, [parameters.inventory_file, parameters.hostname]);

  useEffect(() => {
    async function fetchInventories() {
      setLoadingInv(true);
      setErrorInv(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/inventories/list`);
        if (!response.ok)
          throw new Error(`Server responded with ${response.status}`);
        const data = await response.json();
        if (data.success) {
          setInventories(data.inventories || []);
        } else {
          throw new Error(
            data.message || "Unknown error fetching inventories.",
          );
        }
      } catch (error) {
        console.error("Failed to fetch inventories:", error);
        setErrorInv(error.message);
      } finally {
        setLoadingInv(false);
      }
    }
    fetchInventories();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    console.log(`DeviceAuthFields: Setting ${name} = "${value}"`);

    // Always call with the exact name and value
    onParamChange(name, value);
  };

  const handleModeChange = (mode) => {
    console.log(`DeviceAuthFields: Changing mode to ${mode}`);
    setInputMode(mode);

    if (mode === "manual") {
      // Clear inventory_file and ensure hostname is ready
      onParamChange("inventory_file", undefined);
      // Don't auto-set hostname to empty string, let user fill it
    } else {
      // Clear hostname and ensure inventory_file is ready
      onParamChange("hostname", undefined);
      // Don't auto-set inventory_file, let user select it
    }
  };

  // Validation helpers
  const hasValidHostname =
    parameters.hostname && parameters.hostname.trim() !== "";
  const hasValidInventoryFile =
    parameters.inventory_file && parameters.inventory_file.trim() !== "";
  const hasValidUsername =
    parameters.username && parameters.username.trim() !== "";
  const hasValidPassword =
    parameters.password && parameters.password.trim() !== "";

  return (
    <div className="space-y-6">
      {/* Debug info - remove this in production */}
      <div className="bg-gray-100 p-3 rounded text-xs">
        <strong>Debug Info:</strong>
        <pre>{JSON.stringify(parameters, null, 2)}</pre>
      </div>

      {/* Target Mode Selector Toggle */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Target Mode
        </label>
        <div className="flex gap-2 rounded-md bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => handleModeChange("manual")}
            className={`w-full flex items-center justify-center gap-2 p-2 rounded-md text-sm font-semibold transition-all ${inputMode === "manual" ? "bg-white shadow-sm text-blue-600" : "text-slate-600 hover:bg-slate-200"}`}
          >
            <Keyboard size={16} /> Manual Entry
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("inventory")}
            className={`w-full flex items-center justify-center gap-2 p-2 rounded-md text-sm font-semibold transition-all ${inputMode === "inventory" ? "bg-white shadow-sm text-blue-600" : "text-slate-600 hover:bg-slate-200"}`}
          >
            <List size={16} /> Inventory File
          </button>
        </div>
      </div>

      {/* Conditional Input Area */}
      {inputMode === "manual" ? (
        <div>
          <label
            htmlFor="hostname"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Target Hostname(s) *
          </label>
          <input
            type="text"
            id="hostname"
            name="hostname"
            value={parameters.hostname || ""}
            onChange={handleChange}
            placeholder="e.g., router1, 10.0.0.1"
            className={`mt-1 block w-full border rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500 ${
              hasValidHostname ? "border-slate-300" : "border-red-300"
            }`}
            required
          />
          {!hasValidHostname && (
            <p className="text-sm text-red-600 mt-1">Hostname is required</p>
          )}
        </div>
      ) : (
        <div>
          <label
            htmlFor="inventory_file"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Select Inventory File *
          </label>
          {errorInv && <p className="text-sm text-red-600 mt-1">{errorInv}</p>}
          <select
            id="inventory_file"
            name="inventory_file"
            value={parameters.inventory_file || ""}
            onChange={handleChange}
            disabled={loadingInv || inventories.length === 0}
            className={`mt-1 block w-full border rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 ${
              hasValidInventoryFile ? "border-slate-300" : "border-red-300"
            }`}
            required
          >
            <option value="">
              {loadingInv
                ? "Loading..."
                : inventories.length > 0
                  ? "-- Select a file --"
                  : "No inventory files found"}
            </option>
            {inventories.map((file) => (
              <option key={file} value={file}>
                {file}
              </option>
            ))}
          </select>
          {!hasValidInventoryFile && (
            <p className="text-sm text-red-600 mt-1">
              Please select an inventory file
            </p>
          )}
        </div>
      )}

      {/* Common Authentication Fields */}
      <div className="border-t border-slate-200 pt-6">
        <div className="flex flex-col md:flex-row md:gap-4">
          <div className="w-full md:flex-1 mb-4 md:mb-0">
            <label
              htmlFor="username"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Username *
            </label>
            <input
              type="text"
              id="username"
              name="username"
              value={parameters.username || ""}
              onChange={handleChange}
              className={`mt-1 block w-full border rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500 ${
                hasValidUsername ? "border-slate-300" : "border-red-300"
              }`}
              required
            />
            {!hasValidUsername && (
              <p className="text-sm text-red-600 mt-1">Username is required</p>
            )}
          </div>
          <div className="w-full md:flex-1">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Password *
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={parameters.password || ""}
              onChange={handleChange}
              className={`mt-1 block w-full border rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500 ${
                hasValidPassword ? "border-slate-300" : "border-red-300"
              }`}
              required
            />
            {!hasValidPassword && (
              <p className="text-sm text-red-600 mt-1">Password is required</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
