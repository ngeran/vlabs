// ====================================================================================
// FILE: RunnerDashboard.jsx
// ====================================================================================
//
// Description: A modern dashboard component inspired by the Crextio UI. It is
//              displayed when no script is selected and provides a high-level
//              overview of available resources and recent script activity.
//
// ====================================================================================

import React, { useState, useEffect } from 'react';
import { FileCode, LayoutTemplate, Database, Activity, CheckCircle2, XCircle, Clock, ServerCrash } from 'lucide-react';
import PulseLoader from 'react-spinners/PulseLoader';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

const API_BASE_URL = "http://localhost:3001";

// ====================================================================================
// SECTION 1: Sub-components
// ====================================================================================

/**
 * A visually impactful component to display a single statistic.
 * Features a large number with an icon to its left, and a title centered below.
 *
 * @param {object} props - The component props.
 * @param {React.ReactNode} props.icon - The Lucide icon to display.
 * @param {string} props.title - The title for the statistic.
 * @param {number | string} props.value - The value of the statistic.
 * @param {boolean} props.isLoading - A boolean to indicate if the data is still loading.
 * @returns {React.ReactElement} A styled statistic display component.
 */
const StatDisplay = ({ icon, title, value, isLoading }) => (
    <div className="flex flex-col items-center">
        {/* Top Row: Icon + Large Number */}
        <div className="flex items-center space-x-3">
            <div className="bg-slate-200/70 p-3 rounded-xl shadow-sm">
                {React.cloneElement(icon, { size: 24, className: "text-slate-700" })}
            </div>
            {isLoading ? (
                <div className="w-28 h-20 flex items-center justify-center">
                    <PulseLoader color="#a16207" size={10} />
                </div>
            ) : (
                // <<< CHANGE: Reverted font weight to thin
                <span className="text-8xl font-thin text-slate-800 tracking-tighter">{value}</span>
            )}
        </div>
        {/* Bottom Row: Title */}
        <p className="text-sm text-slate-500 mt-3 font-semibold">{title}</p>
    </div>
);


// ====================================================================================
// SECTION 2: Main Dashboard Component
// ====================================================================================

/**
 * The main dashboard component. It orchestrates the fetching and display of
 * summary statistics and a list of recent script activities with the latest visual style.
 */
function RunnerDashboard() {
    // -----------------------------------
    // State Management
    // -----------------------------------
    const [stats, setStats] = useState({ scripts: 0, templates: 0, inventories: 0 });
    const [recentHistory, setRecentHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // -----------------------------------
    // Data Fetching
    // -----------------------------------

    /**
     * This effect runs once on component mount to fetch all the necessary data
     * for the dashboard from the backend API.
     */
    useEffect(() => {
        const fetchDashboardData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const [scriptsRes, templatesRes, inventoriesRes, historyRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/scripts/list`),
                    fetch(`${API_BASE_URL}/api/templates/discover`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({})
                    }),
                    fetch(`${API_BASE_URL}/api/inventories/list`),
                    fetch(`${API_BASE_URL}/api/history/list`)
                ]);

                if (!scriptsRes.ok || !templatesRes.ok || !inventoriesRes.ok || !historyRes.ok) {
                    throw new Error('Failed to fetch dashboard data. The server may be unavailable or busy.');
                }

                const scriptsData = await scriptsRes.json();
                const templatesData = await templatesRes.json();
                const inventoriesData = await inventoriesRes.json();
                const historyData = await historyRes.json();

                setStats({
                    scripts: scriptsData.success ? (scriptsData.scripts || []).length : 0,
                    templates: templatesData.success ? Object.values(templatesData.discovered_templates || {}).flat().length : 0,
                    inventories: inventoriesData.success ? (inventoriesData.inventories || []).length : 0,
                });
                setRecentHistory(historyData.success ? (historyData.history || []).slice(0, 5) : []);

            } catch (err) {
                console.error("Dashboard fetch error:", err);
                toast.error("Could not load dashboard data.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

    // -----------------------------------
    // UI Rendering
    // -----------------------------------

    // Render an error message if data fetching failed.
    if (error) {
        return (
            <div className="text-center py-24 px-6 bg-white rounded-2xl shadow-lg">
                <ServerCrash className="mx-auto text-red-500 h-16 w-16 mb-4" />
                <h2 className="text-2xl font-semibold text-slate-700">Failed to Load Dashboard</h2>
                <p className="text-slate-500 mt-2">{error}</p>
                <p className="text-slate-400 mt-1 text-sm">Please ensure the backend server is running and accessible.</p>
            </div>
        );
    }

    // Render the main dashboard UI, wrapped in a styled container.
    return (
        <div className="bg-gradient-to-br from-slate-50/50 to-yellow-100/30 p-4 sm:p-8 rounded-3xl shadow-2xl shadow-slate-200/60 animate-fade-in">
            <div className="space-y-10">

                {/* Top Section: Header and Stats */}
                <div className="flex flex-col lg:flex-row justify-between items-start gap-10">
                    {/* Header */}
                    <header className="flex-shrink-0">
                        <h1 className="text-4xl font-bold text-slate-800">Command Center</h1>
                        <p className="mt-2 text-slate-500">An overview of system resources and recent activity.</p>
                    </header>

                    {/* Statistics Display Section */}
                    <div className="w-full lg:w-auto flex-shrink-0 flex justify-around lg:justify-end items-start space-x-4 sm:space-x-12 pt-2">
                        {/* <<< CHANGE: Shortened titles */}
                        <StatDisplay icon={<FileCode />} title="Scripts" value={stats.scripts} isLoading={isLoading} />
                        <StatDisplay icon={<LayoutTemplate />} title="Templates" value={stats.templates} isLoading={isLoading} />
                        <StatDisplay icon={<Database />} title="Inventory" value={stats.inventories} isLoading={isLoading} />
                    </div>
                </div>


                {/* Recent Activity Section (dark theme) */}
                <div className="bg-slate-800 p-6 sm:p-8 rounded-2xl shadow-lg shadow-slate-300/60">
                    <h3 className="text-xl font-semibold text-white flex items-center mb-5">
                        <Activity size={20} className="mr-3 text-yellow-400" /> Recent Activity
                    </h3>
                    {isLoading ? (
                        <div className="flex justify-center items-center h-40"><PulseLoader color="#f1c40f" /></div>
                    ) : recentHistory.length > 0 ? (
                        <ul className="space-y-2">
                            {recentHistory.map((item) => (
                                <li key={item.runId} className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors duration-200">
                                    <div className="flex items-center space-x-4">
                                        {item.isSuccess ?
                                          <CheckCircle2 className="text-yellow-400 flex-shrink-0" size={22} /> :
                                          <XCircle className="text-red-400 flex-shrink-0" size={22} />}
                                        <div>
                                            <p className="font-semibold text-slate-100">{item.scriptId}</p>
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
