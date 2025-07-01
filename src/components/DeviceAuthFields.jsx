// src/components/DeviceAuthFields.jsx
import React, { useState, useEffect } from "react";
import { List, Keyboard } from "lucide-react";

const API_BASE_URL = "http://localhost:3001";

// This component is now significantly more powerful.
function DeviceAuthFields({ parameters, onParamChange }) {
  // State for managing the input mode and fetched inventory files
  const [inputMode, setInputMode] = useState("manual"); // 'manual' or 'inventory'
  const [inventories, setInventories] = useState([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [errorInv, setErrorInv] = useState(null);

  // Effect to fetch available inventory files on component mount
  useEffect(() => {
    const fetchInventories = async () => {
      setLoadingInv(true);
      setErrorInv(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/inventories/list`);
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || "Failed to fetch inventories.");
        }
        setInventories(data.inventories || []);
      } catch (error) {
        setErrorInv(error.message);
      } finally {
        setLoadingInv(false);
      }
    };
    fetchInventories();
  }, []); // Empty dependency array ensures this runs only once

  // Handler for generic input changes (username, password, manual hostname)
  const handleChange = (e) => {
    const { name, value } = e.target;
    onParamChange({ ...parameters, [name]: value });
  };

  // Handler for switching the input mode (Manual vs. Inventory)
  const handleModeChange = (mode) => {
    setInputMode(mode);
    // Clear the parameter of the *other* mode to prevent conflicts
    if (mode === "manual") {
      onParamChange({ ...parameters, inventory_file: undefined });
    } else {
      onParamChange({ ...parameters, hostname: undefined });
    }
  };

  return (
    <div className="space-y-4">
      {/* --- Mode Selector --- */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Target Mode
        </label>
        <div className="flex gap-2 rounded-md bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => handleModeChange("manual")}
            className={`w-full flex items-center justify-center gap-2 p-2 rounded-md text-sm font-semibold transition-all ${
              inputMode === "manual"
                ? "bg-white shadow-sm text-blue-600"
                : "text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Keyboard size={16} /> Manual Entry
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("inventory")}
            className={`w-full flex items-center justify-center gap-2 p-2 rounded-md text-sm font-semibold transition-all ${
              inputMode === "inventory"
                ? "bg-white shadow-sm text-blue-600"
                : "text-slate-600 hover:bg-slate-200"
            }`}
          >
            <List size={16} /> Inventory File
          </button>
        </div>
      </div>

      {/* --- Conditional Inputs based on Mode --- */}
      {inputMode === "manual" && (
        <div>
          <label
            htmlFor="hostname"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Target Hostname(s)
          </label>
          <textarea
            id="hostname"
            name="hostname"
            rows="3"
            value={parameters.hostname || ""}
            onChange={handleChange}
            placeholder="e.g., router1.example.com"
            className="mt-1 block w-full border border-slate-300 rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500"
            required
          />
          <p className="text-xs text-slate-500 mt-1">
            Enter one hostname or IP per line.
          </p>
        </div>
      )}

      {inputMode === "inventory" && (
        <div>
          <label
            htmlFor="inventory_file"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Select Inventory File
          </label>
          {loadingInv && (
            <p className="text-sm text-slate-500">Loading inventories...</p>
          )}
          {errorInv && <p className="text-sm text-red-600">{errorInv}</p>}
          {!loadingInv && (
            <select
              id="inventory_file"
              name="inventory_file"
              value={parameters.inventory_file || ""}
              onChange={handleChange}
              disabled={inventories.length === 0}
              className="mt-1 block w-full border border-slate-300 rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
              required
            >
              <option value="">
                {inventories.length > 0
                  ? "-- Select a file --"
                  : "No inventory files found"}
              </option>
              {inventories.map((file) => (
                <option key={file} value={file}>
                  {file}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* --- Common Auth Fields --- */}
      <div className="border-t border-slate-200 pt-4 space-y-4">
        <div>
          <label
            htmlFor="username"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Username
          </label>
          <input
            type="text"
            id="username"
            name="username"
            value={parameters.username || ""}
            onChange={handleChange}
            className="mt-1 block w-full border border-slate-300 rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Password
          </label>
          <input
            type="password"
            id="password"
            name="password"
            value={parameters.password || ""}
            onChange={handleChange}
            className="mt-1 block w-full border border-slate-300 rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
      </div>
    </div>
  );
}

export default DeviceAuthFields;
