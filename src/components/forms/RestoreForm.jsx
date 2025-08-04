/**
 * ===============================================
 * RESTORE FORM COMPONENT - Enhanced Version
 * ===============================================
 *
 * DESCRIPTION:
 * A sophisticated React component for device backup restoration with modern UI/UX design.
 * Features an elegant glassmorphism design with smooth animations and intuitive user interactions.
 *
 * KEY FEATURES:
 * • Modern glassmorphism UI with gradient backgrounds and glass effects
 * • Smart dropdown components with search functionality and loading states
 * • Real-time data fetching for hosts and backup files
 * • Responsive design that works on all screen sizes
 * • Smooth animations and micro-interactions
 * • Comprehensive error handling with toast notifications
 * • Accessibility-compliant with proper ARIA labels
 * • Debug logging for development
 *
 * DEPENDENCIES:
 * • React (hooks: useState, useEffect)
 * • react-spinners/PulseLoader - Loading animations
 * • react-hot-toast - Toast notifications
 * • DeviceAuthFields - Authentication component
 *
 * HOW TO USE:
 * 1. Import the component: import RestoreForm from './components/forms/RestoreForm'
 * 2. Use in JSX: <RestoreForm parameters={params} onParamChange={handleParamChange} />
 * 3. Ensure API endpoint is running on http://localhost:3001
 * 4. Handle parameter changes in parent component
 *
 * API ENDPOINTS USED:
 * • GET /api/backups/devices - Fetch available host devices
 * • GET /api/backups/host/:hostname - Fetch backups for specific host
 */

// ===============================================
// IMPORTS & DEPENDENCIES
// ===============================================
import React, { useEffect, useState } from 'react';
import PulseLoader from 'react-spinners/PulseLoader';
import toast from 'react-hot-toast';
import DeviceAuthFields from '../shared/DeviceAuthFields.jsx';

// ===============================================
// CONFIGURATION & CONSTANTS
// ===============================================
const API_BASE_URL = "http://localhost:3001";

// Animation duration constants for consistent timing
const ANIMATION_DURATION = {
  fast: 150,
  normal: 200,
  slow: 300
};

