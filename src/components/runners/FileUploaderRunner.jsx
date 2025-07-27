// =========================================================================================
//
// COMPONENT: FileUploaderRunner (FIXED: BUTTON NOT WORKING)
//
// =========================================================================================
//
// OVERVIEW:
//   This component is being fixed to address an issue where the "Upload to Device"
//   button appeared to do nothing after a recent change.
//
// KEY FIX IMPLEMENTED:
//   - The `handleRun` function was missing a critical line of code that was added
//     in a previous fix.
//   - The line `formData.append("remoteFilename", selectedFile.name);` has been
//     restored.
//   - Without this line, the backend would reject the request, causing the upload
//     process to fail silently within the function's catch block. This fix ensures
//     the original filename is always sent to the backend, allowing the process
//     to start correctly.
//
// =========================================================================================

// -----------------------------------------------------------------------------------------
// SECTION 1: IMPORTS & COMPONENT DEFINITION
// -----------------------------------------------------------------------------------------
import React, { useMemo, useState } from 'react';
import RealTimeDisplay from '../RealTimeProgress/RealTimeDisplay.jsx';
import DisplayResults from '../shared/DisplayResults.jsx';
import DebugDisplay from '../shared/DebugDisplay.jsx';
import FileUploaderForm from '../forms/FileUploaderForm.jsx';
import { useScriptRunnerStream } from '../../hooks/useWebSocket.jsx';

function FileUploaderRunner({ script, parameters, onParamChange, wsContext }) {

  // -----------------------------------------------------------------------------------------
  // SECTION 2: STATE MANAGEMENT AND HANDLERS
  // -----------------------------------------------------------------------------------------
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploadTriggered, setIsUploadTriggered] = useState(false);
  const scriptRunner = useScriptRunnerStream(wsContext);

  // This handler initiates the entire process by sending the file and parameters to the backend.
  const handleRun = async () => {
    scriptRunner.resetState();
    setIsUploadTriggered(false); // Reset UI trigger state
    if (!selectedFile) {
      alert("Please select a file to run.");
      return;
    }
    setIsUploadTriggered(true); // Show the real-time display immediately

    // Prepare the form data for the POST request.
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("scriptId", script.id);
    formData.append("wsClientId", wsContext.clientId);

    // --- THE FIX: THIS LINE WAS MISSING ---
    // The backend requires the original filename to be passed explicitly.
    // This line was accidentally omitted in the previous update.
    formData.append("remoteFilename", selectedFile.name);

    // Append all other parameters from the form (hostname, username, etc.).
    Object.entries(parameters).forEach(([key, value]) => {
      if (value) formData.append(key, value);
    });

    try {
      // Send the request to the backend API endpoint.
      const response = await fetch('http://localhost:3001/api/files/upload', { method: 'POST', body: formData });
      if (!response.ok) {
        // If the server returns an error (like 400 Bad Request), throw an error to be caught.
        const errorText = await response.text();
        throw new Error(`Server returned status ${response.status}: ${errorText}`);
      }
      console.log("Upload initiated successfully. Waiting for WebSocket events...");
    } catch (error) {
      // If the fetch fails, alert the user and reset the UI trigger.
      console.error("Error initiating file upload:", error);
      alert(`Failed to start the upload process: ${error.message}`);
      setIsUploadTriggered(false);
    }
  };

  // -----------------------------------------------------------------------------------------
  // SECTION 3: DATA TRANSFORMATION AND PROGRESS CALCULATION
  // -----------------------------------------------------------------------------------------
  // This hook is unchanged from the previous fix and correctly calculates display metrics.
  const {
    allEvents,
    userFriendlyEvents,
    progressMetrics,
    isUploading,
    uploadProgress
  } = useMemo(() => {
    const allEvents = scriptRunner.progressEvents || [];
    const userFriendlyEvents = allEvents.filter(e => e.event_type !== 'LOG_MESSAGE');

    const uploadStepStarted = userFriendlyEvents.some(e => e.event_type === 'STEP_START' && e.message.toLowerCase().includes('uploading'));
    const uploadStepCompleted = userFriendlyEvents.some(e => e.event_type === 'STEP_COMPLETE' && e.message.toLowerCase().includes('uploaded'));
    const isUploading = uploadStepStarted && !uploadStepCompleted && scriptRunner.isRunning;

    const lastProgressUpdate = [...userFriendlyEvents].reverse().find(e => e.event_type === 'PROGRESS_UPDATE');
    const uploadProgress = lastProgressUpdate?.data?.progress || (uploadStepCompleted ? 100 : 0);

    const operationStartEvent = userFriendlyEvents.find(e => e.event_type === 'OPERATION_START');
    const totalSteps = operationStartEvent?.data?.total_steps || 4;
    const completedStepEvents = userFriendlyEvents.filter(e => e.event_type === 'STEP_COMPLETE');
    const completedSteps = completedStepEvents.length;
    const progressPercentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    let currentStep = [...userFriendlyEvents].reverse().find(e => e.event_type === 'STEP_START')?.message || 'Initializing...';

    if (scriptRunner.isComplete) {
      currentStep = scriptRunner.error ? 'Operation failed.' : 'Operation completed successfully.';
    }

    const progressMetrics = { totalSteps, completedSteps, progressPercentage, currentStep };

    return { allEvents, userFriendlyEvents, progressMetrics, isUploading, uploadProgress };
  }, [scriptRunner.progressEvents, scriptRunner.isRunning, scriptRunner.isComplete, scriptRunner.error]);


  // -----------------------------------------------------------------------------------------
  // SECTION 4: RENDER & UI LAYOUT
  // -----------------------------------------------------------------------------------------
  // The rendering logic is unchanged.
  const realTimeProps = {
    isRunning: scriptRunner.isRunning,
    isComplete: scriptRunner.isComplete,
    hasError: !!scriptRunner.error,
    progress: userFriendlyEvents,
    result: scriptRunner.finalResult,
    error: scriptRunner.error,
    onReset: () => {
      scriptRunner.resetState();
      setIsUploadTriggered(false);
    },
    ...progressMetrics,
    latestMessage: userFriendlyEvents[userFriendlyEvents.length - 1],
  };

  const shouldShowRealTimeDisplay = isUploadTriggered || scriptRunner.isRunning || scriptRunner.isComplete;

  return (
    <div className="flex flex-col gap-8">
      <main className="flex-1 space-y-8">
        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg">
          <header className="border-b border-slate-200 pb-4 mb-6">
            <h2 className="text-2xl font-bold text-slate-800">{script.displayName}</h2>
            <p className="mt-1 text-slate-600">{script.description}</p>
          </header>

          <FileUploaderForm
            parameters={parameters}
            onParamChange={onParamChange}
            selectedFile={selectedFile}
            setSelectedFile={setSelectedFile}
            onUpload={handleRun}
            isRunning={scriptRunner.isRunning}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
          />
        </div>

        {shouldShowRealTimeDisplay && (
          <RealTimeDisplay {...realTimeProps} />
        )}

        {scriptRunner.isComplete && !scriptRunner.error && (
          <DisplayResults result={scriptRunner.finalResult} />
        )}

        <DebugDisplay isVisible={script?.capabilities?.enableDebug} progressEvents={allEvents} />
      </main>
    </div>
  );
}

export default FileUploaderRunner;
