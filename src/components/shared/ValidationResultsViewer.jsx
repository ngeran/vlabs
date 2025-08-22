/**
 * @fileoverview Enhanced ValidationResultsViewer - Network Validation Results Display Component
 *
 * @description
 * This component provides a comprehensive, enterprise-grade viewer for network validation results
 * from JSNAPy tests. It displays summary metrics, execution summaries, detailed device results,
 * and progress tracking in a modern, space-efficient responsive UI. The component includes
 * schema-based table formatting that matches the Python run.py output format, providing
 * consistent data presentation across different interfaces.
 *
 * The viewer intelligently applies table schemas based on test types, automatically formatting
 * data according to predefined column mappings, aggregation rules, and result computation logic.
 * This ensures that network engineers see data in familiar, standardized formats regardless
 * of whether they're using the Python CLI or the React web interface.
 *
 * @keyFeatures
 * - Schema-based table formatting matching Python CLI output format
 * - Interactive summary metrics dashboard with device and test success rates
 * - Comprehensive summary table with sorting and filtering capabilities
 * - Space-efficient detailed expandable device cards or table views for test results
 * - Real-time execution progress tracker with status indicators
 * - Export functionality for results in JSON format
 * - Advanced filtering options (status-based, search)
 * - Responsive design with maximum space utilization and collapsible sections
 * - Modern UI with gradients, shadows, subtle animations, and contextual icons
 * - Robust error handling with safe rendering components
 * - Debug mode for raw JSON data viewing and troubleshooting
 * - Backward compatibility with non-schema test formats
 * - Compact view modes for dense data display
 * - Full-height viewport utilization with scrollable sections
 *
 * @dependencies
 * - React (v16.8+ recommended for hooks support)
 * - lucide-react: Icon library for UI elements (CheckCircle2, XCircle, AlertCircle, etc.)
 * - Tailwind CSS: Utility-first CSS framework for styling
 * - Browser APIs: Blob and URL.createObjectURL for data export functionality
 *
 * @howToGuide
 * 1. Import: import ValidationResultsViewer from './ValidationResultsViewer';
 * 2. Basic Usage:
 *    <ValidationResultsViewer
 *      validationResults={resultsData}
 *      progress={progressArray}
 *      isRunning={false}
 *    />
 * 3. Data Structure Expected:
 *    validationResults: {
 *      summary: { total_hosts, passed_hosts, total_tests, mode, etc. },
 *      results_by_host: [{
 *        hostname: string,
 *        status: 'success' | 'error',
 *        test_results: [{
 *          table: { columns: string[], rows: object[], test_name: string, title: string },
 *          raw: [{ test_results: object, device: string }]
 *        }]
 *      }]
 *    }
 * 4. Schema Configuration: Extend the schemas object in SchemaBasedTableFormatter to add support
 *    for additional test types from your table_schemas.yml file
 * 5. Customization: Override Tailwind classes or extend the schema formatting logic
 * 6. Error Handling: Component gracefully handles missing/invalid data with user-friendly messages
 * 7. Export: Click export button to download results as JSON file with timestamp
 * 8. Space Efficiency: Component automatically adjusts to viewport height and provides compact modes
 *
 * @author Network Validation Team
 * @version 2.1.0
 * @since 2024-01-01
 */

import React, { memo, useState, useRef, useEffect } from "react";
import {
  CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronRight, ChevronUp,
  Download, Filter, Search, BarChart3, Table, List, Activity,
  Server, Shield, Clock, Maximize2, Minimize2
} from "lucide-react";

// =============================================================================
// SECTION 1: SCHEMA-BASED TABLE FORMATTING ENGINE
//
// Purpose: Implements the core schema-based formatting logic that mirrors
// the Python run.py table formatting. This section ensures consistent output
// format between CLI and web interfaces by applying predefined schemas to
// raw JSNAPy test data.
//
// Components:
// - Schema definitions converted from table_schemas.yml
// - Data processing functions for nested value extraction
// - Result computation rules and aggregation logic
// - Table formatting with sorting and filtering support
// =============================================================================

