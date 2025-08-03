// src/components/shared/ModernDropdown.jsx
// =================================================================================================
//
// FILE:               src/components/shared/ModernDropdown.jsx
//
// DESCRIPTION:
//   A modern, reusable dropdown component designed for a sleek and sophisticated user experience.
//   It provides a clean, elegant interface with polished animations, a compact footprint,
//   and robust functionality including search, dynamic data fetching, and comprehensive
//   accessibility support. The design is optimized to complement modern UI frameworks.
//
// ENHANCED FEATURES:
//   - Sophisticated Design: A refined, compact aesthetic with subtle shadows and elegant hover states.
//   - Search & Filter: Efficiently handles large datasets with a built-in search input.
//   - Dynamic Content: Supports fetching options from an API endpoint for real-time data.
//   - Advanced Accessibility: Fully navigable with a keyboard, and includes ARIA attributes
//      for screen reader compatibility.
//   - Responsive & Touch-Friendly: Optimized for use on various screen sizes and devices.
//   - Clear Status Indicators: Visual cues for loading, disabled, and error states.
//
// =================================================================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import {
  ChevronDown,
  AlertTriangle,
  Search,
  Check,
  Loader2,
  X
} from "lucide-react";

// Base URL for API Requests
const API_BASE_URL = "http://localhost:3001";

// =================================================================================================
// SECTION 1: COMPONENT DEFINITION & PROPS
// =================================================================================================
/**
 * A modern, versatile, and highly accessible dropdown component.
 * @param {Object} props - Component props
 * @param {string} props.id - A unique identifier for the dropdown (required for accessibility)
 * @param {Array} props.options - Static list of options [{ value, label, description?, isCategory? }, ...]
 * @param {string} props.dynamicOptionsEndpoint - API endpoint to fetch options dynamically
 * @param {string} props.value - The currently selected value
 * @param {Function} props.onChange - Callback function for when a new option is selected
 * @param {string} props.placeholder - Text to display when no option is selected
 * @param {boolean} props.disabled - Renders the dropdown in a disabled state
 * @param {boolean} props.required - Marks the input as required
 * @param {boolean} props.searchable - Enables or disables the search input
 * @param {number} props.maxHeight - Maximum height of the dropdown panel in pixels
 * @param {string} props.size - Defines the visual size ('sm', 'md', 'lg')
 * @param {string} props.className - Optional additional CSS classes for the container
 */
