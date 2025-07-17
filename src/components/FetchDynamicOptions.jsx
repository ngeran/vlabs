// vlabs/src/components/FetchDynamicOptions.jsx

// ====================================================================================
// SECTION 1: IMPORTS & COMPONENT OVERVIEW
// ====================================================================================
// Description: React component for rendering dynamic dropdowns for device IP and backup file selection.
// Purpose: Fetches options from /api/backups/devices for the backup_restore script’s restore mode,
//          validates paths against backup_base_path from metadata.yml, and displays them in the UI.
// Dependencies: Uses Tailwind CSS for styling and fetchDynamicOptions utility for API calls.
import React, { useState, useEffect } from "react";
import { fetchDynamicOptions } from "../utils/fetchDynamicOptions";
import toast from "react-hot-toast";

// ====================================================================================
// SECTION 2: COMPONENT DEFINITION & STATE MANAGEMENT
// ====================================================================================
// Description: Defines the FetchDynamicOptions component and its state for managing devices and backups.
// Purpose: Handles dynamic dropdown logic and user input for restore operations.
export default function FetchDynamicOptions({ script, parameters, onParamChange }) {
  const [deviceOptions, setDeviceOptions] = useState([]); // List of devices and their backups
  const [loadingDevices, setLoadingDevices] = useState(false); // Loading state for API call
  const [errorDevices, setErrorDevices] = useState(null); // Error state for API failures
  const [selectedDevice, setSelectedDevice] = useState(parameters.hostname || ""); // Selected device IP
  const [backupBasePath, setBackupBasePath] = useState(""); // Base path for backup files from metadata.yml

  // ====================================================================================
  // SECTION 3: DATA FETCHING & PROCESSING
  // ====================================================================================
  // Description: Fetches device and backup data from /api/backups/devices when in restore mode.
  // Purpose: Populates dropdowns and validates backup file paths against backup_base_path.
  useEffect(() => {
    const hostnameParam = script?.parameters.find(p => p.name === "hostname");

    if (hostnameParam?.dynamicOptionsEndpoint && parameters.command === "restore") {
      setLoadingDevices(true);
      setErrorDevices(null);
      fetchDynamicOptions(hostnameParam.dynamicOptionsEndpoint, `devices-${script.id}`).then(({ options, error }) => {
        const processedOptions = options.map(device => ({
         deviceIp: device.deviceIp,
         backups: device.backups.map(backup => ({
           value: backup.value,
           label: backup.label.split('_').pop() // Shortens label to e.g., "180433.conf"
         }))
       }));
        setDeviceOptions(processedOptions);
        if (processedOptions.length > 0 && !parameters.hostname) {
          onParamChange("hostname", processedOptions[0].deviceIp);
          setSelectedDevice(processedOptions[0].deviceIp);
        }
        setLoadingDevices(false);
        setErrorDevices(error);
      });
    } else {
      setDeviceOptions([]);
      setSelectedDevice("");
    }
  }, [script, parameters.command, onParamChange, parameters.hostname]);

  // ====================================================================================
  // SECTION 4: BACKUP FILE AUTO-SELECTION
  // ====================================================================================
  // Description: Automatically selects a backup file when a device is chosen.
  // Purpose: Simplifies user interaction by pre-selecting the first valid backup.
  useEffect(() => {
    if (parameters.command === "restore" && selectedDevice) {
      const device = deviceOptions.find(d => d.deviceIp === selectedDevice);
      if (device?.backups.length > 0 && !parameters.backup_file) {
        onParamChange("backup_file", device.backups[0].value);
        console.log(`[FetchDynamicOptions] Auto-selected backup_file: ${device.backups[0].value}`);
      } else if (device?.backups.length === 0) {
        onParamChange("backup_file", "");
        console.log(`[FetchDynamicOptions] No backups available for device: ${selectedDevice}`);
      }
    }
  }, [selectedDevice, deviceOptions, parameters.command, onParamChange]);

  // ====================================================================================
  // SECTION 5: VALIDATION HELPERS
  // ====================================================================================
  // Description: Validates selected hostname and backup file.
  // Purpose: Ensures required fields are filled and paths are valid before submission.
  const hasValidHostname = parameters.hostname && parameters.hostname.trim() !== "";
  const hasValidBackupFile = parameters.backup_file && parameters.backup_file.trim() !== "";
  // ====================================================================================
  // SECTION 6: EVENT HANDLERS
  // ====================================================================================
  // Description: Handles changes to dropdown selections.
  // Purpose: Updates parameters and selected device state, with logging for debugging.
  const handleChange = (e) => {
    const { name, value } = e.target;
    console.log(`[FetchDynamicOptions] Setting ${name} = "${value}"`);
    onParamChange(name, value);
    if (name === "hostname") {
      setSelectedDevice(value);
    }
  };

  // ====================================================================================
  // SECTION 7: UI RENDERING
  // ====================================================================================
  // Description: Renders dropdowns for device IP and backup file selection.
  // Purpose: Provides a user-friendly interface for restore operations with validation feedback.
  if (parameters.command !== "restore") return null;

  return (
    <div className="border-t border-gray-200 pt-6 space-y-4">
      <h4 className="text-sm font-medium text-gray-700 flex items-center">
        <svg className="w-5 h-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
        Restore Configuration
      </h4>
      <div className="flex flex-row gap-4">
        {/* Device IP Dropdown */}
        <div className="flex-1">
          <label htmlFor="restore_hostname" className="block text-sm font-medium text-gray-700 mb-1">
            Device IP *
          </label>
          {loadingDevices ? (
            <div className="flex items-center justify-center h-10">
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : errorDevices ? (
            <p className="text-sm text-red-600">{errorDevices}</p>
          ) : deviceOptions.length === 0 ? (
            <p className="text-sm text-red-600">No devices with backups found.</p>
          ) : (
            <select
              id="restore_hostname"
              name="hostname"
              value={parameters.hostname || ""}
              onChange={handleChange}
              className="block w-full max-w-64 border rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500 transition duration-150 ease-in-out truncate"
              required
              title={parameters.hostname || "Select a device"}
            >
              <option value="" disabled>Select a device</option>
              {deviceOptions.map(device => (
                <option key={device.deviceIp} value={device.deviceIp} title={device.deviceIp}>
                  {device.deviceIp}
                </option>
              ))}
            </select>
          )}
          {!hasValidHostname && (
            <p className="text-sm text-red-600 mt-1">Device IP is required</p>
          )}
        </div>
        {/* Backup File Dropdown */}
        <div className="flex-1">
          <label htmlFor="backup_file" className="block text-sm font-medium text-gray-700 mb-1">
            Backup File to Restore *
          </label>
          {loadingDevices ? (
            <div className="flex items-center justify-center h-10">
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : errorDevices ? (
            <p className="text-sm text-red-600">{errorDevices}</p>
          ) : (
            (() => {
              const device = deviceOptions.find(d => d.deviceIp === selectedDevice);
              const backups = device ? device.backups : [];
              return backups.length === 0 ? (
                <p className="text-sm text-red-600">No backup files available for this device.</p>
              ) : (
                <select
                  id="backup_file"
                  name="backup_file"
                  value={parameters.backup_file || ""}
                  onChange={handleChange}
                  className="block w-full max-w-64 border rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500 transition duration-150 ease-in-out truncate"
                  required
                  title={parameters.backup_file || "Select a backup file"}
                >
                  <option value="" disabled>Select a backup file</option>
                  {backups.map(backup => (
                    <option key={backup.value} value={backup.value} title={backup.value}>
                      {backup.label}
                    </option>
                  ))}
                </select>
              );
            })()
          )}
          {!hasValidBackupFile && (
            <p className="text-sm text-red-600 mt-1">Valid backup file is required</p>
          )}
        </div>
      </div>
    </div>
  );
}
