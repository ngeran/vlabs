// =================================================================================================
//
// FILE:               backend/utils/executeWithRealTimeUpdates.js (Enhanced Hybrid Version)
//
// DESCRIPTION:
//   A robust utility for executing command-line processes with real-time output processing.
//   Handles both streaming JSON output (line-by-line) and bulk JSON output (end-of-process).
//   Designed to work with Python scripts that may output in either format.
//
// KEY FEATURES:
//   - Hybrid JSON parsing (streaming + bulk fallback)
//   - WebSocket integration for real-time UI updates
//   - Automatic cleanup of temporary files
//   - Comprehensive error handling
//   - Debug logging for troubleshooting
//
// DEPENDENCIES:
//   - Node.js child_process module
//   - Node.js fs module
//
// HOW TO USE:
//   1. Import the function:
//      const { executeWithRealTimeUpdates } = require('./executeWithRealTimeUpdates');
//   2. Call with parameters:
//      executeWithRealTimeUpdates(command, args, clientWs, cleanupPath);
//
// =================================================================================================

// =================================================================================================
// SECTION 1: IMPORTS
// =================================================================================================
const { spawn } = require('child_process');
const fs = require('fs');

// =================================================================================================
// SECTION 2: CORE FUNCTIONALITY
// =================================================================================================

/**
 * Executes a command with real-time output processing and WebSocket integration.
 *
 * @param {string} command - The command to execute (e.g., 'python')
 * @param {Array} args - Command arguments (e.g., ['script.py', '--param'])
 * @param {WebSocket} clientWs - WebSocket connection for real-time updates
 * @param {string|null} cleanupPath - Optional file path to delete after execution
 */
function executeWithRealTimeUpdates(command, args, clientWs, cleanupPath = null) {

    // =============================================================================================
    // SUBSECTION 2.1: INITIAL VALIDATION
    // Validates inputs and WebSocket connection before proceeding
    // =============================================================================================
    if (!clientWs || clientWs.readyState !== 1) {
        console.error("[BACKEND] WebSocket client not available for real-time updates.");
        if (cleanupPath) fs.unlink(cleanupPath, () => {});
        return;
    }

    // =============================================================================================
    // SUBSECTION 2.2: PROCESS INITIALIZATION
    // Spawns the child process and initializes state tracking variables
    // =============================================================================================
    const child = spawn(command, args);
    let stdoutBuffer = ""; // Accumulates all stdout content
    let finalResultFromStream = null; // Stores any result found via streaming

    // =============================================================================================
    // SUBSECTION 2.3: STDOUT PROCESSING LOGIC
    // Handles real-time parsing of stdout data as it arrives
    // =============================================================================================
    const processStdoutLines = (buffer) => {
        const lines = buffer.split('\n');
        const newBuffer = lines.pop() || '';

        for (const line of lines) {
            if (line.trim() === '') continue;

            try {
                const jsonData = JSON.parse(line.trim());

                // Handle progress events (streaming updates)
                if (jsonData.event_type) {
                    if (clientWs.readyState === 1) {
                        clientWs.send(JSON.stringify({
                            type: 'progress',
                            ...jsonData
                        }));
                    }
                }
                // Capture potential final result in streaming mode
                else {
                    finalResultFromStream = jsonData;
                }
            } catch (e) {
                // Non-JSON lines are expected in bulk output mode
                console.debug("[BACKEND] Non-JSON stdout line:", line);
            }
        }

        return newBuffer;
    };

    // =============================================================================================
    // SECTION 3: EVENT HANDLERS
    // Handlers for process events (stdout, stderr, close, error)
    // =============================================================================================

    // Handler for stdout data events
    child.stdout.on('data', (data) => {
        const dataStr = data.toString();
        stdoutBuffer += dataStr; // Accumulate for bulk parsing
        processStdoutLines(dataStr); // Process for streaming updates
    });

    // Handler for stderr data events
    child.stderr.on('data', (data) => {
        console.error(`[SCRIPT-STDERR]: ${data.toString().trim()}`);
    });

    // =============================================================================================
    // SUBSECTION 3.1: PROCESS COMPLETION HANDLER
    // Handles process completion and final result processing
    // =============================================================================================
    child.on('close', (code) => {
        let finalResult = null;

        // PHASE 1: Attempt to get result from streaming parser
        if (finalResultFromStream) {
            finalResult = finalResultFromStream;
        }
        // PHASE 2: Fallback to bulk parsing of accumulated stdout
        else if (stdoutBuffer.trim()) {
            try {
                // Strategy 1: Find last valid JSON object in output
                const jsonObjects = stdoutBuffer.trim().split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0)
                    .map(line => {
                        try {
                            return JSON.parse(line);
                        } catch (e) {
                            return null;
                        }
                    })
                    .filter(obj => obj !== null);

                if (jsonObjects.length > 0) {
                    finalResult = jsonObjects[jsonObjects.length - 1];
                }
                // Strategy 2: Parse entire buffer as single JSON
                else {
                    finalResult = JSON.parse(stdoutBuffer.trim());
                }
            } catch (e) {
                console.error("[BACKEND] JSON parse failed:", e.message);
            }
        }

        // Ensure we have a WebSocket connection before sending
        if (clientWs.readyState === 1) {
            // Send final result or error
            if (code === 0) {
                if (finalResult) {
                    clientWs.send(JSON.stringify({
                        type: 'result',
                        data: finalResult
                    }));
                } else {
                    clientWs.send(JSON.stringify({
                        type: 'error',
                        message: 'Script completed but produced no valid output'
                    }));
                }
            } else {
                clientWs.send(JSON.stringify({
                    type: 'error',
                    message: `Script failed with exit code ${code}`
                }));
            }

            // Always send script_end to signal completion
            clientWs.send(JSON.stringify({
                type: 'script_end',
                exitCode: code
            }));
        }

        // Cleanup temporary files if specified
        if (cleanupPath) {
            fs.unlink(cleanupPath, (err) => {
                if (err) console.error(`[BACKEND] Cleanup failed for ${cleanupPath}`);
            });
        }
    });

    // Handler for process errors
    child.on('error', (error) => {
        console.error("[BACKEND] Process error:", error.message);
        if (clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({
                type: 'error',
                message: `Process failed: ${error.message}`
            }));
        }
    });
}

// =================================================================================================
// SECTION 4: MODULE EXPORTS
// =================================================================================================
module.exports = { executeWithRealTimeUpdates };
