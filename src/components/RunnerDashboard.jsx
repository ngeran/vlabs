// ====================================================================================
// FILE:               /src/components/RunnerDashboard.jsx
//
// DESCRIPTION:
//   A modern dashboard component with dark theme, featuring date display, two-column
//   layout with timeline-based recent activity and enhanced statistics including most executed scripts.
// ====================================================================================

// SECTION 1: IMPORTS & CONFIGURATION
// -------------------------------------------------------------------------------------------------
import React, { useState, useEffect, useMemo } from 'react';
import { FileCode, LayoutTemplate, Database, Activity, CheckCircle2, XCircle, Clock, ServerCrash, TrendingUp, Zap } from 'lucide-react';
// Utility functions to replace date-fns
const formatDistanceToNow = (date) => {
  const now = new Date();
  const diff = now - new Date(date);
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 60) return `${minutes} minutes ago`;
  if (hours < 24) return `${hours} hours ago`;
  return `${days} days ago`;
};

const format = (date, formatStr) => {
  const d = new Date(date);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const dayName = days[d.getDay()];
  const monthName = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();

  const getOrdinal = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return `${dayName}, ${monthName} ${getOrdinal(day)}, ${year}`;
};

const API_BASE_URL = "http://localhost:3001";

// Mock data for demonstration (would be removed in real implementation)
const mockHistory = [
  {
    runId: '1',
    displayName: 'Data Migration Script',
    timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    isSuccess: true,
    duration: '2m 34s'
  },
  {
    runId: '2',
    displayName: 'API Health Check',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    isSuccess: true,
    duration: '45s'
  },
  {
    runId: '3',
    displayName: 'Backup Validation',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6), // 6 hours ago
    isSuccess: false,
    duration: '5m 12s'
  },
  {
    runId: '4',
    displayName: 'Performance Optimization',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    isSuccess: true,
    duration: '8m 21s'
  }
];

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
                    <div className="w-8 h-8 border-2 border-yellow-600 rounded-full animate-spin border-t-yellow-300"></div>
                </div>
            ) : (
                <span className="text-8xl font-thin text-slate-800 tracking-tighter">{value}</span>
            )}
        </div>
        <p className="text-sm text-slate-500 mt-3 font-semibold">{title}</p>
    </div>
);

// SECTION 3: SUB-COMPONENT - Dashboard Timeline for Recent Activity
// -------------------------------------------------------------------------------------------------
function DashboardTimeline({ history, isLoading }) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <div className="relative">
          <div className="w-8 h-8 border-2 border-slate-600 rounded-full animate-spin border-t-yellow-400"></div>
          <div className="w-4 h-4 border-2 border-slate-700 rounded-full animate-spin border-t-yellow-300 absolute top-2 left-2" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }}></div>
        </div>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-700 flex items-center justify-center">
          <Clock className="w-6 h-6 text-slate-400" />
        </div>
        <p className="text-slate-400 text-sm">No recent script runs found.</p>
      </div>
    );
  }

  const recentItems = history.slice(0, 5);

  return (
    <div className="space-y-1">
      {recentItems.map((item, index) => {
        const isLast = index === recentItems.length - 1;
        const statusConfig = {
          success: {
            circleColor: 'bg-yellow-400 border-yellow-200',
            iconColor: 'text-yellow-400'
          },
          error: {
            circleColor: 'bg-red-500 border-red-300',
            iconColor: 'text-red-400'
          }
        };

        const config = item.isSuccess ? statusConfig.success : statusConfig.error;
        const StatusIcon = item.isSuccess ? CheckCircle2 : XCircle;

        // Format time for mini timeline
        const timeStr = new Date(item.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        return (
          <div key={item.runId} className="relative flex items-center group">
            {/* Timeline line */}
            {!isLast && (
              <div className="absolute left-3 top-6 w-0.5 h-8 bg-gradient-to-b from-slate-600 to-slate-700" />
            )}

            {/* Timeline circle */}
            <div className="flex-shrink-0 mr-4 flex flex-col items-center">
              <div className={`w-6 h-6 rounded-full border-2 border-slate-800 ${config.circleColor} flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110 z-10`}>
                <div className="w-1.5 h-1.5 bg-slate-800 rounded-full" />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 bg-slate-700/30 hover:bg-slate-700/50 transition-all duration-200 rounded-xl p-3 group-hover:scale-[1.01] cursor-pointer border border-slate-600/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 min-w-0">
                  <StatusIcon className={`${config.iconColor} flex-shrink-0`} size={16} />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-100 text-sm truncate">{item.displayName}</p>
                    <div className="flex items-center text-xs text-slate-400 mt-0.5">
                      <Clock size={10} className="mr-1.5" />
                      <span>{timeStr}</span>
                      {item.duration && (
                        <>
                          <span className="mx-2">•</span>
                          <Zap className="w-3 h-3 mr-1" />
                          <span>{item.duration}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// SECTION 4: MAIN DASHBOARD COMPONENT
// -------------------------------------------------------------------------------------------------
/**
 * Modern dashboard with enhanced statistics and two-column layout
 * @param {{history: Array<object>, isLoading: boolean}} props - Props from the parent component.
 */
function RunnerDashboard({ history = mockHistory, isLoading: isHistoryLoading = false }) {
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

    // --- Data Fetching for Stats (Simulated for demo) ---
    useEffect(() => {
        const fetchStatsData = async () => {
            setIsStatsLoading(true);
            setError(null);
            try {
                // Simulate API delay
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Mock data - in real implementation, these would be actual API calls
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
                    {/* Left Card - Recent Activity with Timeline */}
                    <div className="bg-slate-800 p-6 sm:p-8 rounded-2xl shadow-lg shadow-slate-300/60">
                        <h3 className="text-xl font-semibold text-white flex items-center mb-5">
                            <Activity size={20} className="mr-3 text-yellow-400" /> Recent Activity
                        </h3>
                        <DashboardTimeline history={history} isLoading={isHistoryLoading} />
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
                                                <div className="w-8 h-8 border-2 border-slate-600 rounded-full animate-spin border-t-yellow-400"></div>
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
                                                <div className="w-8 h-8 border-2 border-slate-600 rounded-full animate-spin border-t-yellow-400"></div>
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
                                        <div className="w-6 h-6 border-2 border-slate-600 rounded-full animate-spin border-t-yellow-400"></div>
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
