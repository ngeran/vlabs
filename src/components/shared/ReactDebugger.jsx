// =============================================================================
// FILE: ReactDebugger.jsx
// DESCRIPTION: Comprehensive React debugging component with state tracking,
//              prop inspection, re-render monitoring, and performance metrics.
//              Perfect for debugging React components and state management.
//
// OVERVIEW:
//   This component provides real-time React debugging capabilities including
//   component state tracking, prop changes, re-render counts, performance
//   metrics, and error boundaries. It can monitor any React component and
//   display debugging information in a clean, organized interface.
//
// DEPENDENCIES:
//   - react: For building the UI and debugging hooks
//   - lucide-react: For icons (Bug, Activity, Timer, AlertTriangle)
//
// HOW TO USE:
//   1. Add to your script metadata:
//      capabilities:
//        enableReactDebug: true
//        reactDebugSettings:
//          trackRenders: true
//          trackProps: true
//          trackPerformance: true
//
//   2. Wrap your component or add to your debug panel:
//      import ReactDebugger from '../components/shared/ReactDebugger';
//
//      <ReactDebugger
//        componentName="MyComponent"
//        state={componentState}
//        props={componentProps}
//        isVisible={script?.capabilities?.enableReactDebug}
//      />
//
//   3. For hook debugging:
//      const debugInfo = useReactDebugger('MyComponent', state, props);
// =============================================================================

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Bug, Activity, Timer, AlertTriangle, Zap, Eye, RefreshCw } from "lucide-react";

// =============================================================================
// SECTION 1: REACT DEBUG HOOK
// =============================================================================
export const useReactDebugger = (componentName, state = {}, props = {}) => {
  const renderCount = useRef(0);
  const lastRender = useRef(Date.now());
  const renderHistory = useRef([]);
  const [debugInfo, setDebugInfo] = useState({
    renders: 0,
    lastRenderTime: 0,
    averageRenderTime: 0,
    stateChanges: [],
    propChanges: [],
    performance: {}
  });

  // Track renders
  useEffect(() => {
    renderCount.current += 1;
    const now = Date.now();
    const renderTime = now - lastRender.current;

    renderHistory.current.push({
      timestamp: now,
      renderTime,
      state: JSON.stringify(state),
      props: JSON.stringify(props)
    });

    // Keep only last 50 renders
    if (renderHistory.current.length > 50) {
      renderHistory.current = renderHistory.current.slice(-50);
    }

    const avgRenderTime = renderHistory.current.reduce((acc, r) => acc + r.renderTime, 0) / renderHistory.current.length;

    setDebugInfo(prev => ({
      ...prev,
      renders: renderCount.current,
      lastRenderTime: renderTime,
      averageRenderTime: avgRenderTime,
      componentName
    }));

    lastRender.current = now;
  });

  // Track state changes
  const prevState = useRef(state);
  useEffect(() => {
    if (JSON.stringify(prevState.current) !== JSON.stringify(state)) {
      setDebugInfo(prev => ({
        ...prev,
        stateChanges: [
          ...prev.stateChanges.slice(-10), // Keep last 10 changes
          {
            timestamp: Date.now(),
            from: prevState.current,
            to: state
          }
        ]
      }));
      prevState.current = state;
    }
  }, [state]);

  // Track prop changes
  const prevProps = useRef(props);
  useEffect(() => {
    if (JSON.stringify(prevProps.current) !== JSON.stringify(props)) {
      setDebugInfo(prev => ({
        ...prev,
        propChanges: [
          ...prev.propChanges.slice(-10), // Keep last 10 changes
          {
            timestamp: Date.now(),
            from: prevProps.current,
            to: props
          }
        ]
      }));
      prevProps.current = props;
    }
  }, [props]);

  return debugInfo;
};

// =============================================================================
// SECTION 2: COMPONENT DEFINITION
// =============================================================================
export default function ReactDebugger({
  componentName = "Component",
  state = {},
  props = {},
  isVisible = true,
  trackRenders = true,
  trackProps = true,
  trackPerformance = true,
  className = ""
}) {
  const debugInfo = useReactDebugger(componentName, state, props);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isVisible) return null;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'state', label: 'State', icon: Eye },
    { id: 'props', label: 'Props', icon: Zap },
    { id: 'performance', label: 'Performance', icon: Timer }
  ];

  const renderOverview = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 p-3 rounded-lg">
          <div className="text-xs text-blue-600 font-medium">Renders</div>
          <div className="text-lg font-bold text-blue-900">{debugInfo.renders}</div>
        </div>
        <div className="bg-green-50 p-3 rounded-lg">
          <div className="text-xs text-green-600 font-medium">Last Render</div>
          <div className="text-lg font-bold text-green-900">{debugInfo.lastRenderTime}ms</div>
        </div>
        <div className="bg-purple-50 p-3 rounded-lg">
          <div className="text-xs text-purple-600 font-medium">Avg Render</div>
          <div className="text-lg font-bold text-purple-900">{debugInfo.averageRenderTime?.toFixed(1)}ms</div>
        </div>
        <div className="bg-orange-50 p-3 rounded-lg">
          <div className="text-xs text-orange-600 font-medium">State Changes</div>
          <div className="text-lg font-bold text-orange-900">{debugInfo.stateChanges.length}</div>
        </div>
      </div>
    </div>
  );

  const renderState = () => (
    <div className="space-y-3">
      <div className="bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-xs overflow-auto max-h-40">
        <pre>{JSON.stringify(state, null, 2)}</pre>
      </div>
      {debugInfo.stateChanges.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-2">Recent Changes</h4>
          <div className="space-y-2 max-h-32 overflow-auto">
            {debugInfo.stateChanges.slice(-5).reverse().map((change, idx) => (
              <div key={idx} className="text-xs bg-yellow-50 p-2 rounded border">
                <div className="text-yellow-700">
                  {new Date(change.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderProps = () => (
    <div className="space-y-3">
      <div className="bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-xs overflow-auto max-h-40">
        <pre>{JSON.stringify(props, null, 2)}</pre>
      </div>
    </div>
  );

  const renderPerformance = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3">
        <div className="bg-slate-50 p-3 rounded-lg">
          <div className="text-xs text-slate-600">Performance Metrics</div>
          <div className="mt-2 space-y-1 text-xs">
            <div>Total Renders: <span className="font-medium">{debugInfo.renders}</span></div>
            <div>Average Time: <span className="font-medium">{debugInfo.averageRenderTime?.toFixed(2)}ms</span></div>
            <div>Last Render: <span className="font-medium">{debugInfo.lastRenderTime}ms</span></div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200/60 rounded-2xl shadow-sm ${className}`}>
      <div className="px-5 py-4 border-b border-indigo-100/80">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between gap-3 cursor-pointer hover:bg-indigo-100/50 rounded-xl p-2 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl shadow-sm">
              <Bug className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="text-left">
              <h3 className="text-base font-semibold text-indigo-900">React Debugger</h3>
              <p className="text-xs text-indigo-600">{componentName} • {debugInfo.renders} renders</p>
            </div>
          </div>
          <RefreshCw className={`h-4 w-4 text-indigo-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isExpanded && (
        <div className="p-5">
          <div className="flex gap-1 mb-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  selectedTab === tab.id
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <tab.icon className="h-3 w-3" />
                {tab.label}
              </button>
            ))}
          </div>

          <div>
            {selectedTab === 'overview' && renderOverview()}
            {selectedTab === 'state' && renderState()}
            {selectedTab === 'props' && renderProps()}
            {selectedTab === 'performance' && renderPerformance()}
          </div>
        </div>
      )}
    </div>
  );
}
