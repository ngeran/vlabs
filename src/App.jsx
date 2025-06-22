// vlabs/src/App.jsx

import React, { useState, useEffect } from "react";
import labsData from "./data/labsData";
import categories from "./constants/categories";
import Header from "./components/Header";
import Footer from "./components/Footer";
import CategoryFilter from "./components/CategoryFilter";
import StatsBar from "./components/StatsBar";
import LabCard from "./components/LabCard";
import LabModal from "./components/LabModal";
import { Network } from "lucide-react";

// --- IMPORT THE LAB LAUNCHER UTILITIES ---
import {
  launchLab,
  stopLab,
  getLabStatus,
  onLabStatusChange,
  offLabStatusChange,
} from "./utils/labLauncher";

const App = () => {
  const [activeCategory, setActiveCategory] = useState("all");
  const [filteredLabs, setFilteredLabs] = useState([]);
  const [selectedLab, setSelectedLab] = useState(null); // Null if no modal open
  const [isModalOpen, setIsModalOpen] = useState(false); // Controls modal visibility
  const [labStatuses, setLabStatuses] = useState({}); // NEW: State to track all lab statuses globally

  // Effect to filter labs and initialize/update lab statuses based on active category
  useEffect(() => {
    let allLabs = [];
    if (activeCategory === "all") {
      allLabs = Object.entries(labsData).flatMap(([category, labs]) =>
        labs.map((lab) => ({ ...lab, category })),
      );
    } else {
      const labs = labsData[activeCategory] || [];
      allLabs = labs.map((lab) => ({ ...lab, category: activeCategory }));
    }
    setFilteredLabs(allLabs);

    // Initialize/refresh lab statuses based on newly filtered labs
    const initialStatuses = {};
    allLabs.forEach((lab) => {
      const labIdentifier = `/labs/${lab.category}/${lab.slug}`;
      initialStatuses[labIdentifier] = getLabStatus(labIdentifier) || {
        status: "stopped",
      }; // Default to stopped
    });
    setLabStatuses(initialStatuses);

    // --- Set up global status listener for all labs ---
    const handleGlobalStatusChange = (data) => {
      // `data.id` is the `labIdentifier` (e.g., "/labs/routing/ospf-single-area")
      console.log("[App] Global lab status change received:", data); // Debugging global status updates
      setLabStatuses((prevStatuses) => ({
        ...prevStatuses,
        [data.id]: data, // Update the specific lab's status
      }));
    };

    // Listen for status changes for any lab (pass null as the ID to listen globally)
    onLabStatusChange(null, handleGlobalStatusChange);

    // Cleanup listener on component unmount (or category change if unmounting old listener)
    return () => {
      offLabStatusChange(null, handleGlobalStatusChange);
    };
  }, [activeCategory]); // Re-run when activeCategory changes

  // Function to handle opening the lab modal when "View Details" is clicked
  const handleViewDetails = (lab) => {
    console.log("[App] handleViewDetails called with lab:", lab);
    setSelectedLab(lab);
    setIsModalOpen(true);
  };

  // --- Function to handle launching labs from LabCard (or anywhere else) ---
  const handleStartLabFromCard = async (labToLaunch) => {
    const labIdentifier = `/labs/${labToLaunch.category}/${labToLaunch.slug}`;
    console.log(`[App] Attempting to launch lab from card: ${labIdentifier}`);

    // Immediately update status to 'launching' for instant UI feedback
    setLabStatuses((prevStatuses) => ({
      ...prevStatuses,
      [labIdentifier]: {
        status: "launching",
        message: "Preparing lab environment...",
      },
    }));

    try {
      // The backend's `launchLab` only needs the `labPath` (labIdentifier)
      // The `labData` (parsed YAML) is currently only used within LabModal itself.
      // If `labLauncher` on the frontend needs the full `labData` (e.g. for access URLs before backend provides them),
      // you might need to fetch the YAML here or update your `labLauncher.js` to fetch it.
      // For now, passing an empty object for `labData` as it's not strictly required by backend `launch` endpoint.
      const result = await launchLab(labIdentifier, {}, {});

      if (!result.success) {
        throw new Error(result.message || "Unknown launch error from backend.");
      }
      // Success will be reflected by the global status listener updating `labStatuses` to 'running'
    } catch (error) {
      console.error("Error launching lab from card:", error);
      setLabStatuses((prevStatuses) => ({
        ...prevStatuses,
        [labIdentifier]: {
          status: "failed",
          error: error.message,
          message: "Lab launch failed",
        },
      }));
    }
  };

  // --- Function to handle stopping labs from LabCard (or anywhere else) ---
  const handleStopLabFromCard = async (labToStop) => {
    const labIdentifier = `/labs/${labToStop.category}/${labToStop.slug}`;
    console.log(`[App] Attempting to stop lab from card: ${labIdentifier}`);

    // Immediately update status to 'stopping' for instant UI feedback
    setLabStatuses((prevStatuses) => ({
      ...prevStatuses,
      [labIdentifier]: {
        status: "stopping",
        message: "Stopping lab environment...",
      },
    }));

    try {
      await stopLab(labIdentifier);
      // Success will be reflected by the global status listener updating `labStatuses` to 'stopped'
    } catch (error) {
      console.error("Error stopping lab from card:", error);
      setLabStatuses((prevStatuses) => ({
        ...prevStatuses,
        [labIdentifier]: {
          status: "failed",
          error: error.message,
          message: "Lab stop failed",
        },
      }));
    }
  };

  // Function to handle closing the lab modal
  const handleCloseModal = () => {
    console.log("[App] handleCloseModal called.");
    setSelectedLab(null);
    setIsModalOpen(false);
  };

  // console.log("[App] Current modal state (on render) - isModalOpen:", isModalOpen, "selectedLab:", selectedLab); // Debug

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CategoryFilter
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
        />
        <StatsBar
          filteredLabs={filteredLabs}
          activeCategory={activeCategory}
          categories={categories}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLabs.map((lab, index) => {
            // Construct the unique identifier for this lab
            const labIdentifier = `/labs/${lab.category}/${lab.slug}`;
            // Get the current status from the global labStatuses state
            const currentLabStatus = labStatuses[labIdentifier] || {
              status: "stopped",
            }; // Default to 'stopped' if no status found

            return (
              <LabCard
                key={`${lab.category || "unknown"}-${lab.slug || lab.id}-${index}`} // Using slug for key as it's consistent
                lab={lab}
                onViewDetails={handleViewDetails}
                onStartLab={handleStartLabFromCard} // Pass the new start handler
                onStopLab={handleStopLabFromCard} // Pass the new stop handler
                currentStatus={currentLabStatus.status} // Pass current status to LabCard
                isLaunching={currentLabStatus.status === "launching"} // Specific flag for launching state
              />
            );
          })}
        </div>
        {filteredLabs.length === 0 && (
          <div className="text-center py-12">
            <Network className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No labs found
            </h3>
            <p className="text-gray-500">
              Try selecting a different category or check back later for new
              labs.
            </p>
          </div>
        )}
      </main>
      <Footer />

      {/* Lab Modal - Render only if open and a lab is selected */}
      {isModalOpen && selectedLab && (
        <LabModal
          lab={selectedLab} // Pass the selected lab object to the modal
          isOpen={isModalOpen}
          onClose={handleCloseModal} // Pass the close handler to the modal
          // LabModal will internally get its status from `getLabStatus` and `onLabStatusChange`
          // so no need to pass status props down to it from App.jsx, keeping it consistent.
        />
      )}
    </div>
  );
};

export default App;
