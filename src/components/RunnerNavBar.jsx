// ====================================================================================
// RunnerNavBar.jsx
// A dedicated navigation bar for the Script Runner UI.
// ====================================================================================
import React from "react";

// Iconography
import { History, Wifi, WifiOff, RotateCcw } from "lucide-react";
import ScriptRunnerIcon from "./icons/ScriptRunnerIcon.jsx";

function RunnerNavBar({
  allScripts,
  selectedScriptId,
  onScriptChange,
  isActionInProgress,
  onReset,
  onViewHistory,
  historyItemCount,
  isWsConnected,
}) {
  const showResetButton = selectedScriptId && !isActionInProgress;

  return (
    <header className="bg-white/80 backdrop-blur-lg sticky top-0 z-30 border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Left Side: Title & Status */}
          <div className="flex items-center gap-4">
            <ScriptRunnerIcon className="h-9 w-9" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Script Runner
            </h1>
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                isWsConnected
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800 animate-pulse"
              }`}
            >
              {isWsConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{isWsConnected ? "Live" : "Offline"}</span>
            </div>
          </div>

          {/* Right Side: Actions & Controls */}
          <div className="flex items-center gap-4">
            {/* --- The Improved Script Selector --- */}
            <select
              id="script-select-nav"
              value={selectedScriptId}
              onChange={(e) => onScriptChange(e.target.value)}
              disabled={isActionInProgress}
              className="w-64 border-slate-300 rounded-md p-2 shadow-sm focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
              aria-label="Choose a script"
            >
              <option value="">--- Choose a script ---</option>
              {allScripts.map((script) => (
                <option key={script.id} value={script.id}>
                  {script.displayName}
                </option>
              ))}
            </select>

            {/* --- "Start Over" Button (Conditional) --- */}
            {showResetButton && (
              <button
                onClick={onReset}
                className="p-2 rounded-md hover:bg-slate-100 text-slate-600 hover:text-blue-600 transition-colors"
                title="Start Over / Reset"
              >
                <RotateCcw size={18} />
              </button>
            )}

            <div className="h-8 border-l border-slate-200 mx-2"></div>

            {/* --- View History Button --- */}
            <button
              onClick={onViewHistory}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <History size={16} />
              <span>History</span>
              {historyItemCount > 0 && (
                <span className="bg-blue-600 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">
                  {historyItemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export default RunnerNavBar;
