import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';

const CategoryFilter = ({ categories, activeCategory, onCategoryChange }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <>
      {/* Desktop Category Filter */}
      <div className="hidden md:flex flex-wrap gap-2 mb-8">
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <button
              key={category.id}
              onClick={() => onCategoryChange(category.id)}
              className={`flex items-center px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                activeCategory === category.id
                  ? `${category.color} text-white shadow-lg`
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              <Icon className="w-4 h-4 mr-2" />
              {category.name}
            </button>
          );
        })}
      </div>

      {/* Mobile Category Filter */}
      <div className="md:hidden mb-6">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="flex items-center justify-between w-full px-4 py-3 bg-white border border-gray-200 rounded-lg"
        >
          <div className="flex items-center">
            {(() => {
              const activeCategoryData = categories.find(cat => cat.id === activeCategory);
              const Icon = activeCategoryData?.icon || categories[0].icon;
              return (
                <>
                  <Icon className="w-4 h-4 mr-2" />
                  {activeCategoryData?.name || 'All Labs'}
                </>
              );
            })()}
          </div>
          {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>

        {isMobileMenuOpen && (
          <div className="mt-2 bg-white border border-gray-200 rounded-lg shadow-lg">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <button
                  key={category.id}
                  onClick={() => {
                    onCategoryChange(category.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`flex items-center w-full px-4 py-3 text-left hover:bg-gray-50 ${
                    activeCategory === category.id ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {category.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

export default CategoryFilter;