function ModernDropdown({
  id,
  options = [],
  dynamicOptionsEndpoint,
  value,
  onChange,
  placeholder = "Select an option",
  disabled = false,
  required = false,
  searchable = false,
  maxHeight = 240,
  size = "md",
  className = ""
}) {
  // =================================================================================================
  // SECTION 2: STATE MANAGEMENT & REFS
  // =================================================================================================
  const [dynamicOptions, setDynamicOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // References to DOM elements for focus management and event handling
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const optionsRef = useRef([]);

  // =================================================================================================
  // SECTION 3: DATA PROCESSING & MEMOIZATION
  // =================================================================================================
  // Determines the final list of options to render, prioritizing dynamic options if an endpoint is provided.
  const effectiveOptions = dynamicOptionsEndpoint ? dynamicOptions : options;

  // Filters the options based on the search term, if searching is enabled.
  const filteredOptions = searchable
    ? effectiveOptions.filter(opt =>
        (opt.label || opt.value).toLowerCase().includes(searchTerm.toLowerCase())
      )
    : effectiveOptions;

  // Finds the currently selected option object for display purposes.
  const selectedOption = effectiveOptions.find(opt => opt.value === value);

  // =================================================================================================
  // SECTION 4: STYLING CONFIGURATION
  // =================================================================================================
  // Object mapping size props to Tailwind CSS classes for consistent sizing.
  const sizeConfig = {
    sm: "text-xs py-1.5 px-3 h-8",
    md: "text-sm py-2 px-3 h-9",
    lg: "text-base py-3 px-4 h-11"
  };

  // =================================================================================================
  // SECTION 5: API CALLS & SIDE EFFECTS
  // =================================================================================================
  /**
   * Fetches options from a specified API endpoint.
   */
  const fetchDynamicOptions = useCallback(async () => {
    if (!dynamicOptionsEndpoint) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}${dynamicOptionsEndpoint}`);
      if (!response.ok) throw new Error(`Failed to fetch options for ${id}`);
      const data = await response.json();
      setDynamicOptions(data.options || data || []);
    } catch (err) {
      setError(err.message);
      toast.error(`Error fetching options: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [dynamicOptionsEndpoint, id]);

  // Effect to load dynamic options on component mount or endpoint change.
  useEffect(() => {
    if (dynamicOptionsEndpoint) {
      fetchDynamicOptions();
    }
  }, [dynamicOptionsEndpoint, fetchDynamicOptions]);

  // Effect to handle clicks outside the dropdown to close it.
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm("");
        setFocusedIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Effect to focus the search input when the dropdown opens.
  useEffect(() => {
    if (isOpen && searchable && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [isOpen, searchable]);

  // Effect to scroll to the focused element in the dropdown list
  useEffect(() => {
    if (focusedIndex !== -1 && isOpen) {
      optionsRef.current[focusedIndex]?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest'
      });
    }
  }, [focusedIndex, isOpen]);

  // =================================================================================================
  // SECTION 6: EVENT HANDLERS
  // =================================================================================================
  /**
   * Toggles the open/closed state of the dropdown.
   */
  const handleToggle = useCallback(() => {
    if (disabled || isLoading) return;
    setIsOpen(!isOpen);
    setFocusedIndex(-1);
  }, [disabled, isLoading, isOpen]);

  /**
   * Handles the selection of an option from the list.
   * @param {Object} option - The selected option object
   */
  const handleOptionSelect = useCallback((option) => {
    if (option.isCategory || option.disabled) {
      return;
    }
    onChange(option.value);
    setIsOpen(false);
    setSearchTerm("");
    setFocusedIndex(-1);
    setTimeout(() => triggerRef.current?.focus(), 100);
  }, [onChange]);

  /**
   * Manages keyboard navigation for accessibility.
   * @param {KeyboardEvent} e - The keyboard event
   */
  const handleKeyDown = useCallback((e) => {
    if (disabled) return;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else if (focusedIndex >= 0 && filteredOptions[focusedIndex]) {
          handleOptionSelect(filteredOptions[focusedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSearchTerm("");
        setFocusedIndex(-1);
        triggerRef.current?.focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) setIsOpen(true);
        setFocusedIndex(prev =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) setIsOpen(true);
        setFocusedIndex(prev =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
        break;
      case 'Tab':
        setIsOpen(false);
        setSearchTerm("");
        setFocusedIndex(-1);
        break;
    }
  }, [disabled, isOpen, focusedIndex, filteredOptions, handleOptionSelect]);

  /**
   * Updates the search term state.
   * @param {React.ChangeEvent<HTMLInputElement>} e - The change event from the input
   */
  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
    setFocusedIndex(-1);
  }, []);

  /**
   * Clears the current selection.
   * @param {React.MouseEvent<HTMLButtonElement>} e - The click event
   */
  const clearSelection = useCallback((e) => {
    e.stopPropagation();
    onChange("");
    setSearchTerm("");
  }, [onChange]);

  // =================================================================================================
  // SECTION 7: RENDER LOGIC
  // =================================================================================================
  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Dropdown Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        disabled={disabled || isLoading}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-required={required}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`
          relative w-full rounded-lg border transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-blue-500/50
          disabled:opacity-60 disabled:cursor-not-allowed
          flex items-center justify-between gap-2
          ${sizeConfig[size]}
          ${error ? 'border-red-500' : 'border-slate-300 hover:border-slate-400'}
          ${isOpen ? 'ring-2 ring-blue-500/50 border-blue-500' : ''}
        `}
      >
        <span className={`flex-1 min-w-0 truncate text-left ${selectedOption ? 'text-slate-900' : 'text-slate-500'}`}>
          {isLoading && <Loader2 size={16} className="inline animate-spin mr-2 text-slate-500" />}
          {selectedOption?.label || selectedOption?.value || placeholder}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {selectedOption && !required && (
            <button
              type="button"
              onClick={clearSelection}
              className="p-0.5 hover:bg-slate-200 rounded transition-colors"
              aria-label="Clear selection"
            >
              <X size={14} className="text-slate-500" />
            </button>
          )}
          <ChevronDown
            size={16}
            className={`
              text-slate-500 transition-transform duration-200
              ${isOpen ? 'rotate-180' : ''}
            `}
          />
        </div>
      </button>

      {/* Dropdown Panel with Options */}
      {isOpen && (
        <div
          className={`
            absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-md
            animate-in fade-in-0 zoom-in-95 duration-100
            transform-origin-top
          `}
          style={{ maxHeight: `${maxHeight}px` }}
        >
          {/* Search Input Section */}
          {searchable && (
            <div className="p-2 border-b border-slate-100">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchTerm}
                  onChange={handleSearchChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Search options..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Options List Section */}
          <div className="overflow-y-auto" style={{ maxHeight: `calc(${maxHeight}px - ${searchable ? '48px' : '0px'})` }}>
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-sm text-slate-500 text-center">
                {searchTerm ? 'No options found' : 'No options available'}
              </div>
            ) : (
              <div role="listbox" aria-labelledby={id}>
                {filteredOptions.map((option, index) => (
                  <button
                    key={option.value}
                    ref={el => optionsRef.current[index] = el}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    onClick={() => handleOptionSelect(option)}
                    disabled={option.disabled}
                    className={`
                      group w-full px-4 py-2 text-left text-sm transition-colors duration-150
                      flex items-center justify-between
                      ${option.isCategory ? 'font-semibold text-slate-600 bg-slate-50 cursor-default pointer-events-none' : 'text-slate-800 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none'}
                      ${option.value === value ? 'bg-blue-50 text-blue-800' : ''}
                      ${option.disabled ? 'text-slate-400 cursor-not-allowed opacity-70' : ''}
                    `}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate">
                        {option.label || option.value}
                      </div>
                      {option.description && (
                        <div className="truncate text-xs text-slate-500 mt-0.5">
                          {option.description}
                        </div>
                      )}
                    </div>
                    {option.value === value && (
                      <Check size={16} className="text-blue-600 flex-shrink-0 ml-2" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Message Section */}
      {error && (
        <div
          id={`${id}-error`}
          className="mt-1 flex items-center gap-1 text-xs text-red-500 animate-in slide-in-from-top-1 duration-200"
        >
          <AlertTriangle size={14} />
          {error}
        </div>
      )}
    </div>
  );
}

export default ModernDropdown;
