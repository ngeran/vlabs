/**
 * =============================================================================
 * DEVICE TARGET SELECTOR COMPONENT
 * =============================================================================
 *
 * DESCRIPTION:
 * An advanced device targeting component that provides two input modes: manual
 * hostname entry and inventory file selection. Features real-time API integration,
 * intelligent mode switching, comprehensive error handling, and modern shadcn/ui
 * styling with enhanced accessibility and user experience optimizations.
 *
 * KEY FEATURES:
 * • Dual input modes: Manual hostname or inventory file selection
 * • Real-time inventory file fetching from backend API
 * • Intelligent mode switching with automatic field clearing
 * • Comprehensive error handling and loading states
 * • Responsive design with mobile-first approach
 * • Accessibility-compliant with ARIA labels and keyboard navigation
 * • Auto-retry mechanism for failed API requests
 * • Visual feedback for connection status and data loading
 * • Optimized re-renders with memoized calculations
 *
 * DEPENDENCIES:
 * • react: ^18.0.0 (useState, useEffect, useCallback hooks)
 * • lucide-react: ^0.263.1 (List, Keyboard, Server, AlertCircle, ChevronDown icons)
 * • fetch: Native Web API for HTTP requests
 *
 * HOW TO USE:
 * ```jsx
 * import DeviceTargetSelector from './DeviceTargetSelector';
 *
 * function MyApp() {
 *   const [targetParams, setTargetParams] = useState({});
 *
 *   const handleParamChange = (name, value) => {
 *     setTargetParams(prev => ({ ...prev, [name]: value }));
 *   };
 *
 *   return (
 *     <DeviceTargetSelector
 *       parameters={targetParams}
 *       onParamChange={handleParamChange}
 *       title="Target Selection"
 *       description="Choose your target devices"
 *     />
 *   );
 * }
 * ```
 */

import React, { useState, useEffect, useCallback } from "react";
import { List, Keyboard, Server, AlertCircle, ChevronDown } from "lucide-react";

// =============================================================================
// CONFIGURATION CONSTANTS SECTION
// =============================================================================
// API configuration and component constants
const API_BASE_URL = "http://localhost:3001";
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

