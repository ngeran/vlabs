// =============================================================================
// FILE: TableDisplay.jsx
// DESCRIPTION: Universal reusable component for displaying any structured data
//              in a responsive table format with search, sort, and save functionality.
//              Can be enabled/disabled through script metadata capabilities.
//
// OVERVIEW:
//   This component can display any array of objects as a table, automatically
//   detecting columns or using provided headers. It supports nested objects,
//   multiple data types, searching, sorting, pagination, and exporting data
//   in multiple formats (CSV, JSON, Excel). Perfect for displaying API responses,
//   test results, device information, or any structured data.
//
// DEPENDENCIES:
//   - react: For building the UI and managing component state
//   - lucide-react: For icons (Table, Search, Download, ChevronDown, etc.)
//
// HOW TO USE:
//   1. Add to your script metadata:
//      capabilities:
//        enableTableDisplay: true
//        tableSettings:
//          enableSave: true
//          searchable: true
//          maxRows: 100
//
//   2. Import and use in your component:
//      import TableDisplay from '../components/shared/TableDisplay';
//
//      <TableDisplay
//        title="Device Information"
//        data={deviceData}
//        isVisible={script?.capabilities?.enableTableDisplay}
//        enableSave={script?.capabilities?.tableSettings?.enableSave}
//        searchable={script?.capabilities?.tableSettings?.searchable}
//      />
//
//   3. Data format examples:
//      // Simple objects
//      const data = [
//        { name: "Router1", ip: "192.168.1.1", status: "Online" },
//        { name: "Router2", ip: "192.168.1.2", status: "Offline" }
//      ];
//
//      // Nested objects (auto-flattened)
//      const data = [
//        { device: { name: "Router1", location: "NYC" }, stats: { uptime: 99.9 } }
//      ];
// =============================================================================

import React, { useState, useMemo, useCallback } from "react";
import {
  Table,
  Search,
  Download,
  ChevronDown,
  ChevronUp,
  Save,
  FileText,
  Database,
  Grid,
  Loader,
  CheckCircle,
  AlertCircle
} from "lucide-react";

// =============================================================================
// SECTION 1: UTILITY FUNCTIONS
// =============================================================================

/**
 * Flattens nested objects for table display
 * @param {Object} obj - Object to flatten
 * @param {string} prefix - Prefix for keys
 * @returns {Object} Flattened object
 */
const flattenObject = (obj, prefix = '') => {
  const flattened = {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (obj[key] === null || obj[key] === undefined) {
        flattened[newKey] = '';
      } else if (Array.isArray(obj[key])) {
        flattened[newKey] = obj[key].join(', ');
      } else if (typeof obj[key] === 'object') {
        Object.assign(flattened, flattenObject(obj[key], newKey));
      } else {
        flattened[newKey] = obj[key];
      }
    }
  }

  return flattened;
};

/**
 * Auto-detects column headers from data array
 * @param {Array} data - Array of objects
 * @returns {Array} Array of unique column headers
 */
const detectHeaders = (data) => {
  if (!data || data.length === 0) return [];

  const allKeys = new Set();

  data.forEach(item => {
    const flattened = flattenObject(item);
    Object.keys(flattened).forEach(key => allKeys.add(key));
  });

  return Array.from(allKeys).sort();
};

/**
 * Formats cell value for display
 * @param {any} value - Value to format
 * @returns {string} Formatted value
 */
const formatCellValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/**
 * Exports data to CSV format
 * @param {Array} data - Data to export
 * @param {Array} headers - Column headers
 * @returns {string} CSV content
 */
const exportToCSV = (data, headers) => {
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = row[header] || '';
        // Escape commas and quotes in CSV
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(',')
    )
  ].join('\n');

  return csvContent;
};

// =============================================================================
// SECTION 2: COMPONENT DEFINITION
// =============================================================================

/**
 * Universal table display component with search, sort, and export functionality
 * @param {Object} props - Component props
 * @returns {JSX.Element|null} Table component or null if not visible
 */
