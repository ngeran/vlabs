// vlabs/src/components/LabModal.jsx

import React, { useState, useEffect } from "react";
import {
  X,
  Clock,
  BarChart3,
  Network,
  Play,
  Image as ImageIcon,
  FileText,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Loader,
  Square,
  Globe,
} from "lucide-react";
import getDifficultyColor from "../utils/getDifficultyColor";
import {
  launchLab,
  stopLab,
  getLabStatus,
  onLabStatusChange,
  offLabStatusChange,
} from "../utils/labLauncher";

import yaml from "js-yaml";
import ReactMarkdown from "react-markdown";

const LabModal = ({ lab, isOpen, onClose, onLaunch }) => {
  const safeLab = lab || {};
  const labIdentifier = `/labs/${safeLab.category}/${safeLab.slug}`;

  const [activeTab, setActiveTab] = useState("overview");
  const [labData, setLabData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const [labStatus, setLabStatus] = useState(
    labIdentifier ? getLabStatus(labIdentifier)?.status : null,
  );
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState(null);
  const [labProgress, setLabProgress] = useState(
    labIdentifier ? getLabStatus(labIdentifier) : null,
  );

  useEffect(() => {
    if (isOpen && lab) {
      loadYamlContent();
      checkExistingLabStatus();
    }
  }, [isOpen, lab]);

  useEffect(() => {
    if (isOpen && labIdentifier) {
      const handleStatusChange = (data) => {
        if (data.id !== labIdentifier) return;

        setLabStatus(data.status);
        setLabProgress(data);

        if (data.status === "failed") {
          setLaunchError(data.error);
          setIsLaunching(false);
        } else if (data.status === "running") {
          setIsLaunching(false);
          setLaunchError(null);
        } else if (data.status === "completed") {
          setIsLaunching(false);
        } else if (data.status === "stopped") {
          setIsLaunching(false);
          setLaunchError(null);
        }
      };

      onLabStatusChange(labIdentifier, handleStatusChange);

      return () => {
        offLabStatusChange(labIdentifier, handleStatusChange);
      };
    }
  }, [isOpen, labIdentifier]);

  const loadYamlContent = async () => {
    setIsLoading(true);
    const yamlPath = `/labs/${lab.category}/${lab.slug}/${lab.slug}.yml`;
    console.log("Attempting to fetch YAML from:", yamlPath);

    try {
      const response = await fetch(yamlPath);

      if (response.ok) {
        const text = await response.text();
        console.log("YAML raw text response:", text);

        const data = yaml.load(text);
        console.log("Parsed YAML data (labData):", data);
        setLabData(data);
      } else {
        console.error(
          `Failed to fetch YAML for ${lab.title}. Status: ${response.status}, ${response.statusText}`,
        );
        setLabData(null);
      }
    } catch (error) {
      console.error("Error loading YAML content:", error);
      setLabData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const checkExistingLabStatus = () => {
    if (!labIdentifier) return;

    const existingStatus = getLabStatus(labIdentifier);

    if (existingStatus) {
      setLabStatus(existingStatus.status);
      setLabProgress({
        status: existingStatus.status,
        accessUrl: existingStatus.accessUrl,
        ports: existingStatus.ports,
        message: getStatusMessage(existingStatus.status),
      });
      if (existingStatus.status === "launching") {
        setIsLaunching(true);
      } else {
        setIsLaunching(false);
      }
    } else {
      setLabStatus(null);
      setLabProgress(null);
      setIsLaunching(false);
      setLaunchError(null);
    }
  };

  const getStatusMessage = (status) => {
    switch (status) {
      case "launching":
        return "Preparing lab environment...";
      case "running":
        return "Lab environment is ready!";
      case "completed":
        return "Lab completed successfully!";
      case "failed":
        return "Lab launch failed";
      case "stopped":
        return "Lab has been stopped";
      default:
        return "Not launched";
    }
  };

  const handleLaunchLab = async () => {
    setIsLaunching(true);
    setLaunchError(null);
    setLabStatus("launching");

    try {
      const result = await launchLab(labIdentifier, labData, {});

      if (onLaunch) {
        await onLaunch(lab);
      }

      if (!result.success) {
        throw new Error(result.message);
      }
    } catch (error) {
      setLaunchError(error.message);
      setIsLaunching(false);
      setLabStatus("failed");
    }
  };

  const handleStopLab = async () => {
    try {
      if (!labIdentifier) return;

      await stopLab(labIdentifier);

      setLabStatus("stopping");
      setLabProgress(null);
    } catch (error) {
      console.error("Failed to stop lab:", error);
      setLaunchError(error.message);
      setLabStatus("failed");
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "launching":
        return <Loader className="w-4 h-4 animate-spin text-blue-600" />;
      case "running":
        return <Play className="w-4 h-4 text-green-600" />;
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case "stopped":
        return <Square className="w-4 h-4 text-gray-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "launching":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "running":
        return "bg-green-100 text-green-800 border-green-200";
      case "completed":
        return "bg-green-100 text-green-800 border-green-200";
      case "failed":
        return "bg-red-100 text-red-800 border-red-200";
      case "stopped":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  if (!isOpen || !lab) {
    console.log("[LabModal] Not rendering: isOpen =", isOpen, "lab =", lab);
    return null;
  }

  console.log("Current labData state (during render):", labData);

  return (
    <div className="fixed inset-0 z-50 p-4 overflow-y-auto flex items-center justify-center bg-white/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[95vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Topology Image Section */}
        <div className="relative bg-gray-100">
          <img
            src={`/labs/${lab.category}/${lab.slug}/topology.png`}
            alt={`${lab.title} Topology`}
            className={`w-full h-auto object-contain max-h-[80vh] transition-all`}
            onError={(e) => {
              e.target.style.display = "none";
              if (e.target.nextSibling) {
                e.target.nextSibling.style.display = "flex";
              }
            }}
          />
          {/* Fallback for missing topology image */}
          <div
            style={{ display: "none" }}
            className="flex flex-col items-center justify-center bg-gray-100 p-12 border-2 border-dashed border-gray-300 min-h-[200px]"
          >
            <ImageIcon className="w-16 h-16 text-gray-400 mb-4" />
            <p className="text-gray-500 text-lg">
              Topology diagram not available
            </p>
            <p className="text-gray-400 text-sm mt-2">
              /labs/{lab.category}/{lab.slug}/topology.png
            </p>
          </div>

          {/* Status Banner */}
          {labStatus && (
            <div
              className={`absolute top-12 left-4 right-4 px-4 py-3 rounded-lg border ${getStatusColor(labStatus)} backdrop-blur-sm`}
            >
              <div className="flex items-center space-x-2">
                {getStatusIcon(labStatus)}
                <span className="font-medium">
                  {labProgress?.message || getStatusMessage(labStatus)}
                </span>
                {labProgress?.accessUrl && (
                  <a
                    href={labProgress.accessUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto flex items-center space-x-1 text-sm hover:underline"
                  >
                    <Globe className="w-3 h-3" />
                    <span>Open Lab</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-2 left-2 p-2 bg-white bg-opacity-80 hover:bg-opacity-100 rounded-full shadow-md cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Main content area */}
        <div className="p-6 flex-1 flex flex-col overflow-hidden">
          {/* Wrapper for all static content above the tabs - No flex properties here */}
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-1">{lab.title}</h2>
              <p className="text-gray-600">{lab.description}</p>
              <div className="flex space-x-6 mt-4 text-sm text-gray-500">
                <div className="flex items-center space-x-1">
                  <Clock className="w-4 h-4" />
                  <span>{lab.duration}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <BarChart3 className="w-4 h-4" />
                  <span>{lab.difficulty}</span>
                </div>
                <div className="flex items-center space-x-1 capitalize">
                  <Network className="w-4 h-4" />
                  <span>{lab.category}</span>
                </div>
              </div>
            </div>

            {/* Error Display */}
            {launchError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <span className="font-medium text-red-800">
                    Launch Failed
                  </span>
                </div>
                <p className="text-red-700 mt-1">{launchError}</p>
              </div>
            )}

            {/* Lab Access URLs */}
            {labProgress?.accessUrl && labStatus === "running" && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-medium text-green-800 mb-2">
                  Lab Environment Access
                </h4>
                <div className="space-y-2">
                  <a
                    href={labProgress.accessUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-2 text-green-700 hover:text-green-800 hover:underline"
                  >
                    <Globe className="w-4 h-4" />
                    <span>Primary Lab Interface</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {labProgress.ports && (
                    <div className="text-sm text-green-600">
                      <span>
                        Available ports: {labProgress.ports.join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tabs Navigation */}
            <nav className="flex items-center border-b border-gray-200 mb-6">
              <button
                key="overview"
                onClick={() => setActiveTab("overview")}
                className={`pb-2 px-4 text-sm font-medium cursor-pointer ${
                  activeTab === "overview"
                    ? "border-b-2 border-blue-600 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Overview
              </button>
              <div className="h-6 w-[1px] bg-gray-300 mx-4"></div>{" "}
              {/* Separator */}
              <button
                key="details"
                onClick={() => setActiveTab("details")}
                className={`pb-2 px-4 text-sm font-medium cursor-pointer ${
                  activeTab === "details"
                    ? "border-b-2 border-blue-600 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Details
              </button>
            </nav>
          </div>
          {/* END: Wrapper for all static content above the tabs */}

          {/* Tab Content Area - This should now correctly take remaining space and scroll */}
          {isLoading ? (
            <div className="flex justify-center items-center py-12 flex-1 overflow-y-auto">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="prose max-w-none text-gray-700 flex-1 overflow-y-auto min-h-50">
              {/* Added 'block' class to ensure these children behave predictably within the flex container */}
              {activeTab === "overview" && (
                <div className="block">
                  <ReactMarkdown>
                    {labData?.description || "No description available."}
                  </ReactMarkdown>
                </div>
              )}
              {activeTab === "details" && (
                <div className="block">
                  <h3>Things to do with the lab</h3>
                  {labData?.objectives ? (
                    <ul>
                      {labData.objectives.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No tasks listed for this lab.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with action buttons */}
        <div className="bg-gray-50 px-6 py-4 border-t flex justify-end items-center">
          <div className="flex space-x-3">
            {labStatus === "running" || labStatus === "completed" ? (
              <button
                onClick={handleStopLab}
                className="flex items-center space-x-2 bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg font-medium transition-colors cursor-pointer"
              >
                <Square className="w-4 h-4" />
                <span>Stop Lab</span>
              </button>
            ) : (
              <button
                onClick={handleLaunchLab}
                disabled={isLaunching || labStatus === "launching"}
                className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-medium transition-colors cursor-pointer"
              >
                {isLaunching || labStatus === "launching" ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Launching...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Launch Lab</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LabModal;
