import React, { useState, useEffect } from 'react';
import labsData from './data/labsData';
import categories from './constants/categories';
import Header from './components/Header';
import Footer from './components/Footer';
import CategoryFilter from './components/CategoryFilter';
import StatsBar from './components/StatsBar';
import LabCard from './components/LabCard';
import LabModal from './components/LabModal';
import { Network } from 'lucide-react';

const App = () => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [filteredLabs, setFilteredLabs] = useState([]);
  const [selectedLab, setSelectedLab] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (activeCategory === 'all') {
      const allLabs = Object.entries(labsData).flatMap(([category, labs]) =>
        labs.map(lab => ({ ...lab, category }))
      );
      setFilteredLabs(allLabs);
    } else {
      const labs = labsData[activeCategory] || [];
      setFilteredLabs(labs.map(lab => ({ ...lab, category: activeCategory })));
    }
  }, [activeCategory]);

  const handleViewDetails = (lab) => {
    setSelectedLab(lab);
    setIsModalOpen(true);
  };

  const handleStartLab = async (lab) => {
    console.log(`Launching lab: ${lab.title}`);
    // Add actual logic here (e.g., call to backend or script)
  };

  const handleCloseModal = () => {
    setSelectedLab(null);
    setIsModalOpen(false);
  };

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
              key={`${lab.category || 'unknown'}-${lab.id}-${index}`}
              lab={lab}
              onViewDetails={handleViewDetails}
              onStartLab={handleStartLab}
            />
          ))}
        </div>
        {filteredLabs.length === 0 && (
          <div className="text-center py-12">
            <Network className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No labs found</h3>
            <p className="text-gray-500">Try selecting a different category or check back later for new labs.</p>
          </div>
        )}
      </main>
      <Footer />

      {/* Lab Modal */}
      <LabModal
        lab={selectedLab}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onLaunch={handleStartLab}
      />
    </div>
  );
};

export default App;
