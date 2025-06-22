// src/components/LabCard.jsx
import React from "react";
import { Clock, Info, Play, Square, Loader, AlertCircle } from "lucide-react"; // Import new icons
import getDifficultyColor from "../utils/getDifficultyColor"; // Utility to get appropriate Tailwind CSS color classes

// Accept new props: onStopLab, currentStatus, isLaunching
const LabCard = ({
  lab,
  onViewDetails,
  onStartLab,
  onStopLab,
  currentStatus,
  isLaunching,
}) => {
  // Helper to get status icon for LabCard
  const getStatusIcon = (status) => {
    switch (status) {
      case "launching":
        return <Loader className="w-3.5 h-3.5 animate-spin text-blue-600" />;
      case "running":
        return <Play className="w-3.5 h-3.5 text-green-600" />;
      case "failed":
        return <AlertCircle className="w-3.5 h-3.5 text-red-600" />;
      case "stopped":
        return <Square className="w-3.5 h-3.5 text-gray-600" />;
      case "stopping": // Added stopping state for visual feedback
        return <Loader className="w-3.5 h-3.5 animate-spin text-gray-600" />;
      default:
        return null;
    }
  };

  // Helper to get status badge colors for LabCard
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case "launching":
        return "bg-blue-100 text-blue-800";
      case "running":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "stopped":
        return "bg-gray-100 text-gray-800";
      case "stopping":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Determine if the lab is currently running or in a state where it should be stopped
  const isLabRunning = currentStatus === "running";
  // Determine if the lab is currently launching (from either LabCard or LabModal)
  const isLabLaunching = currentStatus === "launching" || isLaunching;
  // Determine if the lab is currently stopping
  const isLabStopping = currentStatus === "stopping";

  return (
    <div className="w-full">
      {/* Topology Image Section: Clickable to launch LabModal */}
      <div
        className="relative bg-white shadow-md rounded-xl overflow-hidden cursor-pointer"
        onClick={() => onViewDetails(lab)}
      >
        <img
          src={`/labs/${lab.category}/${lab.slug}/topology.png`}
          alt={`${lab.title} topology`}
          className="w-[400px] h-[200px] object-cover bg-gray-100" // Adjusted to 400x200px
          onError={(e) => {
            e.target.style.display = "none";
            const parent = e.target.parentElement;
            parent.classList.add(
              "bg-gray-200",
              "flex",
              "items-center",
              "justify-center",
              "text-gray-500",
              "w-[400px]", // Also adjust the fallback div size
              "h-[200px]", // Also adjust the fallback div size
            );
            parent.innerHTML =
              '<span class="text-sm font-medium">Topology image not available</span>';
          }}
        />
        {/* Difficulty Level Badge: Top-right, rounded-md */}
        {lab.difficulty && (
          <span
            className={`absolute top-3 right-3 px-3 py-1 rounded-md text-xs font-semibold uppercase ${getDifficultyColor(
              lab.difficulty,
            )}`}
          >
            {lab.difficulty}
          </span>
        )}
        {/* NEW: Lab Status Badge on the image (Bottom-left) */}
        {currentStatus && (
          <span
            className={`absolute bottom-3 left-3 px-3 py-1 rounded-md text-xs font-semibold uppercase flex items-center space-x-1 ${getStatusBadgeClass(currentStatus)}`}
          >
            {getStatusIcon(currentStatus)}
            <span>{currentStatus}</span>
          </span>
        )}
      </div>

      {/* Content Section: Visually merges with the page's background */}
      <div className="pt-4 px-5 pb-5">
        {/* Lab Title */}
        <h5 className="text-xl font-semibold tracking-tight text-slate-900 mb-2">
          {lab.title}
        </h5>

        {/* Duration and Buttons Line */}
        <div className="mt-2.5 flex items-center justify-between">
          {/* Duration (Bottom Left): Black background with white text, and black clock icon */}
          <div className="flex items-center text-sm text-gray-500">
            <span className="mr-1 rounded bg-black px-2 py-0.5 text-xs font-semibold text-white">
              {lab.duration || "N/A"}
            </span>
            <Clock className="h-4 w-4 text-black" />
          </div>

          {/* Buttons Group (Right side, next to each other, smaller) */}
          <div className="flex items-center space-x-2">
            {/* Details Button */}
            <button
              onClick={() => onViewDetails(lab)}
              className="flex items-center justify-center space-x-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium px-3 py-1.5 rounded-md text-xs transition-colors duration-200 cursor-pointer"
            >
              <Info className="h-3.5 w-3.5" />
              <span>Details</span>
            </button>

            {/* Conditional Start/Stop Button */}
            {isLabRunning ? (
              // Stop Button (visible when lab is running)
              <button
                onClick={() => onStopLab(lab)}
                disabled={isLabStopping} // Disable while stopping
                className="flex items-center rounded-md bg-red-600 px-3 py-1.5 text-center text-xs font-medium text-white hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              >
                {isLabStopping ? (
                  <>
                    <Loader className="w-3.5 h-3.5 animate-spin" />
                    <span>Stopping</span>
                  </>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop Lab</span>
                  </>
                )}
              </button>
            ) : (
              // Start Lab Button (visible when lab is not running)
              <button
                onClick={() => onStartLab(lab)}
                disabled={isLabLaunching || isLabStopping} // Disable while launching or if it's currently stopping
                className="flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-center text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              >
                {isLabLaunching ? (
                  <>
                    <Loader className="w-3.5 h-3.5 animate-spin" />
                    <span>Launching</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Start Lab</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LabCard;
