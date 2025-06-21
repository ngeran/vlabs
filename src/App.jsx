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

const App = () => {
  const [activeCategory, setActiveCategory] = useState("all");
  const [filteredLabs, setFilteredLabs] = useState([]);
  const [selectedLab, setSelectedLab] = useState(null); // Starts as null
  const [isModalOpen, setIsModalOpen] = useState(false); // Starts as false

  // Effect to filter labs based on active category
  useEffect(() => {
    if (activeCategory === "all") {
      const allLabs = Object.entries(labsData).flatMap(([category, labs]) =>
        labs.map((lab) => ({ ...lab, category })),
      );
      setFilteredLabs(allLabs);
    } else {
      const labs = labsData[activeCategory] || [];
      setFilteredLabs(
        labs.map((lab) => ({ ...lab, category: activeCategory })),
      );
    }
  }, [activeCategory]);

  // Function to handle opening the lab modal when "View Details" is clicked
  const handleViewDetails = (lab) => {
    console.log("[App] handleViewDetails called with lab:", lab); // DEBUG LOG
    setSelectedLab(lab); // Set the lab object to be displayed in the modal
    setIsModalOpen(true); // Set modal open state to true
    console.log("[App] isModalOpen set to true, selectedLab set to:", lab); // DEBUG LOG
  };

  // This function is defined in App.jsx but is NOT used by LabModal directly now.
  // LabModal calls labLauncher.executeDockerCompose internally.
  // You can remove this `handleStartLab` if it's not used anywhere else.
  const handleStartLab = async (lab) => {
    console.log(
      `[App] Launching lab: ${lab.title} (This is from App.jsx's handleStartLab)`,
    );
    // Add actual logic here (e.g., call to backend or script) if needed elsewhere
  };

  // Function to handle closing the lab modal
  const handleCloseModal = () => {
    console.log("[App] handleCloseModal called."); // DEBUG LOG
    setSelectedLab(null); // Clear the selected lab data
    setIsModalOpen(false); // Set modal open state to false
    console.log("[App] isModalOpen set to false, selectedLab cleared."); // DEBUG LOG
  };

  // DEBUG LOG to show current modal state on every render of App.jsx
  console.log(
    "[App] Current modal state (on render) - isModalOpen:",
    isModalOpen,
    "selectedLab:",
    selectedLab,
  );

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
          {filteredLabs.map((lab, index) => (
            <LabCard
              key={`${lab.category || "unknown"}-${lab.id}-${index}`}
              lab={lab}
              onViewDetails={handleViewDetails} // Pass the handler to LabCard
              onStartLab={handleStartLab} // Pass if LabCard has a 'Start' button
            />
          ))}
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

      {/* Lab Modal - CONDITIONAL RENDERING IS CRUCIAL HERE */}
      {/* The modal is only rendered if both isModalOpen is true AND selectedLab is not null */}
      {isModalOpen && selectedLab && (
        <LabModal
          lab={selectedLab} // Pass the selected lab object to the modal
          isOpen={isModalOpen}
          onClose={handleCloseModal} // Pass the close handler to the modal
          // Removed unused props:
          // isOpen={isModalOpen} // Modal's existence is controlled by this conditional rendering
          // onLaunch={handleStartLab} // LabModal handles launch internally via labLauncher
        />
      )}
    </div>
  );
};

export default App;
