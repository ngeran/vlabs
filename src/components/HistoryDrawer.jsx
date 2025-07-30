// =================================================================================================
// FILE:               /src/components/HistoryDrawer.jsx
//
// DESCRIPTION:
//   A presentational component that renders a list of historical script runs in a slide-out
//   panel. It receives its state (isOpen, history data) from a parent component and is
//   responsible only for the UI representation.
// =================================================================================================

// SECTION 1: IMPORTS & SETUP
// -------------------------------------------------------------------------------------------------
import React from 'react';
import { X, History, CheckCircle, XCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import PulseLoader from 'react-spinners/PulseLoader';

// SECTION 2: SUB-COMPONENT - HistoryItem
// -------------------------------------------------------------------------------------------------
/**
 * Renders a single, styled list item representing one historical run.
 * @param {{item: object}} props - The history item object containing run details.
 */
function HistoryItem({ item }) {
  return (
    <li className="p-4 rounded-lg bg-slate-100 hover:bg-slate-200/70 transition-colors duration-200 ease-in-out">
      <div className="flex items-start gap-4">
        {/* Status Icon */}
        <div className="flex-shrink-0 mt-1">
          {item.isSuccess ? (
            <CheckCircle className="w-6 h-6 text-green-600" aria-label="Success" />
          ) : (
            <XCircle className="w-6 h-6 text-red-600" aria-label="Failed" />
          )}
        </div>
        {/* Run Details */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800">{item.displayName}</p>
          <p className="text-sm text-slate-600 truncate" title={item.summary}>
            {item.summary || 'No summary available.'}
          </p>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
            <Clock size={12} />
            {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
          </p>
        </div>
      </div>
    </li>
  );
}


// SECTION 3: MAIN DRAWER COMPONENT
// -------------------------------------------------------------------------------------------------
export default function HistoryDrawer({ isOpen, onClose, history, isLoading }) {
  return (
    <>
      {/* Overlay: Dims the background content when the drawer is open. Clicking it closes the drawer. */}
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/*
        Drawer Panel: The main container for the history content.

        ANIMATION LOGIC FOR SLIDING FROM THE LEFT:
        - `fixed top-0 left-0`:  Anchors the drawer to the top-left corner of the viewport.
        - `transform`:            Tells the browser that this element's position will be animated.
        - `transition-transform`: Applies a smooth transition effect to the `transform` property.
        - `duration-300`:         Sets the animation duration to 300 milliseconds.
        - `ease-in-out`:          Defines the timing function for a smooth acceleration and deceleration.
        - `isOpen ? 'translate-x-0' : '-translate-x-full'`: This is the core logic.
          - When `isOpen` is true, `translate-x-0` is applied, positioning the drawer on-screen.
          - When `isOpen` is false, `-translate-x-full` is applied, moving the drawer 100% of its own width to the left, positioning it completely off-screen.
          The transition between these two states creates the desired slide-in/slide-out effect.
      */}
      <div
        className={`fixed top-0 left-0 h-full w-full max-w-md bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
      >
        <div className="h-full flex flex-col">
          {/* Drawer Header with Title and Close Button */}
          <header className="flex items-center justify-between p-4 border-b border-slate-200 flex-shrink-0">
            <h2 id="history-title" className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <History /> Run History
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-100 transition-colors"
              aria-label="Close history panel"
            >
              <X />
            </button>
          </header>

          {/* Drawer Body: Contains the scrollable list of history items. */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex justify-center items-center h-full">
                <PulseLoader color="#3b82f6" size={10} />
              </div>
            ) : history && history.length > 0 ? (
              <ul className="space-y-3">
                {history.map(item => (
                  <HistoryItem key={item.runId} item={item} />
                ))}
              </ul>
            ) : (
              <div className="text-center py-16 text-slate-500">
                <p>No history records found.</p>
                <p className="text-sm mt-1">Run a script with history tracking enabled to see data here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
