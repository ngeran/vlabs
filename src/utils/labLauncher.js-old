// utils/labLauncher.js

class LabLauncher {
  constructor() {
    this.isElectron = this.checkElectronEnvironment();
    this.apiEndpoint = process.env.REACT_APP_LAB_API_ENDPOINT || 'http://localhost:3001/api';
  }

  checkElectronEnvironment() {
    return window && window.process && window.process.type;
  }

  async launchLab(lab) {
    try {
      const labPath = `labs/${lab.category}/${lab.slug}`;

      // Check if docker-compose.yml exists
      const hasDockerCompose = await this.checkFileExists(`${labPath}/docker-compose.yml`);

      if (hasDockerCompose) {
        return await this.launchDockerCompose(labPath, lab);
      } else {
        // Look for Python launch script
        const hasPythonScript = await this.checkFileExists(`${labPath}/scripts/launch.py`);
        if (hasPythonScript) {
          return await this.launchPythonScript(`${labPath}/scripts/launch.py`, lab);
        } else {
          throw new Error('No launch method found for this lab');
        }
      }
    } catch (error) {
      console.error('Lab launch failed:', error);
      throw error;
    }
  }

  async checkFileExists(filePath) {
    try {
      const response = await fetch(`/${filePath}`, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  async launchDockerCompose(labPath, lab) {
    const launchData = {
      type: 'docker-compose',
      labPath,
      lab,
      timestamp: new Date().toISOString()
    };

    if (this.isElectron) {
      // In Electron environment, execute directly
      return await this.executeElectronCommand('docker-compose', [
        '-f', `${labPath}/docker-compose.yml`,
        'up', '-d'
      ], labPath);
    } else {
      // In web environment, call backend API
      return await this.callLabAPI('/launch', launchData);
    }
  }

  async launchPythonScript(scriptPath, lab) {
    const launchData = {
      type: 'python-script',
      scriptPath,
      lab,
      timestamp: new Date().toISOString()
    };

    if (this.isElectron) {
      // In Electron environment, execute directly
      return await this.executeElectronCommand('python', [scriptPath], path.dirname(scriptPath));
    } else {
      // In web environment, call backend API
      return await this.callLabAPI('/launch', launchData);
    }
  }

  async executeElectronCommand(command, args, cwd) {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    return new Promise((resolve, reject) => {
      window.electronAPI.executeCommand({
        command,
        args,
        cwd
      }).then(result => {
        if (result.success) {
          resolve({
            success: true,
            message: 'Lab launched successfully',
            output: result.output,
            pid: result.pid
          });
        } else {
          reject(new Error(result.error));
        }
      }).catch(reject);
    });
  }

  async callLabAPI(endpoint, data) {
    try {
      const response = await fetch(`${this.apiEndpoint}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`API call failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('API call error:', error);
      throw error;
    }
  }

  async stopLab(lab) {
    const labPath = `labs/${lab.category}/${lab.slug}`;

    try {
      const hasDockerCompose = await this.checkFileExists(`${labPath}/docker-compose.yml`);

      if (hasDockerCompose) {
        return await this.stopDockerCompose(labPath, lab);
      } else {
        // For Python scripts, we might need to track PIDs or use other methods
        return await this.stopPythonLab(lab);
      }
    } catch (error) {
      console.error('Lab stop failed:', error);
      throw error;
    }
  }

  async stopDockerCompose(labPath, lab) {
    const stopData = {
      type: 'docker-compose-stop',
      labPath,
      lab,
      timestamp: new Date().toISOString()
    };

    if (this.isElectron) {
      return await this.executeElectronCommand('docker-compose', [
        '-f', `${labPath}/docker-compose.yml`,
        'down'
      ], labPath);
    } else {
      return await this.callLabAPI('/stop', stopData);
    }
  }

  async stopPythonLab(lab) {
    const stopData = {
      type: 'python-stop',
      lab,
      timestamp: new Date().toISOString()
    };

    return await this.callLabAPI('/stop', stopData);
  }

  async getLabStatus(lab) {
    try {
      const response = await this.callLabAPI('/status', { lab });
      return response;
    } catch (error) {
      console.error('Failed to get lab status:', error);
      return { status: 'unknown', error: error.message };
    }
  }

  // Utility method to show launch notifications
  showLaunchNotification(lab, success, message) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`Lab ${success ? 'Launched' : 'Failed'}`, {
        body: `${lab.title}: ${message}`,
        icon: '/favicon.ico'
      });
    }
  }

  // Request notification permission
  async requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }
}

export default new LabLauncher();
