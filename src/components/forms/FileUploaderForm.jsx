// =========================================================================================
// FILE:               src/components/forms/FileUploaderForm.jsx
//
// OVERVIEW:
//   A highly interactive and visually appealing form component for file uploads. It provides
//   a complete UI for file selection (via drag-and-drop or browsing), device targeting,
//   authentication, and initiating the upload process.
//
// KEY FEATURES:
//   - Rich File Picker: A modern drag-and-drop interface with clear visual feedback for
//     different states (empty, file selected, dragging).
//   - Integrated Progress Bar: When an upload is active, it displays a sleek, dark gray
//     progress bar directly overlaid on the file selection card, providing immediate,
//     contextual feedback right where the user took the action.
//   - State-Aware UI: The form intelligently disables controls (e.g., the "Remove File"
//     and "Upload to Device" buttons) during an active upload to prevent conflicts and
//     provide clear user guidance.
//   - Reusable & Composable: Integrates other shared components like `DeviceTargetSelector`
//     and `DeviceAuthFields` for a consistent look and feel across the application.
//
// HOW-TO GUIDE:
//   This component is designed to be used inside a parent "runner" component, such as
//   `FileUploaderRunner.jsx`.
//
//   1.  **State Management**: The parent runner manages the state for `selectedFile`,
//       `parameters`, `isRunning`, `isUploading`, and `uploadProgress`.
//   2.  **Prop Passing**: The parent passes these state values and their corresponding
//       setter functions down to this form as props.
//   3.  **Callback**: The `onUpload` prop is a function passed from the parent that
//       this component calls when the "Upload to Device" button is clicked.
//
//   Example Usage in Parent (`FileUploaderRunner.jsx`):
//   <FileUploaderForm
//     parameters={parameters}
//     onParamChange={onParamChange}
//     selectedFile={selectedFile}
//     setSelectedFile={setSelectedFile}
//     onUpload={handleRun}
//     isRunning={scriptRunner.isRunning}
//     isUploading={isUploading}
//     uploadProgress={uploadProgress}
//   />
// =========================================================================================

// =========================================================================================
// SECTION 1: IMPORTS
// All necessary libraries and child components are imported here.
// =========================================================================================
import React, { useState } from 'react';
import { Upload, File, X, CheckCircle2, Loader } from 'lucide-react';
import DeviceAuthFields from '../shared/DeviceAuthFields.jsx';
import DeviceTargetSelector from '../shared/DeviceTargetSelector.jsx';

