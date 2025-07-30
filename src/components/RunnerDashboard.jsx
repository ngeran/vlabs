// ====================================================================================
// FILE:               /src/components/RunnerDashboard.jsx
//
// DESCRIPTION:
//   A dashboard component displayed when no script is selected, providing an overview of
//   system resources and recent script activity. It fetches its own summary statistics
//   but receives the dynamic history list via props to ensure data consistency.
// ====================================================================================

// SECTION 1: IMPORTS & CONFIGURATION
// -------------------------------------------------------------------------------------------------
import React, { useState, useEffect } from 'react';
import { FileCode, LayoutTemplate, Database, Activity, CheckCircle2, XCircle, Clock, ServerCrash } from 'lucide-react';
import PulseLoader from 'react-spinners/PulseLoader';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

const API_BASE_URL = "http://localhost:3001";

// SECTION 2: SUB-COMPONENT - StatDisplay
// -------------------------------------------------------------------------------------------------
/**
 * A reusable component to display a single, impactful statistic.
 * @param {object} props - The component props.
 */
const StatDisplay = ({ icon, title, value, isLoading }) => (
    <div className="flex flex-col items-center">
        <div className="flex items-center space-x-3">
            <div className="bg-slate-200/70 p-3 rounded-xl shadow-sm">
                {React.cloneElement(icon, { size: 24, className: "text-slate-700" })}
            </div>
            {isLoading ? (
                <div className="w-28 h-20 flex items-center justify-center">
                    <PulseLoader color="#a16207" size={10} />
                </div>
            ) : (
                <span className="text-8xl font-thin text-slate-800 tracking-tighter">{value}</span>
            )}
        </div>
        <p className="text-sm text-slate-500 mt-3 font-semibold">{title}</p>
    </div>
);


// SECTION 3: MAIN DASHBOARD COMPONENT
// -------------------------------------------------------------------------------------------------
/**
 * Orchestrates the fetching and display of summary statistics and renders the recent
 * activity list received from its parent.
 * @param {{history: Array<object>, isLoading: boolean}} props - Props from the parent component.
 */
function RunnerDashboard({ history, isLoading: isHistoryLoading }) {
    // --- State Management for Stats ---
    const [stats, setStats] = useState({ scripts: 0, templates: 0, inventories: 0 });
    const [isStatsLoading, setIsStatsLoading] = useState(true);
    const [error, setError] = useState(null);

    // --- Data Fetching for Stats ---
    // This effect fetches data specific to the dashboard that isn't needed elsewhere.
    useEffect(() => {
        const fetchStatsData = async () => {
            setIsStatsLoading(true);
            setError(null);
            try {
                // History is no longer fetched here; it's passed in via props.
                const [scriptsRes, templatesRes, inventoriesRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/scripts/list`),
                    fetch(`${API_BASE_URL}/api/templates/discover`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({}) // Empty body for a full discovery
                    }),
                    fetch(`${API_BASE_URL}/api/inventories/list`),
                ]);

                // Check if all responses were successful.
                if (!scriptsRes.ok || !templatesRes.ok || !inventoriesRes.ok) {
                    throw new Error('One or more stat requests failed. The server may be unavailable.');
                }

                const scriptsData = await scriptsRes.json();
                const templatesData = await templatesRes.json();
                const inventoriesData = await inventoriesRes.json();

                // Set the state with the fetched counts.
                setStats({
                    scripts: scriptsData.success ? (scriptsData.scripts || []).length : 0,
                    templates: templatesData.success ? Object.values(templatesData.discovered_templates || {}).flat().length : 0,
                    inventories: inventoriesData.success ? (inventoriesData.inventories || []).length : 0,
                });

            } catch (err) {
                console.error("Dashboard stats fetch error:", err);
                setError(err.message); // Set the error state for display.
                toast.error("Could not load dashboard statistics.");
            } finally {
                setIsStatsLoading(false);
            }
        };

        fetchStatsData();
    }, []); // Empty dependency array ensures this runs only once on mount.

    // --- UI Rendering ---

    // Render a prominent error message if fetching stats failed.
    if (error) {
        return (
            <div className="text-center py-24 px-6 bg-white rounded-2xl shadow-lg">
                <ServerCrash className="mx-auto text-red-500 h-16 w-16 mb-4" />
                <h2 className="text-2xl font-semibold text-slate-700">Failed to Load Dashboard Stats</h2>
                <p className="text-slate-500 mt-2">{error}</p>
            </div>
        );
    }

    // Render the main dashboard UI.
    return (
        <div className="bg-gradient-to-br from-slate-50/50 to-yellow-100/30 p-4 sm:p-8 rounded-3xl shadow-2xl shadow-slate-200/60 animate-fade-in">
            <div className="space-y-10">
                {/* Top Section: Header and Statistics */}
                <div className="flex flex-col lg:flex-row justify-between items-start gap-10">
                    <header className="flex-shrink-0">
                        <h1 className="text-4xl font-bold text-slate-800">Command Center</h1>
                        <p className="mt-2 text-slate-500">An overview of system resources and recent activity.</p>
                    </header>
                    <div className="w-full lg:w-auto flex-shrink-0 flex justify-around lg:justify-end items-start space-x-4 sm:space-x-12 pt-2">
                        <StatDisplay icon={<FileCode />} title="Scripts" value={stats.scripts} isLoading={isStatsLoading} />
                        <StatDisplay icon={<LayoutTemplate />} title="Templates" value={stats.templates} isLoading={isStatsLoading} />
                        <StatDisplay icon={<Database />} title="Inventory" value={stats.inventories} isLoading={isStatsLoading} />
                    </div>
                </div>

                {/* Recent Activity Section (using props for data) */}
                <div className="bg-slate-800 p-6 sm:p-8 rounded-2xl shadow-lg shadow-slate-300/60">
                    <h3 className="text-xl font-semibold text-white flex items-center mb-5">
                        <Activity size={20} className="mr-3 text-yellow-400" /> Recent Activity
                    </h3>
                    {isHistoryLoading ? (
                        <div className="flex justify-center items-center h-40"><PulseLoader color="#f1c40f" /></div>
                    ) : history && history.length > 0 ? (
                        <ul className="space-y-2">
                            {/* Use the history prop, slicing to show the most recent items */}
                            {history.slice(0, 5).map((item) => (
                                <li key={item.runId} className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors duration-200">
                                    <div className="flex items-center space-x-4">
                                        {item.isSuccess ?
                                          <CheckCircle2 className="text-yellow-400 flex-shrink-0" size={22} /> :
                                          <XCircle className="text-red-400 flex-shrink-0" size={22} />}
                                        <div>
                                            <p className="font-semibold text-slate-100">{item.displayName}</p>
                                            <p className="text-xs text-slate-400 flex items-center">
                                                <Clock size={12} className="mr-1.5" />
                                                {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                                            </p>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-center text-slate-400 py-10">No recent script runs found.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default RunnerDashboard;
