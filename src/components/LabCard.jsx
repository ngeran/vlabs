import React from "react";
import { Clock, Info } from "lucide-react"; // Importing icons for duration and details button
import getDifficultyColor from "../utils/getDifficultyColor"; // Utility to get appropriate Tailwind CSS color classes

const LabCard = ({ lab, onViewDetails, onStartLab }) => {
  return (
    // Main container for the LabCard components.
    <div className="w-full">
      {/* Topology Image Section: Clickable to launch LabModal */}
      <div
        className="relative bg-white shadow-md rounded-xl overflow-hidden cursor-pointer" // cursor-pointer already here
        onClick={() => onViewDetails(lab)}
      >
        <img
          src={`/labs/${lab.category}/${lab.slug}/topology.png`}
          alt={`${lab.title} topology`}
          className="h-48 sm:h-56 w-full object-cover bg-gray-100"
          onError={(e) => {
            e.target.style.display = "none";
            const parent = e.target.parentElement;
            parent.classList.add(
              "bg-gray-200",
              "flex",
              "items-center",
              "justify-center",
              "text-gray-500",
              "h-48",
              "sm:h-56",
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
            {/* Details Button: Added cursor-pointer */}
            <button
              onClick={() => onViewDetails(lab)}
              className="flex items-center justify-center space-x-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium px-3 py-1.5 rounded-md text-xs transition-colors duration-200 cursor-pointer" // Added cursor-pointer
            >
              <Info className="h-3.5 w-3.5" />
              <span>Details</span>
            </button>

            {/* Start Lab Button: Added cursor-pointer */}
            <button
              onClick={() => onStartLab(lab)}
              className="flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-center text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-colors duration-200 cursor-pointer" // Added cursor-pointer
            >
              Start Lab
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LabCard;