export default function TableDisplay({
  title = "Data Table",
  headers = null,
  data = [],
  isVisible = true,
  className = "",
  maxRows = 100,
  searchable = true,
  enableSave = false,
  saveConfig = {
    formats: ["csv", "json"],
    defaultFilename: "table-data"
  }
}) {
  // =============================================================================
  // SECTION 3: STATE MANAGEMENT
  // =============================================================================
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [isExpanded, setIsExpanded] = useState(true);

  // =============================================================================
  // SECTION 4: EARLY RETURN CONDITIONS
  // =============================================================================
  if (!isVisible) return null;

  // =============================================================================
  // SECTION 5: DATA PROCESSING
  // =============================================================================

  // Process and flatten data
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map(item => flattenObject(item));
  }, [data]);

  // Determine headers (auto-detect or use provided)
  const tableHeaders = useMemo(() => {
    if (headers && headers.length > 0) return headers;
    return detectHeaders(processedData);
  }, [headers, processedData]);

  // Filter data based on search term
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return processedData;

    return processedData.filter(row =>
      tableHeaders.some(header =>
        formatCellValue(row[header])
          .toLowerCase()
          .includes(searchTerm.toLowerCase())
      )
    );
  }, [processedData, searchTerm, tableHeaders]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aValue = formatCellValue(a[sortConfig.key]);
      const bValue = formatCellValue(b[sortConfig.key]);

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * maxRows;
    return sortedData.slice(startIndex, startIndex + maxRows);
  }, [sortedData, currentPage, maxRows]);

  const totalPages = Math.ceil(sortedData.length / maxRows);

  // =============================================================================
  // SECTION 6: EVENT HANDLERS
  // =============================================================================

  const handleSort = useCallback((key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  const handleSearch = useCallback((e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page when searching
  }, []);

  const handleSave = useCallback(async (format) => {
    setIsSaving(true);
    setSaveStatus(null);

    try {
      let content;
      let mimeType;
      let extension;

      switch (format) {
        case 'csv':
          content = exportToCSV(sortedData, tableHeaders);
          mimeType = 'text/csv';
          extension = 'csv';
          break;
        case 'json':
          content = JSON.stringify(sortedData, null, 2);
          mimeType = 'application/json';
          extension = 'json';
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      // Create and trigger download
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const filename = `${saveConfig.defaultFilename}-${timestamp}.${extension}`;

      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSaveStatus({ type: 'success', message: `Saved as ${filename}` });

    } catch (error) {
      setSaveStatus({ type: 'error', message: error.message });
    } finally {
      setIsSaving(false);
      // Clear status after 3 seconds
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [sortedData, tableHeaders, saveConfig.defaultFilename]);

  // =============================================================================
  // SECTION 7: RENDER HELPERS
  // =============================================================================

  const renderSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return <ChevronDown className="h-3 w-3 text-slate-400" />;
    }
    return sortConfig.direction === 'asc'
      ? <ChevronUp className="h-3 w-3 text-blue-600" />
      : <ChevronDown className="h-3 w-3 text-blue-600" />;
  };

  const renderSaveButton = () => {
    if (!enableSave) return null;

    return (
      <div className="relative">
        <div className="flex items-center gap-2">
          {saveConfig.formats.map(format => (
            <button
              key={format}
              onClick={() => handleSave(format)}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? (
                <Loader className="h-3 w-3 animate-spin" />
              ) : (
                <Download className="h-3 w-3" />
              )}
              Save {format.toUpperCase()}
            </button>
          ))}
        </div>

        {saveStatus && (
          <div className={`absolute top-full left-0 mt-2 px-3 py-2 rounded-lg text-xs font-medium z-10 ${
            saveStatus.type === 'success'
              ? 'bg-green-100 text-green-800 border border-green-200'
              : 'bg-red-100 text-red-800 border border-red-200'
          }`}>
            <div className="flex items-center gap-2">
              {saveStatus.type === 'success' ? (
                <CheckCircle className="h-3 w-3" />
              ) : (
                <AlertCircle className="h-3 w-3" />
              )}
              {saveStatus.message}
            </div>
          </div>
        )}
      </div>
    );
  };

  // =============================================================================
  // SECTION 8: MAIN RENDER LOGIC
  // =============================================================================

  // Handle empty data
  if (!processedData || processedData.length === 0) {
    return (
      <div className={`bg-gradient-to-br from-slate-50 to-white border border-slate-200/60 rounded-2xl shadow-sm ${className}`}>
        <div className="px-5 py-4 border-b border-slate-100/80">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-sm">
              <Table className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500">No data available</p>
            </div>
          </div>
        </div>
        <div className="p-8 text-center">
          <Grid className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No data to display</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gradient-to-br from-slate-50 to-white border border-slate-200/60 rounded-2xl shadow-sm ${className}`}>
      {/* SECTION 8.1: HEADER */}
      <div className="px-5 py-4 border-b border-slate-100/80">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-3 hover:bg-slate-100/50 rounded-xl p-2 transition-colors"
          >
            <div className="p-1.5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-sm">
              <Table className="h-4 w-4 text-blue-600" />
            </div>
            <div className="text-left">
              <h3 className="text-base font-semibold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500">
                {sortedData.length} row{sortedData.length !== 1 ? 's' : ''}
                {filteredData.length !== processedData.length && ` (filtered from ${processedData.length})`}
              </p>
            </div>
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </button>

          <div className="flex items-center gap-3">
            {renderSaveButton()}
          </div>
        </div>
      </div>

      {/* SECTION 8.2: TABLE CONTENT */}
      {isExpanded && (
        <div className="p-5">
          {/* Search Bar */}
          {searchable && (
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search in table..."
                  value={searchTerm}
                  onChange={handleSearch}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* Table */}
          <div className="border rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    {tableHeaders.map((header) => (
                      <th
                        key={header}
                        onClick={() => handleSort(header)}
                        className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate">{header}</span>
                          {renderSortIcon(header)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {paginatedData.map((row, rowIndex) => (
                    <tr key={rowIndex} className="hover:bg-slate-50 transition-colors">
                      {tableHeaders.map((header) => (
                        <td
                          key={header}
                          className="px-4 py-3 text-sm text-slate-800 font-mono max-w-xs"
                        >
                          <div className="truncate" title={formatCellValue(row[header])}>
                            {formatCellValue(row[header])}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-slate-500">
                Showing {((currentPage - 1) * maxRows) + 1} to {Math.min(currentPage * maxRows, sortedData.length)} of {sortedData.length} results
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm font-medium">
                  {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
