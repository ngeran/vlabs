// ====================================================================================
//
// FILE:               /src/components/RunnerDashboard.jsx
//
// OVERVIEW:
//   A modern, stable dashboard component that serves as the default view for the
//   script runner page. All history-related functionality has been completely
//   removed. It now focuses on providing a clean welcome message and displaying
//   high-level, static statistics about the available tools in the system.
//
// KEY FEATURES:
//   - Simplified Display: Welcomes the user and shows static counts of available
//     scripts, templates, and inventories.
//   - Self-Contained: Manages its own local state for fetching and displaying
//     statistics without relying on any props.
//   - Stable & Performant: As a mostly static component, it has minimal impact
//     on application performance and stability.
//
// DEPENDENCIES:
//   - React Core: (useState, useEffect).
//   - UI Libraries: `lucide-react` for icons.
//
// ====================================================================================


// SECTION 1: IMPORTS & CONFIGURATION
// -------------------------------------------------------------------------------------------------
import React, { useState, useEffect } from 'react';
import { FileCode, LayoutTemplate, Database, ServerCrash } from 'lucide-react';


// SECTION 2: UTILITY FUNCTIONS
// -------------------------------------------------------------------------------------------------
/**
 * A utility function to format the current date for display.
 * @param {Date} date - The date object to format.
 * @param {string} formatStr - A format string (currently unused, but for future extension).
 * @returns {string} The formatted date string, e.g., "Monday, August 2nd, 2025".
 */
const format = (date, formatStr) => {
  const d = new Date(date);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const dayName = days[d.getDay()];
  const monthName = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();

  // Helper to get the correct ordinal suffix (st, nd, rd, th) for the day.
  const getOrdinal = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return `${dayName}, ${monthName} ${getOrdinal(day)}, ${year}`;
};


// SECTION 3: SUB-COMPONENT - StatDisplay
// -------------------------------------------------------------------------------------------------
/**
 * A reusable component to display a single, impactful statistic with an icon.
 * Handles its own loading state to show a spinner while data is being fetched.
 * @param {object} props - The component props: { icon, title, value, isLoading }.
 */
const StatDisplay = ({ icon, title, value, isLoading }) => (
    <div className="flex flex-col items-center text-center w-28">
        <div className="flex items-center justify-center space-x-3 h-20">
            <div className="bg-slate-200/70 p-3 rounded-xl shadow-sm">
                {React.cloneElement(icon, { size: 24, className: "text-slate-700" })}
            </div>
            {isLoading ? (
                <div className="flex items-center justify-center w-20 h-20">
                    <div className="w-8 h-8 border-2 border-slate-300 rounded-full animate-spin border-t-slate-600"></div>
                </div>
            ) : (
                <span className="text-6xl md:text-8xl font-thin text-slate-800 tracking-tighter">{value}</span>
            )}
        </div>
        <p className="text-sm text-slate-500 mt-3 font-semibold">{title}</p>
    </div>
);


// SECTION 4: MAIN DASHBOARD COMPONENT
// -------------------------------------------------------------------------------------------------
/**
 * The main component for the Runner Dashboard page. It is now fully independent
 * and does not accept any props.
 */
function RunnerDashboard() {
    // --- State Management (Local to this component) ---
    const [stats, setStats] = useState({ scripts: 0, templates: 0, inventories: 0 });
    const [isStatsLoading, setIsStatsLoading] = useState(true);
    const [error, setError] = useState(null);

    // --- Data Fetching Effect ---
    // This effect runs once when the component mounts to fetch dashboard-specific stats.
    useEffect(() => {
        const fetchStatsData = async () => {
            setIsStatsLoading(true);
            setError(null);
            try {
                // Simulate an API call to fetch counts of available tools.
                await new Promise(resolve => setTimeout(resolve, 800));

                // In a real implementation, this would come from an API endpoint.
                setStats({
                    scripts: 12,
                    templates: 8,
                    inventories: 5,
                });

            } catch (err) {
                console.error("Dashboard stats fetch error:", err);
                setError(err.message);
            } finally {
                setIsStatsLoading(false);
            }
        };

        fetchStatsData();
    }, []); // Empty dependency array ensures this runs only once on mount.


    // --- UI Rendering ---
    // Render an error state if the API call fails.
    if (error) {
        return (
            <div className="text-center py-24 px-6 bg-white rounded-2xl shadow-lg border border-gray-200">
                <ServerCrash className="mx-auto text-red-400 h-16 w-16 mb-4" />
                <h2 className="text-2xl font-semibold text-slate-800">Failed to Load Dashboard Stats</h2>
                <p className="text-slate-500 mt-2">{error}</p>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-slate-50 to-white p-4 sm:p-8 rounded-3xl shadow-xl shadow-slate-200/70 animate-fade-in">
            <div className="space-y-12">
                {/* Top Section: Header and Statistics */}
                <div className="flex flex-col lg:flex-row justify-between items-start gap-10">
                    {/* Header Text */}
                    <header className="flex-shrink-0">
                        <p className="text-3xl lg:text-4xl font-thin text-slate-600 tracking-wide mb-4">
                            {format(new Date(), 'EEEE, MMMM do, yyyy')}
                        </p>
                        <h1 className="text-4xl lg:text-5xl font-bold text-slate-800">Command Center</h1>
                        <p className="mt-2 text-slate-500">Select a tool from the navigation to begin.</p>
                    </header>

                    {/* Stats Display Area */}
                    <div className="w-full lg:w-auto flex-shrink-0 flex justify-around lg:justify-end items-start space-x-4 sm:space-x-8 pt-2">
                        <StatDisplay icon={<FileCode />} title="Scripts" value={stats.scripts} isLoading={isStatsLoading} />
                        <StatDisplay icon={<LayoutTemplate />} title="Templates" value={stats.templates} isLoading={isStatsLoading} />
                        <StatDisplay icon={<Database />} title="Inventories" value={stats.inventories} isLoading={isStatsLoading} />
                    </div>
                </div>

                {/* You can add more static content or cards here in the future */}

            </div>
        </div>
    );
}

export default RunnerDashboard;
