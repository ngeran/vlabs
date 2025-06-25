// src/hooks/useScriptExecution.jsx
import { useState } from "react";

/**
 * @description Custom hook for handling the execution of Python scripts via a backend API.
 * It manages loading states, script output, and execution-specific errors.
 * @returns {{
 * output: string,
 * executionError: string,
 * isLoading: boolean,
 * runScript: (scriptId: string, parameters: object) => Promise<void>,
 * clearOutput: () => void,
 * clearError: () => void
 * }}
 */
export function useScriptExecution() {
  const [output, setOutput] = useState("");
  const [executionError, setExecutionError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  /**
   * @description Initiates the script execution by making a POST request to the backend.
   * @param {string} scriptId - The ID of the script to run.
   * @param {object} parameters - The parameters to send to the script.
   * @returns {Promise<void>}
   */
  const runScript = async (scriptId, parameters) => {
    setOutput("");
    setExecutionError("");
    setIsLoading(true);

    try {
      const response = await fetch("http://localhost:3001/api/scripts/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scriptId, parameters }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Failed to run script on backend.",
        );
      }

      const data = await response.json();
      if (data.success) {
        setOutput(data.output);
        setExecutionError(data.error); // For any script-specific non-fatal errors
      } else {
        setExecutionError(data.message || "Script execution failed.");
        setOutput(data.output); // Still show output even if execution failed with a message
      }
    } catch (err) {
      console.error("Error calling backend:", err);
      setExecutionError(`Network or backend error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * @description Clears the current script output.
   */
  const clearOutput = () => setOutput("");

  /**
   * @description Clears the current execution error.
   */
  const clearError = () => setExecutionError("");

  return {
    output,
    executionError,
    isLoading,
    runScript,
    clearOutput,
    clearError,
  };
}