const SchemaBasedTableFormatter = {
  /**
   * Schema definitions converted from table_schemas.yml
   * Each schema defines how to format raw JSNAPy test data into structured tables
   * with consistent columns, aggregation rules, and result computation logic
   */
  schemas: {
    // Interface descriptions schema - formats interface admin/oper status and descriptions
    test_interface_descriptions: {
      entity_key: ["name"],
      columns: [
        { name: "Interface", sources: ["name"], aggregate: "first" },
        { name: "Admin", sources: ["admin-status"], aggregate: "last" },
        { name: "Oper", sources: ["oper-status"], aggregate: "last" },
        { name: "Description", sources: ["description"], aggregate: "last" },
        { name: "Result", sources: [] }
      ],
      result_rules: {
        fail_on_bucket_failed: true
      },
      sort: {
        failed_first: true,
        keys: ["Interface"]
      }
    },

    // Interface errors schema - formats interface error statistics and counters
    test_interface_errors: {
      entity_key: ["name"],
      columns: [
        { name: "Interface", sources: ["name"], aggregate: "first" },
        { name: "Admin", sources: ["admin-status"], aggregate: "last" },
        { name: "Oper", sources: ["oper-status"], aggregate: "last" },
        { name: "Input Errors", sources: ["input-error-list/input-errors"], aggregate: "last" },
        { name: "Input Drops", sources: ["input-error-list/input-drops"], aggregate: "last" },
        { name: "Input Discards", sources: ["input-error-list/input-discards"], aggregate: "last" },
        { name: "Output Errors", sources: ["output-error-list/output-errors"], aggregate: "last" },
        { name: "Output Drops", sources: ["output-error-list/output-drops"], aggregate: "last" },
        { name: "Carrier Transitions", sources: ["output-error-list/carrier-transitions"], aggregate: "last" },
        { name: "Result", sources: [] }
      ],
      result_rules: {
        fail_on_bucket_failed: true,
        fail_if_any_gt: [
          { column: "Input Errors", threshold: 0 },
          { column: "Input Drops", threshold: 0 },
          { column: "Input Discards", threshold: 0 },
          { column: "Output Errors", threshold: 0 },
          { column: "Output Drops", threshold: 0 }
        ]
      },
      sort: {
        failed_first: true,
        keys: ["Interface"]
      }
    },

    // OSPF neighbors schema - formats OSPF neighbor relationships and states
    test_ospf_neighbors: {
      entity_key: ["interface-name", "neighbor-address"],
      columns: [
        { name: "Interface", sources: ["interface-name"], aggregate: "first" },
        { name: "Neighbor Address", sources: ["neighbor-address"], aggregate: "first" },
        { name: "Neighbor ID", sources: ["neighbor-id"], aggregate: "first" },
        { name: "State", sources: ["ospf-neighbor-state"], aggregate: "last" },
        { name: "Priority", sources: ["neighbor-priority"], aggregate: "last" },
        { name: "DeadTimer", sources: ["activity-timer"], aggregate: "last" },
        { name: "Result", sources: [] }
      ],
      result_rules: {
        fail_on_bucket_failed: true,
        fail_if_ne: [
          { column: "State", value: "Full" }
        ]
      },
      sort: {
        failed_first: true,
        keys: ["Interface", "Neighbor Address"]
      }
    },

    // OSPF interfaces schema - formats OSPF interface states and area information
    test_ospf_interfaces: {
      entity_key: ["interface-name"],
      columns: [
        { name: "Interface", sources: ["interface-name"], aggregate: "first" },
        { name: "State", sources: ["ospf-interface-state"], aggregate: "last" },
        { name: "Area", sources: ["ospf-area"], aggregate: "last" },
        { name: "DR", sources: ["dr-id"], aggregate: "last" },
        { name: "BDR", sources: ["bdr-id"], aggregate: "last" },
        { name: "Neighbors", sources: ["neighbor-count"], aggregate: "last" },
        { name: "Result", sources: [] }
      ],
      result_rules: {
        fail_on_bucket_failed: true
      },
      sort: {
        failed_first: true,
        keys: ["Interface"]
      }
    },

    // BGP neighbors schema - formats BGP peer relationships and states
    test_bgp_neighbors: {
      entity_key: ["peer-address"],
      columns: [
        { name: "Peer Address", sources: ["peer-address"], aggregate: "first" },
        { name: "Peer AS", sources: ["peer-as"], aggregate: "first" },
        { name: "State", sources: ["peer-state"], aggregate: "last" },
        { name: "Active/Received", sources: ["bgp-rib/active-prefix-count", "bgp-rib/received-prefix-count"], aggregate: "last" },
        { name: "Accepted/Damped", sources: ["bgp-rib/accepted-prefix-count", "bgp-rib/suppressed-prefix-count"], aggregate: "last" },
        { name: "Result", sources: [] }
      ],
      result_rules: {
        fail_on_bucket_failed: true,
        fail_if_ne: [
          { column: "State", value: "Established" }
        ]
      },
      sort: {
        failed_first: true,
        keys: ["Peer Address"]
      }
    },

    // BFD sessions schema - formats BFD session states and timers
    test_bfd_sessions: {
      entity_key: ["session-interface", "session-neighbor"],
      columns: [
        { name: "Interface", sources: ["session-interface"], aggregate: "first" },
        { name: "Neighbor", sources: ["session-neighbor"], aggregate: "first" },
        { name: "State", sources: ["session-state"], aggregate: "last" },
        { name: "Detect", sources: ["session-detection-time", "detection-time"], aggregate: "last" },
        { name: "TX", sources: ["session-transmission-interval", "transmission-interval"], aggregate: "last" },
        { name: "Multiplier", sources: ["session-adaptive-multiplier", "detect-multiplier"], aggregate: "last" },
        { name: "Result", sources: [] }
      ],
      result_rules: {
        fail_on_bucket_failed: true,
        fail_if_ne: [
          { column: "State", value: "Up" }
        ]
      },
      sort: {
        failed_first: true,
        keys: ["Interface", "Neighbor"]
      }
    }
  },

  /**
   * Safely retrieves nested object values using dot/slash notation paths
   * Handles complex nested structures commonly found in network device data
   * @param {Object} obj - Source object to traverse
   * @param {string} path - Path string like "input-error-list/input-errors"
   * @returns {*} - Value at path or null if not found
   */
  getNestedValue: (obj, path) => {
    if (!path || !obj) return null;
    return path.split('/').reduce((current, key) => {
      if (current && typeof current === 'object' && key in current) {
        return current[key];
      }
      return null;
    }, obj);
  },

  /**
   * Applies schema-based formatting to raw test data, converting unstructured
   * JSNAPy results into consistent tabular format matching Python CLI output
   * @param {Object} testData - Raw test data with table and raw properties
   * @param {Object} hostResult - Host result containing hostname and device info
   * @returns {Object|null} - Formatted table data with headers and rows, or null if no schema
   */
  formatWithSchema: (testData, hostResult) => {
    // Validate input data structure
    if (!testData.raw || !Array.isArray(testData.raw)) {
      return null; // Cannot apply schema formatting without raw data
    }

    const testName = testData.table?.test_name;
    const schema = SchemaBasedTableFormatter.schemas[testName];

    if (!schema) {
      return null; // No schema available for this test type
    }

    // Initialize data aggregation structures
    const entities = new Map();
    const hostname = hostResult.hostname || 'Unknown';

    // Process all raw test data items
    testData.raw.forEach(rawItem => {
      const testResults = rawItem.test_results || {};
      const device = rawItem.device || hostname;

      // Process each command's results within the test
      Object.entries(testResults).forEach(([command, commandResults]) => {
        if (!Array.isArray(commandResults)) return;

        commandResults.forEach(testResultData => {
          // Process both passed and failed items from JSNAPy results
          ['passed', 'failed'].forEach(bucket => {
            (testResultData[bucket] || []).forEach(item => {
              const pre = item.pre || {};
              const post = item.post || {};
              const combined = { ...pre, ...post }; // Merge pre/post snapshots

              // Generate unique entity key for grouping related data
              const entityKeyValues = schema.entity_key.map(keyPath =>
                SchemaBasedTableFormatter.getNestedValue(combined, keyPath) || ''
              );
              const entityKey = entityKeyValues.join('|');

              // Initialize entity if not exists
              if (!entities.has(entityKey)) {
                entities.set(entityKey, {
                  Host: hostname,
                  Device: device,
                  data: {},
                  bucket: bucket,
                  message: item.message || item.err || ''
                });
              }

              const entity = entities.get(entityKey);

              // Update entity status - failed takes precedence
              if (bucket === 'failed') {
                entity.bucket = 'failed';
                entity.message = item.message || item.err || entity.message;
              }

              // Extract and aggregate column values according to schema
              schema.columns.forEach(column => {
                if (column.sources && column.sources.length > 0) {
                  column.sources.forEach(sourcePath => {
                    const value = SchemaBasedTableFormatter.getNestedValue(combined, sourcePath);
                    if (value !== null && value !== undefined) {
                      // Apply aggregation strategy
                      if (column.aggregate === 'first' && !entity.data[column.name]) {
                        entity.data[column.name] = value;
                      } else if (column.aggregate === 'last') {
                        entity.data[column.name] = value;
                      }
                      // Additional aggregation types can be added here
                    }
                  });
                }
              });
            });
          });
        });
      });
    });

    // Convert aggregated entities to table rows and apply result computation
    const rows = Array.from(entities.values()).map(entity => {
      const row = {
        Host: entity.Host,
        Device: entity.Device,
        ...entity.data
      };

      // Compute result status based on schema rules
      let result = entity.bucket === 'failed' ? 'FAILED' : 'PASSED';

      if (schema.result_rules) {
        // Apply various failure condition rules
        if (schema.result_rules.fail_if_ne) {
          schema.result_rules.fail_if_ne.forEach(rule => {
            if (row[rule.column] && row[rule.column] !== rule.value) {
              result = 'FAILED';
            }
          });
        }

        if (schema.result_rules.fail_if_any_gt) {
          schema.result_rules.fail_if_any_gt.forEach(rule => {
            const value = parseFloat(row[rule.column]) || 0;
            if (value > rule.threshold) {
              result = 'FAILED';
            }
          });
        }

        if (schema.result_rules.fail_if_equals) {
          schema.result_rules.fail_if_equals.forEach(rule => {
            if (row[rule.column] === rule.value) {
              result = 'FAILED';
            }
          });
        }
      }

      row.Result = result;
      if (entity.message) {
        row.Message = entity.message;
      }

      return row;
    });

    // Apply schema-defined sorting rules for consistent output
    if (schema.sort) {
      rows.sort((a, b) => {
        // Apply failed-first sorting if specified
        if (schema.sort.failed_first) {
          if (a.Result === 'FAILED' && b.Result !== 'FAILED') return -1;
          if (a.Result !== 'FAILED' && b.Result === 'FAILED') return 1;
        }

        // Sort by specified keys in order
        for (const key of schema.sort.keys) {
          const aVal = String(a[key] || '');
          const bVal = String(b[key] || '');
          if (aVal < bVal) return -1;
          if (aVal > bVal) return 1;
        }
        return 0;
      });
    }

    // Generate column headers in proper order
    const headers = ['Host', 'Device'];
    schema.columns.forEach(col => {
      if (col.name !== 'Result') {
        headers.push(col.name);
      }
    });
    headers.push('Result');

    // Add Message column if any row has messages
    if (rows.some(row => row.Message)) {
      headers.push('Message');
    }

    return { headers, rows };
  }
};

