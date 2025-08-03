// src/shared/SingleDeviceAuth.jsx
// =============================================================================
// DESCRIPTION
// =============================================================================
// SingleDeviceAuth.jsx is a reusable React component that renders a modern form for
// entering device authentication details (hostname, username, password) for network
// configuration tasks. It combines the functionality of DeviceTargetSelector.jsx
// (hostname input) and DeviceAuthFields.jsx (username/password inputs) into a single
// component, designed for use within DeviceConfigurationRunner.jsx. The component is
// metadata-driven, supporting configuration via metadata.yml, and features real-time
// validation, responsive design, and a sleek UI with Tailwind CSS and lucide-react icons.
//
// =============================================================================
// KEY FEATURES
// =============================================================================
// - Single Form: Combines hostname, username, and password inputs in a unified form.
// - Metadata-Driven: Configurable via metadata.yml (title, description, parameters).
// - Real-Time Validation: Displays error messages and red borders for empty required fields.
// - Password Toggle: Allows showing/hiding the password with Eye/EyeOff icons.
// - Responsive Design: Uses a 3-column grid for medium screens, single-column for smaller screens.
// - Modern Styling: Gradient backgrounds, shadows, and rounded corners matching provided components.
// - Logging: Console logs for debugging input changes and interactions.
// - Accessibility: Input fields include ARIA-compatible labels and validation feedback.
//
// =============================================================================
// HOW-TO GUIDE
// =============================================================================
// 1. Place in Project:
//    - Save this file as `src/shared/SingleDeviceAuth.jsx`.
//    - Ensure dependencies are installed: `npm install react lucide-react`.
// 2. Update metadata.yml:
//    - Set `deviceAuth.component` to `SingleDeviceAuth`.
//    - Define `requiredFields: ["hostname", "username", "password"]`.
//    - Add parameters for `hostname`, `username`, `password` with `type: text` or `password`.
// 3. Integrate with DeviceConfigurationRunner.jsx:
//    - Import: `import SingleDeviceAuth from "../shared/SingleDeviceAuth";`.
//    - Render for `deviceAuth` capability, passing `parameters`, `onParamChange`, `title`, and `description`.
// 4. Test:
//    - Run frontend: `npm run dev`.
//    - Navigate to "Configuration Templates" and verify the form renders.
//    - Check console for `[SingleDeviceAuth]` logs on input changes.
//    - Ensure validation shows red borders/errors for empty fields.
//    - Test with a screen reader for accessibility.
// 5. Debug:
//    - Verify `metadata.yml` has correct `deviceAuth` configuration.
//    - Check console logs for parameter updates.
//    - Ensure backend (`/api/templates/discover`) returns templates for the sidebar.
//
// =============================================================================
// SECTION 1: IMPORTS
// =============================================================================
import React, { useState } from "react";
import { Server, User, Lock, Eye, EyeOff, Shield } from "lucide-react";

// =============================================================================
// SECTION 2: COMPONENT DEFINITION
// =============================================================================
// Renders a form for single-device authentication with hostname, username, and password inputs.
// @param {Object} parameters - Input values (hostname, username, password) from parent state.
// @param {Function} onParamChange - Callback to update parameters in parent state (name, value).
// @param {string} title - Form title from metadata.yml (default: "Device Authentication").
// @param {string} description - Form description from metadata.yml.
// @param {string} className - Additional CSS classes for styling.
export default function SingleDeviceAuth({
  parameters = {}, // Default to empty object
  onParamChange = () => {}, // Default to no-op function
  title = "Device Authentication",
  description = "Enter credentials and target device for secure access",
  className = ""
}) {
  // =============================================================================
  // SECTION 3: STATE MANAGEMENT
  // =============================================================================
  // Tracks password visibility toggle state
  const [showPassword, setShowPassword] = useState(false);

  // =============================================================================
  // SECTION 4: EVENT HANDLERS
  // =============================================================================
  // Handles input changes for hostname, username, password
  // Calls onParamChange with field name and value, logs for debugging
  const handleChange = (e) => {
    const { name, value } = e.target;
    console.log(`[SingleDeviceAuth] Updating ${name} to:`, value);
    onParamChange(name, value);
  };

  // Toggles password visibility
  const togglePasswordVisibility = () => {
    console.log(`[SingleDeviceAuth] Toggling password visibility to:`, !showPassword);
    setShowPassword(!showPassword);
  };

  // =============================================================================
  // SECTION 5: VALIDATION HELPERS
  // =============================================================================
  // Checks if fields are non-empty for validation
  const hasValidHostname = parameters.hostname && parameters.hostname.trim() !== "";
  const hasValidUsername = parameters.username && parameters.username.trim() !== "";
  const hasValidPassword = parameters.password && parameters.password.trim() !== "";

  // =============================================================================
  // SECTION 6: RENDER LOGIC
  // =============================================================================
  return (
    <div className={`bg-gradient-to-br from-slate-50 to-white border border-slate-200/60 rounded-2xl shadow-sm backdrop-blur-sm ${className}`}>
      {/* SECTION 6.1: HEADER */}
      {/* Displays title, description, and connection status badge */}
      <div className="px-5 py-4 border-b border-slate-100/80">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-sm">
              <Shield className="h-4 w-4 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-900 truncate">{title}</h3>
              <p className="text-xs text-slate-500 truncate">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-slate-100/80 to-slate-50 rounded-full border border-slate-200/60">
            <div className="h-2 w-2 bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full animate-pulse"></div>
            <span className="text-xs font-medium text-slate-600">Secure Connection</span>
          </div>
        </div>
      </div>

      {/* SECTION 6.2: FORM FIELDS */}
      {/* Renders hostname, username, and password inputs in a responsive grid */}
      <div className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Hostname Input */}
          <div className="group">
            <div className="relative">
              <input
                type="text"
                id="hostname"
                name="hostname"
                value={parameters.hostname || ""}
                onChange={handleChange}
                placeholder="e.g., router1.company.com"
                className={`w-full pl-9 pr-4 py-2.5 text-sm border rounded-xl transition-all duration-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 hover:border-slate-300 ${
                  hasValidHostname
                    ? "border-slate-200 bg-white shadow-sm"
                    : "border-red-200 bg-red-50/50 focus:ring-red-500/20 focus:border-red-400"
                }`}
                aria-label="Target hostname"
              />
              <Server className={`absolute left-2.5 top-2.5 h-4 w-4 transition-colors ${
                hasValidHostname ? "text-slate-400 group-hover:text-slate-500" : "text-red-400"
              }`} />
            </div>
            {!hasValidHostname && (
              <p className="text-xs text-red-500 mt-1.5 ml-1 animate-in fade-in duration-200">
                Hostname required
              </p>
            )}
          </div>

          {/* Username Input */}
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
                aria-label="Username"
              />
              <User className={`absolute left-2.5 top-2.5 h-4 w-4 transition-colors ${
                hasValidUsername ? "text-slate-400 group-hover:text-slate-500" : "text-red-400"
              }`} />
            </div>
            {!hasValidUsername && (
              <p className="text-xs text-red-500 mt-1.5 ml-1 animate-in fade-in duration-200">
                Username required
              </p>
            )}
          </div>

          {/* Password Input */}
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
                aria-label="Password"
              />
              <Lock className={`absolute left-2.5 top-2.5 h-4 w-4 transition-colors ${
                hasValidPassword ? "text-slate-400 group-hover:text-slate-500" : "text-red-400"
              }`} />
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
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
