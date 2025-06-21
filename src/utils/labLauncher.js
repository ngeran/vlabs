// utils/labLauncher.js
class LabLauncher {
  constructor() {
    this.activeLabs = new Map();
    this.eventListeners = new Map();
  }

  // Register event listeners for lab status updates
  addEventListener(labId, eventType, callback) {
    if (!this.eventListeners.has(labId)) {
      this.eventListeners.set(labId, new Map());
    }

    if (!this.eventListeners.get(labId).has(eventType)) {
      this.eventListeners.get(labId).set(eventType, []);
    }

    this.eventListeners.get(labId).get(eventType).push(callback);
  }

  // Remove event listeners
  removeEventListener(labId, eventType, callback) {
    if (
      this.eventListeners.has(labId) &&
      this.eventListeners.get(labId).has(eventType)
    ) {
      const callbacks = this.eventListeners.get(labId).get(eventType);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  // Emit events to registered listeners
  emit(labId, eventType, data) {
    if (
      this.eventListeners.has(labId) &&
      this.eventListeners.get(labId).has(eventType)
    ) {
      this.eventListeners
        .get(labId)
        .get(eventType)
        .forEach((callback) => {
          callback(data);
        });
    }
  }

  // Launch a lab with Docker Compose
  async launchLab(lab, options = {}) {
    const labId = `${lab.category}-${lab.slug}`;

    try {
      // Check if lab is already running
      if (this.activeLabs.has(labId)) {
        throw new Error("Lab is already running");
      }

      // Set initial status
      this.activeLabs.set(labId, {
        status: "launching",
        startTime: Date.now(),
        lab: lab,
      });

      this.emit(labId, "statusChange", {
        status: "launching",
        message: "Preparing lab environment...",
      });

      // Validate lab configuration
      const config = await this.validateLabConfig(lab);

      // Launch Docker Compose
      const launchResult = await this.executeDockerCompose(
        lab,
        config,
        options,
      );

      // Update status to running
      this.activeLabs.set(labId, {
        ...this.activeLabs.get(labId),
        status: "running",
        containerId: launchResult.containerId,
        ports: launchResult.ports,
        accessUrl: launchResult.accessUrl,
      });

      this.emit(labId, "statusChange", {
        status: "running",
        message: "Lab environment is ready!",
        accessUrl: launchResult.accessUrl,
        ports: launchResult.ports,
      });

      // Start monitoring the lab
      this.startMonitoring(labId);

      return {
        success: true,
        labId: labId,
        accessUrl: launchResult.accessUrl,
        ports: launchResult.ports,
      };
    } catch (error) {
      // Update status to failed
      this.activeLabs.set(labId, {
        ...this.activeLabs.get(labId),
        status: "failed",
        error: error.message,
      });

      this.emit(labId, "statusChange", {
        status: "failed",
        message: `Launch failed: ${error.message}`,
        error: error.message,
      });

      throw error;
    }
  }

  // Validate lab configuration
  async validateLabConfig(lab) {
    try {
      // Check for required files
      const requiredFiles = [`docker-compose.yml`, `lab-config.json`];

      const labPath = `/labs/${lab.category}/${lab.slug}`;

      for (const file of requiredFiles) {
        try {
          const response = await fetch(`${labPath}/${file}`);
          if (!response.ok) {
            throw new Error(`Missing required file: ${file}`);
          }
        } catch (error) {
          throw new Error(`Cannot access ${file}: ${error.message}`);
        }
      }

      // Load and validate lab configuration
      const configResponse = await fetch(`${labPath}/lab-config.json`);
      const config = await configResponse.json();

      // Validate configuration structure
      if (!config.name || !config.services) {
        throw new Error("Invalid lab configuration: missing name or services");
      }

      return config;
    } catch (error) {
      throw new Error(`Configuration validation failed: ${error.message}`);
    }
  }

  // Execute Docker Compose
  async executeDockerCompose(lab, config, options) {
    const labPath = `/labs/${lab.category}/${lab.slug}`;

    try {
      // In a real implementation, this would make an API call to your backend
      // For now, we'll simulate the Docker Compose execution

      const response = await fetch("/api/labs/launch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          labPath: labPath,
          config: config,
          options: options,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to launch lab");
      }

      const result = await response.json();

      return {
        containerId: result.containerId,
        ports: result.ports,
        accessUrl: result.accessUrl,
      };
    } catch (error) {
      throw new Error(`Docker Compose execution failed: ${error.message}`);
    }
  }

  // Start monitoring lab status
  startMonitoring(labId) {
    const monitoringInterval = setInterval(async () => {
      try {
        const labInfo = this.activeLabs.get(labId);
        if (!labInfo || labInfo.status !== "running") {
          clearInterval(monitoringInterval);
          return;
        }

        // Check container status
        const status = await this.checkContainerStatus(labInfo.containerId);

        if (status.isComplete) {
          // Lab has completed
          this.activeLabs.set(labId, {
            ...labInfo,
            status: "completed",
            completedAt: Date.now(),
          });

          this.emit(labId, "statusChange", {
            status: "completed",
            message: "Lab completed successfully!",
            completionData: status.completionData,
          });

          clearInterval(monitoringInterval);
        } else if (status.hasFailed) {
          // Lab has failed
          this.activeLabs.set(labId, {
            ...labInfo,
            status: "failed",
            error: status.error,
          });

          this.emit(labId, "statusChange", {
            status: "failed",
            message: `Lab failed: ${status.error}`,
            error: status.error,
          });

          clearInterval(monitoringInterval);
        }
      } catch (error) {
        console.error("Monitoring error:", error);
      }
    }, 5000); // Check every 5 seconds

    // Store interval reference for cleanup
    const labInfo = this.activeLabs.get(labId);
    this.activeLabs.set(labId, {
      ...labInfo,
      monitoringInterval: monitoringInterval,
    });
  }

  // Check container status
  async checkContainerStatus(containerId) {
    try {
      const response = await fetch(`/api/labs/status/${containerId}`);
      const data = await response.json();

      return {
        isRunning: data.isRunning,
        isComplete: data.isComplete,
        hasFailed: data.hasFailed,
        error: data.error,
        completionData: data.completionData,
      };
    } catch (error) {
      return {
        isRunning: false,
        isComplete: false,
        hasFailed: true,
        error: error.message,
      };
    }
  }

  // Stop a running lab
  async stopLab(labId) {
    try {
      const labInfo = this.activeLabs.get(labId);
      if (!labInfo) {
        throw new Error("Lab not found");
      }

      // Clear monitoring interval
      if (labInfo.monitoringInterval) {
        clearInterval(labInfo.monitoringInterval);
      }

      // Stop the container
      if (labInfo.containerId) {
        await fetch(`/api/labs/stop/${labInfo.containerId}`, {
          method: "POST",
        });
      }

      // Update status
      this.activeLabs.set(labId, {
        ...labInfo,
        status: "stopped",
        stoppedAt: Date.now(),
      });

      this.emit(labId, "statusChange", {
        status: "stopped",
        message: "Lab stopped successfully",
      });

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to stop lab: ${error.message}`);
    }
  }

  // Get lab status
  getLabStatus(labId) {
    return this.activeLabs.get(labId) || null;
  }

  // Get all active labs
  getActiveLabs() {
    return Array.from(this.activeLabs.entries()).map(([id, info]) => ({
      id,
      ...info,
    }));
  }

  // Clean up completed/failed labs
  cleanup() {
    for (const [labId, labInfo] of this.activeLabs.entries()) {
      if (labInfo.status === "completed" || labInfo.status === "failed") {
        if (labInfo.monitoringInterval) {
          clearInterval(labInfo.monitoringInterval);
        }
        this.activeLabs.delete(labId);
        this.eventListeners.delete(labId);
      }
    }
  }
}

// Create singleton instance
const labLauncher = new LabLauncher();

export default labLauncher;
