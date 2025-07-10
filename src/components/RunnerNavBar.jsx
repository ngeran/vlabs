// src/components/RunnerNavBar.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { ChevronDown, History, Wifi, WifiOff, RotateCcw } from "lucide-react";
import ScriptRunnerIcon from "./icons/ScriptRunnerIcon.jsx";

// ====================================================================================
// SECTION 1: REUSABLE DROPDOWN MENU COMPONENT (This helper component is perfect as-is)
// ====================================================================================
function DropdownMenu({ label, scripts, onSelectScript }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuRef]);

  const handleSelect = (scriptId) => {
    onSelectScript(scriptId);
    setIsOpen(false);
  };

  if (!scripts || scripts.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-full hover:bg-white/60 font-mono text-xs uppercase font-bold text-slate-600 hover:text-slate-900 transition-colors"
      >
        <span>{label}</span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 w-64 bg-white rounded-lg shadow-xl border border-slate-200 p-2 z-40">
          <div className="space-y-1">
            {scripts.map((script) => (
              <button
                key={script.id}
                onClick={() => handleSelect(script.id)}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
              >
                {script.displayName}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ====================================================================================
// SECTION 2: THE MAIN NAVBAR COMPONENT (With Corrected Logic)
// ====================================================================================
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

  // ✨ --- CORRECTED: Prepare data for the specific menu structure you requested --- ✨
  const menuData = useMemo(() => {
    // Group 1: Device Management (contains scripts with 'Device Management' category)
    const managementScripts = allScripts.filter(
      (s) => s.category === "Device Management",
    );

    // Group 2: Network Automation (contains scripts from two categories)
    const automationScripts = allScripts.filter(
      (s) =>
        s.category === "Validation & Testing" || s.category === "Configuration",
    );

    // Return an array of objects to define the dropdowns and their order.
    return [
      { label: "Device Management", scripts: managementScripts },
      { label: "Network Automation", scripts: automationScripts },
    ];
  }, [allScripts]);

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
              title={
                isWsConnected
                  ? "Live connection active"
                  : "Disconnected from server"
              }
            >
              {isWsConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{isWsConnected ? "Live" : "Offline"}</span>
            </div>
          </div>

          {/* --- Right Side: Controls with the correct layout --- */}
          <div className="flex items-center gap-1 bg-slate-200/70 rounded-full p-1.5 shadow-sm">
            {/* Step 1: Map over menuData to create the DROPDOWN menus */}
            {menuData.map(({ label, scripts }) => (
              <DropdownMenu
                key={label}
                label={label}
                scripts={scripts}
                onSelectScript={onScriptChange}
              />
            ))}

            {/* Step 2: Add the separator */}
            <div className="w-px h-5 bg-slate-300 mx-1"></div>

            {/* Step 3: Add the STATIC "History" button */}
            <button
              onClick={onViewHistory}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full hover:bg-white/60 font-mono text-xs uppercase font-bold text-slate-600 hover:text-slate-900 transition-colors"
            >
              <History size={14} />
              <span>History</span>
              {historyItemCount > 0 && (
                <span className="bg-blue-600 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full ml-1">
                  {historyItemCount}
                </span>
              )}
            </button>

            {/* Step 4: Add the optional "Reset" button */}
            {showResetButton && (
              <button
                onClick={onReset}
                className="p-2 rounded-full hover:bg-white/60 text-slate-600 hover:text-blue-600 transition-colors"
                title="Start Over / Reset"
              >
                <RotateCcw size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default RunnerNavBar;
