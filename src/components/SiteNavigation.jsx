// src/components/SiteNavigation.jsx

import React, { useState, useEffect, useMemo } from "react";
import { Link, NavLink } from "react-router-dom";
import { Code, HardHat } from "lucide-react";
import SiteLogo from "./SiteLogo";

// An Icon Registry is a clean, scalable way to manage icons.
const iconRegistry = {
  python: (
    <Code
      size={16}
      className="text-slate-500 group-hover:text-blue-600 transition-colors"
    />
  ),
  docker: (
    <img
      src="https://www.docker.com/wp-content/uploads/2022/03/Moby-logo.png"
      alt="Docker"
      className="h-5 w-auto"
    />
  ),
};

const SiteNavigation = () => {
  const [menuItems, setMenuItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch navigation data from the backend
  useEffect(() => {
    const fetchMenu = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          "http://localhost:3001/api/navigation/menu",
        );
        if (!response.ok) throw new Error("Network response was not ok");
        const data = await response.json();
        if (data.success && Array.isArray(data.menu)) {
          setMenuItems(data.menu);
        } else {
          throw new Error(data.message || "Malformed navigation data");
        }
      } catch (err) {
        console.error("Error fetching navigation menu:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMenu();
  }, []);

  // Flatten the menu hierarchy to create a single list of links
  const flatNavLinks = useMemo(() => {
    return menuItems.flatMap((item) =>
      item.type === "dropdown" ? item.items : [item],
    );
  }, [menuItems]);

  // Helper to get the correct icon for a link
  const getIconForLink = (link) => {
    if (link.title.includes("Docker")) return iconRegistry.docker;
    if (link.title.includes("Python")) return iconRegistry.python;
    return null;
  };

  // --- Styling Constants ---
  const navClasses =
    "sticky top-0 w-full bg-white/95 backdrop-blur-sm border-b border-slate-200 z-30";
  const containerClasses = "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8";

  // --- ✨ THE LAYOUT CHANGE IS HERE ✨ ---
  const flexContainerClasses = "flex items-center h-16 space-x-8"; // Changed to space-x-8

  // --- Loading and Error States ---
  if (isLoading || error) {
    return (
      <nav className={navClasses}>
        <div className={containerClasses}>
          <div className="flex items-center justify-between h-16">
            {" "}
            {/* Keep this centered for loading/error */}
            <Link to="/" className="flex-shrink-0">
              <SiteLogo size={32} />
            </Link>
            <span
              className={`text-sm ${error ? "text-red-600" : "text-slate-500"}`}
            >
              {isLoading ? "Loading Navigation..." : `Error: ${error}`}
            </span>
          </div>
        </div>
      </nav>
    );
  }

  // --- Main Horizontal Navigation Component (Left-Aligned) ---
  return (
    <nav className={navClasses}>
      <div className={containerClasses}>
        <div className={flexContainerClasses}>
          {/* Logo - The first item in the flex container */}
          <div className="flex-shrink-0">
            <Link to="/">
              <SiteLogo size={32} />
            </Link>
          </div>

          {/* Horizontal Navigation Links - The second item, spaced by the parent */}
          <div className="flex items-center space-x-2">
            {flatNavLinks.map((link) => (
              <NavLink
                key={link.path}
                to={link.path}
                className={({ isActive }) =>
                  `group inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "text-blue-600 bg-blue-50"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`
                }
              >
                {getIconForLink(link)}
                <span>{link.title}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default SiteNavigation;
