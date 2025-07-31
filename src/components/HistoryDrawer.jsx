// =================================================================================================
// FILE:               /src/components/HistoryDrawer.jsx
//
// DESCRIPTION:
//   A modern, redesigned presentational component that renders a list of historical script runs
//   in a slide-out panel with contemporary styling, glassmorphism effects, and smooth animations.
// =================================================================================================

import React from 'react';
import { X, History, CheckCircle, XCircle, Clock, Zap, AlertTriangle } from 'lucide-react';

// Mock data for demonstration
const mockHistory = [
  {
    runId: '1',
    displayName: 'Data Migration Script',
    summary: 'Successfully migrated 10,000 user records to new database schema',
    timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    isSuccess: true,
    duration: '2m 34s'
  },
  {
    runId: '2',
    displayName: 'API Health Check',
    summary: 'All endpoints responding normally, latency within acceptable range',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    isSuccess: true,
    duration: '45s'
  },
  {
    runId: '3',
    displayName: 'Backup Validation',
    summary: 'Connection timeout while validating remote backup integrity',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6), // 6 hours ago
    isSuccess: false,
    duration: '5m 12s'
  },
  {
    runId: '4',
    displayName: 'Performance Optimization',
    summary: 'Database queries optimized, reduced average response time by 40%',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    isSuccess: true,
    duration: '8m 21s'
  }
];

// Utility function to format time ago
function formatTimeAgo(timestamp) {
  const now = new Date();
  const diff = now - new Date(timestamp);
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// SECTION 2: SUB-COMPONENT - HistoryItem (Compact Version)
// -------------------------------------------------------------------------------------------------
function HistoryItem({ item }) {
  const statusConfig = {
    success: {
      icon: CheckCircle,
      bgColor: 'bg-emerald-50/80',
      iconColor: 'text-emerald-600',
      accentColor: 'bg-emerald-500'
    },
    error: {
      icon: XCircle,
      bgColor: 'bg-red-50/80',
      iconColor: 'text-red-600',
      accentColor: 'bg-red-500'
    }
  };

  const config = item.isSuccess ? statusConfig.success : statusConfig.error;
  const StatusIcon = config.icon;

  return (
    <div className={`group relative overflow-hidden rounded-xl border border-slate-200/60 ${config.bgColor} p-3 transition-all duration-300 hover:shadow-md cursor-pointer`}>
      {/* Compact accent bar */}
      <div className={`absolute left-0 top-0 h-full w-0.5 ${config.accentColor} transition-all duration-300 group-hover:w-1`} />

      <div className="flex items-start gap-3">
        {/* Inline status icon */}
        <div className="flex-shrink-0 mt-0.5">
          <StatusIcon className={`w-4 h-4 ${config.iconColor}`} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Compact title and meta on same line for shorter items */}
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-medium text-slate-900 text-sm truncate pr-2">
              {item.displayName}
            </h3>
            <span className="text-xs text-slate-400 flex-shrink-0">
              {formatTimeAgo(item.timestamp)}
            </span>
          </div>

          {/* Compact summary - single line with truncation */}
          <p className="text-slate-600 text-xs mb-2 truncate" title={item.summary}>
            {item.summary || 'No summary available.'}
          </p>

          {/* Compact duration info */}
          {item.duration && (
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Zap className="w-3 h-3" />
              <span>{item.duration}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// SECTION 3: COMPACT LOADING SPINNER
// -------------------------------------------------------------------------------------------------
function ModernLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-32 space-y-3">
      <div className="w-8 h-8 border-2 border-slate-200 rounded-full animate-spin border-t-violet-500"></div>
      <p className="text-slate-500 text-xs">Loading...</p>
    </div>
  );
}

// SECTION 4: MAIN DRAWER COMPONENT
// -------------------------------------------------------------------------------------------------
export default function HistoryDrawer({
  isOpen = true, // Default to true for demo
  onClose = () => {},
  history = mockHistory, // Use mock data for demo
  isLoading = false
}) {
  return (
    <>
      {/* Enhanced backdrop with blur effect */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-all duration-500 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Compact drawer */}
      <div
        className={`fixed top-0 left-0 h-full w-full max-w-sm bg-white/95 backdrop-blur-xl shadow-2xl z-50 transform transition-all duration-500 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } border-r border-white/20`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
      >
        <div className="h-full flex flex-col">
          {/* Compact header */}
          <header className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-200/60 p-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h2 id="history-title" className="text-lg font-bold text-slate-900">
                    History
                  </h2>
                  <p className="text-xs text-slate-500">
                    {history?.length || 0} runs
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          </header>

          {/* Compact scrollable content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-3">
              {isLoading ? (
                <ModernLoader />
              ) : history && history.length > 0 ? (
                <div className="space-y-2">
                  {history.map((item, index) => (
                    <div
                      key={item.runId}
                      style={{
                        animationDelay: `${index * 50}ms`
                      }}
                      className="animate-in slide-in-from-left-2 fade-in duration-300"
                    >
                      <HistoryItem item={item} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-slate-400" />
                  </div>
                  <h3 className="text-sm font-medium text-slate-700 mb-1">No History</h3>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Run scripts to see execution history here.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
