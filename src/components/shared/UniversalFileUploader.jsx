// =============================================================================
// FILE: UniversalFileUploader.jsx
// DESCRIPTION: Reusable component for uploading any type of file to Juniper routers
//              using PyEZ integration. Can be enabled/disabled through script metadata
//              capabilities and provides a clean interface for file uploads.
//
// OVERVIEW:
//   This component provides a user-friendly interface for uploading files to
//   Juniper routers. It handles file selection, connection parameters input,
//   and communicates with a Python backend script that uses Juniper PyEZ to
//   establish the connection and transfer files. The component includes progress
//   tracking, error handling, and success feedback.
//
// DEPENDENCIES:
//   - react: For building the UI and managing component state
//   - lucide-react: For icons (Upload, File, CheckCircle, AlertCircle, Loader2)
//   - Backend: run.py script with Juniper PyEZ for device connectivity
//
// HOW TO USE:
//   1. Add to your script metadata:
//      capabilities:
//        enableFileUpload: true
//
//   2. Import and use in your component:
//      import UniversalFileUploader from '../components/shared/UniversalFileUploader';
//
//      <UniversalFileUploader
//        isVisible={script?.capabilities?.enableFileUpload}
//        onUploadComplete={(result) => console.log('Upload completed:', result)}
//        onUploadError={(error) => console.log('Upload failed:', error)}
//      />
//
//   3. Optional props:
//      - className: Additional CSS classes
//      - defaultPath: Default upload path (defaults to /var/tmp/)
//      - acceptedFileTypes: File type restrictions
//      - maxFileSize: Maximum file size in bytes
// =============================================================================

import React, { useState, useRef } from "react";
import { Upload, File, CheckCircle, AlertCircle, Loader2, FolderUp, Settings } from "lucide-react";

// =============================================================================
// SECTION 1: COMPONENT DEFINITION
// =============================================================================
/**
 * Universal file uploader for Juniper routers using PyEZ
 * @param {Object} props - Component props
 * @param {boolean} props.isVisible - Controls visibility (from metadata capabilities)
 * @param {Function} props.onUploadComplete - Callback when upload succeeds
 * @param {Function} props.onUploadError - Callback when upload fails
 * @param {Function} props.onUploadProgress - Callback for progress updates
 * @param {string} props.className - Additional CSS classes
 * @param {string} props.defaultPath - Default upload path on router
 * @param {string} props.acceptedFileTypes - Allowed file types (e.g., ".txt,.cfg,.py")
 * @param {number} props.maxFileSize - Maximum file size in bytes (default: 100MB)
 * @param {string} props.title - Custom title for the component
 * @returns {JSX.Element|null} File uploader component or null if not visible
 */
