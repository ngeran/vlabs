// =================================================================================================
// FILE:               /vlabs/backend/services/historyService.js
//
// DESCRIPTION:
//   A dedicated service for managing the lifecycle of script run history. It handles loading
//   from and persisting to a local JSON file, adding new entries, and provides functions
//   for retrieving history data. It is designed to be the single source of truth for all
//   historical run information.
// =================================================================================================

// SECTION 1: IMPORTS & CONFIGURATION
// -------------------------------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

// The path to the JSON file that will store our history data.
const HISTORY_FILE_PATH = path.join(__dirname, '..', 'data', 'run_history.json');
// A safeguard to prevent the history file from becoming excessively large.
const MAX_HISTORY_ITEMS = 200;

// SECTION 2: IN-MEMORY STATE & INITIALIZATION
// -------------------------------------------------------------------------------------------------
let runHistory = [];
let webSocketServer = null; // Will hold the reference to the main WSS instance.

/**
 * Loads history from the JSON file into memory when the server starts.
 * If the file or directory doesn't exist, it creates them.
 */
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE_PATH)) {
      const data = fs.readFileSync(HISTORY_FILE_PATH, 'utf8');
      runHistory = JSON.parse(data);
      console.log(`[HistoryService] Successfully loaded ${runHistory.length} history items from disk.`);
    } else {
      // Ensure the 'data' directory exists before trying to write to it later.
      fs.mkdirSync(path.dirname(HISTORY_FILE_PATH), { recursive: true });
      console.log('[HistoryService] History file not found. A new one will be created on the first run.');
    }
  } catch (error) {
    console.error('[HistoryService] CRITICAL: Error loading history from file:', error);
    runHistory = []; // Start with a clean slate if the file is corrupt.
  }
}

/**
 * Initializes the history service. This must be called once at server startup.
 * @param {WebSocketServer} wss - The application's central WebSocket server instance.
 */
function initialize(wss) {
  webSocketServer = wss;
  loadHistory();
}

// SECTION 3: CORE SERVICE FUNCTIONS
// -------------------------------------------------------------------------------------------------

/**
 * Saves the current in-memory history array to the JSON file.
 * This is a private helper function called after any modification.
 */
function saveHistory() {
  try {
    const dataToSave = JSON.stringify(runHistory, null, 2);
    fs.writeFileSync(HISTORY_FILE_PATH, dataToSave, 'utf8');
  } catch (error) {
    console.error('[HistoryService] CRITICAL: Error saving history to file:', error);
  }
}

/**
 * Broadcasts a data payload to every connected WebSocket client.
 * @param {object} data - The message object to be stringified and sent.
 */
function broadcast(data) {
  if (!webSocketServer) {
    console.warn('[HistoryService] WebSocket server not initialized. Cannot broadcast update.');
    return;
  }
  const message = JSON.stringify(data);
  webSocketServer.clients.forEach(client => {
    // Check if the client's connection is open before sending.
    if (client.readyState === 1) { // WebSocket.OPEN === 1
      client.send(message);
    }
  });
}

/**
 * Adds a new history item to the log. This is the primary entry point for new records.
 * It prepends the item, enforces the max history size, saves to disk, and broadcasts the update.
 * @param {object} historyItem - The new history record to add.
 */
function addHistoryItem(historyItem) {
  // Prepend the new item to the start of the array.
  runHistory.unshift(historyItem);

  // Trim the history array if it exceeds the maximum configured size.
  if (runHistory.length > MAX_HISTORY_ITEMS) {
    runHistory = runHistory.slice(0, MAX_HISTORY_ITEMS);
  }

  // Persist the updated history to the file system.
  saveHistory();

  // Notify all connected clients that a new history item is available.
  broadcast({
    type: 'history_update',
    payload: historyItem
  });
  console.log(`[HistoryService] Added new history item for runId: ${historyItem.runId}`);
}

/**
 * Retrieves the entire history log.
 * @returns {Array<object>} The full history array, sorted most recent first.
 */
function getHistory() {
  return runHistory;
}

/**
 * Retrieves a specified number of the most recent history items.
 * Ideal for populating dashboard widgets without sending the entire log.
 * @param {number} [limit=6] - The number of recent items to retrieve.
 * @returns {Array<object>} A slice of the history array.
 */
function getRecentHistory(limit = 6) {
  return runHistory.slice(0, limit);
}


// SECTION 4: EXPORTS
// -------------------------------------------------------------------------------------------------
module.exports = {
  initialize,
  addHistoryItem,
  getHistory,
  getRecentHistory,
};