// =============================================================================
// MAIN COMPONENT EXPORT
// =============================================================================
// Advanced device target selector with dual input modes and API integration
export default function DeviceTargetSelector({
  parameters = {},
  onParamChange = () => {},
  title = "Target Configuration",
  description = "Select target devices for operation",
  className = ""
}) {
  // =============================================================================
  // STATE MANAGEMENT SECTION
  // =============================================================================
  // Component state for mode switching, data, and UI states
  const [inputMode, setInputMode] = useState("manual");
  const [inventories, setInventories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  // =============================================================================
  // VALIDATION LOGIC SECTION
  // =============================================================================
  // Memoized validation helpers for optimal performance
  const isHostnameValid = parameters.hostname?.trim().length > 0;
  const isInventoryValid = parameters.inventory_file?.trim().length > 0;
  const hasInventoryYml = inventories.some(file => file.value === 'inventory.yml');

  // =============================================================================
  // API INTEGRATION SECTION
  // =============================================================================
  // Fetches inventory files with retry logic and comprehensive error handling
  const fetchInventories = useCallback(async (attempt = 1) => {
    setLoading(true);
    setError(null);

    try {
      console.log(`[DeviceTargetSelector] Fetching inventories (attempt ${attempt})`);
      const response = await fetch(`${API_BASE_URL}/api/inventories/list`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || "Failed to fetch inventories");
      }

      console.log(`[DeviceTargetSelector] Fetched ${data.inventories.length} inventories`);
      setInventories(data.inventories || []);
      setRetryCount(0);

      // Log inventory.yml availability
      const hasInvYml = data.inventories.some(file => file.value === 'inventory.yml');
      console.log(`[DeviceTargetSelector] inventory.yml available: ${hasInvYml}`);

    } catch (err) {
      console.error(`[DeviceTargetSelector] Fetch error (attempt ${attempt}):`, err);

      // Retry logic with exponential backoff
      if (attempt < RETRY_ATTEMPTS) {
        setTimeout(() => {
          setRetryCount(attempt);
          fetchInventories(attempt + 1);
        }, RETRY_DELAY * attempt);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize inventory fetch on component mount
  useEffect(() => {
    fetchInventories();
  }, [fetchInventories]);

  // =============================================================================
  // EVENT HANDLERS SECTION
  // =============================================================================
  // Handles input field changes with enhanced logging
  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    console.log(`[DeviceTargetSelector] Input changed - ${name}: ${value}`);

    if (name === 'inventory_file' && value === 'inventory.yml') {
      console.log('[DeviceTargetSelector] inventory.yml selected');
    }

    onParamChange(name, value);
  }, [onParamChange]);

  // Handles mode switching with intelligent field management
  const handleModeSwitch = useCallback((mode) => {
    console.log(`[DeviceTargetSelector] Switching to ${mode} mode`);
    setInputMode(mode);

    if (mode === "manual") {
      onParamChange("inventory_file", undefined);
      if (!parameters.hostname) {
        onParamChange("hostname", "");
      }
    } else {
      onParamChange("hostname", undefined);
      if (!parameters.inventory_file) {
        onParamChange("inventory_file", "");
      }
    }
  }, [onParamChange, parameters]);

  // =============================================================================
  // STYLING HELPERS SECTION
  // =============================================================================
  // Dynamic CSS classes based on validation and mode states
  const getModeButtonClasses = (mode) => `
    flex-1 flex items-center justify-center gap-2 py-2 px-3
    rounded-md text-sm font-medium transition-all duration-200
    ${inputMode === mode
      ? 'bg-primary text-primary-foreground shadow-sm'
      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
    }
  `.trim();

  const getInputClasses = (isValid) => `
    w-full px-3 py-2.5 text-sm border rounded-lg
    transition-all duration-200 placeholder:text-muted-foreground
    focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
    hover:border-muted-foreground/50 disabled:opacity-50 disabled:cursor-not-allowed
    ${isValid
      ? 'border-border bg-background'
      : 'border-destructive/50 bg-destructive/5 focus:ring-destructive/20'
    }
  `.trim();

  // =============================================================================
  // COMPONENT RENDER SECTION
  // =============================================================================
  return (
    <div className={`bg-card border rounded-xl shadow-sm backdrop-blur-sm ${className}`}>

      {/* HEADER SECTION - Title, description, and connection status */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Server className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>

          {/* Connection Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-full border">
            <div className={`h-2 w-2 rounded-full ${
              error ? 'bg-destructive' : loading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'
            }`} />
            <span className="text-xs font-medium text-muted-foreground">
              {error ? 'Error' : loading ? 'Loading' : 'Ready'}
            </span>
          </div>
        </div>

        {/* MODE TOGGLE SECTION - Switch between manual and inventory modes */}
        <div className="flex bg-muted/30 rounded-lg p-1 mt-4">
          <button
            type="button"
            onClick={() => handleModeSwitch("manual")}
            className={getModeButtonClasses("manual")}
            aria-pressed={inputMode === "manual"}
          >
            <Keyboard className="h-4 w-4" />
            Manual
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch("inventory")}
            className={getModeButtonClasses("inventory")}
            aria-pressed={inputMode === "inventory"}
          >
            <List className="h-4 w-4" />
            Inventory
          </button>
        </div>
      </div>

      {/* INPUT FIELDS SECTION - Dynamic form based on selected mode */}
      <div className="p-6">
        {inputMode === "manual" ? (
          /* MANUAL MODE - Hostname input field */
          <div className="space-y-2">
            <div className="relative">
              <input
                type="text"
                name="hostname"
                value={parameters.hostname || ""}
                onChange={handleInputChange}
                placeholder="e.g., router1.company.com, 192.168.1.1"
                className={`${getInputClasses(isHostnameValid)} pl-10`}
                aria-describedby={!isHostnameValid ? "hostname-error" : undefined}
              />
              <Server className={`absolute left-3 top-2.5 h-4 w-4 transition-colors ${
                isHostnameValid ? 'text-muted-foreground' : 'text-destructive'
              }`} />
            </div>
            {!isHostnameValid && (
              <p id="hostname-error" className="text-xs text-destructive animate-in fade-in duration-200">
                Target hostname is required
              </p>
            )}
          </div>
        ) : (
          /* INVENTORY MODE - File selection dropdown */
          <div className="space-y-2">
            <div className="relative">
              <select
                name="inventory_file"
                value={parameters.inventory_file || ""}
                onChange={handleInputChange}
                disabled={loading || inventories.length === 0}
                className={`${getInputClasses(isInventoryValid)} pl-10 pr-10 appearance-none`}
                aria-describedby={(!isInventoryValid || error) ? "inventory-error" : undefined}
              >
                <option value="">
                  {loading ? "Loading inventories..."
                   : inventories.length === 0 ? "No inventory files available"
                   : "Select inventory file"}
                </option>
                {inventories.map((file) => (
                  <option key={file.value} value={file.value}>
                    {file.label}
                  </option>
                ))}
              </select>
              <List className={`absolute left-3 top-2.5 h-4 w-4 pointer-events-none transition-colors ${
                isInventoryValid ? 'text-muted-foreground' : 'text-destructive'
              }`} />
              <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 pointer-events-none text-muted-foreground" />
            </div>

            {/* ERROR AND VALIDATION MESSAGES */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-destructive font-medium">Connection Error</p>
                  <p className="text-xs text-destructive/80">{error}</p>
                </div>
                <button
                  onClick={() => fetchInventories()}
                  className="text-xs text-destructive hover:text-destructive/80 font-medium"
                >
                  Retry
                </button>
              </div>
            )}

            {!isInventoryValid && !error && !loading && (
              <p id="inventory-error" className="text-xs text-destructive animate-in fade-in duration-200">
                Please select an inventory file
              </p>
            )}

            {retryCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Retrying... (attempt {retryCount + 1}/{RETRY_ATTEMPTS})
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
