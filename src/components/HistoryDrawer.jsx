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
  },
  {
    runId: '5',
    displayName: 'Security Audit',
    summary: 'Vulnerability scan completed, 3 minor issues identified and patched',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
    isSuccess: true,
    duration: '12m 18s'
  }
];

// Utility function to format time
function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }
}

// Timeline Item Component
function TimelineItem({ item, isLast }) {
  const statusConfig = {
    success: {
      circleColor: 'bg-emerald-500 border-emerald-200',
      cardBg: 'bg-gradient-to-br from-emerald-50/80 to-green-50/60',
      icon: CheckCircle,
      iconColor: 'text-emerald-600'
    },
    error: {
      circleColor: 'bg-red-500 border-red-200',
      cardBg: 'bg-gradient-to-br from-red-50/80 to-pink-50/60',
      icon: XCircle,
      iconColor: 'text-red-600'
    }
  };

  const config = item.isSuccess ? statusConfig.success : statusConfig.error;
  const StatusIcon = config.icon;

  return (
    <div className="relative flex group">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-4 top-8 w-0.5 h-full bg-gradient-to-b from-slate-300 to-slate-200 -z-10" />
      )}

      {/* Timeline circle with time */}
      <div className="flex flex-col items-center flex-shrink-0 mr-4">
        <div className={`w-8 h-8 rounded-full border-4 border-white shadow-lg ${config.circleColor} flex items-center justify-center transition-all duration-300 group-hover:scale-110 z-10`}>
          <div className="w-2 h-2 bg-white rounded-full" />
        </div>
        <div className="mt-2 text-xs font-medium text-slate-500 bg-white/80 backdrop-blur-sm px-2 py-1 rounded-full border border-slate-200/60">
          {formatTime(item.timestamp)}
        </div>
      </div>

      {/* Content card */}
      <div className={`flex-1 mb-6 rounded-2xl border border-white/60 ${config.cardBg} backdrop-blur-sm p-4 shadow-sm hover:shadow-md transition-all duration-300 group-hover:scale-[1.02] cursor-pointer`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <StatusIcon className={`w-4 h-4 ${config.iconColor} flex-shrink-0`} />
            <h3 className="font-semibold text-slate-900 text-sm leading-tight">
              {item.displayName}
            </h3>
          </div>
          {item.duration && (
            <div className="flex items-center gap-1 text-xs text-slate-500 bg-white/60 rounded-full px-2 py-1">
              <Zap className="w-3 h-3" />
              <span>{item.duration}</span>
            </div>
          )}
        </div>

        {/* Summary */}
        <p className="text-slate-600 text-xs leading-relaxed">
          {item.summary || 'No summary available.'}
        </p>
      </div>
    </div>
  );
}

// Date Section Component
function DateSection({ date, items }) {
  return (
    <div className="mb-8">
      {/* Date header */}
      <div className="flex items-center gap-3 mb-4 px-1">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent flex-1" />
        <div className="bg-gradient-to-r from-violet-600 to-purple-600 text-white px-3 py-1 rounded-full text-xs font-semibold shadow-sm">
          {date}
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent flex-1" />
      </div>

      {/* Timeline items */}
      <div>
        {items.map((item, index) => (
          <TimelineItem
            key={item.runId}
            item={item}
            isLast={index === items.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

// Loading component
function ModernLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-40 space-y-4">
      <div className="relative">
        <div className="w-10 h-10 border-3 border-slate-200 rounded-full animate-spin border-t-violet-500"></div>
        <div className="w-6 h-6 border-2 border-slate-100 rounded-full animate-spin border-t-purple-400 absolute top-2 left-2" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }}></div>
      </div>
      <p className="text-slate-500 text-sm font-medium">Loading timeline...</p>
    </div>
  );
}

// Main Drawer Component
export default function HistoryDrawer({
  isOpen = true,
  onClose = () => {},
  history = mockHistory,
  isLoading = false
}) {
  // Group history by date
  const groupedHistory = React.useMemo(() => {
    if (!history || history.length === 0) return {};

    return history.reduce((groups, item) => {
      const date = formatDate(item.timestamp);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(item);
      return groups;
    }, {});
  }, [history]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-all duration-500 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 left-0 h-full w-full max-w-md bg-white/95 backdrop-blur-xl shadow-2xl z-50 transform transition-all duration-500 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } border-r border-white/20`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <header className="bg-gradient-to-r from-white/90 to-slate-50/90 backdrop-blur-sm border-b border-slate-200/60 p-6 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h2 id="history-title" className="text-xl font-bold text-slate-900">
                    Execution Timeline
                  </h2>
                  <p className="text-sm text-slate-500">
                    {history?.length || 0} runs tracked
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-slate-100/80 transition-colors backdrop-blur-sm"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
          </header>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              {isLoading ? (
                <ModernLoader />
              ) : Object.keys(groupedHistory).length > 0 ? (
                <div>
                  {Object.entries(groupedHistory).map(([date, items]) => (
                    <DateSection
                      key={date}
                      date={date}
                      items={items}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                    <Clock className="w-8 h-8 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">No Timeline Yet</h3>
                  <p className="text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">
                    Execute your first script to start building your timeline history.
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
