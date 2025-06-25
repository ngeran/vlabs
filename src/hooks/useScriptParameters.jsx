// src/hooks/useScriptParameters.js
import { useState, useEffect } from "react";

/**
 * @description Custom hook for managing script parameters (currentArgs)
 * It initializes and updates parameters based on the selected script configuration
 * and inventory selection mode.
 * @param {object} selectedScriptConfig - The configuration object of the currently selected script.
 * @param {Array<string>} availableInventories - List of available inventory files.
 * @param {string} inventorySelectionMode - 'file' or 'manual' mode for inventory selection.
 * @returns {{currentArgs: object, handleArgChange: (argName: string, value: any) => void, setCurrentArgs: React.Dispatch<React.SetStateAction<object>>}}
 */
export function useScriptParameters(
  selectedScriptConfig,
  availableInventories,
  inventorySelectionMode,
) {
  const [currentArgs, setCurrentArgs] = useState({});

  // Effect to initialize/reset currentArgs when selected script, available inventories,
  // or inventory selection mode changes.
  useEffect(() => {
    if (selectedScriptConfig) {
      const newArgs = {};
      selectedScriptConfig.parameters.forEach((param) => {
        newArgs[param.name] = param.defaultValue || "";
      });

      // Special handling for 'get_device_facts' to set default inventory_file
      // or clear hosts based on the current inventory selection mode.
      if (selectedScriptConfig.id === "get_device_facts") {
        if (
          availableInventories.length > 0 &&
          inventorySelectionMode === "file"
        ) {
          newArgs.inventory_file = availableInventories[0];
        } else {
          newArgs.inventory_file = ""; // Clear if switching to manual or no inventories
        }
        newArgs.hosts = ""; // Ensure hosts is cleared/initialized
      }

      setCurrentArgs(newArgs);
    }
  }, [selectedScriptConfig, availableInventories, inventorySelectionMode]);

  /**
   * @description Handles changes to individual script arguments.
   * @param {string} argName - The name of the argument to update.
   * @param {any} value - The new value for the argument.
   */
  const handleArgChange = (argName, value) => {
    setCurrentArgs((prevArgs) => ({
      ...prevArgs,
      [argName]: value,
    }));
  };

  return { currentArgs, handleArgChange, setCurrentArgs };
}
