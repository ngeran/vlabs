// src/App.jsx

import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

import labsData from "./data/labsData";
import categories from "./constants/categories";
import Header from "./components/Header";
import Footer from "./components/Footer";
import CategoryFilter from "./components/CategoryFilter";
import StatsBar from "./components/StatsBar";
import LabCard from "./components/LabCard";
import LabModal from "./components/LabModal";
import PythonScriptRunner from "./components/PythonScriptRunner";
import HomePage from "./pages/HomePage"; // IMPORT THE NEW HOME PAGE COMPONENT
import { Network } from "lucide-react"; // Keep if Network icon is used elsewhere (e.g., HomePage), otherwise it can be removed

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
  const [selectedLab, setSelectedLab] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [labStatuses, setLabStatuses] = useState({});

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
      };
    });
    setLabStatuses(initialStatuses);

    // --- Set up global status listener for all labs ---
    const handleGlobalStatusChange = (data) => {
      console.log("[App] Global lab status change received:", data);
      setLabStatuses((prevStatuses) => ({
        ...prevStatuses,
        [data.id]: data,
      }));
    };

    onLabStatusChange(null, handleGlobalStatusChange);

    return () => {
      offLabStatusChange(null, handleGlobalStatusChange);
    };
  }, [activeCategory]);

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

    setLabStatuses((prevStatuses) => ({
      ...prevStatuses,
      [labIdentifier]: {
        status: "launching",
        message: "Preparing lab environment...",
      },
    }));

    try {
      const result = await launchLab(labIdentifier, {}, {});
      if (!result.success) {
        throw new Error(result.message || "Unknown launch error from backend.");
      }
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

    setLabStatuses((prevStatuses) => ({
      ...prevStatuses,
      [labIdentifier]: {
        status: "stopping",
        message: "Stopping lab environment...",
      },
    }));

    try {
      await stopLab(labIdentifier);
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

  return (
    // Updated overall page background color
    <div className="min-h-screen bg-[#E9E9E9]">
      <Router>
        <Header /> {/* Header component now includes SiteNavigation */}

        {/* The previous simple navigation <nav> element has been removed from here.
            SiteNavigation component (within Header) now handles all navigation. */}

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-[calc(100vh-140px)]">
          <Routes>
            {/* NEW: Route for the Home Page */}
            <Route path="/" element={<HomePage />} />

            {/* Route for the Labs Dashboard - NOW AT /labs-dashboard */}
            <Route
              path="/labs-dashboard" // Path changed from "/" to "/labs-dashboard"
              element={
                <>
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
                      const labIdentifier = `/labs/${lab.category}/${lab.slug}`;
                      const currentLabStatus = labStatuses[labIdentifier] || {
                        status: "stopped",
                      };

                      return (
                        <LabCard
                          key={`${lab.category || "unknown"}-${lab.slug || lab.id}-${index}`}
                          lab={lab}
                          onViewDetails={handleViewDetails}
                          onStartLab={handleStartLabFromCard}
                          onStopLab={handleStopLabFromCard}
                          currentStatus={currentLabStatus.status}
                          isLaunching={currentLabStatus.status === "launching"}
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
                </>
              }
            />

            {/* Route for the Python Script Runner (path remains the same) */}
            <Route path="/python-runner" element={<PythonScriptRunner />} />
          </Routes>
        </main>

        <Footer />

        {/* Lab Modal - Render only if open and a lab is selected */}
        {isModalOpen && selectedLab && (
          <LabModal
            lab={selectedLab}
            isOpen={isModalOpen}
            onClose={handleCloseModal}
          />
        )}
      </Router>
    </div> // Closing div for min-h-screen container
  );
};

export default App;
