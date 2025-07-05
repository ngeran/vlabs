// src/components/SiteNavigation.jsx

import React, { useState, useEffect, useMemo } from "react";
import { Link, NavLink } from "react-router-dom";
import { Code } from "lucide-react"; // <-- 3. REMOVED HardHat from this import
import SiteLogo from "./icons/SiteLogo";
import LabIcon from "./icons/LabIcon";
import CodeIcon from "./icons/CodeIcon";

// An Icon Registry is a clean, scalable way to manage icons.
const iconRegistry = {
  python: (
    <CodeIcon className="h-5 w-5 text-slate-500 group-hover:text-blue-600 transition-colors" />
  ),
  docker: (
    <LabIcon className="h-5 w-5 text-slate-500 group-hover:text-blue-600 transition-colors" />
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
    // This logic remains flexible. If your YAML specified a key, we'd use that.
    // For now, we infer based on title.
    if (link.title.includes("Docker") || link.title.includes("Labs"))
      return iconRegistry.docker;
    if (link.title.includes("Runner")) return iconRegistry.python;
    return null;
  };

  // --- Styling Constants ---
  const navClasses =
    "sticky top-0 w-full bg-white/95 backdrop-blur-sm border-b border-slate-200 z-30";
  const containerClasses = "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8";
  const flexContainerClasses = "flex items-center h-16 space-x-8";

  // --- Loading and Error States ---
  if (isLoading || error) {
    return (
      <nav className={navClasses}>
        <div className={containerClasses}>
          <div className="flex items-center justify-between h-16">
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
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link to="/">
              <SiteLogo size={32} />
            </Link>
          </div>

          {/* Horizontal Navigation Links */}
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
