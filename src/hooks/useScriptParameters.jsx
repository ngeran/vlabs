import { useState, useEffect } from "react";

/**
 * Enhanced hook for managing script parameters with test discovery support.
 * This manages both static parameters (e.g., hostname) and dynamic parameters (checkboxes for discovered tests)
 * for scripts such as JSNAPy that support environment-aware, dynamic test selection.
 *
 * Enhanced by: nikos-geranios_vgi at 2025-06-27 13:07:59
 */
export function useScriptParameters(
  selectedScriptConfig,        // The config object for the currently selected script (from backend)
  availableInventories,        // Array of available inventory files (for inventory selection)
  inventorySelectionMode,      // How inventories are selected (e.g., 'file' or 'manual')
) {
  // --- State for current argument values for the script form ---
  const [currentArgs, setCurrentArgs] = useState({});
  // --- NEW: State for dynamic JSNAPy test options and selected environment ---
  const [dynamicTestOptions, setDynamicTestOptions] = useState([]);      // Array of test objects {id, ...}
  const [selectedEnvironment, setSelectedEnvironment] = useState('development'); // Current environment

  /**
   * Effect to initialize/reset currentArgs when:
   * - The script changes (new script selected)
   * - Available inventories change (for get_device_facts)
   * - Inventory selection mode changes
   * - The set of dynamically discovered test options changes (JSNAPy)
   * - The environment changes (for JSNAPy)
   */
  useEffect(() => {
    if (selectedScriptConfig) {
      const newArgs = {};
      // Set default values for each parameter from script config
      selectedScriptConfig.parameters.forEach((param) => {
        newArgs[param.name] = param.defaultValue || "";
      });

      // Special initialization for get_device_facts script (inventory selection)
      if (selectedScriptConfig.id === "get_device_facts") {
        if (
          availableInventories.length > 0 &&
          inventorySelectionMode === "file"
        ) {
          newArgs.inventory_file = availableInventories[0]; // Pick first as default
        } else {
          newArgs.inventory_file = "";
        }
        newArgs.hosts = ""; // Default to empty hosts field
      }

      // --- NEW: Special logic for JSNAPy script (test selection) ---
      if (selectedScriptConfig.id === "run_jsnapy_tests") {
        // Set the environment parameter
        newArgs.environment = selectedEnvironment;
        
        // For each dynamically discovered test, set initial selection to false (unchecked)
        if (dynamicTestOptions.length > 0) {
          dynamicTestOptions.forEach(test => {
            newArgs[test.id] = false;
          });
        }
      }

      setCurrentArgs(newArgs); // Update state
    }
  }, [
    selectedScriptConfig, 
    availableInventories, 
    inventorySelectionMode, 
    dynamicTestOptions, 
    selectedEnvironment
  ]);

  /**
   * Generic argument change handler for form fields.
   * @param {string} argName - Name of the argument/parameter to change.
   * @param {any} value - New value for the argument.
   */
  const handleArgChange = (argName, value) => {
    setCurrentArgs((prevArgs) => ({
      ...prevArgs,
      [argName]: value,
    }));
  };

  /**
   * ✨ NEW: Handler for environment dropdown change (JSNAPy).
   * Updates both internal env state and the 'environment' parameter in currentArgs.
   * @param {string} environment - New environment value
   */
  const handleEnvironmentChange = (environment) => {
    setSelectedEnvironment(environment);
    setCurrentArgs(prevArgs => ({
      ...prevArgs,
      environment: environment
    }));
  };

  /**
   * ✨ NEW: Set the dynamically discovered test options.
   * (Called after fetching test list from backend)
   * @param {Array} testOptions - Array of test objects ({id, ...})
   */
  const setTestOptions = (testOptions) => {
    setDynamicTestOptions(testOptions);
    
    // Initialize test selection (all unchecked) in currentArgs
    const newTestArgs = {};
    testOptions.forEach(test => {
      newTestArgs[test.id] = false;
    });
    
    setCurrentArgs(prevArgs => ({
      ...prevArgs,
      ...newTestArgs
    }));
  };

  /**
   * ✨ NEW: Utility to get the list of tests currently selected (checked) by the user.
   * @returns {Array} Array of selected test IDs
   */
  const getSelectedTests = () => {
    return dynamicTestOptions
      .filter(test => currentArgs[test.id])
      .map(test => test.id);
  };

  /**
   * ✨ NEW: Reset function to clear all parameter values and test selections.
   * Useful for "Reset" buttons or when changing scripts.
   */
  const resetArgs = () => {
    if (selectedScriptConfig) {
      const newArgs = {};
      selectedScriptConfig.parameters.forEach((param) => {
        newArgs[param.name] = param.defaultValue || "";
      });
      
      // Reset test selections to unchecked for all discovered tests
      dynamicTestOptions.forEach(test => {
        newArgs[test.id] = false;
      });
      
      setCurrentArgs(newArgs);
    }
  };

  // --- Return state and handlers for use in form components ---
  return { 
    currentArgs,                  // The current parameters/checkbox state for the script
    handleArgChange,              // Handler for generic argument changes (input fields/checkboxes)
    setCurrentArgs,               // Setter for currentArgs (if you need to set all at once)
    // --- NEW: Test discovery-related exports ---
    dynamicTestOptions,           // Array of current dynamic test options (from discovery)
    selectedEnvironment,          // The currently selected environment
    handleEnvironmentChange,      // Handler for environment dropdown
    setTestOptions,               // Setter for dynamic test options (after fetching)
    getSelectedTests,             // Utility to get array of selected test IDs
    resetArgs                     // Function to reset all arguments to initial values
  };
}