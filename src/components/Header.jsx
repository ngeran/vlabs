import React from 'react';
import { Network } from 'lucide-react';
import labsData from '../data/labsData';

const Header = () => {
  const totalLabs = Object.values(labsData).reduce((acc, labs) => acc + labs.length, 0);

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="bg-blue-600 p-2 rounded-lg mr-4">
              <Network className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Advanced Networking Labs</h1>
              <p className="text-gray-600">Hands-on network configuration and troubleshooting</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center space-x-4">
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">{totalLabs}</div>
              <div className="text-sm text-gray-500">Total Labs</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
