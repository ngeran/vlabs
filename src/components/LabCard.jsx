import React from 'react';
import { Clock, BarChart3, Info } from 'lucide-react';
import getDifficultyColor from '../utils/getDifficultyColor';

const LabCard = ({ lab, onViewDetails, onStartLab }) => {
  return (
    <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 overflow-hidden group">
      <div className="relative">
        <img
          src={`/labs/${lab.category}/${lab.slug}/topology.png`}
          alt={`${lab.title} topology`}
          className="w-full h-48 object-cover bg-gray-100"
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
        <span
          className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(
            lab.difficulty
          )}`}
        >
          {lab.difficulty || 'N/A'}
        </span>
      </div>

      <div className="p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors duration-200">
          {lab.title}
        </h3>
        <p className="text-gray-600 text-sm mb-4 line-clamp-2">{lab.description}</p>
        <div className="flex items-center justify-between mb-4 text-sm text-gray-500">
          <div className="flex items-center">
            <Clock className="w-4 h-4 mr-1" />
            {lab.duration || 'N/A'}
          </div>
          <div className="flex items-center">
            <BarChart3 className="w-4 h-4 mr-1" />
            {lab.difficulty || 'N/A'}
          </div>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => onViewDetails(lab)}
            className="flex-1 flex items-center justify-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg"
          >
            <Info className="w-4 h-4" />
            <span>Details</span>
          </button>
          <button
            onClick={() => onStartLab(lab)}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg"
          >
            Start Lab
          </button>
        </div>
      </div>
    </div>
  );
};

export default LabCard;