export default function UniversalFileUploader({
  isVisible = false,
  onUploadComplete = () => {},
  onUploadError = () => {},
  onUploadProgress = () => {},
  className = "",
  defaultPath = "/var/tmp/",
  acceptedFileTypes = "*",
  maxFileSize = 100 * 1024 * 1024, // 100MB default
  title = "Universal File Uploader"
}) {
  // =============================================================================
  // SECTION 2: STATE MANAGEMENT
  // =============================================================================
  const [selectedFile, setSelectedFile] = useState(null);
  const [connectionParams, setConnectionParams] = useState({
    hostname: "",
    username: "",
    password: "",
    path: defaultPath
  });
  const [uploadStatus, setUploadStatus] = useState("idle"); // idle, uploading, success, error
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInputRef = useRef(null);

  // =============================================================================
  // SECTION 3: EARLY RETURN CONDITIONS
  // =============================================================================
  // Don't render if not visible
  if (!isVisible) {
    return null;
  }

  // =============================================================================
  // SECTION 4: VALIDATION FUNCTIONS
  // =============================================================================
  /**
   * Validates the selected file against size and type restrictions
   * @param {File} file - The file to validate
   * @returns {Object} Validation result with isValid boolean and message
   */
  const validateFile = (file) => {
    if (!file) {
      return { isValid: false, message: "No file selected" };
    }

    // Check file size
    if (file.size > maxFileSize) {
      const maxSizeMB = Math.round(maxFileSize / (1024 * 1024));
      return {
        isValid: false,
        message: `File size exceeds ${maxSizeMB}MB limit`
      };
    }

    // Check file type if restrictions are set
    if (acceptedFileTypes !== "*") {
      const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      const allowedTypes = acceptedFileTypes.toLowerCase().split(',');
      if (!allowedTypes.includes(fileExtension)) {
        return {
          isValid: false,
          message: `File type not allowed. Accepted types: ${acceptedFileTypes}`
        };
      }
    }

    return { isValid: true, message: "File is valid" };
  };

  /**
   * Validates connection parameters
   * @returns {Object} Validation result with isValid boolean and message
   */
  const validateConnectionParams = () => {
    const { hostname, username, password } = connectionParams;

    if (!hostname.trim()) {
      return { isValid: false, message: "Hostname is required" };
    }
    if (!username.trim()) {
      return { isValid: false, message: "Username is required" };
    }
    if (!password.trim()) {
      return { isValid: false, message: "Password is required" };
    }

    return { isValid: true, message: "Connection parameters are valid" };
  };

  // =============================================================================
  // SECTION 5: EVENT HANDLERS
  // =============================================================================
  /**
   * Handles file selection from input
   * @param {Event} event - File input change event
   */
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      const validation = validateFile(file);
      if (validation.isValid) {
        setSelectedFile(file);
        setUploadStatus("idle");
        setUploadMessage("");
      } else {
        setUploadMessage(validation.message);
        setUploadStatus("error");
        setSelectedFile(null);
      }
    }
  };

  /**
   * Handles connection parameter changes
   * @param {string} field - Parameter field name
   * @param {string} value - New value
   */
  const handleParamChange = (field, value) => {
    setConnectionParams(prev => ({
      ...prev,
      [field]: value
    }));
  };

  /**
   * Triggers file input dialog
   */
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  /**
   * Clears selected file and resets status
   */
  const clearFile = () => {
    setSelectedFile(null);
    setUploadStatus("idle");
    setUploadMessage("");
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  /**
   * Handles the upload process
   */
  const handleUpload = async () => {
    // Validate file and connection parameters
    const fileValidation = validateFile(selectedFile);
    const paramValidation = validateConnectionParams();

    if (!fileValidation.isValid) {
      setUploadMessage(fileValidation.message);
      setUploadStatus("error");
      onUploadError(fileValidation.message);
      return;
    }

    if (!paramValidation.isValid) {
      setUploadMessage(paramValidation.message);
      setUploadStatus("error");
      onUploadError(paramValidation.message);
      return;
    }

    try {
      setUploadStatus("uploading");
      setUploadMessage("Connecting to router...");
      setUploadProgress(10);

      // Prepare form data for the backend
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('hostname', connectionParams.hostname);
      formData.append('username', connectionParams.username);
      formData.append('password', connectionParams.password);
      formData.append('path', connectionParams.path || defaultPath);

      // Progress simulation for user feedback
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev < 90) return prev + 10;
          return prev;
        });
      }, 500);

      setUploadMessage("Uploading file to router...");

      // Make API call to Python backend
      const response = await fetch('/api/upload-to-router', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);

      if (response.ok) {
        const result = await response.json();
        setUploadProgress(100);
        setUploadStatus("success");
        setUploadMessage(`File uploaded successfully to ${connectionParams.path || defaultPath}${selectedFile.name}`);
        onUploadComplete(result);
      } else {
        const error = await response.text();
        throw new Error(error || 'Upload failed');
      }

    } catch (error) {
      setUploadStatus("error");
      setUploadMessage(`Upload failed: ${error.message}`);
      setUploadProgress(0);
      onUploadError(error.message);
    }
  };

  /**
   * Toggles component expansion
   */
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // =============================================================================
  // SECTION 6: UTILITY FUNCTIONS
  // =============================================================================
  /**
   * Formats file size for display
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  /**
   * Gets status icon based on current upload status
   * @returns {JSX.Element} Status icon component
   */
  const getStatusIcon = () => {
    switch (uploadStatus) {
      case "uploading":
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Upload className="h-4 w-4 text-blue-600" />;
    }
  };

  /**
   * Gets status color classes based on current upload status
   * @returns {string} CSS classes for status styling
   */
  const getStatusColorClasses = () => {
    switch (uploadStatus) {
      case "uploading":
        return "from-blue-50 to-indigo-50 border-blue-200/60";
      case "success":
        return "from-green-50 to-emerald-50 border-green-200/60";
      case "error":
        return "from-red-50 to-rose-50 border-red-200/60";
      default:
        return "from-blue-50 to-indigo-50 border-blue-200/60";
    }
  };

  // =============================================================================
  // SECTION 7: RENDER LOGIC
  // =============================================================================
  return (
    <div className={`bg-gradient-to-br ${getStatusColorClasses()} rounded-2xl shadow-sm backdrop-blur-sm ${className}`}>
      {/* SECTION 7.1: HEADER */}
      <div className="px-5 py-4 border-b border-blue-100/80">
        <button
          onClick={toggleExpanded}
          className="w-full flex items-center justify-between gap-3 cursor-pointer hover:bg-blue-100/50 rounded-xl p-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300/50"
          aria-expanded={isExpanded}
          aria-controls="uploader-content"
        >
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl shadow-sm">
              <FolderUp className="h-4 w-4 text-blue-600" />
            </div>
            <div className="min-w-0 text-left">
              <h3 className="text-base font-semibold text-blue-900 truncate">
                {title}
              </h3>
              <p className="text-xs text-blue-600 truncate">
                {selectedFile ? `${selectedFile.name} (${formatFileSize(selectedFile.size)})` : 'No file selected'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {uploadStatus !== "idle" && (
              <div className="flex items-center gap-2">
                {getStatusIcon()}
              </div>
            )}
            <div className="px-3 py-1.5 bg-gradient-to-r from-blue-100/80 to-indigo-50 rounded-full border border-blue-200/60">
              <span className="text-xs font-medium text-blue-700">
                {isExpanded ? 'Collapse' : 'Expand'}
              </span>
            </div>
          </div>
        </button>
      </div>

      {/* SECTION 7.2: COLLAPSIBLE CONTENT */}
      {isExpanded && (
        <div
          id="uploader-content"
          className="p-5 animate-in slide-in-from-top-2 duration-200"
        >
          {/* SECTION 7.2.1: FILE SELECTION */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-blue-900">File Selection</h4>
            </div>

            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                accept={acceptedFileTypes === "*" ? undefined : acceptedFileTypes}
                className="hidden"
              />

              <div className="flex items-center gap-3">
                <button
                  onClick={triggerFileSelect}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-xl transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300/50"
                >
                  <File className="h-4 w-4" />
                  Choose File
                </button>

                {selectedFile && (
                  <button
                    onClick={clearFile}
                    className="px-3 py-2 text-sm text-gray-600 hover:text-red-600 transition-colors duration-200"
                  >
                    Clear
                  </button>
                )}
              </div>

              {selectedFile && (
                <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                  <div className="flex items-center gap-2">
                    <File className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">{selectedFile.name}</span>
                    <span className="text-xs text-blue-600">({formatFileSize(selectedFile.size)})</span>
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 7.2.2: CONNECTION PARAMETERS */}
            <div className="border-t border-blue-100/50 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-blue-900">Router Connection</h4>
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <Settings className="h-3 w-3" />
                  {showAdvanced ? 'Basic' : 'Advanced'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-blue-800 mb-1">
                    Hostname/IP *
                  </label>
                  <input
                    type="text"
                    value={connectionParams.hostname}
                    onChange={(e) => handleParamChange('hostname', e.target.value)}
                    placeholder="192.168.1.1"
                    className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-blue-800 mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    value={connectionParams.username}
                    onChange={(e) => handleParamChange('username', e.target.value)}
                    placeholder="admin"
                    className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-blue-800 mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    value={connectionParams.password}
                    onChange={(e) => handleParamChange('password', e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300"
                  />
                </div>

                {showAdvanced && (
                  <div>
                    <label className="block text-xs font-medium text-blue-800 mb-1">
                      Upload Path
                    </label>
                    <input
                      type="text"
                      value={connectionParams.path}
                      onChange={(e) => handleParamChange('path', e.target.value)}
                      placeholder={defaultPath}
                      className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300"
                    />
                    <p className="text-xs text-blue-600 mt-1">
                      Default: {defaultPath}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 7.2.3: UPLOAD SECTION */}
            <div className="border-t border-blue-100/50 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-blue-900">Upload</h4>
              </div>

              {/* Progress Bar */}
              {uploadStatus === "uploading" && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-blue-600 mb-1">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-blue-100 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Status Message */}
              {uploadMessage && (
                <div className={`p-3 rounded-xl mb-3 ${
                  uploadStatus === "success"
                    ? "bg-green-50 border border-green-200 text-green-800"
                    : uploadStatus === "error"
                    ? "bg-red-50 border border-red-200 text-red-800"
                    : "bg-blue-50 border border-blue-200 text-blue-800"
                }`}>
                  <div className="flex items-center gap-2">
                    {getStatusIcon()}
                    <span className="text-sm">{uploadMessage}</span>
                  </div>
                </div>
              )}

              {/* Upload Button */}
              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploadStatus === "uploading" || !connectionParams.hostname || !connectionParams.username || !connectionParams.password}
                className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-300/50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {uploadStatus === "uploading" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Upload to Router
                  </>
                )}
              </button>
            </div>

            {/* SECTION 7.2.4: FOOTER INFO */}
            <div className="border-t border-blue-100/50 pt-3">
              <div className="flex items-center justify-between text-xs text-blue-600">
                <span>Max file size: {formatFileSize(maxFileSize)}</span>
                <span>Uses Juniper PyEZ</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
