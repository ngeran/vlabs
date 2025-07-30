// =================================================================================================
// FILE:               /vlabs/backend/routes/historyRoutes.js
//
// DESCRIPTION:
//   An Express router dedicated to handling all API requests for script run history.
//   It provides endpoints for the frontend to fetch both the complete history log and
//   a limited subset of recent activities.
// =================================================================================================

// SECTION 1: IMPORTS & SETUP
// -------------------------------------------------------------------------------------------------
const express = require('express');
const router = express.Router();
const historyService = require('../services/historyService'); // The service that contains our logic.

// SECTION 2: ROUTE DEFINITIONS
// -------------------------------------------------------------------------------------------------

/**
 * @route   GET /api/history
 * @desc    Get script run history. Can be limited by a query parameter.
 *          - /api/history: Returns the full history log.
 *          - /api/history?limit=5: Returns the 5 most recent history items.
 * @access  Public
 */
router.get('/', (req, res) => {
  try {
    // Check if a 'limit' query parameter was provided.
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;

    if (limit && !isNaN(limit)) {
      // If a valid limit is present, get only the recent items.
      const recentHistory = historyService.getRecentHistory(limit);
      res.json({ success: true, history: recentHistory });
    } else {
      // Otherwise, return the entire history log.
      const fullHistory = historyService.getHistory();
      res.json({ success: true, history: fullHistory });
    }
  } catch (error) {
    console.error('[HistoryRoutes] Error retrieving history:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve history.', error: error.message });
  }
});

// SECTION 3: EXPORT
// -------------------------------------------------------------------------------------------------
module.exports = router;
