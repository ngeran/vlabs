import React, { memo, useState, useRef, useEffect } from "react";
import {
  CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronRight,
  Download, Filter, Search, BarChart3, Table, List
} from "lucide-react";

// ... [Previous components remain the same until BulletproofValidationResultsViewer]

// =============================================================================
// SUMMARY TABLE COMPONENT
// =============================================================================
const SummaryTable = memo(({ hostResults }) => {
  const [tableData, setTableData] = useState([]);

  useEffect(() => {
    const data = [];

    hostResults.forEach((hostResult) => {
      if (hostResult.status === 'success' && hostResult.test_results) {
        hostResult.test_results.forEach((testResult) => {
          const passed = testResult.table?.rows?.filter(row => row.Status === 'PASSED').length || 0;
          const failed = testResult.table?.rows?.filter(row => row.Status === 'FAILED').length || 0;
          const errors = testResult.table?.rows?.filter(row => row.Status === 'ERROR').length || 0;

          data.push({
            host: hostResult.hostname,
            test: testResult.table?.test_name || 'Unknown Test',
            passed,
            failed,
            errors,
            status: failed === 0 && errors === 0 ? 'PASS' : 'FAIL'
          });
        });
      } else {
        data.push({
          host: hostResult.hostname,
          test: 'CONNECTION',
          passed: 0,
          failed: 1,
          errors: 1,
          status: 'FAIL'
        });
      }
    });

    setTableData(data);
  }, [hostResults]);

  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Table className="h-5 w-5" />
          Test Execution Summary
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Host
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Test
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Passed
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Failed
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Errors
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tableData.map((row, index) => (
              <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  <BulletproofText>{row.host}</BulletproofText>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <BulletproofText>{row.test}</BulletproofText>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {row.passed}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {row.failed}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {row.errors}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
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
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
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
              <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {test.table.columns.map((column, colIndex) => (
                  <td
                    key={colIndex}
                    className="px-6 py-4 whitespace-normal text-sm text-gray-500"
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
// MAIN BULLETPROOF VALIDATION RESULTS VIEWER
// =============================================================================
const BulletproofValidationResultsViewer = memo(({ validationResults }) => {
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'table'
  const [expandedHosts, setExpandedHosts] = useState(new Set());

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
      alert("Failed to export results. Check console for details.");
    }
  };

  const toggleHostExpanded = (hostIndex) => {
    const newExpanded = new Set(expandedHosts);
    if (newExpanded.has(hostIndex)) {
      newExpanded.delete(hostIndex);
    } else {
      newExpanded.add(hostIndex);
    }
    setExpandedHosts(newExpanded);
  };

  // Handle both results_by_host and results formats
  const hostResults = validationResults?.results_by_host || validationResults?.results || [];

  if (!validationResults || !hostResults.length) {
    return (
      <div className="flex items-center gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <AlertCircle className="h-4 w-4 text-yellow-600" />
        <span className="text-sm text-yellow-800">
          No validation results available to display.
        </span>
      </div>
    );
  }

  const { summary } = validationResults;

  return (
    <div className="space-y-6 p-4">
      {/* Summary Section */}
      {summary && (
        <div className="border rounded-lg bg-white shadow-sm">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">Validation Summary</h1>
                <p className="text-sm text-gray-600">
                  Overall results across all hosts and tests
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
                  Export Results
                </button>
              </div>
            </div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {hostResults.length}
                </div>
                <div className="text-sm text-gray-600">Total Hosts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {summary.passed_hosts || 0}
                </div>
                <div className="text-sm text-gray-600">Successful Hosts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {summary.total_tests || 0}
                </div>
                <div className="text-sm text-gray-600">Total Tests</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {summary.total_tests && hostResults.length ?
                    Math.round((summary.passed_hosts / hostResults.length) * 100) : 0}%
                </div>
                <div className="text-sm text-gray-600">Success Rate</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Table */}
      <SummaryTable hostResults={hostResults} />

      {/* Detailed Results */}
      <div className="border rounded-lg bg-white shadow-sm">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <List className="h-5 w-5" />
            Detailed Results
          </h2>
        </div>
        <div className="p-4 space-y-6">
          {hostResults.map((hostResult, hostIndex) => (
            <div key={`host-${hostIndex}-${hostResult.hostname}`} className="space-y-4">
              <div
                className="cursor-pointer flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
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
                <div className="ml-6 space-y-4">
                  {hostResult.status === 'error' ? (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span className="text-sm text-red-800">
                        <BulletproofText>{hostResult.message || 'An error occurred during validation.'}</BulletproofText>
                      </span>
                    </div>
                  ) : (
                    hostResult.test_results?.map((test, testIndex) => (
                      <div key={testIndex} className="space-y-2">
                        <h4 className="text-md font-medium">
                          <BulletproofText>{test.table?.test_name || 'Unknown Test'}</BulletproofText>
                        </h4>
                        <p className="text-sm text-gray-600 mb-2">
                          <BulletproofText>{test.table?.title || ''}</BulletproofText>
                        </p>
                        {viewMode === 'table' ? (
                          <DetailedTestTable test={test} />
                        ) : (
                          <SafeTestResultCard
                            test={test}
                            isExpanded={true}
                            onToggle={() => {}}
                          />
                        )}
                        {test.raw && (
                          <div className="mt-4">
                            <details>
                              <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                                View Raw Data
                              </summary>
                              <div className="mt-2">
                                <SafeJsonDisplay data={test.raw} />
                              </div>
                            </details>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Debug Info */}
      <details className="mt-8">
        <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
          🐛 Debug: View Full Raw Data (Safe)
        </summary>
        <div className="mt-2">
          <SafeJsonDisplay data={validationResults} />
        </div>
      </details>
    </div>
  );
});

export default BulletproofValidationResultsViewer;
