// ====================================================================================
//
// COMPONENT:          App.jsx
// FILE:               /src/App.jsx
//
// OVERVIEW:
//   This is the root component of the application. Its primary responsibility is to
//   set up the main page layout, routing, and manage truly global components like the
//   Header, Footer, and the Lab Details modal. It has been intentionally refactored
//   to be a "thin" component, delegating route-specific state and logic down to
//   dedicated page components to prevent state pollution and unnecessary re-renders.
//
// KEY FEATURES:
//   - High-Level Routing: Uses `react-router-dom` to direct users to the correct page.
//   - Global Layout: Provides the consistent Header and Footer for the entire app.
//   - Centralized Modal Control: Manages the state for the `LabModal`, ensuring it
//     can be triggered from anywhere but is rendered at the top level.
//   - State Isolation: Does NOT contain state related to specific pages like the
//     labs dashboard or script runner, which is critical for performance and stability.
//
// DEPENDENCIES:
//   - React Core: (useState) for managing modal state.
//   - React Router: (BrowserRouter, Routes, Route) for navigation.
//   - Page Components: `HomePage`, `LabsDashboardPage`, `PythonScriptRunner`.
//   - UI Components: `Header`, `Footer`, `LabModal`, `Toaster`.
//
// ====================================================================================

// SECTION 1: IMPORTS & CONFIGURATION
// ------------------------------------------------------------------------------------
import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";

// --- High-Level UI Components ---
import Header from "./components/Header";
import Footer from "./components/Footer";
import LabModal from "./components/LabModal";

// --- Page-Level Components ---
import HomePage from "./pages/HomePage";
import LabsDashboardPage from "./pages/LabsDashboardPage"; // CORRECT: Import the dedicated page component
import PythonScriptRunner from "./components/PythonScriptRunner";


// SECTION 2: MAIN APPLICATION COMPONENT
// ------------------------------------------------------------------------------------
const App = () => {
  // --- State Management for Global Components ---
  // Manages the state for the Lab Details modal. This is kept in App.jsx
  // because the modal is rendered at the top level, outside the routed content.
  const [selectedLab, setSelectedLab] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // --- Modal Event Handlers ---

  /**
   * Opens the Lab Details modal with the data of the specified lab.
   * This function can be passed as a prop to child components.
   * @param {object} lab - The lab object to display in the modal.
   */
  const handleViewDetails = (lab) => {
    setSelectedLab(lab);
    setIsModalOpen(true);
  };

  /**
   * Closes the Lab Details modal and clears its state.
   */
  const handleCloseModal = () => {
    setSelectedLab(null);
    setIsModalOpen(false);
  };


  // SECTION 3: RENDER METHOD
  // ------------------------------------------------------------------------------------
  return (
    // Sets the base background color for the entire application.
    <div className="min-h-screen bg-[#E9E9E9]">
      {/*
        The Toaster component listens for all toast() calls globally and renders
        the notifications. It should be placed once in the top-level layout.
      */}
      <Toaster
        position="top-right"
        toastOptions={{
          success: { style: { background: "#F0FDF4", color: "#166534" } },
          error: { style: { background: "#FEF2F2", color: "#991B1B" } },
        }}
      />
      <Router>
        <Header />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-[calc(100vh-140px)]">
          <Routes>
            {/* Route 1: Home Page */}
            <Route path="/" element={<HomePage />} />

            {/* Route 2: Labs Dashboard */}
            {/* CORRECT: Renders the self-contained page component, passing only the props it needs. */}
            <Route
              path="/labs-dashboard"
              element={<LabsDashboardPage onViewDetails={handleViewDetails} />}
            />

            {/* Route 3: Python Script Runner */}
            {/* CORRECT: This route is now fully isolated from lab status updates. */}
            <Route path="/python-runner" element={<PythonScriptRunner />} />
          </Routes>
        </main>
        <Footer />

        {/* The LabModal is rendered here, outside the Routes, so it can overlay any page. */}
        {isModalOpen && selectedLab && (
          <LabModal
            lab={selectedLab}
            isOpen={isModalOpen}
            onClose={handleCloseModal}
          />
        )}
      </Router>
    </div>
  );
};

export default App;
