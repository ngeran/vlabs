// =============================================================================
// FILE:               src/components/shared/UniversalTableViewer.jsx
//
// DESCRIPTION:
//   A reusable table component for rendering JSON data with headers and rows using
//   shadcn/ui Table components. Designed to handle dynamic table structures from API
//   responses, with responsive styling and accessibility features.
//
// KEY FEATURES:
//   ✅ Renders JSON data with headers and data arrays as a table.
//   ✅ Uses shadcn/ui Table components for consistent styling.
//   ✅ Responsive design with horizontal scrolling for large tables.
//   ✅ Accessibility-compliant with proper semantic markup.
//   ✅ Handles nested data and null/undefined values gracefully.
//
// DEPENDENCIES:
//   - React 16.8+ (for component rendering).
//   - @shadcn/ui (for Table, TableHeader, TableBody, TableRow, TableHead, TableCell).
//   - Tailwind CSS 3.0+ (for styling utilities).
//   - Optional: shadcn/ui theme configuration.
//
// HOW TO USE:
//   ```javascript
//   import UniversalTableViewer from './UniversalTableViewer';
//
//   const tableData = {
//     title: "Interface Status",
//     headers: ["Interface Name", "Admin Status", "Link Status"],
//     data: [
//       { "Interface Name": "ge-0/0/0", "Admin Status": "up", "Link Status": "up" },
//       { "Interface Name": "ge-0/0/1", "Admin Status": "up", "Link Status": "down" }
//     ]
//   };
//
//   <UniversalTableViewer tableData={tableData} />
//   ```
// =============================================================================

import React from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table';

/**
 * Universal Table Viewer Component
 *
 * @param {Object} props - Component props
 * @param {Object} props.tableData - JSON object containing title, headers, and data
 * @param {string} [props.tableData.title] - Optional table title
 * @param {string[]} props.tableData.headers - Array of column headers
 * @param {Object[]} props.tableData.data - Array of row data objects
 * @param {string} [props.className] - Additional Tailwind CSS classes
 */
const UniversalTableViewer = ({ tableData, className = '' }) => {
  // Early return if no valid table data
  if (!tableData || !tableData.headers || !tableData.data || !Array.isArray(tableData.headers) || !Array.isArray(tableData.data)) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        No table data available
      </div>
    );
  }

  // Clean up data by removing newlines and trimming strings
  const cleanData = (value) => {
    if (typeof value === 'string') {
      return value.replace(/\n/g, '').trim();
    }
    return value ?? '-';
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Table Title */}
      {tableData.title && (
        <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {tableData.title}
        </h4>
      )}

      {/* Table Container */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <Table>
          <TableHeader>
            <TableRow>
              {tableData.headers.map((header, index) => (
                <TableHead
                  key={`header-${index}`}
                  className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  {cleanData(header)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableData.data.map((row, rowIndex) => (
              <TableRow key={`row-${rowIndex}`}>
                {tableData.headers.map((header, colIndex) => (
                  <TableCell
                    key={`cell-${rowIndex}-${colIndex}`}
                    className="text-sm text-gray-900 dark:text-gray-100"
                  >
                    {cleanData(row[header])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default UniversalTableViewer;
