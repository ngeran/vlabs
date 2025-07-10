// ====================================================================================
// COMPONENT: DeviceAuthFields.jsx - FINAL CORRECTED VERSION
// This version fixes the critical bug in how the onParamChange prop is called.
// ====================================================================================

// ====================================================================================
// SECTION 1: IMPORTS & DEPENDENCIES
// ====================================================================================
import React, { useState, useEffect } from "react";
import { List, Keyboard } from "lucide-react";

// ====================================================================================
// SECTION 2: API CONSTANTS
// ====================================================================================
const API_BASE_URL = "http://localhost:3001";

// ====================================================================================
// SECTION 3: MAIN COMPONENT DEFINITION
// ====================================================================================
/**
 * @description A smart component for handling device targeting and authentication.
 * @param {object} props - Component props.
 * @param {object} props.parameters - The current state object for all form parameters.
 * @param {(name: string, value: any) => void} props.onParamChange - Callback to update ONE parameter in the parent's state.
 */
export default function DeviceAuthFields({ parameters, onParamChange }) {
  // ----------------------------------------------------------------------------------
  // Subsection 3.1: State Management
  // ----------------------------------------------------------------------------------
  const [inputMode, setInputMode] = useState("manual");
  const [inventories, setInventories] = useState([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [errorInv, setErrorInv] = useState(null);

  // ----------------------------------------------------------------------------------
  // Subsection 3.2: Data Fetching Effect
  // ----------------------------------------------------------------------------------
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

  // ----------------------------------------------------------------------------------
  // Subsection 3.3: Event Handlers
  // ----------------------------------------------------------------------------------

  /**
   * ✨ THIS IS THE FIX ✨
   * @description Handles any change in the input or select fields.
   * It now calls the parent's handler with the correct (name, value) signature.
   */
  const handleChange = (e) => {
    const { name, value } = e.target;
    // Correctly call the parent's state update function with two arguments.
    onParamChange(name, value);
  };

  /**
   * ✨ THIS IS THE FIX ✨
   * @description Handles clicks on the 'Manual Entry' vs 'Inventory File' toggle.
   * It now correctly calls the parent's handler to clear the conflicting field.
   */
  const handleModeChange = (mode) => {
    setInputMode(mode);
    if (mode === "manual") {
      // Tell the parent to REMOVE the 'inventory_file' key by passing undefined.
      onParamChange("inventory_file", undefined);
    } else {
      // Tell the parent to REMOVE the 'hostname' key by passing undefined.
      onParamChange("hostname", undefined);
    }
  };

  // ----------------------------------------------------------------------------------
  // Subsection 3.4: Main Render Logic (JSX)
  // ----------------------------------------------------------------------------------
  return (
    <div className="space-y-6">
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
            Target Hostname(s)
          </label>
          <input
            type="text"
            id="hostname"
            name="hostname"
            value={parameters.hostname || ""}
            onChange={handleChange}
            placeholder="e.g., router1, 10.0.0.1"
            className="mt-1 block w-full border border-slate-300 rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
      ) : (
        <div>
          <label
            htmlFor="inventory_file"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Select Inventory File
          </label>
          {errorInv && <p className="text-sm text-red-600 mt-1">{errorInv}</p>}
          <select
            id="inventory_file"
            name="inventory_file"
            value={parameters.inventory_file || ""}
            onChange={handleChange}
            disabled={loadingInv || inventories.length === 0}
            className="mt-1 block w-full border border-slate-300 rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
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
          <div className="w-full md:flex-1">
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
    </div>
  );
}
