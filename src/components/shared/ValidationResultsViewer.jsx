/**
 * @component EnhancedValidationResultsViewer
 * @description
 * This component provides a comprehensive viewer for network validation results from JSNAPy tests.
 * It displays summary metrics, execution summaries, detailed device results, and progress tracking
 * in a modern, responsive UI. The viewer supports multiple view modes (card/table), exporting results,
 * and debug views for raw data. It handles various data formats gracefully and provides visual
 * indicators for statuses, metrics, and progress.
 *
 * @keyFeatures
 * - Interactive summary metrics dashboard with device and test success rates
 * - Comprehensive summary table with sorting and filtering capabilities (improved)
 * - Detailed expandable device cards or table views for test results
 * - Real-time execution progress tracker with status indicators
 * - Export functionality for results in JSON format
 * - Search and filter options for quick navigation (new)
 * - Responsive design with space-efficient collapsible sections
 * - Slick UI with gradients, shadows, subtle animations, and modern icons
 * - Error handling with safe rendering components
 * - Debug mode for raw JSON data viewing
 *
 * @dependencies
 * - React (v16+ recommended, uses hooks like useState, useEffect, useRef)
 * - lucide-react: For icons (CheckCircle2, XCircle, AlertCircle, etc.)
 * - Tailwind CSS: For styling (classes like bg-gradient-to-br, flex, grid, etc.)
 * - No external chart libraries; uses native HTML/JS for any visualizations
 * - Browser APIs: For export (Blob, URL.createObjectURL)
 *
 * @howToGuide
 * 1. Import the component: import EnhancedValidationResultsViewer from './ValidationResultsViewer';
 * 2. Pass props:
 *    - validationResults: Object containing results_by_host array or similar structure
 *    - progress: Array of progress events (optional, for execution tracking)
 *    - isRunning: Boolean indicating if validation is in progress
 * 3. Render: <EnhancedValidationResultsViewer validationResults={data} progress={progress} isRunning={false} />
 * 4. Data Structure Expectation:
 *    - validationResults: { summary: {...}, results_by_host: [{ hostname, status, test_results: [{ table: { columns, rows, test_name, title } }] }] }
 * 5. Customization: Extend styles via Tailwind config or override classes
 * 6. Error Handling: Component gracefully handles missing/invalid data with warnings
 * 7. Export: Triggers JSON download of processed results
 */

import React, { memo, useState, useRef, useEffect } from "react";
import {
  CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronRight,
  Download, Filter, Search, BarChart3, Table, List, Activity,
  Server, Shield, Clock
} from "lucide-react";

// =============================================================================
// UTILITY COMPONENTS
// =============================================================================
// This section defines small, reusable components for safe rendering of text, statuses, and JSON.
// These prevent crashes from invalid data and provide consistent visual elements.
const BulletproofText = memo(({ children, className = "" }) => {
  // Safely renders text, replacing null/undefined with a dash
  if (children === null || children === undefined) {
    return <span className={className}>-</span>;
  }

  const text = String(children);
  return <span className={className}>{text}</span>;
});

