// =================================================================================================
//
// COMPONENT: MultiLevelSelect.jsx
//
// ROLE: A specialized, stateful UI component for the script runner's sidebar.
//
// DESCRIPTION: This component provides a hierarchical, multi-level dropdown interface for
//              selecting a software image from an inventory. It is designed to be "plugged in"
//              to the sidebar via the ScriptOptionsRenderer when a script's metadata
//              specifies it. It fetches its own data from the `/api/inventory-tree` endpoint
//              and communicates the final, complete image path back to the parent
//              (PythonScriptRunner) via the `onParamChange` callback.
//
// =================================================================================================

// =================================================================================================
// SECTION 1: IMPORTS
// =================================================================================================

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

// =================================================================================================
// SECTION 2: COMPONENT DEFINITION & PROPS
// =================================================================================================

/**
 * Renders a series of dependent dropdowns for selecting a software image.
 * @param {object} props - The component props.
 * @param {object} props.parameters - The current parameters object from the parent (PythonScriptRunner).
 * @param {function} props.onParamChange - The callback function to update the parent's state.
 */
const MultiLevelSelect = ({ parameters, onParamChange }) => {

  // =================================================================================================
  // SECTION 3: STATE MANAGEMENT
  // =================================================================================================

  // --- Internal State for Data Fetching ---
  // `data` holds the entire inventory tree fetched from the API.
  const [data, setData] = useState(null);
  // `loading` and `error` manage the UI state during the API call.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);


  // --- Derived State from Props ---
  // The single source of truth for the selection is the `image_path` parameter from the parent.
  // This makes the component controlled by its parent's state.
  const imagePath = parameters.image_path || '';
  // We derive the individual selections by splitting the path.
  const [vendor, category, platform, image] = imagePath.split('/');

  // =================================================================================================
  // SECTION 4: DATA FETCHING LIFECYCLE
  // =================================================================================================

  useEffect(() => {
    // Fetches the hierarchical inventory data when the component mounts.
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('http://localhost:3001/api/inventory-tree');
        if (!response.ok) throw new Error('Failed to fetch inventory data');
        const jsonData = await response.json();
        setData(jsonData);
      } catch (err) {
        console.error('Error fetching inventory tree:', err);
        setError(err.message);
        toast.error(`Could not load inventory: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []); // The empty dependency array ensures this runs only once.

  // =================================================================================================
  // SECTION 5: EVENT HANDLERS & PARENT COMMUNICATION
  // =================================================================================================

  /**
   * Handles a change in any of the dropdowns. It reconstructs the image path
   * and calls the `onParamChange` prop to update the state in the parent component.
   * This is the primary mechanism for integrating with the script runner.
   */
  const handleSelectionChange = useCallback((level, value) => {
    const currentPathParts = imagePath.split('/');
    let newPath = '';

    // Rebuild the path based on which dropdown was changed.
    // Changing a higher-level dropdown resets the levels below it.
    if (level === 'vendor') {
      newPath = value;
    } else if (level === 'category') {
      newPath = `${currentPathParts[0]}/${value}`;
    } else if (level === 'platform') {
      newPath = `${currentPathParts[0]}/${currentPathParts[1]}/${value}`;
    } else if (level === 'image') {
      newPath = `${currentPathParts[0]}/${currentPathParts[1]}/${currentPathParts[2]}/${value}`;
    }

    // This call updates the state in `PythonScriptRunner`, triggering a re-render.
    onParamChange('image_path', newPath);
  }, [imagePath, onParamChange]);


  // =================================================================================================
  // SECTION 6: DERIVED DATA FOR UI RENDERING
  // =================================================================================================

  // Helper functions to filter the inventory tree for dropdown options.
  const getFolders = (items) => (items ? items.filter(item => item.type === 'folder') : []);
  const getFiles = (items) => (items ? items.filter(item => item.type === 'file') : []);

  // These values are recalculated on every render based on the current selections.
  const vendorOptions = getFolders(data?.children || []);
  const categoryOptions = vendor ? getFolders(vendorOptions.find(v => v.name === vendor)?.children || []) : [];
  const platformOptions = category ? getFolders(categoryOptions.find(c => c.name === category)?.children || []) : [];
  const imageOptions = platform ? getFiles(platformOptions.find(p => p.name === platform)?.children || []) : [];


  // =================================================================================================
  // SECTION 7: UI RENDERING
  // =================================================================================================

  // --- Render Loading and Error States ---
  if (loading) {
    return <p className="text-sm text-slate-500 italic">Loading image inventory...</p>;
  }
  if (error) {
    return <p className="text-sm font-semibold text-red-600">Error: {error}</p>;
  }

  // --- Render Main Component UI ---
  return (
    // The component uses a simple `div` wrapper and standard styling to fit into the sidebar.
    <div className="space-y-4">
      {/* Vendor Dropdown */}
      <div>
        <label htmlFor="vendor-select" className="block text-sm font-semibold text-slate-700 mb-1">
          Vendor
        </label>
        <select
          id="vendor-select"
          value={vendor || ''}
          onChange={(e) => handleSelectionChange('vendor', e.target.value)}
          className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        >
          <option value="">Select Vendor</option>
          {vendorOptions.map(opt => <option key={opt.name} value={opt.name}>{opt.name}</option>)}
        </select>
      </div>

      {/* Category Dropdown (Renders only if a Vendor is selected) */}
      {vendor && (
        <div>
          <label htmlFor="category-select" className="block text-sm font-semibold text-slate-700 mb-1">
            Product Category
          </label>
          <select
            id="category-select"
            value={category || ''}
            onChange={(e) => handleSelectionChange('category', e.target.value)}
            className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="">Select Category</option>
            {categoryOptions.map(opt => <option key={opt.name} value={opt.name}>{opt.name}</option>)}
          </select>
        </div>
      )}

      {/* Platform Dropdown (Renders only if a Category is selected) */}
      {category && (
        <div>
          <label htmlFor="platform-select" className="block text-sm font-semibold text-slate-700 mb-1">
            Platform/Model
          </label>
          <select
            id="platform-select"
            value={platform || ''}
            onChange={(e) => handleSelectionChange('platform', e.target.value)}
            className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="">Select Platform</option>
            {platformOptions.map(opt => <option key={opt.name} value={opt.name}>{opt.name}</option>)}
          </select>
        </div>
      )}

      {/* Image Dropdown (Renders only if a Platform is selected) */}
      {platform && (
        <div>
          <label htmlFor="image-select" className="block text-sm font-semibold text-slate-700 mb-1">
            Upgrade Image
          </label>
          <select
            id="image-select"
            value={image || ''}
            onChange={(e) => handleSelectionChange('image', e.target.value)}
            className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="">Select Image</option>
            {imageOptions.map(opt => <option key={opt.name} value={opt.name}>{opt.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
};

// =================================================================================================
// SECTION 8: COMPONENT EXPORT
// =================================================================================================

export default MultiLevelSelect;
