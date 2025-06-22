// src/components/Header.jsx
import React from 'react';
import SiteNavigation from './SiteNavigation'; // Import the new navigation component

const Header = () => {
  return (
    <header>
      {/* The SiteNavigation component now handles the entire top navigation bar
          including the logo on the left and menu on the right. */}
      <SiteNavigation />
    </header>
  );
};

export default Header;
