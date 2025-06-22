// src/pages/HomePage.jsx
import React from 'react';
import { Network } from 'lucide-react';
import labsData from '../data/labsData'; // Still needed here to calculate totalLabs

const HomePage = () => {
  // Calculate total labs - moved from old Header.jsx
  const totalLabs = Object.values(labsData).reduce((acc, labs) => acc + labs.length, 0);

  return (
    <div className="bg-white shadow-sm border-b border-gray-200 py-12 sm:py-16 lg:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Hero Section Content */}
        <div className="flex flex-col items-center justify-center mb-8">
          <div className="bg-blue-600 p-3 rounded-xl mb-4">
            <Network className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-4 leading-tight">
            Welcome to vLabs
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            Your hands-on platform for **Advanced Networking Labs**.
            Explore complex network configurations, troubleshoot scenarios,
            and run powerful automation scripts.
          </p>
        </div>

        {/* Total Labs Stat (moved from old Header.jsx) */}
        <div className="flex items-center justify-center space-x-6">
          <div className="text-center">
            <div className="text-4xl font-bold text-blue-600">{totalLabs}</div>
            <div className="text-md text-gray-500">Total Labs Available</div>
          </div>
        </div>

        {/* You can add more content here, like calls to action */}
        <div className="mt-10">
            <p className="text-gray-700 text-lg">
                Ready to dive in? Navigate to the <a href="/labs-dashboard" className="text-blue-600 hover:underline font-semibold">Labs Dashboard</a> or try out the <a href="/python-runner" className="text-blue-600 hover:underline font-semibold">Python Script Runner</a>.
            </p>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
