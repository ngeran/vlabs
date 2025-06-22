// src/components/SiteNavigation.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ChevronDown, Code, HardHat } from 'lucide-react';
import SiteLogo from './SiteLogo'; // Adjusted import: now importing SiteLogo.jsx

const SiteNavigation = () => {
  const [menuItems, setMenuItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Fetch navigation menu from backend
  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/navigation/menu');
        if (!response.ok) {
          throw new Error('Failed to fetch navigation menu.');
        }
        const data = await response.json();
        if (data.success && Array.isArray(data.menu)) {
          setMenuItems(data.menu);
        } else {
          setError(data.message || 'Malformed navigation data received.');
        }
      } catch (err) {
        console.error("Error fetching navigation menu:", err);
        setError(`Failed to load navigation: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMenu();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Helper to get icon based on title (can be expanded)
  const getIcon = (title) => {
    switch (title) {
      case 'Labs': return <HardHat size={18} />;
      // Docker logo size adjusted for better proportion with the larger SiteLogo
      case 'Docker Labs Dashboard': return <img src="https://www.docker.com/wp-content/uploads/2022/03/Moby-logo.png" alt="Docker" className="h-6 w-auto inline-block mr-1" />;
      case 'Python Script Runner': return <Code size={18} />;
      default: return null;
    }
  };

  // Base navigation styling, blending with page background
  const baseNavClasses = "w-full py-3 bg-[#E9E9E9]";
  const contentContainerClasses = "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center space-x-6";

  // Define your SiteLogo component usage with desired size
  const siteLogoComponent = <SiteLogo size={32} className="h-8 w-auto" />;

  if (isLoading) {
    return (
      <nav className={baseNavClasses}>
        <div className={contentContainerClasses}>
          {siteLogoComponent} {/* Using the SiteLogo component */}
          <span className="text-sm text-gray-500">Loading Navigation...</span>
        </div>
      </nav>
    );
  }

  if (error) {
    return (
      <nav className="w-full py-3 bg-red-100 text-red-700">
        <div className={contentContainerClasses}>
          {siteLogoComponent} {/* Using the SiteLogo component */}
          <span className="text-sm">Error loading navigation: {error}</span>
        </div>
      </nav>
    );
  }

  return (
    <nav className={baseNavClasses}>
      <div className={contentContainerClasses}>
        {/* Logo on the left side of the centered content area */}
        <Link to="/" className="flex items-center font-bold text-gray-900 hover:text-blue-600 transition-colors duration-200">
          {siteLogoComponent} {/* Using the SiteLogo component here */}
        </Link>

        {/* Navigation items */}
        <ul className="flex items-center">
          {menuItems.map((item) => (
            <li key={item.title} className="relative group">
              {item.type === 'link' && (
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                      isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
                    } transition-colors duration-200`
                  }
                >
                  {getIcon(item.title)}
                  <span className="ml-2">{item.title}</span>
                </NavLink>
              )}
              {item.type === 'dropdown' && (
                <div ref={dropdownRef}>
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-200 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 focus:ring-blue-500 transition-colors duration-200"
                  >
                    {getIcon(item.title)}
                    <span className="ml-2">{item.title}</span>
                    <ChevronDown className={`ml-2 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} size={16} />
                  </button>
                  {isDropdownOpen && (
                    <div className="absolute left-0 mt-2 w-60 rounded-md shadow-lg bg-gray-100 ring-1 ring-black ring-opacity-5 z-50">
                      <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                        {item.items.map((subItem) => (
                          <Link
                            key={subItem.path}
                            to={subItem.path}
                            onClick={() => setIsDropdownOpen(false)}
                            className="block px-4 py-2 text-sm text-gray-800 hover:bg-gray-200 hover:text-gray-900"
                            role="menuitem"
                          >
                            <div className="flex items-center">
                              {getIcon(subItem.title)}
                              <span className="ml-2">{subItem.title}</span>
                            </div>
                            {subItem.description && (
                              <p className="text-xs text-gray-500 mt-0.5">{subItem.description}</p>
                            )}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
};

export default SiteNavigation;
