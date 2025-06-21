import React from 'react';

const StatsBar = ({ filteredLabs, activeCategory, categories }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-gray-600">Showing </span>
          <span className="font-semibold text-gray-900 mx-1">{filteredLabs.length}</span>
          <span className="text-gray-600"> labs</span>
          {activeCategory !== 'all' && (
            <>
              <span className="text-gray-600 mx-1"> in </span>
              <span className="font-semibold text-blue-600">{categories.find(cat => cat.id === activeCategory)?.name}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatsBar;
