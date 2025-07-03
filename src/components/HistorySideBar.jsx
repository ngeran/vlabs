// src/components/HistorySidebar.jsx
import React, { useState, useEffect } from "react";
import { History, Clock, ServerCrash, CheckCircle } from "lucide-react";

const API_BASE_URL = "http://localhost:3001";

function HistorySidebar({ onSelectHistoryItem }) {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/history/list`);
        const data = await response.json();
        if (data.success) {
          setHistory(data.history);
        }
      } catch (error) {
        console.error("Failed to fetch history:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHistory();
  }, []);

  return (
    <aside className="hidden lg:block lg:w-72 flex-shrink-0">
      <div className="sticky top-24">
        <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-200 pb-2 flex items-center">
          <History size={18} className="mr-2 text-slate-500" />
          Run History
        </h3>
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading history...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No recent runs found.</p>
        ) : (
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
            {history.map((run) => (
              <li key={run.runId}>
                <button
                  onClick={() => onSelectHistoryItem(run.runId)}
                  className="w-full text-left p-2 rounded-md hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <div className="flex items-center justify-between font-medium text-sm text-slate-700">
                    <span>{run.scriptId}</span>
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
    </aside>
  );
}

export default HistorySidebar;
