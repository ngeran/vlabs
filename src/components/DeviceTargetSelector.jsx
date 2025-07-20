// =============================================================================
// FILE: DeviceTargetSelector.jsx
// DESCRIPTION: Reusable component for rendering device targeting inputs (hostname
//              or inventory file selection) with a toggle between manual and
//              inventory modes. Fetches inventory files from the backend API and
//              logs interactions to verify inventory file selection, including
//              specific checks for inventory.yml.
// DEPENDENCIES:
//   - react: For building the UI and managing state (useState, useEffect).
//   - lucide-react: For icons (List, Keyboard, Server, AlertCircle, ChevronDown, Wifi).
//   - fetch: For making API calls to fetch inventory files.
// =============================================================================

import React, { useState, useEffect } from "react";
import { List, Keyboard, Server, AlertCircle, ChevronDown, Wifi } from "lucide-react";

// =============================================================================
// SECTION 1: CONSTANTS
// =============================================================================
const API_BASE_URL = "http://localhost:3001"; // Base URL for backend API

// =============================================================================
// SECTION 2: COMPONENT DEFINITION
// =============================================================================
// Renders inputs for selecting target devices (hostname or inventory file).
export default function DeviceTargetSelector({
  parameters = {}, // Input parameters (hostname, inventory_file)
  onParamChange = () => {}, // Callback to update parameters
  title = "Target Configuration", // Title from metadata.yml
  description = "Select target devices for operation", // Description from metadata.yml
  className = "" // Additional CSS classes
}) {
  // =============================================================================
  // SECTION 3: STATE MANAGEMENT
  // =============================================================================
  const [inputMode, setInputMode] = useState("manual"); // Toggle between manual and inventory modes
  const [inventories, setInventories] = useState([]); // List of available inventory files
  const [loadingInv, setLoadingInv] = useState(false); // Loading state for inventory fetch
  const [errorInv, setErrorInv] = useState(null); // Error message for inventory fetch

  // =============================================================================
  // SECTION 4: FETCH INVENTORY FILES
  // =============================================================================
  // Fetch available inventory files from the backend.
  useEffect(() => {
    async function fetchInventories() {
      setLoadingInv(true);
      setErrorInv(null);
      try {
        console.log('[DeviceTargetSelector] Fetching inventory files from:', `${API_BASE_URL}/api/inventories/list`);
        const response = await fetch(`${API_BASE_URL}/api/inventories/list`);
        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (data.success) {
          console.log('[DeviceTargetSelector] Successfully fetched inventories:', data.inventories);
          const hasInventoryYml = data.inventories.some(file => file.value === 'inventory.yml');
          console.log('[DeviceTargetSelector] Is inventory.yml available?', hasInventoryYml);
          if (!hasInventoryYml) {
            console.warn('[DeviceTargetSelector] inventory.yml not found in fetched inventories');
            setErrorInv('Inventory file "inventory.yml" not found in available inventories.');
          }
          setInventories(data.inventories || []);
        } else {
          throw new Error(data.message || "Unknown error fetching inventories.");
        }
      } catch (error) {
        console.error('[DeviceTargetSelector] Failed to fetch inventories:', error.message);
        setErrorInv(error.message);
      } finally {
        setLoadingInv(false);
      }
    }
    fetchInventories();
  }, []);

  // =============================================================================
  // SECTION 5: EVENT HANDLERS
  // =============================================================================
  // Handle input changes for hostname or inventory_file.
  const handleChange = (e) => {
    const { name, value } = e.target;
    console.log(`[DeviceTargetSelector] Updating ${name} to:`, value);
    if (name === 'inventory_file' && value === 'inventory.yml') {
      console.log('[DeviceTargetSelector] Selected inventory.yml');
    }
    onParamChange(name, value);
  };

  // Handle toggle between manual and inventory modes, resetting other field.
  const handleModeChange = (mode) => {
    console.log('[DeviceTargetSelector] Switching to input mode:', mode);
    setInputMode(mode);
    if (mode === "manual") {
      console.log('[DeviceTargetSelector] Clearing inventory_file and setting hostname');
      onParamChange("inventory_file", undefined);
      if (!parameters.hostname) {
        onParamChange("hostname", "");
      }
    } else {
      console.log('[DeviceTargetSelector] Clearing hostname and setting inventory_file');
      onParamChange("hostname", undefined);
      if (!parameters.inventory_file) {
        onParamChange("inventory_file", "");
      }
    }
  };

  // =============================================================================
  // SECTION 6: VALIDATION HELPERS
  // =============================================================================
  const hasValidHostname = parameters.hostname && parameters.hostname.trim() !== "";
  const hasValidInventoryFile = parameters.inventory_file && parameters.inventory_file.trim() !== "";

  // =============================================================================
  // SECTION 7: RENDER LOGIC
  // =============================================================================
  return (
    <div className={`bg-gradient-to-br from-slate-50 to-white border border-slate-200/60 rounded-2xl shadow-sm backdrop-blur-sm ${className}`}>
      {/* SECTION 7.1: HEADER */}
      <div className="px-5 py-4 border-b border-slate-100/80">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-sm">
              <Server className="h-4 w-4 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-900 truncate">{title}</h3>
              <p className="text-xs text-slate-500 truncate">{description}</p>
            </div>
          </div>
          {/* Connection Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-slate-100/80 to-slate-50 rounded-full border border-slate-200/60">
            <div className="h-2 w-2 bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full animate-pulse"></div>
            <span className="text-xs font-medium text-slate-600">Network Ready</span>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex bg-slate-100/50 rounded-xl p-1 mt-3 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => handleModeChange("manual")}
            className={`relative flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 ${
              inputMode === "manual"
                ? "bg-white text-blue-600 shadow-sm border border-slate-200/80"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <Keyboard className="h-3.5 w-3.5" />
            Manual
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("inventory")}
            className={`relative flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 ${
              inputMode === "inventory"
                ? "bg-white text-blue-600 shadow-sm border border-slate-200/80"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            Inventory
          </button>
        </div>
      </div>

      {/* SECTION 7.2: INPUT FIELDS */}
      <div className="p-5">
        {inputMode === "manual" ? (
          <div className="group">
            <div className="relative">
              <input
                type="text"
                id="hostname"
                name="hostname"
                value={parameters.hostname || ""}
                onChange={handleChange}
                placeholder="router1.company.com, 192.168.1.1"
                className={`w-full pl-9 pr-4 py-2.5 text-sm border rounded-xl transition-all duration-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 hover:border-slate-300 ${
                  hasValidHostname
                    ? "border-slate-200 bg-white shadow-sm"
                    : "border-red-200 bg-red-50/50 focus:ring-red-500/20 focus:border-red-400"
                }`}
              />
              <Server className={`absolute left-2.5 top-2.5 h-4 w-4 transition-colors ${
                hasValidHostname ? 'text-slate-400 group-hover:text-slate-500' : 'text-red-400'
              }`} />
            </div>
            {!hasValidHostname && (
              <p className="text-xs text-red-500 mt-1.5 ml-1 animate-in fade-in duration-200">
                Target hostname required
              </p>
            )}
          </div>
        ) : (
          <div className="group">
            <div className="relative">
              <select
                id="inventory_file"
                name="inventory_file"
                value={parameters.inventory_file || ""}
                onChange={handleChange}
                disabled={loadingInv || inventories.length === 0}
                className={`w-full pl-9 pr-10 py-2.5 text-sm border rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 hover:border-slate-300 appearance-none disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${
                  hasValidInventoryFile
                    ? "border-slate-200 bg-white shadow-sm"
                    : "border-red-200 bg-red-50/50 focus:ring-red-500/20 focus:border-red-400"
                }`}
              >
                <option value="">
                  {loadingInv
                    ? "Loading inventories..."
                    : inventories.length > 0
                      ? "Select inventory file"
                      : "No inventory files found"}
                </option>
                {inventories.map((file) => (
                  <option key={file.value} value={file.value}>
                    {file.label}
                  </option>
                ))}
              </select>
              <List className={`absolute left-2.5 top-2.5 h-4 w-4 pointer-events-none transition-colors ${
                hasValidInventoryFile ? 'text-slate-400 group-hover:text-slate-500' : 'text-red-400'
              }`} />
              <ChevronDown className={`absolute right-2.5 top-2.5 h-4 w-4 pointer-events-none transition-colors ${
                hasValidInventoryFile ? 'text-slate-400' : 'text-red-400'
              }`} />
            </div>
            {errorInv && (
              <p className="text-xs text-red-500 mt-1.5 ml-1 animate-in fade-in duration-200 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errorInv}
              </p>
            )}
            {!hasValidInventoryFile && !errorInv && (
              <p className="text-xs text-red-500 mt-1.5 ml-1 animate-in fade-in duration-200">
                Please select an inventory file
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
        I
}