// =============================================================================
// SECTION 2: SAFE RENDERING UTILITY COMPONENTS
//
// Purpose: Provides bulletproof rendering components that prevent crashes from
// invalid data and maintain consistent visual elements. These components handle
// null/undefined values gracefully and provide fallback displays for error states.
//
// Components:
// - BulletproofText: Safe text rendering with null handling
// - SafeStatusIndicator: Consistent status badge rendering
// - SafeJsonDisplay: Error-safe JSON data display
// - CompactStatusBadge: Space-efficient status indicators
// =============================================================================

/**
 * Safely renders text content, replacing null/undefined with dash placeholder
 * Prevents React rendering errors from invalid data types
 */
const BulletproofText = memo(({ children, className = "" }) => {
  if (children === null || children === undefined) {
    return <span className={className}>-</span>;
  }

  const text = String(children);
  return <span className={className}>{text}</span>;
});

/**
 * Renders status indicators with consistent color coding and icons
 * Maps various status strings to standardized visual representations
 */
const SafeStatusIndicator = memo(({ status, className = "", compact = false }) => {
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

  const baseClasses = compact
    ? `inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${config.color} ${config.bg} ${config.border} border`
    : `inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color} ${config.bg} ${config.border} border`;

  return (
    <span className={`${baseClasses} ${className}`}>
      <Icon className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {status}
    </span>
  );
});

/**
 * Space-efficient compact status badge for dense layouts
 */
