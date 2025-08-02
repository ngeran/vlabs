// =================================================================================================
//
// FILE:               backend/utils/executeWithRealTimeUpdates.js (Hybrid Version)
//
// OVERVIEW:
//   This module provides a robust, self-contained utility function for executing a
//   long-running command-line process. It has been upgraded to be "bilingual,"
//   meaning it can correctly handle scripts that output a real-time stream of
//   single-line JSON events AND scripts that output a single, multi-line JSON block at the end.
//
// KEY FEATURES:
//   - Hybrid Parsing: Attempts to parse stdout line-by-line for real-time events. If no
//     final result is found this way, it performs a fallback check, attempting to parse
//     the entire stdout buffer as a single JSON object. This provides maximum compatibility.
//   - Clean Stream Protocol: Still assumes `stdout` is for UI-facing JSON and `stderr` is for
//     developer-facing logs, preventing UI pollution.
//
// HOW-TO GUIDE:
//   This version requires no changes to the calling code or the Python scripts. It is a
//   drop-in replacement that is simply more resilient to different output formats.
//
// =================================================================================================

// =================================================================================================
// SECTION 1: IMPORTS
// =================================================================================================
const { spawn } = require('child_process');
const fs = require('fs');

// =================================================================================================
// SECTION 2: FUNCTION DEFINITION
// =================================================================================================

/**
 * Executes a command, intelligently processing its stdout to support both streaming
 * and block-based JSON output, with optional file cleanup.
 */
function executeWithRealTimeUpdates(command, args, clientWs, cleanupPath = null) {
  // -----------------------------------------------------------------------------------------------
  // Subsection 2.1: Initial Validation
  // -----------------------------------------------------------------------------------------------
  if (!clientWs || clientWs.readyState !== 1) {
    console.error("[BACKEND] WebSocket client not available for real-time updates.");
    if (cleanupPath) fs.unlink(cleanupPath, () => {});
    return;
  }

  // -----------------------------------------------------------------------------------------------
  // Subsection 2.2: Spawn Child Process & State Initialization
  // -----------------------------------------------------------------------------------------------
  const child = spawn(command, args);
  let stdoutBuffer = ""; // This will now accumulate the ENTIRE stdout.
  let finalResultFromStream = null; // Stores the result if found via line-by-line parsing.

  // -----------------------------------------------------------------------------------------------
  // Subsection 2.3: stdout Stream Processing Logic
  // -----------------------------------------------------------------------------------------------
  const processStdoutLines = (buffer) => {
    const lines = buffer.split('\n');
    const newBuffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim() === '') continue;
      try {
        const jsonData = JSON.parse(line.trim());
        if (jsonData.event_type) {
          if (clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({ type: 'progress', ...jsonData }));
          }
        } else {
          // This assumes a streaming script prints its final result on a single line.
          finalResultFromStream = jsonData;
        }
      } catch (e) {
        // This is now expected for multi-line JSON. We will log it but allow it to continue.
        console.warn("[BACKEND] Received non-JSON line on stdout (may be part of a larger JSON block):", line);
      }
    }
    return newBuffer;
  };

  // =================================================================================================
  // SECTION 3: CHILD PROCESS EVENT HANDLERS
  // =================================================================================================

  child.stdout.on('data', (data) => {
    const dataStr = data.toString();
    // Accumulate the entire output for our fallback parser.
    stdoutBuffer += dataStr;
    // Also, attempt to process line-by-line for streaming scripts.
    processStdoutLines(dataStr);
  });

  child.stderr.on('data', (data) => {
    console.error(`[SCRIPT-STDERR]: ${data.toString().trim()}`);
  });

  // -----------------------------------------------------------------------------------------------
  // Event: 'close' - The process has finished. THIS CONTAINS THE FIX.
  // -----------------------------------------------------------------------------------------------
  child.on('close', (code) => {
    let finalResult = null;

    // --- ### THE FIX IS HERE ### ---
    // This logic makes the utility "bilingual".

    // Priority 1: Check if the line-by-line streaming parser found a result.
    // This works for the File Uploader.
    if (finalResultFromStream) {
      finalResult = finalResultFromStream;
    }
    // Priority 2 (Fallback): If no streaming result was found, try to parse the
    // ENTIRE accumulated stdout buffer as a single JSON object.
    // This works for the JSNAPy runner.
    else if (stdoutBuffer.trim()) {
      try {
        finalResult = JSON.parse(stdoutBuffer.trim());
      } catch (e) {
        console.error("[BACKEND] CRITICAL: Script finished, but stdout could not be parsed as a single JSON block. Error:", e.message);
        finalResult = null; // Ensure it's null on failure.
      }
    }
    // --- ### END OF FIX ### ---

    if (clientWs.readyState !== 1) return;

    // Now, send the final messages based on what we found.
    if (code === 0 && finalResult) {
      clientWs.send(JSON.stringify({ type: 'result', data: finalResult }));
    } else {
      clientWs.send(JSON.stringify({ type: 'error', message: `Script exited with code ${code} or produced invalid/no JSON output.` }));
    }

    clientWs.send(JSON.stringify({ type: 'script_end', exitCode: code }));

    if (cleanupPath) {
      fs.unlink(cleanupPath, (err) => {
        if (err) console.error(`[BACKEND] Failed to delete temp file: ${cleanupPath}`, err);
        else console.log(`[BACKEND] Deleted temp file: ${cleanupPath}`);
      });
    }
  });

  child.on('error', (error) => {
    if (clientWs.readyState === 1) {
      clientWs.send(JSON.stringify({ type: 'error', message: `Failed to start process: ${error.message}` }));
    }
  });
}

// =================================================================================================
// SECTION 4: MODULE EXPORTS
// =================================================================================================
module.exports = { executeWithRealTimeUpdates };
