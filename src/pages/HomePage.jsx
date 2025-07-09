// src/pages/HomePage.jsx
import React from "react";
import {
  Network,
  Code,
  Play,
  TrendingUp,
  Users,
  ArrowRight,
  Terminal,
  BookOpen,
  Zap,
  Shield,
  Wifi,
  Router,
  Lock,
  Globe,
  Settings,
  Database,
  Cloud,
  Cpu,
  Activity,
} from "lucide-react";
import labsData from "../data/labsData";

const HomePage = () => {
  // Calculate statistics
  const totalLabs = Object.values(labsData).reduce(
    (acc, labs) => acc + labs.length,
    0,
  );
  const categories = Object.keys(labsData).length;

  // Mock data for scripts and recent activity (you can replace with real data)
  const totalScripts = 15; // You can calculate this from your actual script data
  const activeUsers = 42; // Mock data

  // Calculate completion percentage (mock data - you can replace with real logic)
  const completedLabs = Math.floor(totalLabs * 0.65); // 65% completion rate
  const completionPercentage = Math.round((completedLabs / totalLabs) * 100);

  // Function to get appropriate icon for each category
  const getCategoryIcon = (category) => {
    const iconMap = {
      routing: Router,
      switching: Network,
      security: Shield,
      wireless: Wifi,
      protocols: Globe,
      vpn: Lock,
      firewall: Shield,
      configuration: Settings,
      troubleshooting: Activity,
      monitoring: Activity,
      scripting: Code,
      automation: Terminal,
      database: Database,
      cloud: Cloud,
      performance: Cpu,
      analysis: TrendingUp,
      basics: BookOpen,
      advanced: Zap,
    };

    // Default to Network icon if category not found
    return iconMap[category.toLowerCase()] || Network;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Vector Labs Dashboard
          </h1>
          <p className="text-gray-600">
            Welcome back! Here's what's happening with your networking labs.
          </p>
        </div>

        {/* Stats Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Labs Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Labs</p>
                <p className="text-3xl font-bold text-gray-900">{totalLabs}</p>
                <p className="text-sm text-green-600 flex items-center mt-1">
                  <TrendingUp className="w-4 h-4 mr-1" />
                  +2 this week
                </p>
              </div>
              <div className="bg-blue-100 p-3 rounded-full">
                <Network className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          {/* Completed Labs Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Completed</p>
                <p className="text-3xl font-bold text-gray-900">
                  {completedLabs}
                </p>
                <p className="text-sm text-green-600 flex items-center mt-1">
                  <TrendingUp className="w-4 h-4 mr-1" />
                  {completionPercentage}% complete
                </p>
              </div>
              <div className="bg-green-100 p-3 rounded-full">
                <BookOpen className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          {/* Scripts Available Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Scripts</p>
                <p className="text-3xl font-bold text-gray-900">
                  {totalScripts}
                </p>
                <p className="text-sm text-blue-600 flex items-center mt-1">
                  <Terminal className="w-4 h-4 mr-1" />
                  Python & Bash
                </p>
              </div>
              <div className="bg-yellow-100 p-3 rounded-full">
                <Code className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>

          {/* Active Users Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Active Users
                </p>
                <p className="text-3xl font-bold text-gray-900">
                  {activeUsers}
                </p>
                <p className="text-sm text-purple-600 flex items-center mt-1">
                  <Users className="w-4 h-4 mr-1" />
                  Online now
                </p>
              </div>
              <div className="bg-purple-100 p-3 rounded-full">
                <Users className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Welcome Card */}
          <div className="lg:col-span-2">
            <div className="bg-zinc-800 rounded-lg shadow-sm p-8 text-white h-full flex items-center">
              <div className="flex items-center justify-between w-full">
                <div>
                  <h2 className="text-2xl font-bold mb-2">
                    Welcome to Vecror Hub
                  </h2>
                  <p className="text-blue-100 mb-6 text-lg">
                    Your hands-on platform for Advanced Networking Labs. Explore
                    complex network configurations, troubleshoot scenarios, and
                    run powerful automation scripts.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <a
                      href="/labs-dashboard"
                      className="bg-white text-blue-600 px-6 py-3 rounded-lg font-semibold hover:bg-zinc-400 transition-colors flex items-center"
                    >
                      Browse Labs
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </a>
                    <a
                      href="/python-runner"
                      className="bg-orange-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-700 transition-colors flex items-center"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Run Scripts
                    </a>
                  </div>
                </div>
                <div className="hidden lg:block">
                  <div className=" bg-opacity-20 p-4 rounded-full">
                    <svg
                      width="80"
                      height="80"
                      viewBox="0 0 19 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="text-white"
                    >
                      <path
                        d="M6.20742 9.02441H0.12651C0.0566404 9.02441 0 9.08105 0 9.15092V9.85095C0 9.92081 0.0566404 9.97745 0.12651 9.97745H6.20742C6.27728 9.97745 6.33392 9.92081 6.33392 9.85095V9.15092C6.33392 9.08105 6.27728 9.02441 6.20742 9.02441Z"
                        fill="currentColor"
                      ></path>
                      <path
                        d="M18.8754 9.02441H12.7945C12.7246 9.02441 12.668 9.08105 12.668 9.15092V9.85095C12.668 9.92081 12.7246 9.97745 12.7945 9.97745H18.8754C18.9453 9.97745 19.0019 9.92081 19.0019 9.85095V9.15092C19.0019 9.08105 18.9453 9.02441 18.8754 9.02441Z"
                        fill="currentColor"
                      ></path>
                      <path
                        d="M9.02441 0.12657V6.20747C9.02441 6.27734 9.08105 6.33398 9.15092 6.33398H9.85094C9.92081 6.33398 9.97745 6.27734 9.97745 6.20747V0.12657C9.97745 0.0567002 9.92081 5.96046e-05 9.85094 5.96046e-05H9.15092C9.08105 5.96046e-05 9.02441 0.0567002 9.02441 0.12657Z"
                        fill="currentColor"
                      ></path>
                      <path
                        d="M9.0332 12.8028V18.8837C9.0332 18.9536 9.08984 19.0103 9.15971 19.0103H9.85974C9.9296 19.0103 9.98624 18.9536 9.98624 18.8837V12.8028C9.98624 12.733 9.9296 12.6763 9.85974 12.6763H9.15971C9.08984 12.6763 9.0332 12.733 9.0332 12.8028Z"
                        fill="currentColor"
                      ></path>
                      <path
                        d="M8.0754 7.40936C8.07773 7.40703 8.07772 7.40325 8.07539 7.40093L3.17103 2.50499C3.12043 2.45439 3.04452 2.45439 2.99392 2.50499L2.50475 2.99417C2.45415 3.04477 2.45415 3.12068 2.50475 3.17128L7.90425 8.57078C7.98157 8.6481 8.07962 8.72957 8.07962 8.83892V10.1715C8.07962 10.2305 8.05431 10.2811 8.02058 10.3233L2.50475 15.8391C2.45415 15.8897 2.45415 15.9656 2.50475 16.0162L2.99392 16.5054C3.04452 16.556 3.12043 16.556 3.17103 16.5054L8.07118 11.6053L8.3495 11.3269C8.77964 10.8968 9.02422 10.3149 9.02422 9.70762V9.31122C9.02422 8.70397 8.77964 8.12203 8.3495 7.6919L8.0754 7.41779C8.07307 7.41546 8.07307 7.41169 8.0754 7.40936Z"
                        fill="currentColor"
                      ></path>
                      <path
                        d="M10.99 8.68324C10.99 8.68467 10.9917 8.68538 10.9927 8.68437L16.5058 3.17128C16.5564 3.12067 16.5564 3.04477 16.5058 2.99417L16.0166 2.50499C15.966 2.45439 15.8901 2.45439 15.8395 2.50499L10.9394 7.40514L10.661 7.68346C10.2309 8.1136 9.98633 8.69554 9.98633 9.30279V9.69918C9.98633 10.3064 10.2309 10.8884 10.661 11.3185L10.9394 11.5968L15.8395 16.497C15.8901 16.5476 15.966 16.5476 16.0166 16.497L16.5058 16.0078C16.5564 15.9572 16.5564 15.8813 16.5058 15.8307L11.1063 10.4312C11.029 10.3539 10.9309 10.2724 10.9309 10.1631V8.83048C10.9309 8.77311 10.9548 8.7237 10.9871 8.68226C10.9881 8.68106 10.99 8.68172 10.99 8.68324Z"
                        fill="currentColor"
                      ></path>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Quick Actions
            </h3>
            <div className="space-y-4">
              <a
                href="/labs-dashboard"
                className="flex items-center p-3 rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <div className="bg-blue-100 p-2 rounded-lg mr-3 group-hover:bg-blue-200">
                  <Network className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Browse All Labs</p>
                  <p className="text-sm text-gray-500">
                    {totalLabs} labs available
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 ml-auto" />
              </a>

              <a
                href="/python-runner"
                className="flex items-center p-3 rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <div className="bg-yellow-100 p-2 rounded-lg mr-3 group-hover:bg-yellow-200">
                  <Terminal className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Python Runner</p>
                  <p className="text-sm text-gray-500">Execute scripts</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 ml-auto" />
              </a>

              <div className="flex items-center p-3 rounded-lg hover:bg-gray-50 transition-colors group cursor-pointer">
                <div className="bg-green-100 p-2 rounded-lg mr-3 group-hover:bg-green-200">
                  <Zap className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Quick Start</p>
                  <p className="text-sm text-gray-500">Get started guide</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 ml-auto" />
              </div>
            </div>
          </div>
        </div>

        {/* Lab Categories Overview - Horizontal Layout */}
        <div className="mt-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Lab Categories
            </h3>
            <div className="flex gap-4 pb-2">
              {Object.entries(labsData).map(([category, labs]) => {
                const IconComponent = getCategoryIcon(category);
                return (
                  <div
                    key={category}
                    className="flex-1 border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900 capitalize text-sm">
                          {category.replace("-", " ")}
                        </h4>
                        <p className="text-xs text-gray-500">
                          {labs.length} labs
                        </p>
                      </div>
                      <div className="bg-gray-100 p-2 rounded-lg ml-2">
                        <IconComponent className="w-4 h-4 text-gray-600" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
