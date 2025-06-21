// src/utils/labLauncher.js

const API_BASE_URL = "http://localhost:3001"; // Or 3333 if you changed it

// --- Lab Status Management (In-Memory Store) ---
// This object will store the status of each launched lab, keyed by labPath (or lab slug/id).
// Example structure: { "/labs/routing/ospf-single-area": { status: "running", accessUrl: "...", ports: [...] } }
const labStatusStore = {};

// --- Simple Event Emitter for Lab Status Changes ---
// This will allow components to subscribe to status updates.
// eventListeners structure: { "labPath": [callback1, callback2], "labPath2": [...] }
const eventListeners = {};

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
    id: labPath,
  }; // Ensure ID is part of statusData
  console.log(
    `[labLauncher] Status updated for ${labPath}:`,
    labStatusStore[labPath],
  );
  // Emit event for this specific labPath
  if (eventListeners[labPath]) {
    eventListeners[labPath].forEach((callback) =>
      callback(labStatusStore[labPath]),
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
 * @param {string} labPath - The unique identifier for the lab.
 * @param {function} callback - The function to call when the lab's status changes.
 */
export const onLabStatusChange = (labPath, callback) => {
  if (!eventListeners[labPath]) {
    eventListeners[labPath] = [];
  }
  eventListeners[labPath].push(callback);
  console.log(
    `[labLauncher] Added listener for ${labPath}. Total: ${eventListeners[labPath].length}`,
  );
};

/**
 * Unsubscribes a callback function from status changes for a specific lab.
 * @param {string} labPath - The unique identifier for the lab.
 * @param {function} callback - The function to remove.
 */
export const offLabStatusChange = (labPath, callback) => {
  if (eventListeners[labPath]) {
    eventListeners[labPath] = eventListeners[labPath].filter(
      (cb) => cb !== callback,
    );
    console.log(
      `[labLauncher] Removed listener for ${labPath}. Total: ${eventListeners[labPath].length}`,
    );
  }
};
// --- END Lab Status Management ---

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
    console.log("[Frontend] Lab launch request successful:", data.message);

    // Update status based on backend response (even if simulated initially)
    setLabStatus(labPath, {
      status: "running", // Assuming successful launch implies running, or parse a specific status from 'data'
      message: data.message,
      containerId: data.containerId, // Still a placeholder from backend
      ports: data.ports, // Still a placeholder from backend
      accessUrl: data.accessUrl, // Still a placeholder from backend
    });

    return {
      success: true,
      message: data.message,
      containerId: data.containerId,
      ports: data.ports,
      accessUrl: data.accessUrl,
    };
  } catch (error) {
    console.error("[Frontend] Error launching lab:", error.message);
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
  setLabStatus(labPath, {
    status: "stopping",
    message: "Sending stop request...",
  });
  try {
    const response = await fetch(`${API_BASE_URL}/api/labs/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ labPath }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.message || "Failed to stop lab";
      setLabStatus(labPath, {
        status: "failed",
        error: errorMessage,
        message: `Stop Failed: ${errorMessage}`,
      });
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log("[Frontend] Lab stop request successful:", data.message);
    setLabStatus(labPath, { status: "stopped", message: data.message });
    return { success: true, message: data.message };
  } catch (error) {
    console.error("[Frontend] Error stopping lab:", error.message);
    setLabStatus(labPath, {
      status: "failed",
      error: error.message,
      message: `Stop Failed: ${error.message}`,
    });
    return { success: false, message: `Failed to stop lab: ${error.message}` };
  }
};

/**
 * Sends a request to the backend to check the status of a lab.
 * This is primarily for initial status check on page load or modal open.
 * Note: Your backend endpoint for this currently returns simulated data.
 * @param {string} containerId - The ID of the container to check status for (currently a placeholder in backend).
 * @returns {object} - An object indicating success/failure and status data.
 */
export const checkLabStatus = async (containerId) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/labs/status/${containerId}`,
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to check lab status");
    }

    const data = await response.json();
    console.log("[Frontend] Lab status check successful:", data);

    // Update the client-side store with the fetched status.
    // NOTE: This assumes `containerId` is how you uniquely identify the lab for client-side status.
    // If you prefer to use `labPath`, you'd need to modify the backend's `/status` endpoint to accept `labPath`
    // and your frontend to send `labPath` instead of `containerId` here.
    setLabStatus(containerId, {
      status: data.isRunning
        ? "running"
        : data.hasFailed
          ? "failed"
          : data.isComplete
            ? "completed"
            : "unknown",
      message: data.message,
      accessUrl: data.accessUrl, // If backend returns this
      ports: data.ports, // If backend returns this
    });

    return { success: true, ...data };
  } catch (error) {
    console.error("[Frontend] Error checking lab status:", error.message);
    setLabStatus(containerId, {
      status: "failed",
      error: error.message,
      message: `Status check failed: ${error.message}`,
    });
    return { success: false, message: `Status check failed: ${error.message}` };
  }
};
