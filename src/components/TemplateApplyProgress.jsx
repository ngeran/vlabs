// src/components/TemplateApplyProgress.jsx

import React from "react";
import { CheckCircle, XCircle, AlertTriangle, Loader } from "lucide-react";

// Helper component for progress steps
const ProgressStep = ({ stepInfo }) => {
  const getStatusColor = () => {
    switch (stepInfo.status) {
      case "COMPLETED":
        return "text-green-500";
      case "FAILED":
      case "TIMEOUT":
        return "text-red-500";
      case "IN_PROGRESS":
        return "text-blue-500 animate-pulse";
      default:
        return "text-slate-500";
    }
  };

  const getStatusIcon = () => {
    switch (stepInfo.status) {
      case "COMPLETED":
        return <CheckCircle size={20} />;
      case "FAILED":
      case "TIMEOUT":
        return <XCircle size={20} />;
      case "IN_PROGRESS":
        return <Loader size={20} className="animate-spin" />;
      default:
        return null;
    }
  };

  return (
    <li className="mb-4 pl-8 relative">
      <div
        className={`absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center ${getStatusColor()}`}
      >
        {getStatusIcon()}
      </div>
      <div className="font-medium text-slate-800">{stepInfo.name}</div>
      <div className="text-sm text-slate-500">{stepInfo.description}</div>
      {stepInfo.duration && (
        <div className="text-xs text-slate-400">
          Completed in {stepInfo.duration.toFixed(2)}s
        </div>
      )}
      {stepInfo.details?.commit_report && (
        <div className="text-xs text-blue-500 mt-1 pl-4 border-l-2 border-blue-200">
          {stepInfo.details.commit_report}
        </div>
      )}
    </li>
  );
};

const TemplateApplyProgress = ({ applicationState, onReset }) => {
  const { isApplying, progress, result, error, isComplete, duration } =
    applicationState;

  if (!isApplying && !isComplete) {
    return null; // Don't render if not started
  }

  const overallStatus = result?.success ? "SUCCESS" : "FAILURE";
  const progressData = result?.progress || progress;

  return (
    <div className="mt-10 border border-slate-200 rounded-lg p-6 lg:p-8 bg-white shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-slate-800">
          Configuration Deployment
        </h3>
        {isComplete && (
          <button
            onClick={onReset}
            className="text-sm text-blue-600 hover:underline"
          >
            Start New Deployment
          </button>
        )}
      </div>

      {/* Overall Status */}
      {isComplete && (
        <div
          className={`p-4 rounded-md mb-6 flex items-center gap-4 text-lg font-semibold ${
            overallStatus === "SUCCESS"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {overallStatus === "SUCCESS" ? <CheckCircle /> : <AlertTriangle />}
          <span>
            Deployment{" "}
            {overallStatus === "SUCCESS" ? "Completed Successfully" : "Failed"}{" "}
            {duration ? `in ${(duration / 1000).toFixed(2)}s` : ""}
          </span>
        </div>
      )}

      {/* Progress Steps */}
      {progressData?.steps && (
        <ul className="border-l-2 border-slate-200">
          {progressData.steps.map((step, index) => (
            <ProgressStep key={index} stepInfo={step} />
          ))}
        </ul>
      )}

      {/* Error Display */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded">
          <h4 className="font-bold">Error:</h4>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Final Result Details */}
      {result && (
        <div className="mt-6 border-t pt-4">
          <h4 className="font-semibold text-slate-700 mb-2">Final Details:</h4>
          <pre className="bg-slate-900 text-slate-200 text-xs p-4 rounded-md overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default TemplateApplyProgress;