// =========================================================================================
// SECTION 2: COMPONENT DEFINITION
// =========================================================================================
function FileUploaderForm({
  // --- Core State & Callbacks ---
  parameters,
  onParamChange,
  selectedFile,
  setSelectedFile,
  onUpload,
  isRunning,
  // --- New Props for Progress Display ---
  isUploading,      // A boolean to activate the progress bar view
  uploadProgress    // A number from 0 to 100
}) {
  // =====================================================================================
  // SECTION 3: LOCAL UI STATE
  // Manages UI-specific state, like the drag-over effect.
  // =====================================================================================
  const [isDragging, setIsDragging] = useState(false);

  // =====================================================================================
  // SECTION 4: FILE HANDLING & UTILITY FUNCTIONS
  // These functions manage the file selection process and format data for display.
  // =====================================================================================
  const handleFileChange = (e) => { if (e.target.files[0]) setSelectedFile(e.target.files[0]); };
  const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) setSelectedFile(e.dataTransfer.files[0]); };
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const removeFile = () => setSelectedFile(null);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // =====================================================================================
  // SECTION 5: RENDER METHOD
  // Assembles the final UI based on the current state and props.
  // =====================================================================================
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* ------------------------------------------------------------------ */}
        {/* Subsection 5.1: Enhanced File Picker Column                      */}
        {/* ------------------------------------------------------------------ */}
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-6 text-slate-800 flex items-center gap-2"><Upload /> File Selection</h3>
          <div
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 group ${
              isUploading ? 'border-slate-400 bg-slate-100' :
              selectedFile ? 'border-emerald-400 bg-emerald-50 cursor-pointer' :
              'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
            }`}
            onClick={() => !(isRunning || isUploading) && document.getElementById('fileInput').click()}
            onDrop={!(isRunning || isUploading) ? handleDrop : e => e.preventDefault()}
            onDragOver={!(isRunning || isUploading) ? handleDragOver : e => e.preventDefault()}
            onDragLeave={!(isRunning || isUploading) ? handleDragLeave : e => e.preventDefault()}
          >
            <input id="fileInput" type="file" className="hidden" onChange={handleFileChange} disabled={isRunning || isUploading} />

            {/* --- A: File Selected View (with Progress Overlay) --- */}
            {selectedFile && (
              <div className="relative">
                {/* --- Progress Bar Overlay (NEW) --- */}
                {isUploading && (
                  <div className="absolute inset-0 bg-slate-100/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-lg">
                    <Loader className="w-10 h-10 text-slate-500 animate-spin" />
                    <p className="mt-4 text-lg font-semibold text-slate-800">
                      Uploading... {uploadProgress.toFixed(0)}%
                    </p>
                    <div className="w-4/5 mt-2 bg-slate-300 rounded-full h-2">
                      <div
                        className="bg-slate-700 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* --- Original File Info View --- */}
                {/* This view is visually muted when the progress overlay is active. */}
                <div className={`space-y-4 ${isUploading ? 'opacity-20' : ''}`}>
                    <div className="flex items-center justify-center">
                        <div className="relative">
                            <div className="p-4 bg-emerald-100 rounded-2xl"><File className="w-12 h-12 text-emerald-600" /></div>
                            <div className="absolute -top-1 -right-1 p-1 bg-emerald-500 rounded-full"><CheckCircle2 className="w-4 h-4 text-white" /></div>
                        </div>
                    </div>
                    <div>
                        <p className="text-lg font-semibold text-emerald-800 break-all mb-1">{selectedFile.name}</p>
                        <p className="text-sm text-emerald-600">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); removeFile(); }}
                        disabled={isRunning || isUploading}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                        <X className="w-4 h-4" /> Remove File
                    </button>
                </div>
              </div>
            )}

            {/* --- B: Empty State View (No file selected) --- */}
            {!selectedFile && (
              <div className="space-y-6">
                <div className="flex items-center justify-center">
                  <div className={`p-6 rounded-2xl transition-all duration-300 ${isDragging ? 'bg-blue-200 scale-110' : 'bg-slate-200 group-hover:bg-blue-100 group-hover:scale-105'}`}>
                    <Upload className={`w-16 h-16 transition-all duration-300 ${isDragging ? 'text-blue-600 animate-bounce' : 'text-slate-500 group-hover:text-blue-600'}`} />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className={`text-xl font-bold transition-colors duration-200 ${isDragging ? 'text-blue-700' : 'text-slate-700 group-hover:text-blue-600'}`}>
                    {isDragging ? 'Drop your file here' : 'Choose a file or drag it here'}
                  </p>
                  <p className="text-sm text-slate-500 max-w-xs mx-auto">Click to browse or drag and drop your file.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Subsection 5.2: Device Configuration Column                      */}
        {/* ------------------------------------------------------------------ */}
        <div className="bg-slate-50 border rounded-lg p-6 space-y-6">
          <DeviceTargetSelector parameters={parameters} onParamChange={onParamChange} />
          <DeviceAuthFields parameters={parameters} onParamChange={onParamChange} />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Subsection 5.3: Upload Action Section                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex-1">
                <h4 className="text-lg font-semibold text-slate-800 mb-1">Ready to Upload</h4>
                <div className="space-y-1 text-sm text-slate-600">
                    {selectedFile && <p className="flex items-center gap-2"><File className="w-4 h-4 text-emerald-600" /><span className="font-medium">{selectedFile.name}</span></p>}
                    {parameters?.hostname && <p className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /><span>Device: {parameters.hostname}</span></p>}
                </div>
            </div>
            <div className="flex-shrink-0">
                <button
                    onClick={onUpload}
                    disabled={isRunning || isUploading || !selectedFile || !parameters?.hostname}
                    className="group relative inline-flex items-center gap-3 px-8 py-4 bg-slate-900 hover:bg-slate-700 disabled:bg-slate-400 text-white font-semibold rounded-lg shadow-md transition-all duration-300 disabled:cursor-not-allowed">
                    <Upload className="w-5 h-5" />
                    <span>Upload to Device</span>
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}

export default FileUploaderForm;