const CompactStatusBadge = memo(({ status, className = "" }) => {
  const statusConfig = {
    'PASSED': { color: 'bg-green-500', text: 'P' },
    'PASS': { color: 'bg-green-500', text: 'P' },
    'FAILED': { color: 'bg-red-500', text: 'F' },
    'FAIL': { color: 'bg-red-500', text: 'F' },
    'ERROR': { color: 'bg-orange-500', text: 'E' },
    'SUCCESS': { color: 'bg-green-500', text: 'S' }
  };

  const config = statusConfig[status] || statusConfig['ERROR'];

  return (
    <span
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-xs font-bold ${config.color} ${className}`}
      title={status}
    >
      {config.text}
    </span>
  );
});

/**
 * Safely displays JSON data with error handling and formatted output
 * Provides fallback display for malformed data objects
 */
const SafeJsonDisplay = memo(({ data }) => {
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
        <span className="text-sm text-red-800">Unable to display data: {error.message}</span>
      </div>
    );
  }
});

// =============================================================================
// SECTION 3: SPACE-EFFICIENT SUMMARY METRICS DASHBOARD
//
// Purpose: Computes and displays key performance indicators in a compact,
// space-efficient layout. Provides dashboard-style overview with visual cards
// showing device success rates, test pass rates, and system health metrics.
//
// Features:
// - Compact metric cards with color-coded indicators
// - Responsive grid layout that adapts to screen size
// - Hover effects and smooth transitions
// - Essential metrics prioritized for space efficiency
// =============================================================================

const CompactSummaryMetrics = memo(({ hostResults, summary }) => {
  const [metrics, setMetrics] = useState({});

  useEffect(() => {
    // Calculate comprehensive metrics from host results data
    let totalDevicesTested = hostResults.length;
    let successfulDevices = 0;
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let connectionFailures = 0;

    hostResults.forEach((hostResult) => {
      if (hostResult.status === 'success' && hostResult.test_results) {
        successfulDevices++;

        // Aggregate test results across all test types for this host
        hostResult.test_results.forEach((testResult) => {
          if (testResult.table?.rows) {
            totalTests += testResult.table.rows.length;
            totalPassed += testResult.table.rows.filter(row =>
              row.Status === 'PASSED' || row.Result === 'PASSED'
            ).length;
            totalFailed += testResult.table.rows.filter(row =>
              row.Status === 'FAILED' || row.Result === 'FAILED'
            ).length;
          }
        });
      } else {
        connectionFailures++;
      }
    });

    // Calculate percentage rates with safe division
    const deviceSuccessRate = totalDevicesTested > 0
      ? Math.round((successfulDevices / totalDevicesTested) * 100)
      : 0;
    const testSuccessRate = totalTests > 0
      ? Math.round((totalPassed / totalTests) * 100)
      : 0;

    setMetrics({
      totalDevicesTested,
      successfulDevices,
      connectionFailures,
      deviceSuccessRate,
      totalTests,
      totalPassed,
      totalFailed,
      testSuccessRate
    });
  }, [hostResults, summary]);

  return (
    <div className="grid grid-cols-4 lg:grid-cols-6 gap-3">
      {/* Essential metrics in compact format */}
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-3 rounded-lg border border-blue-200 hover:shadow-md transition-all duration-200">
        <div className="flex items-center gap-1.5 mb-1">
          <Server className="h-3.5 w-3.5 text-blue-600" />
          <span className="text-xs font-medium text-blue-700">DEVICES</span>
        </div>
        <div className="text-xl font-bold text-blue-800">{metrics.totalDevicesTested}</div>
        <div className="text-xs text-blue-600">Total</div>
      </div>

      <div className="bg-gradient-to-br from-green-50 to-green-100 p-3 rounded-lg border border-green-200 hover:shadow-md transition-all duration-200">
        <div className="flex items-center gap-1.5 mb-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          <span className="text-xs font-medium text-green-700">SUCCESS</span>
        </div>
        <div className="text-xl font-bold text-green-800">{metrics.deviceSuccessRate}%</div>
        <div className="text-xs text-green-600">Connected</div>
      </div>

      <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-3 rounded-lg border border-indigo-200 hover:shadow-md transition-all duration-200">
        <div className="flex items-center gap-1.5 mb-1">
          <Shield className="h-3.5 w-3.5 text-indigo-600" />
          <span className="text-xs font-medium text-indigo-700">TESTS</span>
        </div>
        <div className="text-xl font-bold text-indigo-800">{metrics.totalTests}</div>
        <div className="text-xs text-indigo-600">Checks</div>
      </div>

      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-3 rounded-lg border border-emerald-200 hover:shadow-md transition-all duration-200">
        <div className="flex items-center gap-1.5 mb-1">
          <BarChart3 className="h-3.5 w-3.5 text-emerald-600" />
          <span className="text-xs font-medium text-emerald-700">PASS</span>
        </div>
        <div className="text-xl font-bold text-emerald-800">{metrics.testSuccessRate}%</div>
        <div className="text-xs text-emerald-600">Rate</div>
      </div>

      <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-3 rounded-lg border border-purple-200 hover:shadow-md transition-all duration-200">
        <div className="flex items-center gap-1.5 mb-1">
          <Activity className="h-3.5 w-3.5 text-purple-600" />
          <span className="text-xs font-medium text-purple-700">PASSED</span>
        </div>
        <div className="text-xl font-bold text-purple-800">{metrics.totalPassed}</div>
        <div className="text-xs text-purple-600">Count</div>
      </div>

      <div className="bg-gradient-to-br from-red-50 to-red-100 p-3 rounded-lg border border-red-200 hover:shadow-md transition-all duration-200">
        <div className="flex items-center gap-1.5 mb-1">
          <XCircle className="h-3.5 w-3.5 text-red-600" />
          <span className="text-xs font-medium text-red-700">FAILED</span>
        </div>
        <div className="text-xl font-bold text-red-800">{metrics.totalFailed}</div>
        <div className="text-xs text-red-600">Count</div>
      </div>
    </div>
  );
});

// =============================================================================
// SECTION 4: COMPACT SUMMARY TABLE COMPONENT
//
// Purpose: Creates a space-efficient sortable, filterable summary table showing
// all tests across devices. Optimized for maximum information density while
// maintaining readability and providing quick identification of test execution
// status across the infrastructure.
//
// Features:
// - Compact row height and column spacing
// - Inline search and filter controls
// - Sortable columns with visual indicators
// - Status badges and connection state display
// - Responsive design with horizontal scrolling
// =============================================================================

const CompactSummaryTable = memo(({ hostResults }) => {
  const [tableData, setTableData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'host', direction: 'asc' });

  useEffect(() => {
    // Process host results into flat summary table format
    const data = [];

    hostResults.forEach((hostResult) => {
      if (hostResult.status === 'success' && hostResult.test_results) {
        // Add entry for each test executed on this host
        hostResult.test_results.forEach((testResult) => {
          data.push({
            host: hostResult.hostname,
            test: testResult.table?.test_name || 'Unknown Test',
            testTitle: testResult.table?.title || '',
            connectionStatus: 'CONNECTED'
          });
        });
      } else {
        // Add entry for failed connection
        data.push({
          host: hostResult.hostname,
          test: 'CONNECTION',
          testTitle: 'Device Connection Test',
          connectionStatus: 'FAILED'
        });
      }
    });

    setTableData(data);
  }, [hostResults]);

  // Apply search filtering across host and test names
  const filteredData = tableData.filter(row =>
    row.host.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.test.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Apply sorting based on user selection
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
      {/* Compact table header with search and filter controls */}
      <div className="p-3 border-b bg-gradient-to-r from-gray-50 to-gray-100 flex justify-between items-center">
        <div>
          <h3 className="text-md font-semibold flex items-center gap-2">
            <Table className="h-4 w-4 text-blue-600" />
            Test Summary
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-3 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-32"
            />
          </div>
          <Filter className="h-4 w-4 text-gray-500 cursor-pointer hover:text-blue-600" />
        </div>
      </div>

      {/* Compact scrollable table content */}
      <div className="overflow-x-auto max-h-64">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th onClick={() => requestSort('host')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Device {sortConfig.key === 'host' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => requestSort('connectionStatus')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Status {sortConfig.key === 'connectionStatus' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => requestSort('test')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Test {sortConfig.key === 'test' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedData.map((row, index) => (
              <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                  <div className="flex items-center gap-1.5">
                    <Server className="h-3 w-3 text-gray-500" />
                    <BulletproofText>{row.host}</BulletproofText>
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-sm">
                  <CompactStatusBadge status={row.connectionStatus} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 font-medium">
                  <BulletproofText>{row.test}</BulletproofText>
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
// SECTION 5: SPACE-EFFICIENT DETAILED TEST TABLE WITH SCHEMA SUPPORT
//
// Purpose: Implements the core detailed test result display with schema-based
// formatting in a compact, space-efficient layout. Intelligently applies table
// schemas when available and falls back to generic formatting. Optimized for
// maximum information density while maintaining readability.
//
// Features:
// - Compact table layout with reduced padding and font sizes
// - Schema-based formatting matching Python CLI output
// - Collapsible sections and inline filtering
// - Dense data display with hover-based details
// - Responsive design with horizontal scrolling
// - Debug mode toggle for troubleshooting
// =============================================================================

const CompactDetailedTestTable = memo(({ test, hostResult }) => {
  const [showRawData, setShowRawData] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  // Attempt schema-based formatting first
  const schemaFormatted = SchemaBasedTableFormatter.formatWithSchema(test, hostResult);

  // Handle case where no test data is available
  if (!test.table?.rows?.length && !schemaFormatted) {
    return (
      <div className="flex items-center gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
        <AlertCircle className="h-3 w-3 text-yellow-600 flex-shrink-0" />
        <span className="text-yellow-800">No test data available</span>
      </div>
    );
  }

  // Use schema-formatted data if available, otherwise fall back to original format
  const tableData = schemaFormatted || {
    headers: test.table.columns || [],
    rows: test.table.rows || []
  };

  // Apply status-based filtering
  const filteredRows = filterStatus === 'all'
    ? tableData.rows
    : tableData.rows.filter(row => {
        if (filterStatus === 'failed') return row.Result === 'FAILED' || row.Status === 'FAILED';
        if (filterStatus === 'passed') return row.Result === 'PASSED' || row.Status === 'PASSED';
        return true;
      });

  // Calculate status counts for filter labels
  const statusCounts = {
    total: tableData.rows.length,
    failed: tableData.rows.filter(r => r.Result === 'FAILED' || r.Status === 'FAILED').length,
    passed: tableData.rows.filter(r => r.Result === 'PASSED' || r.Status === 'PASSED').length
  };

  return (
    <div className="border rounded bg-white shadow-sm overflow-hidden">
      {/* Compact test header with metadata and controls */}
      <div className="p-2 border-b bg-gray-50 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
            <BulletproofText>{test.table?.test_name || 'Test Details'}</BulletproofText>
            {schemaFormatted && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                Schema
              </span>
            )}
          </h4>
        </div>

        {/* Compact control panel */}
        <div className="flex items-center gap-1.5">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs border rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All ({statusCounts.total})</option>
            <option value="failed">Failed ({statusCounts.failed})</option>
            <option value="passed">Passed ({statusCounts.passed})</option>
          </select>

          <button
            onClick={() => setShowRawData(!showRawData)}
            className="text-xs text-gray-600 hover:text-gray-800 flex items-center gap-1 px-1.5 py-1 rounded hover:bg-gray-100 transition-colors"
          >
            {showRawData ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
            Debug
          </button>
        </div>
      </div>

      {/* Compact main data table */}
      <div className="overflow-x-auto max-h-60">
        <table className="min-w-full border-collapse text-xs">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              {tableData.headers.map((header, index) => (
                <th
                  key={index}
                  scope="col"
                  className="border border-gray-300 px-2 py-1.5 text-left text-xs font-bold text-gray-700 uppercase tracking-wider bg-gray-200"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {filteredRows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-50 transition-colors">
                {tableData.headers.map((header, colIndex) => (
                  <td key={colIndex} className="border border-gray-300 px-2 py-1.5 text-xs">
                    {(header === 'Status' || header === 'Result') ? (
                      <CompactStatusBadge status={row[header] || 'UNKNOWN'} />
                    ) : (header === 'Description' || header === 'Message') ? (
                      <div className="text-gray-700 max-w-xs font-mono truncate" title={row[header]}>
                        <BulletproofText>{row[header] || '-'}</BulletproofText>
                      </div>
                    ) : (header === 'Interface' || header === 'Check' || header === 'Host' || header === 'Device') ? (
                      <div className="text-gray-900 font-medium">
                        <BulletproofText>{row[header] || '-'}</BulletproofText>
                      </div>
                    ) : (
                      <div className="text-gray-600">
                        <BulletproofText>{row[header] || ''}</BulletproofText>
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Raw data debug section - collapsible */}
      {showRawData && (
        <div className="border-t p-2 bg-gray-50">
          <h5 className="text-xs font-medium text-gray-700 mb-1">Raw Test Data:</h5>
          <div className="max-h-32 overflow-auto">
            <SafeJsonDisplay data={test} />
          </div>
        </div>
      )}

      {/* Compact status summary footer */}
      <div className="border-t bg-gray-50 px-2 py-1">
        <div className="flex justify-between items-center text-xs text-gray-600">
          <span>
            {filteredRows.length} of {statusCounts.total} results
          </span>
          <span className="flex items-center gap-1">
            {schemaFormatted && (
              <span className="inline-flex items-center px-1 py-0.5 rounded text-xs bg-blue-100 text-blue-800">
                Schema
              </span>
            )}
            <span>
              {statusCounts.failed > 0 ? `${statusCounts.failed}F ` : ''}
              {statusCounts.passed}P
            </span>
          </span>
        </div>
      </div>
    </div>
  );
});

// =============================================================================
// SECTION 6: COMPACT DEVICE STATUS CARD COMPONENT
//
// Purpose: Defines space-efficient expandable cards for individual device results.
// Each card shows device connection status, test summary metrics, and expandable
// detailed test results in a compact format optimized for screen space utilization.
//
// Features:
// - Compact card layout with reduced padding
// - Inline metrics display with space-efficient badges
// - Smooth expand/collapse animations
// - Visual status indicators and connection state
// - Optimized for both mobile and desktop viewing
// - Quick status identification through color coding
// =============================================================================

const CompactDeviceStatusCard = memo(({ hostResult, index, isExpanded, onToggle }) => {
  /**
   * Compute device-specific status information and metrics
   * Analyzes test results to provide summary statistics and connection status
   */
  const getDeviceStatusInfo = () => {
    if (hostResult.status === 'success' && hostResult.test_results) {
      const totalTests = hostResult.test_results.length;
      let totalChecks = 0;
      let passedChecks = 0;

      // Aggregate check counts across all test results
      hostResult.test_results.forEach(test => {
        if (test.table?.rows) {
          totalChecks += test.table.rows.length;
          passedChecks += test.table.rows.filter(row =>
            row.Status === 'PASSED' || row.Result === 'PASSED'
          ).length;
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
        connectionMessage: `${totalTests} test(s), ${totalChecks} checks`
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
        connectionMessage: 'Connection failed'
      };
    }
  };

  const deviceInfo = getDeviceStatusInfo();

  return (
    <div className={`border rounded ${deviceInfo.bgColor} ${deviceInfo.borderColor} overflow-hidden transition-all duration-200`}>
      {/* Compact clickable card header */}
      <div
        className="cursor-pointer p-3 hover:bg-opacity-80 transition-colors"
        onClick={() => onToggle(index)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Compact expansion chevron */}
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-gray-600 transition-transform duration-200" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-gray-600 transition-transform duration-200" />
            )}
            <Server className={`h-4 w-4 ${deviceInfo.statusColor}`} />
            <div>
              <h3 className="text-md font-semibold text-gray-900">
                <BulletproofText>{hostResult.hostname || 'Unknown Host'}</BulletproofText>
              </h3>
              <p className="text-xs text-gray-600">
                {deviceInfo.connectionMessage}
              </p>
            </div>
          </div>

          {/* Compact metrics and status */}
          <div className="text-right flex items-center gap-2">
            <div className="text-xs text-gray-600">
              {deviceInfo.passedChecks}/{deviceInfo.totalChecks}
            </div>
            <CompactStatusBadge
              status={hostResult.status === 'success' ? 'PASS' : 'FAIL'}
            />
          </div>
        </div>
      </div>

      {/* Expandable content area with detailed test results */}
      {isExpanded && (
        <div className="border-t bg-white p-2 space-y-2 transition-opacity duration-200 opacity-100">
          {hostResult.status === 'error' ? (
            // Compact error state display
            <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded">
              <XCircle className="h-3 w-3 text-red-600 flex-shrink-0" />
              <span className="text-sm text-red-800">
                <BulletproofText>{hostResult.message || 'An error occurred during validation.'}</BulletproofText>
              </span>
            </div>
          ) : (
            // Render compact detailed test tables
            hostResult.test_results?.map((test, testIndex) => (
              <CompactDetailedTestTable
                key={testIndex}
                test={test}
                hostResult={hostResult}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
});

// =============================================================================
// SECTION 7: COMPACT EXECUTION PROGRESS TRACKER
//
// Purpose: Provides real-time progress tracking for validation operations in
// a space-efficient format. Displays execution steps, timestamps, and status
// updates in a compact scrollable timeline optimized for continuous monitoring.
//
// Features:
// - Compact timeline layout with reduced spacing
// - Auto-scroll functionality for live monitoring
// - Visual status indicators with minimal footprint
// - Collapsible design to save space when not needed
// - Essential progress information prioritized
// - Smooth animations and state transitions
// =============================================================================

const CompactExecutionProgressTracker = memo(({ progress, isRunning }) => {
  const progressRef = useRef(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    // Auto-scroll to bottom when new progress items are added
    if (progressRef.current && !isCollapsed) {
      progressRef.current.scrollTop = progressRef.current.scrollHeight;
    }
  }, [progress, isCollapsed]);

  // Don't render if no progress data available
  if (!progress || progress.length === 0) return null;

  return (
    <div className="border rounded bg-white shadow-sm">
      {/* Compact progress tracker header with collapsible toggle */}
      <div className="p-2 border-b bg-gradient-to-r from-blue-50 to-blue-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-gray-600 hover:text-gray-800"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <Clock className="h-4 w-4 text-blue-600" />
          <h3 className="text-md font-semibold">
            Progress
            {isRunning && (
              <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 animate-pulse">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                Running
              </span>
            )}
          </h3>
        </div>
        <div className="text-xs text-gray-600">
          {progress.length} events
        </div>
      </div>

      {/* Collapsible compact progress timeline */}
      {!isCollapsed && (
        <div ref={progressRef} className="p-2 space-y-1 max-h-40 overflow-y-auto">
          {progress.slice(-10).map((step, index) => (
            <div key={index} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 transition-colors">
              {/* Compact status dot */}
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                step.event_type === 'OPERATION_COMPLETE' || step.event_type === 'STEP_COMPLETE' || step.event_type === 'TEST_COMPLETE'
                  ? 'bg-green-500'
                  : step.event_type === 'OPERATION_START' || step.event_type === 'STEP_START'
                  ? 'bg-blue-500'
                  : 'bg-gray-400'
              }`}></div>

              {/* Compact progress message */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-900 truncate">
                  <BulletproofText>{step.message}</BulletproofText>
                </div>
                {step.data && (
                  <div className="text-xs text-gray-500 truncate">
                    {step.data.host && <span>{step.data.host}</span>}
                    {step.data.test && <span> • {step.data.test}</span>}
                    {step.data.status && <span> • {step.data.status}</span>}
                  </div>
                )}
              </div>

              {/* Compact timestamp */}
              <div className="text-xs text-gray-400 flex-shrink-0">
                {new Date().toLocaleTimeString('en-US', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// =============================================================================
// SECTION 8: MAIN SPACE-EFFICIENT VALIDATION RESULTS VIEWER
//
// Purpose: The primary orchestrating component that combines all sections into
// a cohesive, space-efficient validation results interface. Optimized for maximum
// screen space utilization with full-height viewport design, compact layouts,
// and efficient information density while maintaining usability and accessibility.
//
// Features:
// - Full viewport height utilization with proper scrolling
// - Compact component layouts throughout the interface
// - Responsive design optimized for various screen sizes
// - Space-efficient view modes (cards/table) with density options
// - Collapsible sections to maximize content area
// - Comprehensive error handling and data validation
// - Export functionality with compact file formats
// - Debug mode with minimal space footprint
// - Modern UI with performance-optimized animations
// =============================================================================

const EnhancedValidationResultsViewer = memo(({ validationResults, progress, isRunning }) => {
  // Component state management
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'table'
  const [expandedHosts, setExpandedHosts] = useState(new Set());
  const [showRawData, setShowRawData] = useState(false);
  const [isCompactMode, setIsCompactMode] = useState(true);

  /**
   * Export validation results as JSON file with timestamp
   * Includes error handling for export failures
   */
  const handleExport = () => {
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
      alert("Failed to export results. Please check console for details.");
    }
  };

  /**
   * Toggle expansion state for individual host results
   * Manages which device cards are expanded in the UI
   */
  const toggleHostExpanded = (hostIndex) => {
    const newExpanded = new Set(expandedHosts);
    if (newExpanded.has(hostIndex)) {
      newExpanded.delete(hostIndex);
    } else {
      newExpanded.add(hostIndex);
    }
    setExpandedHosts(newExpanded);
  };

  // Flexible data handling for various input formats from different sources
  const dataPayload = validationResults?.data || validationResults;
  const hostResults = dataPayload?.results_by_host ||
                     dataPayload?.results ||
                     (Array.isArray(dataPayload) ? dataPayload : []);

  // Handle case where no validation results are provided
  if (!validationResults) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 p-2">
        <div className="flex-1 space-y-3">
          <CompactExecutionProgressTracker progress={progress} isRunning={isRunning} />

          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <span className="text-sm text-red-800">
              No validation results provided to component.
            </span>
          </div>

          {/* Compact debug information */}
          <div className="p-3 bg-white border rounded">
            <h3 className="text-sm font-medium text-gray-700 mb-1">Debug Info:</h3>
            <p className="text-xs text-gray-600">
              validationResults: {validationResults === null ? 'null' : validationResults === undefined ? 'undefined' : 'provided'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Handle case where results structure exists but no host data
  if (!hostResults.length) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 p-2">
        <div className="flex-1 space-y-3">
          <CompactExecutionProgressTracker progress={progress} isRunning={isRunning} />

          <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <span className="text-sm text-yellow-800">
              {isRunning ? "Validation in progress..." : "No host results found in validation data."}
            </span>
          </div>

          {/* Compact extended debug information */}
          <div className="p-3 bg-white border rounded">
            <button
              onClick={() => setShowRawData(!showRawData)}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 mb-2"
            >
              {showRawData ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Debug Info
            </button>
            {showRawData && (
              <div className="text-xs text-gray-600 space-y-1">
                <p>validationResults keys: {Object.keys(validationResults || {}).join(', ')}</p>
                <p>dataPayload keys: {Object.keys(dataPayload || {}).join(', ')}</p>
                <p>hostResults length: {hostResults.length}</p>
                <div className="max-h-32 overflow-auto">
                  <SafeJsonDisplay data={validationResults} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const { summary } = dataPayload;

  return (
    <div className="h-screen flex flex-col bg-gray-50 p-2">
      <div className="flex-1 flex flex-col space-y-3 min-h-0">
        {/* Compact progress tracking section */}
        <CompactExecutionProgressTracker progress={progress} isRunning={isRunning} />

        {/* Compact main header section */}
        <div className="border rounded bg-white shadow-sm">
          <div className="p-3">
            {/* Compact header with title and controls */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-600" />
                  Network Validation Results
                </h1>
              </div>

              {/* Compact control buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsCompactMode(!isCompactMode)}
                  className="flex items-center gap-1 px-2 py-1.5 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200 transition-colors"
                >
                  {isCompactMode ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
                  {isCompactMode ? 'Expand' : 'Compact'}
                </button>
                <button
                  onClick={() => setViewMode(viewMode === 'cards' ? 'table' : 'cards')}
                  className="flex items-center gap-1 px-2 py-1.5 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200 transition-colors"
                >
                  {viewMode === 'cards' ? <Table className="h-3 w-3" /> : <List className="h-3 w-3" />}
                  {viewMode === 'cards' ? 'Table' : 'Cards'}
                </button>
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1 px-2 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
                >
                  <Download className="h-3 w-3" />
                  Export
                </button>
              </div>
            </div>

            {/* Compact key metrics dashboard */}
            <CompactSummaryMetrics hostResults={hostResults} summary={summary} />
          </div>
        </div>

        {/* Compact summary table section */}
        <CompactSummaryTable hostResults={hostResults} />

        {/* Main detailed results section - uses remaining space */}
        <div className="flex-1 border rounded bg-white shadow-sm flex flex-col min-h-0">
          <div className="p-3 border-b bg-gradient-to-r from-gray-50 to-gray-100 flex-shrink-0">
            <h2 className="text-md font-semibold flex items-center gap-2">
              <List className="h-4 w-4 text-blue-600" />
              Device Results
              <span className="text-sm text-gray-600 font-normal">
                ({hostResults.length} device{hostResults.length !== 1 ? 's' : ''})
              </span>
            </h2>
          </div>

          {/* Scrollable detailed results content */}
          <div className="flex-1 p-3 overflow-y-auto min-h-0">
            <div className="space-y-2">
              {viewMode === 'cards' ? (
                /* Compact card view mode */
                hostResults.map((hostResult, hostIndex) => (
                  <CompactDeviceStatusCard
                    key={`host-${hostIndex}-${hostResult.hostname}`}
                    hostResult={hostResult}
                    index={hostIndex}
                    isExpanded={expandedHosts.has(hostIndex)}
                    onToggle={toggleHostExpanded}
                  />
                ))
              ) : (
                /* Compact table view mode */
                <div className="space-y-3">
                  {hostResults.map((hostResult, hostIndex) => (
                    <div key={`host-${hostIndex}-${hostResult.hostname}`} className="space-y-2">
                      <div
                        className="cursor-pointer flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
                        onClick={() => toggleHostExpanded(hostIndex)}
                      >
                        <div className="flex items-center gap-2">
                          {expandedHosts.has(hostIndex) ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          <Server className="h-3.5 w-3.5 text-gray-600" />
                          <h3 className="text-sm font-medium">
                            <BulletproofText>{hostResult.hostname || 'Unknown Host'}</BulletproofText>
                          </h3>
                          <CompactStatusBadge
                            status={hostResult.status === 'success' ? 'PASS' : 'FAIL'}
                          />
                        </div>
                        <div className="text-xs text-gray-500">
                          {hostResult.test_results?.length || 0} tests
                        </div>
                      </div>

                      {/* Expandable detailed content in table view */}
                      {expandedHosts.has(hostIndex) && (
                        <div className="ml-4 space-y-2 transition-opacity duration-200 opacity-100">
                          {hostResult.status === 'error' ? (
                            <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded">
                              <XCircle className="h-3 w-3 text-red-600 flex-shrink-0" />
                              <span className="text-sm text-red-800">
                                <BulletproofText>{hostResult.message || 'An error occurred during validation.'}</BulletproofText>
                              </span>
                            </div>
                          ) : (
                            hostResult.test_results?.map((test, testIndex) => (
                              <CompactDetailedTestTable
                                key={testIndex}
                                test={test}
                                hostResult={hostResult}
                              />
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
        </div>

        {/* Compact debug/raw data section - collapsible */}
        <div className="border rounded bg-white shadow-sm">
          <div className="p-2">
            <button
              onClick={() => setShowRawData(!showRawData)}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              {showRawData ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Debug: View Raw Data
            </button>
            {showRawData && (
              <div className="mt-2 transition-opacity duration-200 opacity-100">
                <div className="max-h-40 overflow-auto">
                  <SafeJsonDisplay data={validationResults} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default EnhancedValidationResultsViewer;