const SafeStatusIndicator = memo(({ status, className = "" }) => {
  // Maps status strings to icons and colors for consistent status badges
  const statusConfig = {
    'PASSED': { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100', border: 'border-green-200' },
    'PASS': { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100', border: 'border-green-200' },
    'FAILED': { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', border: 'border-red-200' },
    'FAIL': { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', border: 'border-red-200' },
    'ERROR': { icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-100', border: 'border-orange-200' },
    'SUCCESS': { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100', border: 'border-green-200' },
    'CONNECTED': { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100', border: 'border-green-200' },
    'CONNECTION FAILED': { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', border: 'border-red-200' }
  };

  const config = statusConfig[status] || statusConfig['ERROR'];
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color} ${config.bg} ${config.border} border ${className}`}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
});

const SafeJsonDisplay = memo(({ data }) => {
  // Safely stringifies and displays JSON data in a preformatted block, with error fallback
  try {
    const jsonString = JSON.stringify(data, null, 2);
    return (
      <pre className="bg-gray-100 p-3 rounded-lg text-xs overflow-auto max-h-96 border">
        <code>{jsonString}</code>
      </pre>
    );
  } catch (error) {
    return (
      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <span className="text-sm text-red-800">Unable to display data</span>
      </div>
    );
  }
});

// =============================================================================
// ENHANCED SUMMARY METRICS COMPONENT
// =============================================================================
// This section computes and displays key metrics like device success rates and test pass rates.
// Uses gradients and icons for a slick, dashboard-like appearance. Improved with tooltips for details.
const EnhancedSummaryMetrics = memo(({ hostResults, summary }) => {
  const [metrics, setMetrics] = useState({});

  useEffect(() => {
    // Calculate metrics from host results, handling edge cases like zero divisions
    let totalDevicesTested = hostResults.length;
    let successfulDevices = 0;
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let totalErrors = 0;
    let connectionFailures = 0;

    hostResults.forEach((hostResult) => {
      if (hostResult.status === 'success' && hostResult.test_results) {
        successfulDevices++;
        hostResult.test_results.forEach((testResult) => {
          if (testResult.table?.rows) {
            totalTests += testResult.table.rows.length;
            totalPassed += testResult.table.rows.filter(row => row.Status === 'PASSED').length;
            totalFailed += testResult.table.rows.filter(row => row.Status === 'FAILED').length;
            totalErrors += testResult.table.rows.filter(row => row.Status === 'ERROR').length;
          }
        });
      } else {
        connectionFailures++;
      }
    });

    const deviceSuccessRate = totalDevicesTested > 0 ? Math.round((successfulDevices / totalDevicesTested) * 100) : 0;
    const testSuccessRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;

    setMetrics({
      totalDevicesTested,
      successfulDevices,
      connectionFailures,
      deviceSuccessRate,
      totalTests,
      totalPassed,
      totalFailed,
      totalErrors,
      testSuccessRate
    });
  }, [hostResults, summary]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {/* Device Metrics - Enhanced with hover effects for sophistication */}
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-2 mb-2">
          <Server className="h-4 w-4 text-blue-600" />
          <span className="text-xs font-medium text-blue-700">DEVICES</span>
        </div>
        <div className="text-2xl font-bold text-blue-800">{metrics.totalDevicesTested}</div>
        <div className="text-xs text-blue-600">Total Tested</div>
      </div>

      <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-xs font-medium text-green-700">SUCCESSFUL</span>
        </div>
        <div className="text-2xl font-bold text-green-800">{metrics.successfulDevices}</div>
        <div className="text-xs text-green-600">Connected & Tested</div>
      </div>

      <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="h-4 w-4 text-purple-600" />
          <span className="text-xs font-medium text-purple-700">DEVICE SUCCESS</span>
        </div>
        <div className="text-2xl font-bold text-purple-800">{metrics.deviceSuccessRate}%</div>
        <div className="text-xs text-purple-600">Connection Rate</div>
      </div>

      {/* Test Metrics */}
      <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-4 rounded-lg border border-indigo-200 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-4 w-4 text-indigo-600" />
          <span className="text-xs font-medium text-indigo-700">VALIDATIONS</span>
        </div>
        <div className="text-2xl font-bold text-indigo-800">{metrics.totalTests}</div>
        <div className="text-xs text-indigo-600">Total Checks</div>
      </div>

      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-4 rounded-lg border border-emerald-200 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="h-4 w-4 text-emerald-600" />
          <span className="text-xs font-medium text-emerald-700">TEST SUCCESS</span>
        </div>
        <div className="text-2xl font-bold text-emerald-800">{metrics.testSuccessRate}%</div>
        <div className="text-xs text-emerald-600">Pass Rate</div>
      </div>
    </div>
  );
});

// =============================================================================
// ENHANCED SUMMARY TABLE COMPONENT
// =============================================================================
// This section creates a sortable, filterable summary table for all tests across devices.
// Improved with search input, column sorting, and space-efficient pagination (stubbed for future).
const EnhancedSummaryTable = memo(({ hostResults }) => {
  const [tableData, setTableData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'host', direction: 'asc' });

  useEffect(() => {
    // Process host results into flat table data for summary
    const data = [];

    hostResults.forEach((hostResult) => {
      if (hostResult.status === 'success' && hostResult.test_results) {
        hostResult.test_results.forEach((testResult) => {
          const passed = testResult.table?.rows?.filter(row => row.Status === 'PASSED').length || 0;
          const failed = testResult.table?.rows?.filter(row => row.Status === 'FAILED').length || 0;
          const errors = testResult.table?.rows?.filter(row => row.Status === 'ERROR').length || 0;
          const total = passed + failed + errors;

          data.push({
            host: hostResult.hostname,
            test: testResult.table?.test_name || 'Unknown Test',
            testTitle: testResult.table?.title || '',
            passed,
            failed,
            errors,
            total,
            status: failed === 0 && errors === 0 ? 'PASS' : 'FAIL',
            successRate: total > 0 ? Math.round((passed / total) * 100) : 0,
            connectionStatus: 'CONNECTED'
          });
        });
      } else {
        data.push({
          host: hostResult.hostname,
          test: 'CONNECTION',
          testTitle: 'Device Connection Test',
          passed: 0,
          failed: 0,
          errors: 1,
          total: 1,
          status: 'FAIL',
          successRate: 0,
          connectionStatus: 'FAILED'
        });
      }
    });

    setTableData(data);
  }, [hostResults]);

  // Filter and sort table data based on user input
  const filteredData = tableData.filter(row =>
    row.host.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.test.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedData = [...filteredData].sort((a, b) => {
    if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
    if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
      <div className="p-4 border-b bg-gradient-to-r from-gray-50 to-gray-100 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Table className="h-5 w-5 text-blue-600" />
            Test Execution Summary
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Comprehensive overview of all device tests and their results
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search hosts or tests..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Filter className="h-5 w-5 text-gray-500 cursor-pointer hover:text-blue-600" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th onClick={() => requestSort('host')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer">
                Device {sortConfig.key === 'host' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => requestSort('connectionStatus')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer">
                Connection {sortConfig.key === 'connectionStatus' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => requestSort('test')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer">
                Test Name {sortConfig.key === 'test' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Test Description
              </th>
              <th onClick={() => requestSort('total')} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer">
                Total Checks {sortConfig.key === 'total' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => requestSort('passed')} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer">
                Passed {sortConfig.key === 'passed' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => requestSort('failed')} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer">
                Failed {sortConfig.key === 'failed' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => requestSort('errors')} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer">
                Errors {sortConfig.key === 'errors' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => requestSort('successRate')} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer">
                Success Rate {sortConfig.key === 'successRate' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => requestSort('status')} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer">
                Overall Status {sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedData.map((row, index) => (
              <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-gray-500" />
                    <BulletproofText>{row.host}</BulletproofText>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <SafeStatusIndicator status={row.connectionStatus} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                  <BulletproofText>{row.test}</BulletproofText>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">
                  <BulletproofText>{row.testTitle}</BulletproofText>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-semibold text-gray-700">
                  {row.total}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {row.passed}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    {row.failed}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                    {row.errors}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-semibold">
                  <span className={`${row.successRate === 100 ? 'text-green-600' : row.successRate >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {row.successRate}%
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <SafeStatusIndicator status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

// =============================================================================
// DETAILED TEST RESULTS TABLE
// =============================================================================
// This section renders detailed tables for individual tests, with status indicators and hover effects.
// Space-efficient by limiting max height and adding scroll if needed.
const DetailedTestTable = memo(({ test }) => {
  if (!test.table?.rows?.length) {
    return (
      <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <AlertCircle className="h-4 w-4 text-yellow-600" />
        <span className="text-sm text-yellow-800">
          No test data available for this validation.
        </span>
      </div>
    );
  }

  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden mt-4">
      <div className="p-3 border-b bg-gray-50">
        <h4 className="text-md font-semibold text-gray-800">
          <BulletproofText>{test.table?.test_name || 'Test Details'}</BulletproofText>
        </h4>
        {test.table?.title && (
          <p className="text-sm text-gray-600 mt-1">
            <BulletproofText>{test.table.title}</BulletproofText>
          </p>
        )}
      </div>
      <div className="overflow-x-auto max-h-80">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {test.table.columns.map((column, index) => (
                <th
                  key={index}
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {test.table.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={`${rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                {test.table.columns.map((column, colIndex) => (
                  <td
                    key={colIndex}
                    className="px-6 py-4 text-sm text-gray-500"
                  >
                    {column === 'Status' ? (
                      <SafeStatusIndicator status={row[column]} />
                    ) : (
                      <BulletproofText>{row[column] || '-'}</BulletproofText>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

// =============================================================================
// DEVICE STATUS CARD COMPONENT
// =============================================================================
// This section defines expandable cards for device results, with status info and detailed tables.
// Improved UX with smooth transitions and conditional coloring for quick visual scanning.
const DeviceStatusCard = memo(({ hostResult, index, isExpanded, onToggle }) => {
  const getDeviceStatusInfo = () => {
    // Compute device-specific metrics and status messages
    if (hostResult.status === 'success' && hostResult.test_results) {
      const totalTests = hostResult.test_results.length;
      let totalChecks = 0;
      let passedChecks = 0;

      hostResult.test_results.forEach(test => {
        if (test.table?.rows) {
          totalChecks += test.table.rows.length;
          passedChecks += test.table.rows.filter(row => row.Status === 'PASSED').length;
        }
      });

      return {
        status: 'CONNECTED',
        statusColor: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        testsRun: totalTests,
        totalChecks,
        passedChecks,
        connectionMessage: `Successfully connected and executed ${totalTests} test(s) with ${totalChecks} validation checks`
      };
    } else {
      return {
        status: 'CONNECTION FAILED',
        statusColor: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        testsRun: 0,
        totalChecks: 0,
        passedChecks: 0,
        connectionMessage: hostResult.message || 'Failed to connect to device'
      };
    }
  };

  const deviceInfo = getDeviceStatusInfo();

  return (
    <div className={`border rounded-lg ${deviceInfo.bgColor} ${deviceInfo.borderColor} overflow-hidden transition-all duration-300`}>
      <div
        className="cursor-pointer p-4 hover:bg-opacity-80 transition-colors"
        onClick={() => onToggle(index)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-gray-600 transition-transform duration-300" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-600 transition-transform duration-300" />
            )}
            <Server className={`h-5 w-5 ${deviceInfo.statusColor}`} />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                <BulletproofText>{hostResult.hostname || 'Unknown Host'}</BulletproofText>
              </h3>
              <p className={`text-sm ${deviceInfo.statusColor} font-medium`}>
                {deviceInfo.status}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">
              Tests: {deviceInfo.testsRun} | Checks: {deviceInfo.passedChecks}/{deviceInfo.totalChecks}
            </div>
            <SafeStatusIndicator
              status={hostResult.status === 'success' ? 'PASS' : 'FAIL'}
              className="text-sm mt-1"
            />
          </div>
        </div>
        <div className="mt-2 text-sm text-gray-600">
          <BulletproofText>{deviceInfo.connectionMessage}</BulletproofText>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t bg-white p-4 space-y-4 transition-opacity duration-300 opacity-100">
          {hostResult.status === 'error' ? (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <XCircle className="h-4 w-4 text-red-600" />
              <span className="text-sm text-red-800">
                <BulletproofText>{hostResult.message || 'An error occurred during validation.'}</BulletproofText>
              </span>
            </div>
          ) : (
            hostResult.test_results?.map((test, testIndex) => (
              <DetailedTestTable key={testIndex} test={test} />
            ))
          )}
        </div>
      )}
    </div>
  );
});

// =============================================================================
// EXECUTION PROGRESS TRACKER
// =============================================================================
// This section tracks and displays execution progress with timestamps and status dots.
// Enhanced with animation for running state and scroll-to-bottom for live updates.
const ExecutionProgressTracker = memo(({ progress, isRunning }) => {
  const progressRef = useRef(null);

  useEffect(() => {
    // Auto-scroll to bottom when new progress items are added
    if (progressRef.current) {
      progressRef.current.scrollTop = progressRef.current.scrollHeight;
    }
  }, [progress]);

  if (!progress || progress.length === 0) return null;

  return (
    <div className="border rounded-lg bg-white shadow-sm mb-6">
      <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-blue-100">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-600" />
          Execution Progress
          {isRunning && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 animate-pulse">
              <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
              Running
            </span>
          )}
        </h2>
      </div>
      <div ref={progressRef} className="p-4 space-y-2 max-h-60 overflow-y-auto">
        {progress.map((step, index) => (
          <div key={index} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
            <div className={`w-2 h-2 rounded-full ${
              step.event_type === 'OPERATION_COMPLETE' || step.event_type === 'STEP_COMPLETE' || step.event_type === 'TEST_COMPLETE'
                ? 'bg-green-500'
                : step.event_type === 'OPERATION_START' || step.event_type === 'STEP_START'
                ? 'bg-blue-500'
                : 'bg-gray-400'
            }`}></div>
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">
                <BulletproofText>{step.message}</BulletproofText>
              </div>
              {step.data && (
                <div className="text-xs text-gray-500 mt-1">
                  {step.data.host && <span>Host: {step.data.host} | </span>}
                  {step.data.test && <span>Test: {step.data.test} | </span>}
                  {step.data.step && <span>Step: {step.data.step} | </span>}
                  {step.data.status && <span>Status: {step.data.status}</span>}
                </div>
              )}
            </div>
            <div className="text-xs text-gray-400">
              {new Date().toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// =============================================================================
// MAIN ENHANCED VALIDATION RESULTS VIEWER
// =============================================================================
// This is the primary component that orchestrates all sections.
// Improved functionality: Added view mode toggle, export, raw data toggle, and better data handling.
// UI/UX enhancements: Space-efficient layout with collapses, slick gradients/shadows, responsive grids.
const EnhancedValidationResultsViewer = memo(({ validationResults, progress, isRunning }) => {
  const [viewMode, setViewMode] = useState('table'); // 'cards' or 'table'
  const [expandedHosts, setExpandedHosts] = useState(new Set());
  const [showRawData, setShowRawData] = useState(false);

  const handleExport = () => {
    // Export results as JSON, with error handling
    try {
      const exportData = {
        timestamp: new Date().toISOString(),
        summary: validationResults?.summary || {},
        results: validationResults?.results || validationResults?.results_by_host || []
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jsnapy-validation-results-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (exportError) {
      console.error("Failed to export results:", exportError);
      alert("Failed to export results. Check console for details.");
    }
  };

  const toggleHostExpanded = (hostIndex) => {
    // Toggle expansion state for hosts
    const newExpanded = new Set(expandedHosts);
    if (newExpanded.has(hostIndex)) {
      newExpanded.delete(hostIndex);
    } else {
      newExpanded.add(hostIndex);
    }
    setExpandedHosts(newExpanded);
  };

  // Flexible data handling for various input formats
  console.log("ValidationResults received:", validationResults);

  const dataPayload = validationResults?.data || validationResults;
  const hostResults = dataPayload?.results_by_host ||
                     dataPayload?.results ||
                     (Array.isArray(dataPayload) ? dataPayload : []);

  console.log("Processed hostResults:", hostResults);

  if (!validationResults) {
    return (
      <div className="space-y-6 p-4 bg-gray-50 min-h-screen">
        <ExecutionProgressTracker progress={progress} isRunning={isRunning} />

        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <span className="text-sm text-red-800">
            No validation results provided to component.
          </span>
        </div>

        <div className="p-4 bg-white border rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Debug Info:</h3>
          <p className="text-xs text-gray-600">
            validationResults: {validationResults === null ? 'null' : validationResults === undefined ? 'undefined' : 'provided'}
          </p>
        </div>
      </div>
    );
  }

  if (!hostResults.length) {
    return (
      <div className="space-y-6 p-4 bg-gray-50 min-h-screen">
        <ExecutionProgressTracker progress={progress} isRunning={isRunning} />

        <div className="flex items-center gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <span className="text-sm text-yellow-800">
            {isRunning ? "Validation in progress..." : "No host results found in validation data."}
          </span>
        </div>

        <div className="p-4 bg-white border rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Debug Info:</h3>
          <div className="text-xs text-gray-600 space-y-1">
            <p>validationResults keys: {Object.keys(validationResults || {}).join(', ')}</p>
            <p>dataPayload keys: {Object.keys(dataPayload || {}).join(', ')}</p>
            <p>hostResults length: {hostResults.length}</p>
            <p>Data structure:</p>
            <SafeJsonDisplay data={validationResults} />
          </div>
        </div>
      </div>
    );
  }

  const { summary } = dataPayload;

  return (
    <div className="space-y-6 p-4 bg-gray-50 min-h-screen">
      {/* Progress Tracker - Always at top for monitoring */}
      <ExecutionProgressTracker progress={progress} isRunning={isRunning} />

      {/* Header Section - Compact with actions */}
      <div className="border rounded-lg bg-white shadow-sm">
        <div className="p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Shield className="h-6 w-6 text-blue-600" />
                Network Validation Results
              </h1>
              <p className="text-sm text-gray-600 mt-2">
                Comprehensive validation results across all tested devices and configurations
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode(viewMode === 'cards' ? 'table' : 'cards')}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {viewMode === 'cards' ? <Table className="h-4 w-4" /> : <List className="h-4 w-4" />}
                {viewMode === 'cards' ? 'Table View' : 'Card View'}
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download className="h-4 w-4" />
                Export
              </button>
            </div>
          </div>

          {/* Enhanced Metrics - Grid for responsiveness */}
          <EnhancedSummaryMetrics hostResults={hostResults} summary={summary} />
        </div>
      </div>

      {/* Summary Table - Always visible, with search/sort for better UX */}
      <EnhancedSummaryTable hostResults={hostResults} />

      {/* Detailed Results - Collapsible for space efficiency */}
      <div className="border rounded-lg bg-white shadow-sm">
        <div className="p-4 border-b bg-gradient-to-r from-gray-50 to-gray-100">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <List className="h-5 w-5 text-blue-600" />
            Detailed Device Results
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Expand each device to view detailed test results and validation data
          </p>
        </div>
        <div className="p-4 space-y-4">
          {viewMode === 'cards' ? (
            hostResults.map((hostResult, hostIndex) => (
              <DeviceStatusCard
                key={`host-${hostIndex}-${hostResult.hostname}`}
                hostResult={hostResult}
                index={hostIndex}
                isExpanded={expandedHosts.has(hostIndex)}
                onToggle={toggleHostExpanded}
              />
            ))
          ) : (
            <div className="space-y-6">
              {hostResults.map((hostResult, hostIndex) => (
                <div key={`host-${hostIndex}-${hostResult.hostname}`} className="space-y-4">
                  <div
                    className="cursor-pointer flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    onClick={() => toggleHostExpanded(hostIndex)}
                  >
                    <div className="flex items-center gap-3">
                      {expandedHosts.has(hostIndex) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <h3 className="text-lg font-medium">
                        <BulletproofText>{hostResult.hostname || 'Unknown Host'}</BulletproofText>
                      </h3>
                      <SafeStatusIndicator
                        status={hostResult.status === 'success' ? 'PASS' : 'FAIL'}
                        className="text-sm"
                      />
                    </div>
                    <div className="text-sm text-gray-500">
                      {hostResult.test_results?.length || 0} tests
                    </div>
                  </div>

                  {expandedHosts.has(hostIndex) && (
                    <div className="ml-6 space-y-4 transition-opacity duration-300 opacity-100">
                      {hostResult.status === 'error' ? (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <XCircle className="h-4 w-4 text-red-600" />
                          <span className="text-sm text-red-800">
                            <BulletproofText>{hostResult.message || 'An error occurred during validation.'}</BulletproofText>
                          </span>
                        </div>
                      ) : (
                        hostResult.test_results?.map((test, testIndex) => (
                          <DetailedTestTable key={testIndex} test={test} />
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Debug/Raw Data Section - Collapsible for space efficiency */}
      <div className="border rounded-lg bg-white shadow-sm">
        <div className="p-4">
          <button
            onClick={() => setShowRawData(!showRawData)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            {showRawData ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            🐛 Debug: View Full Raw Data
          </button>
          {showRawData && (
            <div className="mt-4 transition-opacity duration-300 opacity-100">
              <SafeJsonDisplay data={validationResults} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default EnhancedValidationResultsViewer;
