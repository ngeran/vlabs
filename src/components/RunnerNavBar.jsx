// ====================================================================================
// FILE:               /src/components/RunnerNavBar.jsx
//
// DESCRIPTION:
//   A sticky top navigation bar for the Script Runner page. It provides dropdown menus
//   for script selection, a live connection status indicator, and a reset button.
//   All history-related UI has been removed for simplification.
//
// KEY FEATURES:
//   - Dynamic Dropdown Menus: Automatically groups scripts into categories for
//     organized selection.
//   - Connection Status: Visually indicates whether the WebSocket connection to the
//     backend is live or offline.
//   - Clean Interface: The History button and item count have been removed to
//     align with the simplified, stable version of the application.
//
// DEPENDENCIES:
//   - React Core: (useState, useEffect, useRef, useMemo).
//   - UI Libraries: `lucide-react` for icons.
//   - Child Components: `ScriptRunnerIcon`.
//
// ====================================================================================

// SECTION 1: IMPORTS & CONFIGURATION
// -------------------------------------------------------------------------------------------------
import React, { useState, useEffect, useRef, useMemo } from "react";
// REMOVED: History icon from lucide-react
import { ChevronDown, Wifi, WifiOff, RotateCcw } from "lucide-react";
import ScriptRunnerIcon from "./icons/ScriptRunnerIcon.jsx";

// SECTION 2: REUSABLE DROPDOWN MENU COMPONENT
// -------------------------------------------------------------------------------------------------
// This helper component is unchanged.
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
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-md hover:bg-white/60 font-mono text-xs uppercase font-bold text-slate-600 hover:text-slate-900 transition-colors"
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

// SECTION 3: THE MAIN NAVBAR COMPONENT
// -------------------------------------------------------------------------------------------------
function RunnerNavBar({
  allScripts,
  selectedScriptId,
  onScriptChange,
  isActionInProgress,
  onReset,
  isWsConnected,
  // REMOVED: onViewHistory, historyItemCount
}) {
  const showResetButton = selectedScriptId && !isActionInProgress;

  // This logic for creating dropdowns is unchanged.
  const menuData = useMemo(() => {
    const managementScripts = allScripts.filter(
      (s) => s.category === "Device Management",
    );
    const automationScripts = allScripts.filter(
      (s) =>
        s.category === "Validation & Testing" || s.category === "Configuration",
    );
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
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
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

          {/* Right Side: Controls */}
          <div className="flex items-center gap-1 bg-slate-200/70 rounded-md p-1.5 shadow-sm">
            {/* Map over menuData to create the dropdowns */}
            {menuData.map(({ label, scripts }) => (
              <DropdownMenu
                key={label}
                label={label}
                scripts={scripts}
                onSelectScript={onScriptChange}
              />
            ))}

            {/* REMOVED: Separator and History button */}

            {/* Optional "Reset" button */}
            {showResetButton && (
              <>
                {/* Add a separator only if there are dropdowns */}
                {menuData.some(m => m.scripts.length > 0) && (
                  <div className="w-px h-5 bg-slate-300 mx-1"></div>
                )}
                <button
                  onClick={onReset}
                  className="p-2 rounded-full hover:bg-white/60 text-slate-600 hover:text-blue-600 transition-colors"
                  title="Start Over / Reset"
                >
                  <RotateCcw size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default RunnerNavBar;
