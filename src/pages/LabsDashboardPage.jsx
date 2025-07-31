// ====================================================================================
//
// COMPONENT:          LabsDashboardPage.jsx
// FILE:               /src/pages/LabsDashboardPage.jsx
//
// OVERVIEW:
//   This component serves as the dedicated page for displaying the labs dashboard.
//   It is responsible for fetching, filtering, and displaying lab cards, as well as
//   managing all real-time lab status updates. By encapsulating this logic, it
//   ensures that its state changes do not trigger re-renders in unrelated parts of
//   the application, such as the PythonScriptRunner.
//
// KEY FEATURES:
//   - State Encapsulation: Manages all lab-related state (`activeCategory`,
//     `filteredLabs`, `labStatuses`) internally.
//   - Data Fetching & Filtering: Handles the logic for displaying labs based on the
//     selected category.
//   - Real-Time Status Updates: Subscribes to the `labLauncher` utility to receive
//     and display live status updates for all labs.
//   - Lab Interaction: Contains the handlers for starting and stopping labs.
//
// DEPENDENCIES:
//   - React Core: (useState, useEffect) for state and lifecycle management.
//   - Lab Utilities: Imports all necessary functions from `labLauncher.js`.
//   - UI Components: `CategoryFilter`, `StatsBar`, `LabCard`.
//
// ====================================================================================


// SECTION 1: IMPORTS & CONFIGURATION
// ------------------------------------------------------------------------------------
import React, { useState, useEffect } from 'react';
import { Network } from 'lucide-react';

// --- Application-Specific Imports ---
import labsData from '../data/labsData';
import categories from '../constants/categories';
import { launchLab, stopLab, getLabStatus, onLabStatusChange, offLabStatusChange } from '../utils/labLauncher';

// --- UI Component Imports ---
import CategoryFilter from '../components/CategoryFilter';
import StatsBar from '../components/StatsBar';
import LabCard from '../components/LabCard';


// SECTION 2: DASHBOARD PAGE COMPONENT
// ------------------------------------------------------------------------------------
const LabsDashboardPage = ({ onViewDetails }) => {
  // --- State Management ---
  const [activeCategory, setActiveCategory] = useState('all');
  const [filteredLabs, setFilteredLabs] = useState([]);
  const [labStatuses, setLabStatuses] = useState({});


  // SECTION 3: LIFECYCLE EFFECTS
  // ------------------------------------------------------------------------------------
  /**
   * This effect handles filtering labs when the category changes and sets up the
   * global listener for real-time lab status updates.
   */
  useEffect(() => {
    // --- Filter Labs by Category ---
    let allLabs = [];
    if (activeCategory === 'all') {
      allLabs = Object.entries(labsData).flatMap(([category, labs]) =>
        labs.map((lab) => ({ ...lab, category }))
      );
    } else {
      const labs = labsData[activeCategory] || [];
      allLabs = labs.map((lab) => ({ ...lab, category: activeCategory }));
    }
    setFilteredLabs(allLabs);

    // --- Initialize Lab Statuses ---
    const initialStatuses = {};
    allLabs.forEach((lab) => {
      const labIdentifier = `/labs/${lab.category}/${lab.slug}`;
      initialStatuses[labIdentifier] = getLabStatus(labIdentifier) || { status: 'stopped' };
    });
    setLabStatuses(initialStatuses);

    // --- Set up Global Status Listener ---
    const handleGlobalStatusChange = (data) => {
      setLabStatuses((prevStatuses) => ({
        ...prevStatuses,
        [data.id]: data,
      }));
    };

    // Subscribe to status changes for all labs (by passing null as the ID)
    onLabStatusChange(null, handleGlobalStatusChange);

    // --- Cleanup ---
    // Unsubscribe from the global listener when the component unmounts.
    return () => {
      offLabStatusChange(null, handleGlobalStatusChange);
    };
  }, [activeCategory]); // Reruns only when the active category changes.


  // SECTION 4: EVENT HANDLERS
  // ------------------------------------------------------------------------------------
  const handleStartLabFromCard = async (labToLaunch) => {
    const labIdentifier = `/labs/${labToLaunch.category}/${labToLaunch.slug}`;
    setLabStatuses((prev) => ({ ...prev, [labIdentifier]: { status: 'launching' } }));
    try {
      await launchLab(labIdentifier, {}, {});
    } catch (error) {
      console.error("Error launching lab:", error);
      setLabStatuses((prev) => ({ ...prev, [labIdentifier]: { status: 'failed', error: error.message } }));
    }
  };

  const handleStopLabFromCard = async (labToStop) => {
    const labIdentifier = `/labs/${labToStop.category}/${labToStop.slug}`;
    setLabStatuses((prev) => ({ ...prev, [labIdentifier]: { status: 'stopping' } }));
    try {
      await stopLab(labIdentifier);
    } catch (error) {
      console.error("Error stopping lab:", error);
      setLabStatuses((prev) => ({ ...prev, [labIdentifier]: { status: 'failed', error: error.message } }));
    }
  };


  // SECTION 5: RENDER METHOD
  // ------------------------------------------------------------------------------------
  return (
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
          const currentLabStatus = labStatuses[labIdentifier] || { status: 'stopped' };

          return (
            <LabCard
              key={`${lab.category}-${lab.slug}-${index}`}
              lab={lab}
              onViewDetails={onViewDetails}
              onStartLab={handleStartLabFromCard}
              onStopLab={handleStopLabFromCard}
              currentStatus={currentLabStatus.status}
              isLaunching={currentLabStatus.status === 'launching'}
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
            Try selecting a different category or check back later.
          </p>
        </div>
      )}
    </>
  );
};

export default LabsDashboardPage;
