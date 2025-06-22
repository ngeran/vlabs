// src/utils/labLauncher.js

const API_BASE_URL = "http://localhost:3001"; // Or 3333 if you changed it

// --- Lab Status Management (In-Memory Store) ---
const labStatusStore = {};
const eventListeners = {};
const pollingIntervals = {}; // To store polling timers for each lab

/**
 * Stores and updates the status of a specific lab in the client-side store.
 * Also emits a status change event for subscribed components.
 * @param {string} labPath - The unique identifier for the lab (e.g., "/labs/routing/ospf-single-area").
 * @param {object} statusData - An object containing the current status (e.g., { status: 'running', accessUrl: '...', ports: [...] }).
 */
const setLabStatus = (labPath, statusData) => {
  labStatusStore[labPath] = {
    ...labStatusStore[labPath],
    ...statusData,
    id: labPath, // Ensure ID is part of statusData
  };
  console.log(
    `[labLauncher] Status updated for ${labPath}:`,
    labStatusStore[labPath],
  );

  // Emit event for this specific labPath listener
  if (eventListeners[labPath]) {
    eventListeners[labPath].forEach((callback) =>
      callback(labStatusStore[labPath]),
    );
  }

  // NEW: Also emit event for the global listener (labPath = null)
  // This is what `App.jsx` likely uses for `handleGlobalStatusChange`
  if (eventListeners[null]) {
    eventListeners[null].forEach(
      (callback) => callback(labStatusStore[labPath]), // Pass the updated lab's status object
    );
  }
};

/**
 * Retrieves the current status of a specific lab from the client-side store.
 * @param {string} labPath - The unique identifier for the lab.
 * @returns {object|null} The lab's status data, or null if not found.
 */
export const getLabStatus = (labPath) => {
  return labStatusStore[labPath] || null;
};

/**
 * Subscribes a callback function to status changes for a specific lab.
 * The `labPath` can also be `null` to register a global listener.
 * @param {string|null} labPath - The unique identifier for the lab, or null for a global listener.
 * @param {function} callback - The function to call when the lab's status changes.
 */
export const onLabStatusChange = (labPath, callback) => {
  if (!eventListeners[labPath]) {
    eventListeners[labPath] = [];
  }
  eventListeners[labPath].push(callback);
  console.log(
    `[labLauncher] Added listener for ${
      labPath === null ? "global" : labPath
    }. Total: ${eventListeners[labPath].length}`,
  );
};

/**
 * Unsubscribes a callback function from status changes for a specific lab.
 * @param {string|null} labPath - The unique identifier for the lab.
 * @param {function} callback - The function to remove.
 */
export const offLabStatusChange = (labPath, callback) => {
  if (eventListeners[labPath]) {
    eventListeners[labPath] = eventListeners[labPath].filter(
      (cb) => cb !== callback,
    );
    console.log(
      `[labLauncher] Removed listener for ${
        labPath === null ? "global" : labPath
      }. Total: ${eventListeners[labPath].length}`,
    );
  }
};
// --- END Lab Status Management ---

/**
 * Function to start polling for a lab's status.
 * @param {string} labPath - The unique identifier for the lab.
 */
const startPollingLabStatus = (labPath) => {
  if (pollingIntervals[labPath]) {
    clearInterval(pollingIntervals[labPath]); // Clear existing one if any
  }

  const poll = async () => {
    const statusResult = await checkLabStatus(labPath);
    console.log(
      `[labLauncher] Polling status for ${labPath}:`,
      statusResult.status,
    );

    // Stop polling if lab is running, stopped, or failed
    // The backend now correctly returns 'stopped' even if it wasn't explicitly stopped,
    // if no containers are found for that project.
    if (["running", "stopped", "failed"].includes(statusResult.status)) {
      clearInterval(pollingIntervals[labPath]);
      delete pollingIntervals[labPath];
      console.log(
        `[labLauncher] Stopped polling for ${labPath}. Final status: ${statusResult.status}`,
      );
    }
  };

  // Poll immediately and then every 3 seconds
  poll();
  pollingIntervals[labPath] = setInterval(poll, 3000); // Poll every 3 seconds
  console.log(`[labLauncher] Started polling for ${labPath}`);
};

/**
 * Function to stop polling for a lab's status.
 * @param {string} labPath - The unique identifier for the lab.
 */
const stopPollingLabStatus = (labPath) => {
  if (pollingIntervals[labPath]) {
    clearInterval(pollingIntervals[labPath]);
    delete pollingIntervals[labPath];
    console.log(`[labLauncher] Manually stopped polling for ${labPath}`);
  }
};

/**
 * Sends a request to the backend to launch a Docker Compose lab.
 * Updates the client-side store and emits status changes.
 * @param {string} labPath - The path to the lab directory relative to /public (e.g., "/labs/routing/ospf-single-area").
 * @param {object} config - Optional configuration for the lab (e.g., specific settings).
 * @param {object} options - Optional launch options (e.g., specific flags for docker-compose).
 * @returns {object} - An object indicating success/failure and a message, plus any data from the backend.
 */
