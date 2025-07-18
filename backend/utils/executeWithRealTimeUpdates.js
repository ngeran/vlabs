const { spawn } = require('child_process');

/**
 * Executes a command with real-time updates via WebSocket
 * Uses sensible defaults for most common use cases
 */
function executeWithRealTimeUpdates(command, args, clientWs) {
  if (!clientWs || clientWs.readyState !== 1) {
    return;
  }

  const child = spawn(command, args);
  let stderrBuffer = "";
  let stdoutBuffer = "";

  // Handle stderr (progress updates)
  child.stderr.on("data", (data) => {
    stderrBuffer += data.toString();
    const lines = stderrBuffer.split('\n');
    stderrBuffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim().startsWith("JSON_PROGRESS:")) {
        try {
          const progressData = JSON.parse(line.substring(14).trim());
          if (clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({ type: 'progress', ...progressData }));
          }
        } catch (e) {
          console.error("[BACKEND] Failed to parse progress JSON:", line);
        }
      }
    }
  });

  // Handle stdout
  child.stdout.on("data", (data) => {
    stdoutBuffer += data.toString();
  });

  // Handle process completion
  child.on("close", (code) => {
    if (code !== 0) {
      return clientWs.readyState === 1 ?
        clientWs.send(JSON.stringify({ type: 'error', message: `Script exited with error code ${code}` })) : null;
    }

    try {
      const jsonMatch = stdoutBuffer.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        if (clientWs.readyState === 1) {
          clientWs.send(JSON.stringify({ type: 'result', data: JSON.parse(jsonMatch[0]) }));
        }
      } else {
        throw new Error("No JSON result found");
      }
    } catch (e) {
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({ type: 'error', message: "Failed to parse final script output", error: e.message }));
      }
    }
  });

  // Handle spawn errors
  child.on("error", (error) => {
    if (clientWs.readyState === 1) {
      clientWs.send(JSON.stringify({ type: 'error', message: `Failed to start process: ${error.message}` }));
    }
  });
}

module.exports = { executeWithRealTimeUpdates };
