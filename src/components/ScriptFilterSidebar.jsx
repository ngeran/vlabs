// src/components/ScriptFilterSidebar.jsx
import React, { useMemo } from "react";
import { Tag } from "lucide-react";

function ScriptFilterSidebar({
  allScripts,
  selectedCategories,
  onCategoryChange,
}) {
  // Use useMemo to get a unique, sorted list of categories. This prevents re-calculation on every render.
  const uniqueCategories = useMemo(() => {
    const categories = new Set(
      allScripts.map((script) => script.category).filter(Boolean),
    );
    return Array.from(categories).sort();
  }, [allScripts]);

  const handleCheckboxChange = (category) => {
    // Create a new set from the current selections for easy manipulation
    const newSelection = new Set(selectedCategories);
    if (newSelection.has(category)) {
      newSelection.delete(category); // Uncheck: remove from set
    } else {
      newSelection.add(category); // Check: add to set
    }
    // Call the parent handler with the new array of selected categories
    onCategoryChange(Array.from(newSelection));
  };

  const clearFilters = () => {
    onCategoryChange([]);
  };

  return (
    <aside className="w-64 flex-shrink-0 pr-8">
      <div className="sticky top-24">
        {" "}
        {/* Makes the sidebar stick on scroll */}
        <h3 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2 flex items-center">
          <Tag size={18} className="mr-2" />
          Filter by Category
        </h3>
        {uniqueCategories.length > 0 ? (
          <div className="space-y-3">
            {uniqueCategories.map((category) => (
              <label
                key={category}
                className="flex items-center text-sm font-medium text-gray-700 hover:text-blue-600 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(category)}
                  onChange={() => handleCheckboxChange(category)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-3">{category}</span>
              </label>
            ))}
            {selectedCategories.length > 0 && (
              <button
                onClick={clearFilters}
                className="text-sm text-blue-600 hover:underline mt-4"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No categories found.</p>
        )}
      </div>
    </aside>
  );
}

export default ScriptFilterSidebar;
