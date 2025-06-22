// src/components/PythonScriptRunner.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Label } from 'recharts';

function PythonScriptRunner() {
  const [availableScripts, setAvailableScripts] = useState([]);
  const [selectedScriptConfig, setSelectedScriptConfig] = useState(null);
  const [currentArgs, setCurrentArgs] = useState({});

  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fetchingScripts, setFetchingScripts] = useState(true);

  // --- useEffect to Fetch Script List on Component Mount ---
  useEffect(() => {
    const fetchScripts = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/scripts/list');
        if (!response.ok) {
          throw new Error('Failed to fetch script list from backend.');
        }
        const data = await response.json();
        if (data.success && Array.isArray(data.scripts)) {
          setAvailableScripts(data.scripts);
          if (data.scripts.length > 0) {
            // Automatically select the first script, or perhaps the first featured one
            setSelectedScriptConfig(data.scripts[0]);
            const initialArgs = {};
            data.scripts[0].arguments.forEach(arg => {
              initialArgs[arg.name] = arg.default || '';
            });
            setCurrentArgs(initialArgs);
          }
        } else {
          setError(data.message || 'Malformed script list received.');
        }
      } catch (err) {
        console.error("Error fetching script list:", err);
        setError(`Failed to load scripts: ${err.message}`);
      } finally {
        setFetchingScripts(false);
      }
    };

    fetchScripts();
  }, []);

  // --- useEffect to Update Arguments when Selected Script Changes ---
  useEffect(() => {
    if (selectedScriptConfig) {
      const newArgs = {};
      selectedScriptConfig.arguments.forEach(arg => {
        newArgs[arg.name] = arg.default || '';
      });
      setCurrentArgs(newArgs);
      setOutput('');
      setError('');
    }
  }, [selectedScriptConfig]);

  // Handler for script selection change
  const handleScriptSelectChange = (e) => {
    const selectedName = e.target.value;
    const config = availableScripts.find(script => script.name === selectedName);
    setSelectedScriptConfig(config);
  };

  // Handler for dynamic argument input changes
  const handleArgChange = (argName, value) => {
    setCurrentArgs(prevArgs => ({
      ...prevArgs,
      [argName]: value
    }));
  };

  // Function to handle running the script
  const handleRunScript = async () => {
    if (!selectedScriptConfig) {
      setError('No script selected.');
      return;
    }

    setOutput('');
    setError('');
    setIsLoading(true);

    const argsToSend = selectedScriptConfig.arguments.map(argDef => {
      const value = currentArgs[argDef.name] || '';
      if (argDef.required && value === '') {
          setError(`Required argument "${argDef.name}" is missing.`);
          setIsLoading(false);
          return null;
      }
      return value;
    }).filter(arg => arg !== null);

    if (argsToSend.some(arg => arg === null)) {
        return;
    }

    try {
      const response = await fetch('http://localhost:3001/api/scripts/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scriptName: selectedScriptConfig.name,
          args: argsToSend,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to run script on backend.');
      }

      const data = await response.json();
      if (data.success) {
        setOutput(data.output);
        setError(data.error);
      } else {
        setError(data.message || 'Script execution failed.');
        setOutput(data.output);
      }
    } catch (err) {
      console.error("Error calling backend:", err);
      setError(`Network or backend error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Memoized featured scripts (only 'featured' category) ---
  const featuredScripts = useMemo(() => {
    return availableScripts.filter(script => script.tags && script.tags.includes('featured'));
  }, [availableScripts]);

  // --- Memoized data for the Donut Chart by Category ---
  const scriptsByCategoryData = useMemo(() => {
    const categoryCounts = availableScripts.reduce((acc, script) => {
      const category = script.category || 'Uncategorized'; // Default category if not specified
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});

    return Object.keys(categoryCounts).map(category => ({
      name: category,
      value: categoryCounts[category]
    }));
  }, [availableScripts]);

  // Define shades of green for the donut chart segments and legend dots
  const COLORS = ['#6BBD45', '#8BC34A', '#A1D36F', '#B3E594', '#C5F7B9', '#D9FAE7', '#A0DEB7', '#76C6A0']; // Added more shades

  // Handle clicking a featured script in the table
  const handleFeaturedScriptClick = (scriptName) => {
    const config = availableScripts.find(script => script.name === scriptName);
    if (config) {
      setSelectedScriptConfig(config);
      // Scroll to the run script section for better UX
      document.getElementById('run-script-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };


  // --- Loading State for initial script fetch ---
  if (fetchingScripts) {
    return (
      // Main container, adjusted for full width and no top padding
      <div className="w-full bg-white shadow-sm border-b border-gray-200 py-12 sm:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Loader2 className="animate-spin h-10 w-10 text-blue-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Loading Scripts...</h1>
          <p className="text-gray-600">Please wait while scripts are being fetched from the backend.</p>
        </div>
      </div>
    );
  }

  // --- Prominent Error Display for initial script fetch failure ---
  if (error && !output && !fetchingScripts) {
    return (
      // Main container, adjusted for full width and no top padding
      <div className="w-full bg-red-50 shadow-sm border-b border-red-200 py-12 sm:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-red-700">
          <h1 className="text-2xl font-bold text-red-800 mb-3">Error Loading Scripts</h1>
          <p className="mb-2">There was an issue loading the list of Python scripts:</p>
          <pre className="whitespace-pre-wrap break-all font-mono bg-red-100 p-3 rounded-md text-red-800 text-sm overflow-x-auto">{error}</pre>
          <p className="mt-4 text-red-600">Please ensure your backend is running and `public/scripts.yaml` is correctly configured, and includes the `tags` array for scripts you want featured.</p>
        </div>
      </div>
    );
  }

  return (
    // Outer container to match HomePage's top section styling
    <div className="bg-white shadow-sm border-b border-gray-200 py-12 sm:py-16 lg:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Central main title for the page */}
        <h1 className="text-4xl font-extrabold text-gray-900 mb-8 text-center">Python Script Runner</h1>

        {/* New Two-Column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Left Column: Featured Scripts Table */}
          <div className="md:col-span-2 bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center mb-4">
              <Zap size={20} className="mr-2 text-blue-500" />
              Featured Scripts
            </h2>
            {featuredScripts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Script Name
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th scope="col" className="relative px-6 py-3">
                        <span className="sr-only">Select</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {featuredScripts.map((script) => (
                      <tr key={script.name}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {script.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {script.category}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleFeaturedScriptClick(script.name)}
                            className="text-blue-600 hover:text-blue-900 px-3 py-1 border border-blue-600 rounded-md hover:bg-blue-50 transition-colors duration-200"
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-600 text-center py-4">No featured scripts available. Add 'featured' tag in scripts.yaml.</p>
            )}
          </div>

          {/* Right Column: Script Statistics (Donut Chart & Legend) */}
          <div className="md:col-span-1 bg-white rounded-lg shadow-md p-6 flex flex-col items-center justify-center text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Script Statistics</h2>
            {availableScripts.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={scriptsByCategoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      fill="#8884d8"
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {scriptsByCategoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                      <Label
                        value={availableScripts.length}
                        position="center"
                        fill="#000"
                        className="font-bold text-3xl"
                      />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                {/* Category Legend */}
                <div className="mt-4 w-full text-left">
                  {scriptsByCategoryData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center justify-between text-gray-700 text-sm mb-1">
                      <div className="flex items-center">
                        <span
                          className="inline-block w-3 h-3 rounded-full mr-2"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        ></span>
                        {entry.name}
                      </div>
                      <span className="inline-block border border-gray-400 rounded px-2 py-0.5 text-xs font-semibold">
                        {entry.value}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-gray-600">No scripts to display statistics.</p>
            )}
          </div>
        </div>

        {/* Main Script Runner Form (now identified by an ID for scrolling) */}
        <div id="run-script-section" className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Run a Script</h2>

          {/* Script Selection */}
          <div className="mb-6">
            <label htmlFor="script-select" className="block text-sm font-medium text-gray-700 mb-1">Select Script:</label>
            <select
              id="script-select"
              value={selectedScriptConfig ? selectedScriptConfig.name : ''}
              onChange={handleScriptSelectChange}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md shadow-sm"
              disabled={availableScripts.length === 0}
            >
              {availableScripts.length === 0 ? (
                <option value="">No scripts available</option>
              ) : (
                availableScripts.map((script) => (
                  <option key={script.name} value={script.name}>
                    {script.name} - {script.description} ({script.category})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Dynamic Arguments Input */}
          {selectedScriptConfig && selectedScriptConfig.arguments.length > 0 && (
            <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Script Arguments:</h3>
              {selectedScriptConfig.arguments.map((arg) => (
                <div key={arg.name} className="mb-4">
                  <label htmlFor={`arg-${arg.name}`} className="block text-sm font-medium text-gray-700 mb-1">
                    {arg.name} {arg.required && <span className="text-red-500">*</span>}:
                    {arg.description && <span className="font-normal text-xs text-gray-500 ml-1"> ({arg.description})</span>}
                  </label>
                  <input
                    type={arg.type === 'number' ? 'number' : 'text'}
                    id={`arg-${arg.name}`}
                    value={currentArgs[arg.name] || ''}
                    onChange={(e) => handleArgChange(arg.name, e.target.value)}
                    placeholder={arg.placeholder || `Enter ${arg.name}`}
                    required={arg.required}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Run Button */}
          <button
            onClick={handleRunScript}
            disabled={isLoading || !selectedScriptConfig}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin h-5 w-5 mr-3" /> Running Script...
              </>
            ) : (
              'Run Script'
            )}
          </button>

          {/* Output Display */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Script Output:</h2>
            {error && (
              <pre className="bg-red-50 text-red-700 p-4 rounded-md text-sm border border-red-200 whitespace-pre-wrap break-all overflow-x-auto">
                <span className="font-bold">ERROR:</span> {error}
              </pre>
            )}
            {output && (
              <pre className="bg-gray-100 p-4 rounded-md text-gray-800 text-sm border border-gray-200 whitespace-pre-wrap break-all overflow-x-auto">
                {output}
              </pre>
            )}
            {!output && !error && !isLoading && !fetchingScripts && (
              <p className="text-gray-600 text-sm">Run a script to see output here.</p>
            )}
            {isLoading && (
                <p className="text-blue-600 text-sm flex items-center">
                    <Loader2 className="animate-spin h-4 w-4 mr-2" /> Loading...
                </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PythonScriptRunner;
