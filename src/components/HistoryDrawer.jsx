// src/components/HistoryDrawer.jsx
import React, { useEffect } from "react";
import { X, History, Clock, ServerCrash, CheckCircle } from "lucide-react";

function HistoryDrawer({
  history,
  isLoading,
  isOpen,
  onClose,
  onSelectHistoryItem,
  selectedHistoryId,
}) {
  console.log("[DIAG][HistoryDrawer] Rendered with history count:", history.length);

  // Effect to handle the Escape key to close the drawer
  useEffect(() => {
    const handleEsc = (event) => {
      if (event.keyCode === 27) onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div
        className={`fixed top-0 right-0 bottom-0 w-80 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-4 h-full flex flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center">
              <History size={18} className="mr-2 text-slate-500" />
              Run History
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors"
            >
              <X size={20} />
            </button>
          </header>

          <div className="overflow-y-auto flex-1 pr-2">
            {isLoading ? (
              <p>Loading...</p>
            ) : history.length === 0 ? (
              <p>No runs yet.</p>
            ) : (
              <ul className="space-y-1">
                {history.map((run) => (
                  <li key={run.runId}>
                    <button
                      onClick={() => {
                        onSelectHistoryItem(run.runId);
                        onClose();
                      }}
                      className={`w-full text-left p-2 rounded-md hover:bg-slate-100 transition-colors ${
                        selectedHistoryId === run.runId ? "bg-blue-50" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between font-medium text-sm text-slate-800">
                        <span className="truncate">{run.scriptId}</span>
                        {run.isSuccess ? (
                          <CheckCircle size={16} className="text-green-500" />
                        ) : (
                          <ServerCrash size={16} className="text-red-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                        <Clock size={12} />
                        <span>{new Date(run.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default HistoryDrawer;
