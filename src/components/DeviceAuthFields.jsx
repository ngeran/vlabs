// src/components/DeviceAuthFields.jsx

import React, { useState, useEffect } from "react";
import { List, Keyboard } from "lucide-react";

const API_BASE_URL = "http://localhost:3001";

/**
 * @description A smart component for handling device targeting and authentication.
 *              It allows switching between manual host entry and inventory file selection,
 *              and provides a compact, user-friendly layout for credentials.
 * @param {object} props - Component props.
 * @param {object} props.parameters - The current state of parameters for the script.
 * @param {function} props.onParamChange - The callback to update the parent's state.
 */
export default function DeviceAuthFields({ parameters, onParamChange }) {
  const [inputMode, setInputMode] = useState("manual");
  const [inventories, setInventories] = useState([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [errorInv, setErrorInv] = useState(null);

  useEffect(() => {
    const fetchInventories = async () => {
      setLoadingInv(true);
      setErrorInv(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/inventories/list`);
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
    };
    fetchInventories();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    onParamChange({ ...parameters, [name]: value });
  };

  const handleModeChange = (mode) => {
    setInputMode(mode);
    if (mode === "manual") {
      const { inventory_file, ...rest } = parameters;
      onParamChange(rest);
    } else {
      const { hostname, ...rest } = parameters;
      onParamChange(rest);
    }
  };

  return (
    <div className="space-y-6">
      {/* Target Mode Selector (unchanged) */}
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

      {/* Conditional Inputs */}
      {inputMode === "manual" ? (
        <div>
          <label
            htmlFor="hostname"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Target Hostname(s)
          </label>
          {/* --- UI CHANGE #1: Use a single-line input instead of textarea --- */}
          <input
            type="text"
            id="hostname"
            name="hostname"
            value={parameters.hostname || ""}
            onChange={handleChange}
            placeholder="e.g., router1, router2.cisco.com, 10.0.0.1"
            className="mt-1 block w-full border border-slate-300 rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500"
            required
          />
          <p className="text-xs text-slate-500 mt-1">
            Enter one or more hostnames/IPs, separated by commas.
          </p>
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

      {/* Common Auth Fields */}
      <div className="border-t border-slate-200 pt-6">
        {/* --- UI CHANGE #2: Wrap username and password in a flex container --- */}
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
