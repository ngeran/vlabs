// =============================================================================
// FILE: DeviceAuthFields.jsx
// DESCRIPTION: Reusable component for rendering authentication input fields
//              (username and password) with validation and a password toggle.
// DEPENDENCIES:
//   - react: For building the UI and managing state (useState).
//   - lucide-react: For icons (User, Lock, Shield, Eye, EyeOff).
// =============================================================================

import React, { useState } from "react";
import { User, Lock, Shield, Eye, EyeOff } from "lucide-react";

// =============================================================================
// SECTION 1: COMPONENT DEFINITION
// =============================================================================
// Renders input fields for device authentication credentials.
export default function DeviceAuthFields({
  parameters = {}, // Input parameters (username, password)
  onParamChange = () => {}, // Callback to update parameters
  title = "Device Authentication", // Title from metadata.yml
  description = "Secure credentials for device access", // Description from metadata.yml
  className = "" // Additional CSS classes
}) {
  // =============================================================================
  // SECTION 2: STATE MANAGEMENT
  // =============================================================================
  // State to toggle password visibility.
  const [showPassword, setShowPassword] = useState(false);

  // =============================================================================
  // SECTION 3: EVENT HANDLERS
  // =============================================================================
  // Handle input changes for username and password.
  const handleChange = (e) => {
    const { name, value } = e.target;
    onParamChange(name, value);
  };

  // =============================================================================
  // SECTION 4: VALIDATION HELPERS
  // =============================================================================
  const hasValidUsername = parameters.username && parameters.username.trim() !== "";
  const hasValidPassword = parameters.password && parameters.password.trim() !== "";

  // =============================================================================
  // SECTION 5: RENDER LOGIC
  // =============================================================================
  return (
    <div className={`bg-gradient-to-br from-slate-50 to-white border border-slate-200/60 rounded-2xl shadow-sm backdrop-blur-sm ${className}`}>
      {/* SECTION 5.1: HEADER */}
      <div className="px-5 py-4 border-b border-slate-100/80">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl shadow-sm">
              <Shield className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-900 truncate">{title}</h3>
              <p className="text-xs text-slate-500 truncate">{description}</p>
            </div>
          </div>
          {/* Security Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-slate-100/80 to-slate-50 rounded-full border border-slate-200/60">
            <div className="h-2 w-2 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full animate-pulse"></div>
            <span className="text-xs font-medium text-slate-600">Secure Connection</span>
          </div>
        </div>
      </div>

      {/* SECTION 5.2: FORM FIELDS */}
      <div className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Username Field */}
          <div className="group">
            <div className="relative">
              <input
                type="text"
                id="username"
                name="username"
                value={parameters.username || ""}
                onChange={handleChange}
                placeholder="Username"
                className={`w-full pl-9 pr-4 py-2.5 text-sm border rounded-xl transition-all duration-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 hover:border-slate-300 ${
                  hasValidUsername
                    ? "border-slate-200 bg-white shadow-sm"
                    : "border-red-200 bg-red-50/50 focus:ring-red-500/20 focus:border-red-400"
                }`}
              />
              <User className={`absolute left-2.5 top-2.5 h-4 w-4 transition-colors ${
                hasValidUsername ? 'text-slate-400 group-hover:text-slate-500' : 'text-red-400'
              }`} />
            </div>
            {!hasValidUsername && (
              <p className="text-xs text-red-500 mt-1.5 ml-1 animate-in fade-in duration-200">
                Username required
              </p>
            )}
          </div>

          {/* Password Field */}
          <div className="group">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                value={parameters.password || ""}
                onChange={handleChange}
                placeholder="Password"
                className={`w-full pl-9 pr-10 py-2.5 text-sm border rounded-xl transition-all duration-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 hover:border-slate-300 ${
                  hasValidPassword
                    ? "border-slate-200 bg-white shadow-sm"
                    : "border-red-200 bg-red-50/50 focus:ring-red-500/20 focus:border-red-400"
                }`}
              />
              <Lock className={`absolute left-2.5 top-2.5 h-4 w-4 transition-colors ${
                hasValidPassword ? 'text-slate-400 group-hover:text-slate-500' : 'text-red-400'
              }`} />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {!hasValidPassword && (
              <p className="text-xs text-red-500 mt-1.5 ml-1 animate-in fade-in duration-200">
                Password required
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
