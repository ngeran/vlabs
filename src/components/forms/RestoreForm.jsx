// src/components/forms/RestoreForm.jsx

import React, { useEffect, useState } from 'react';
import PulseLoader from 'react-spinners/PulseLoader';
import toast from 'react-hot-toast';
import DeviceAuthFields from '../shared/DeviceAuthFields.jsx';

const API_BASE_URL = "http://localhost:3001";

// Custom Dropdown Component
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
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedOption = options.find(opt => opt.value === value);

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="relative">
      <label className="block text-sm font-semibold text-slate-700 mb-2">
        {label}
      </label>

      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && !loading && setIsOpen(!isOpen)}
          disabled={disabled || loading}
          className={`
            w-full px-4 py-3 text-left bg-white border rounded-xl shadow-sm transition-all duration-200
            ${disabled || loading
              ? 'border-slate-300 bg-slate-100 text-slate-500 cursor-not-allowed'
              : 'border-slate-400 hover:border-slate-600 focus:ring-2 focus:ring-slate-500 focus:border-slate-600'
            }
            ${isOpen ? 'ring-2 ring-slate-500 border-slate-600' : ''}
          `}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {icon && (
                <div className="text-slate-400">
                  {icon}
                </div>
              )}
              <span className={selectedOption ? 'text-slate-900' : 'text-slate-500'}>
                {loading ? (
                  <div className="flex items-center space-x-2">
                    <PulseLoader size={4} color="#64748b" />
                    <span>Loading...</span>
                  </div>
                ) : (
                  selectedOption?.label || placeholder
                )}
              </span>
            </div>
            {!loading && (
              <svg
                className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${
                  isOpen ? 'rotate-180' : ''
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </div>
        </button>

        {isOpen && !loading && !disabled && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-xl shadow-lg">
            {options.length > 5 && (
              <div className="p-2 border-b border-slate-100">
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-600 outline-none"
                />
              </div>
            )}

            <div className="max-h-60 overflow-y-auto">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    className={`
                      w-full px-4 py-3 text-left hover:bg-slate-100 transition-colors duration-150
                      ${option.value === value ? 'bg-slate-200 text-slate-900' : 'text-slate-700'}
                      first:rounded-t-xl last:rounded-b-xl
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{option.label}</span>
                      {option.value === value && (
                        <svg className="w-4 h-4 text-slate-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    {option.description && (
                      <p className="text-sm text-slate-500 mt-1">{option.description}</p>
                    )}
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-sm text-slate-500">
                  No options found
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

function RestoreForm({ parameters, onParamChange }) {
  const [hosts, setHosts] = useState([]);
  const [backups, setBackups] = useState([]);
  const [loadingHosts, setLoadingHosts] = useState(false);
  const [loadingBackups, setLoadingBackups] = useState(false);

  // Fetch hosts with backups
  useEffect(() => {
    setLoadingHosts(true);
    fetch(`${API_BASE_URL}/api/backups/devices`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const hostOptions = data.devices.map(dev => ({
            value: dev.deviceIp,
            label: dev.deviceIp,
            description: `Device: ${dev.deviceIp}`
          }));
          setHosts(hostOptions);
        }
      })
      .catch(() => toast.error("Failed to fetch hosts."))
      .finally(() => setLoadingHosts(false));
  }, []);

  // Fetch backups when a host is selected
  useEffect(() => {
    const selectedHost = parameters.hostname;
    if (!selectedHost) {
      setBackups([]);
      onParamChange("backup_file", "");
      return;
    }
    setLoadingBackups(true);
    fetch(`${API_BASE_URL}/api/backups/host/${selectedHost}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const backupOptions = data.backups.map(backup => ({
            value: backup.value,
            label: backup.label,
            description: backup.description || `Backup file: ${backup.label}`
          }));
          setBackups(backupOptions);
        } else {
          setBackups([]);
        }
      })
      .catch(() => toast.error("Failed to fetch backups."))
      .finally(() => setLoadingBackups(false));
  }, [parameters.hostname, onParamChange]);

  // [DEBUG] Log parameters whenever they change
  useEffect(() => {
    console.log("RestoreForm parameters updated:", parameters);
  }, [parameters]);

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-2xl p-6 border border-slate-200">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-slate-200 rounded-xl">
            <svg className="w-6 h-6 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-slate-800">Restore from Backup</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ModernDropdown
            label="Select Host Device"
            value={parameters.hostname || ""}
            onChange={(value) => onParamChange("hostname", value)}
            options={hosts}
            placeholder="Choose a host device..."
            loading={loadingHosts}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            }
          />

          <ModernDropdown
            label="Select Backup File"
            value={parameters.backup_file || ""}
            onChange={(value) => onParamChange("backup_file", value)}
            options={backups}
            placeholder="Choose a backup file..."
            disabled={!parameters.hostname || backups.length === 0}
            loading={loadingBackups}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
            }
          />
        </div>
      </div>

      <DeviceAuthFields parameters={parameters} onParamChange={onParamChange} />
    </div>
  );
}

export default RestoreForm;