// ===============================================
// MODERN DROPDOWN COMPONENT
// Sophisticated dropdown with search, loading states, and smooth animations
// ===============================================
const ModernDropdown = ({
  label,
  value,
  onChange,
  options = [],
  placeholder,
  disabled = false,
  loading = false,
  icon
}) => {
  // ============= STATE MANAGEMENT =============
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // ============= COMPUTED VALUES =============
  // Filter options based on search term for better UX
  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Find currently selected option for display
  const selectedOption = options.find(opt => opt.value === value);

  // ============= EVENT HANDLERS =============
  /**
   * Handle option selection with cleanup
   * @param {string} optionValue - The selected option value
   */
  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm('');
    setFocusedIndex(-1);
  };

  /**
   * Handle keyboard navigation for accessibility
   * @param {KeyboardEvent} e - Keyboard event
   */
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        setIsOpen(false);
        setFocusedIndex(-1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && filteredOptions[focusedIndex]) {
          handleSelect(filteredOptions[focusedIndex].value);
        }
        break;
    }
  };

  // ============= COMPONENT RENDER =============
  return (
    <div className="relative group">
      {/* Label with elegant typography */}
      <label className="block text-sm font-bold text-gray-800 mb-3 tracking-wide uppercase">
        {label}
      </label>

      <div className="relative">
        {/* Main dropdown button with glassmorphism effect */}
        <button
          type="button"
          onClick={() => !disabled && !loading && setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          disabled={disabled || loading}
          className={`
            w-full px-6 py-4 text-left bg-white/70 backdrop-blur-sm border-2 rounded-2xl
            shadow-lg transition-all duration-${ANIMATION_DURATION.normal} group-hover:shadow-xl
            ${disabled || loading
              ? 'border-gray-300 bg-gray-50/70 text-gray-500 cursor-not-allowed'
              : 'border-gray-300 hover:border-gray-900 focus:ring-4 focus:ring-gray-900/20 focus:border-gray-900'
            }
            ${isOpen ? 'ring-4 ring-gray-900/20 border-gray-900 shadow-xl' : ''}
          `}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={label}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Icon with sophisticated styling */}
              {icon && (
                <div className="text-gray-900 opacity-80">
                  {React.cloneElement(icon, { className: "w-5 h-5" })}
                </div>
              )}
              {/* Content display with loading state */}
              <span className={`font-medium ${selectedOption ? 'text-gray-900' : 'text-gray-600'}`}>
                {loading ? (
                  <div className="flex items-center space-x-3">
                    <PulseLoader size={6} color="#111827" />
                    <span className="text-sm">Loading options...</span>
                  </div>
                ) : (
                  selectedOption?.label || placeholder
                )}
              </span>
            </div>
            {/* Chevron icon with rotation animation */}
            {!loading && (
              <svg
                className={`w-5 h-5 text-gray-900 transition-transform duration-${ANIMATION_DURATION.normal} ${
                  isOpen ? 'rotate-180' : ''
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </div>
        </button>

        {/* Dropdown menu with glassmorphism and smooth animations */}
        {isOpen && !loading && !disabled && (
          <div className="absolute z-50 w-full mt-2 bg-white/95 backdrop-blur-md border-2 border-gray-200 rounded-2xl shadow-2xl animate-in slide-in-from-top-2 duration-200">
            {/* Search input for large option lists */}
            {options.length > 5 && (
              <div className="p-4 border-b border-gray-200/50">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search options..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-gray-900 outline-none transition-all duration-200"
                    autoFocus
                  />
                </div>
              </div>
            )}

            {/* Options list with scrolling */}
            <div className="max-h-64 overflow-y-auto custom-scrollbar">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option, index) => (
                  <button
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    className={`
                      w-full px-6 py-4 text-left hover:bg-gray-100/80 transition-all duration-${ANIMATION_DURATION.fast}
                      ${option.value === value ? 'bg-gray-200/80 text-gray-900' : 'text-gray-700'}
                      ${focusedIndex === index ? 'bg-gray-100/80' : ''}
                      first:rounded-t-2xl last:rounded-b-2xl border-b border-gray-100/50 last:border-b-0
                    `}
                    role="option"
                    aria-selected={option.value === value}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <span className="font-semibold text-sm">{option.label}</span>
                        {option.description && (
                          <p className="text-xs text-gray-600 mt-1 opacity-80">{option.description}</p>
                        )}
                      </div>
                      {/* Check mark for selected option */}
                      {option.value === value && (
                        <svg className="w-5 h-5 text-gray-900 ml-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-6 py-8 text-center">
                  <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.47-.881-6.08-2.33" />
                  </svg>
                  <p className="text-sm text-gray-500 font-medium">No options found</p>
                  <p className="text-xs text-gray-400 mt-1">Try adjusting your search</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Invisible overlay to close dropdown when clicking outside */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

// ===============================================
// MAIN RESTORE FORM COMPONENT
// Primary component for backup restoration interface
// ===============================================
function RestoreForm({ parameters, onParamChange }) {
  // ============= STATE MANAGEMENT =============
  const [hosts, setHosts] = useState([]);
  const [backups, setBackups] = useState([]);
  const [loadingHosts, setLoadingHosts] = useState(false);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [error, setError] = useState(null);

  // ============= DATA FETCHING EFFECTS =============
  /**
   * Fetch available host devices on component mount
   * Populates the host dropdown with devices that have backups
   */
  useEffect(() => {
    const fetchHosts = async () => {
      setLoadingHosts(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/backups/devices`);
        const data = await response.json();

        if (data.success && data.devices) {
          const hostOptions = data.devices.map(dev => ({
            value: dev.deviceIp,
            label: `${dev.deviceIp}`,
            description: `Device: ${dev.deviceIp} • Last backup: ${dev.lastBackup || 'Unknown'}`
          }));
          setHosts(hostOptions);
        } else {
          throw new Error(data.message || 'Failed to fetch devices');
        }
      } catch (error) {
        console.error('Error fetching hosts:', error);
        setError('Failed to load host devices');
        toast.error("Unable to fetch host devices. Please check your connection.");
      } finally {
        setLoadingHosts(false);
      }
    };

    fetchHosts();
  }, []);

  /**
   * Fetch backup files when a host is selected
   * Updates backup dropdown based on selected host
   */
  useEffect(() => {
    const fetchBackups = async () => {
      const selectedHost = parameters.hostname;

      // Reset backups if no host selected
      if (!selectedHost) {
        setBackups([]);
        onParamChange("backup_file", "");
        return;
      }

      setLoadingBackups(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/backups/host/${selectedHost}`);
        const data = await response.json();

        if (data.success && data.backups) {
          const backupOptions = data.backups.map(backup => ({
            value: backup.value,
            label: backup.label,
            description: backup.description || `Size: ${backup.size || 'Unknown'} • Created: ${backup.date || 'Unknown'}`
          }));
          setBackups(backupOptions);
        } else {
          setBackups([]);
          if (data.backups && data.backups.length === 0) {
            toast.error(`No backups found for host: ${selectedHost}`);
          }
        }
      } catch (error) {
        console.error('Error fetching backups:', error);
        setError('Failed to load backup files');
        setBackups([]);
        toast.error("Unable to fetch backup files. Please try again.");
      } finally {
        setLoadingBackups(false);
      }
    };

    fetchBackups();
  }, [parameters.hostname, onParamChange]);

  // ============= DEBUG LOGGING =============
  /**
   * Development logging for parameter changes
   * Helps with debugging form state
   */
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log("RestoreForm parameters updated:", parameters);
    }
  }, [parameters]);

  // ============= ICON COMPONENTS =============
  // Black SVG icons for consistent design
  const HostIcon = (
    <svg fill="currentColor" viewBox="0 0 24 24" stroke="none">
      <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM3 16a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z"/>
    </svg>
  );

  const BackupIcon = (
    <svg fill="currentColor" viewBox="0 0 24 24" stroke="none">
      <path d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V4a2 2 0 00-2-2H4zm0 2h16v12H4V4zm2 2v8h12V6H6zm2 2h8v4H8V8z"/>
    </svg>
  );

  const RestoreIcon = (
    <svg fill="currentColor" viewBox="0 0 24 24" stroke="none">
      <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0L8 8m4-4v12"/>
    </svg>
  );

  // ============= COMPONENT RENDER =============
  return (
    <div className="min-h-fit bg-gradient-to-br from-gray-50 via-white to-gray-100 p-4">
      <div className="max-w-4xl mx-auto space-y-6">



        {/* ============= ERROR DISPLAY ============= */}
        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6 mb-6">
            <div className="flex items-center space-x-3">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-800 font-semibold">{error}</p>
            </div>
          </div>
        )}

        {/* ============= AUTHENTICATION SECTION ============= */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-2xl border border-gray-200/50">
          <DeviceAuthFields parameters={parameters} onParamChange={onParamChange} />
        </div>

        {/* ============= MAIN FORM SECTION ============= */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-2xl border border-gray-200/50">
          <div className="flex items-center space-x-4 mb-6">
            <div className="p-2 bg-gradient-to-br from-gray-900 to-gray-700 rounded-xl">
              {React.cloneElement(RestoreIcon, { className: "w-5 h-5" })}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Select Backup Source</h2>
              <p className="text-gray-600 text-sm">Choose your device and backup file to restore</p>
            </div>
          </div>

          {/* Form fields in responsive grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Host Selection Dropdown */}
            <ModernDropdown
              label="Host Device"
              value={parameters.hostname || ""}
              onChange={(value) => onParamChange("hostname", value)}
              options={hosts}
              placeholder="Select a host device..."
              loading={loadingHosts}
              icon={HostIcon}
            />

            {/* Backup File Selection Dropdown */}
            <ModernDropdown
              label="Backup File"
              value={parameters.backup_file || ""}
              onChange={(value) => onParamChange("backup_file", value)}
              options={backups}
              placeholder={
                !parameters.hostname
                  ? "Select a host first..."
                  : backups.length === 0
                    ? "No backups available"
                    : "Choose a backup file..."
              }
              disabled={!parameters.hostname || backups.length === 0}
              loading={loadingBackups}
              icon={BackupIcon}
            />
          </div>

          {/* Progress indicator */}
          <div className="mt-6 flex items-center justify-center space-x-4">
            <div className={`w-2 h-2 rounded-full transition-all duration-300 ${parameters.hostname ? 'bg-gray-900' : 'bg-gray-300'}`}></div>
            <div className="w-6 h-0.5 bg-gray-300"></div>
            <div className={`w-2 h-2 rounded-full transition-all duration-300 ${parameters.backup_file ? 'bg-gray-900' : 'bg-gray-300'}`}></div>
            <div className="w-6 h-0.5 bg-gray-300"></div>
            <div className={`w-2 h-2 rounded-full transition-all duration-300 ${parameters.hostname && parameters.backup_file ? 'bg-gray-900' : 'bg-gray-300'}`}></div>
          </div>
        </div>


      </div>

      {/* Custom scrollbar styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
}

export default RestoreForm;
