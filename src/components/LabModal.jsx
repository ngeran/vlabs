import React, { useState, useEffect } from 'react';
import { X, Clock, BarChart3, Network, Play, Image as ImageIcon, FileText, ExternalLink } from 'lucide-react';
import getDifficultyColor from '../utils/getDifficultyColor';
import yaml from 'js-yaml';

const LabModal = ({ lab, isOpen, onClose, onLaunch }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [labData, setLabData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [topologyExpanded, setTopologyExpanded] = useState(true); // Default to zoomed

  useEffect(() => {
    if (isOpen && lab) {
      loadYamlContent();
    }
  }, [isOpen, lab]);

  const loadYamlContent = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/labs/${lab.category}/${lab.slug}/${lab.slug}.yml`);
      if (response.ok) {
        const text = await response.text();
        const data = yaml.load(text);
        setLabData(data);
      } else {
        setLabData(null);
      }
    } catch {
      setLabData(null);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !lab) return null;

  return (
    <div className="fixed inset-0 z-50 p-4 overflow-y-auto flex items-center justify-center bg-white/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[95vh] shadow-2xl overflow-hidden flex flex-col">

        {/* Topology Image */}
        <div className="relative bg-gray-100">
          <img
            src={`/labs/${lab.category}/${lab.slug}/topology.png`}
            alt={`${lab.title} Topology`}
            className={`w-full h-auto object-contain ${topologyExpanded ? 'max-h-[80vh]' : 'max-h-[400px]'} transition-all`}
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
          <div
            style={{ display: 'none' }}
            className="flex flex-col items-center justify-center bg-gray-100 p-12 border-2 border-dashed border-gray-300"
          >
            <ImageIcon className="w-16 h-16 text-gray-400 mb-4" />
            <p className="text-gray-500 text-lg">Topology diagram not available</p>
            <p className="text-gray-400 text-sm mt-2">
              /labs/{lab.category}/{lab.slug}/topology.png
            </p>
          </div>
          <button
            onClick={() => setTopologyExpanded(!topologyExpanded)}
            className="absolute top-2 right-2 bg-white bg-opacity-80 hover:bg-opacity-100 p-2 rounded-full shadow-md"
            aria-label="Expand Topology"
          >
            <ExternalLink className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={onClose}
            className="absolute top-2 left-2 p-2 bg-white bg-opacity-80 hover:bg-opacity-100 rounded-full shadow-md"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Main content */}
        <div className="overflow-y-auto p-6 flex-1">
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

          {/* Tabs */}
          <nav className="flex space-x-8 border-b border-gray-200 mb-6">
            {['overview', 'details'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-2 text-sm font-medium ${
                  activeTab === tab
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'overview' ? 'Overview' : 'Details'}
              </button>
            ))}
          </nav>

          {/* Tab content */}
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="prose max-w-none text-gray-700">
              {activeTab === 'overview' && (
                <div>
                  <h3>Overview</h3>
                  <p>{labData?.overview || 'No overview available.'}</p>
                  {labData?.objectives && (
                    <>
                      <h4>Objectives</h4>
                      <ul>
                        {labData.objectives.map((obj, i) => (
                          <li key={i}>{obj}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
              {activeTab === 'details' && (
                <div>
                  <h3>Prerequisites</h3>
                  {labData?.prerequisites ? (
                    <ul>
                      {labData.prerequisites.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No prerequisites listed.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t flex justify-between items-center">
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${getDifficultyColor(lab.difficulty)}`}>
            {lab.difficulty}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="flex items-center space-x-2 bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-lg font-medium transition-colors"
            >
              <X className="w-4 h-4" />
              <span>Back</span>
            </button>
            <button
              onClick={async () => {
                if (onLaunch) await onLaunch(lab);
                onClose();
              }}
              className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              <Play className="w-4 h-4" />
              <span>Launch Lab</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LabModal;
