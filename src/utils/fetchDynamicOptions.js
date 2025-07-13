/**
 * Reusable utility for fetching dynamic options from API endpoints.
 * Handles fetching, error management, and toast notifications for UI feedback.
 * Used by components like DeviceAuthFields to fetch dynamic dropdown options.
 */

import toast from "react-hot-toast";

const API_BASE_URL = "http://localhost:3001";

// Cache to store fetched options and reduce API calls
const optionsCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch dynamic options from a specified API endpoint.
 * Uses caching to avoid redundant requests within the cache duration.
 * @param {string} endpoint - API endpoint to fetch options (e.g., '/api/backups/devices').
 * @param {string} cacheKey - Unique key for caching the response.
 * @returns {Promise<Object>} Object containing options, loading state, and error.
 */
export async function fetchDynamicOptions(endpoint, cacheKey) {
  // Check cache first
  const cached = optionsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return { options: cached.options, isLoading: false, error: null };
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`);
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || "Failed to fetch options.");
    }

    // Cache the options
    const options = data.devices || data.options || [];
    optionsCache.set(cacheKey, { options, timestamp: Date.now() });

    return { options, isLoading: false, error: null };
  } catch (error) {
    console.error(`Failed to fetch options from ${endpoint}:`, error);
    toast.error(error.message || "Could not connect to server to fetch options.");
    return { options: [], isLoading: false, error: error.message };
  }
}

/**
 * Clear cache for a specific endpoint or all endpoints.
 * @param {string|null} cacheKey - Cache key to clear, or null to clear all.
 */
export function clearOptionsCache(cacheKey = null) {
  if (cacheKey) {
    optionsCache.delete(cacheKey);
  } else {
    optionsCache.clear();
  }
}
