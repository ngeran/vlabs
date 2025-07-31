// ====================================================================================
// FILE:               /src/components/RunnerDashboard.jsx
//
// DESCRIPTION:
//   A modern dashboard component with dark theme, featuring date display, two-column
//   layout with recent activity and enhanced statistics including most executed scripts.
// ====================================================================================

// SECTION 1: IMPORTS & CONFIGURATION
// -------------------------------------------------------------------------------------------------
import React, { useState, useEffect, useMemo } from 'react';
import { FileCode, LayoutTemplate, Database, Activity, CheckCircle2, XCircle, Clock, ServerCrash, TrendingUp } from 'lucide-react';
import PulseLoader from 'react-spinners/PulseLoader';
import toast from 'react-hot-toast';
import { formatDistanceToNow, format } from 'date-fns';

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
 * Modern dashboard with enhanced statistics and two-column layout
 * @param {{history: Array<object>, isLoading: boolean}} props - Props from the parent component.
 */
function RunnerDashboard({ history, isLoading: isHistoryLoading }) {
    // --- State Management for Stats ---
    const [stats, setStats] = useState({ scripts: 0, templates: 0, inventories: 0 });
    const [isStatsLoading, setIsStatsLoading] = useState(true);
    const [error, setError] = useState(null);

    // --- Computed Statistics from History ---
    const historyStats = useMemo(() => {
        if (!history || history.length === 0) {
            return {
                totalRuns: 0,
                successRate: 0,
                mostExecutedScripts: [],
                recentSuccessRate: 0
            };
        }

        // Count script executions
        const scriptCounts = history.reduce((acc, item) => {
            acc[item.displayName] = (acc[item.displayName] || 0) + 1;
            return acc;
        }, {});

        // Get top 3 most executed scripts
        const mostExecutedScripts = Object.entries(scriptCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3)
            .map(([script, count], index) => ({ script, executions: count, rank: index + 1 }));

        // Calculate success rates
        const successfulRuns = history.filter(item => item.isSuccess).length;
        const successRate = Math.round((successfulRuns / history.length) * 100);

        // Recent success rate (last 10 runs)
        const recentRuns = history.slice(0, 10);
        const recentSuccessful = recentRuns.filter(item => item.isSuccess).length;
        const recentSuccessRate = recentRuns.length > 0 ? Math.round((recentSuccessful / recentRuns.length) * 100) : 0;

        return {
            totalRuns: history.length,
            successRate,
            mostExecutedScripts,
            recentSuccessRate
        };
    }, [history]);

    // --- Data Fetching for Stats ---
    useEffect(() => {
        const fetchStatsData = async () => {
            setIsStatsLoading(true);
            setError(null);
            try {
                const [scriptsRes, templatesRes, inventoriesRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/scripts/list`),
                    fetch(`${API_BASE_URL}/api/templates/discover`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({})
                    }),
                    fetch(`${API_BASE_URL}/api/inventories/list`),
                ]);

                if (!scriptsRes.ok || !templatesRes.ok || !inventoriesRes.ok) {
                    throw new Error('One or more stat requests failed. The server may be unavailable.');
                }

                const scriptsData = await scriptsRes.json();
                const templatesData = await templatesRes.json();
                const inventoriesData = await inventoriesRes.json();

                setStats({
                    scripts: scriptsData.success ? (scriptsData.scripts || []).length : 0,
                    templates: templatesData.success ? Object.values(templatesData.discovered_templates || {}).flat().length : 0,
                    inventories: inventoriesData.success ? (inventoriesData.inventories || []).length : 0,
                });

            } catch (err) {
                console.error("Dashboard stats fetch error:", err);
                setError(err.message);
                toast.error("Could not load dashboard statistics.");
            } finally {
                setIsStatsLoading(false);
            }
        };

        fetchStatsData();
    }, []);

    // --- UI Rendering ---
    if (error) {
        return (
            <div className="text-center py-24 px-6 bg-gray-900 rounded-2xl shadow-lg border border-gray-700">
                <ServerCrash className="mx-auto text-red-400 h-16 w-16 mb-4" />
                <h2 className="text-2xl font-semibold text-white">Failed to Load Dashboard Stats</h2>
                <p className="text-gray-400 mt-2">{error}</p>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-slate-50/50 to-yellow-100/30 p-4 sm:p-8 rounded-3xl shadow-2xl shadow-slate-200/60 animate-fade-in">
            <div className="space-y-10">
                {/* Top Section: Header and Statistics */}
                <div className="flex flex-col lg:flex-row justify-between items-start gap-10">
                    <header className="flex-shrink-0">
                        <p className="text-4xl font-thin text-slate-600 tracking-wide mb-4">
                            {format(new Date(), 'EEEE, MMMM do, yyyy')}
                        </p>
                        <h1 className="text-4xl font-bold text-slate-800">Command Center</h1>
                        <p className="mt-2 text-slate-500">An overview of system resources and recent activity.</p>
                    </header>
                    <div className="w-full lg:w-auto flex-shrink-0 flex justify-around lg:justify-end items-start space-x-4 sm:space-x-12 pt-2">
                        <StatDisplay icon={<FileCode />} title="Scripts" value={stats.scripts} isLoading={isStatsLoading} />
                        <StatDisplay icon={<LayoutTemplate />} title="Templates" value={stats.templates} isLoading={isStatsLoading} />
                        <StatDisplay icon={<Database />} title="Inventory" value={stats.inventories} isLoading={isStatsLoading} />
                    </div>
                </div>

                {/* Split into two separate cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left Card - Recent Activity */}
                    <div className="bg-slate-800 p-6 sm:p-8 rounded-2xl shadow-lg shadow-slate-300/60">
                        <h3 className="text-xl font-semibold text-white flex items-center mb-5">
                            <Activity size={20} className="mr-3 text-yellow-400" /> Recent Activity
                        </h3>
                        {isHistoryLoading ? (
                            <div className="flex justify-center items-center h-40"><PulseLoader color="#f1c40f" /></div>
                        ) : history && history.length > 0 ? (
                            <ul className="space-y-2">
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

                    {/* Right Card - Statistics */}
                    <div className="bg-slate-800 p-6 sm:p-8 rounded-2xl shadow-lg shadow-slate-300/60">
                        <h3 className="text-xl font-semibold text-white flex items-center mb-5">
                            <TrendingUp size={20} className="mr-3 text-yellow-400" /> Execution Statistics
                        </h3>
                        <div className="space-y-6">
                            {/* Total Runs and Success Rate */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="bg-slate-700/50 p-4 rounded-lg">
                                    <div className="flex items-center space-x-3">
                                        <div className="bg-yellow-500/20 p-2 rounded-lg">
                                            <Activity className="text-yellow-400" size={18} />
                                        </div>
                                        <div>
                                            <p className="text-slate-300 text-sm">Total Runs</p>
                                            {isHistoryLoading ? (
                                                <PulseLoader color="#f1c40f" size={6} />
                                            ) : (
                                                <p className="text-2xl font-bold text-white">{historyStats.totalRuns}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-slate-700/50 p-4 rounded-lg">
                                    <div className="flex items-center space-x-3">
                                        <div className="bg-yellow-500/20 p-2 rounded-lg">
                                            <CheckCircle2 className="text-yellow-400" size={18} />
                                        </div>
                                        <div>
                                            <p className="text-slate-300 text-sm">Success Rate</p>
                                            {isHistoryLoading ? (
                                                <PulseLoader color="#f1c40f" size={6} />
                                            ) : (
                                                <p className="text-2xl font-bold text-white">{historyStats.successRate}%</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Most Executed Scripts */}
                            <div className="bg-slate-700/50 p-4 rounded-lg">
                                <h4 className="text-slate-300 text-sm font-semibold mb-3 flex items-center">
                                    <TrendingUp size={14} className="mr-2 text-yellow-400" />
                                    Most Executed Scripts
                                </h4>
                                {isHistoryLoading ? (
                                    <div className="flex justify-center items-center h-20">
                                        <PulseLoader color="#f1c40f" size={6} />
                                    </div>
                                ) : historyStats.mostExecutedScripts.length > 0 ? (
                                    <div className="space-y-2">
                                        {historyStats.mostExecutedScripts.map((item) => (
                                            <div key={item.script} className="flex items-center justify-between p-2 bg-slate-600/30 rounded">
                                                <div className="flex items-center space-x-2">
                                                    <span className="text-yellow-400 font-bold text-xs">#{item.rank}</span>
                                                    <span className="text-slate-200 text-sm truncate">{item.script}</span>
                                                </div>
                                                <span className="text-slate-400 text-xs">{item.executions}x</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-slate-400 text-xs text-center py-4">No execution data</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default RunnerDashboard;