export const launchLab = async (labPath, config = {}, options = {}) => {
  setLabStatus(labPath, {
    status: "launching",
    message: "Sending launch request...",
  });
  try {
    const response = await fetch(`${API_BASE_URL}/api/labs/launch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ labPath, config, options }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.message || "Failed to launch lab";
      setLabStatus(labPath, {
        status: "failed",
        error: errorMessage,
        message: `Launch Failed: ${errorMessage}`,
      });
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log(
      "[Frontend] Lab launch request initiated successfully:",
      data.message,
    );

    setLabStatus(labPath, {
      message: data.message,
    });

    // --- NEW: Start polling for the lab's actual status ---
    startPollingLabStatus(labPath);

    return {
      success: true,
      message: data.message,
      labPath: labPath, // Return labPath for clarity
    };
  } catch (error) {
    console.error("[Frontend] Error initiating lab launch:", error.message);
    setLabStatus(labPath, {
      status: "failed",
      error: error.message,
      message: `Launch Failed: ${error.message}`,
    });
    return { success: false, message: `Launch Failed: ${error.message}` };
  }
};

/**
 * Sends a request to the backend to stop a Docker Compose lab.
 * Updates the client-side store and emits status changes.
 * @param {string} labPath - The path to the lab directory relative to /public (e.g., "/labs/routing/ospf-single-area").
 * @returns {object} - An object indicating success/failure and a message.
 */
export const stopLab = async (labPath) => {
  console.log(`[labLauncher] --- Initiating stopLab for ${labPath} ---`); // NEW LOG
  setLabStatus(labPath, {
    status: "stopping",
    message: "Sending stop request...",
  });
  // Stop any active polling for this lab as we are manually stopping it.
  stopPollingLabStatus(labPath);

  try {
    const response = await fetch(`${API_BASE_URL}/api/labs/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ labPath }),
    });

    console.log(
      `[labLauncher] Stop request for ${labPath} responded. Status: ${response.status}, OK: ${response.ok}`,
    ); // NEW LOG

    if (!response.ok) {
      const errorData = await response.json();
      console.error(
        "[labLauncher] Stop failed - Backend responded with error:",
        errorData,
      ); // NEW LOG
      const errorMessage = errorData.message || "Failed to stop lab";
      setLabStatus(labPath, {
        status: "failed",
        error: errorMessage,
        message: `Stop Failed: ${errorMessage}`,
      });
      return { success: false, message: `Stop Failed: ${errorMessage}` };
    }

    const data = await response.json();
    console.log(
      "[labLauncher] Lab stop request successful! Backend Data:",
      data,
    ); // NEW LOG
    setLabStatus(labPath, { status: data.status, message: data.message }); // This should set status to "stopped"
    console.log(
      `[labLauncher] Final status set to "${data.status}" for ${labPath}`,
    ); // NEW LOG
    return { success: true, message: data.message };
  } catch (error) {
    console.error(
      "[labLauncher] Error in stopLab fetch:",
      error.message,
      error,
    ); // NEW LOG
    setLabStatus(labPath, {
      status: "failed",
      error: error.message,
      message: `Stop Failed: ${error.message}`,
    });
    return { success: false, message: `Failed to stop lab: ${error.message}` };
  }
};

/**
 * UPDATED: Sends a request to the backend to check the status of a lab by its path.
 * This is primarily for polling and initial status check on page load.
 * @param {string} labPath - The unique identifier for the lab (e.g., "/labs/routing/ospf-single-area").
 * @returns {object} - An object indicating success/failure and status data.
 */
export const checkLabStatus = async (labPath) => {
  try {
    // IMPORTANT: Changed endpoint and parameter to labPath
    const response = await fetch(
      `${API_BASE_URL}/api/labs/status-by-path?labPath=${encodeURIComponent(labPath)}`,
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to check lab status");
    }

    const data = await response.json();
    // Removed extensive logging here to keep console cleaner during polling,
    // but the setLabStatus will log the update.
    // console.log("[Frontend] Lab status check successful for", labPath, ":", data);

    // Update the client-side store with the fetched status.
    setLabStatus(labPath, {
      status: data.status, // Use the actual status returned from backend
      message: data.message,
      accessUrl: data.accessUrl, // If backend returns this
      ports: data.ports, // If backend returns this
    });

    return { success: true, ...data };
  } catch (error) {
    console.error("[Frontend] Error checking lab status:", error.message);
    // If status check fails, set lab status to failed
    setLabStatus(labPath, {
      status: "failed",
      error: error.message,
      message: `Status check failed: ${error.message}`,
    });
    return { success: false, message: `Status check failed: ${error.message}` };
  }
};
