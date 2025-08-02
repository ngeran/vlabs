// ====================================================================================
// FILE:               /vite.config.js
//
// OVERVIEW:
//   This is the configuration file for Vite, the frontend build tool. It defines
//   how the development server runs, which plugins to use, and how to resolve
//   module import paths.
//
// KEY FEATURES:
//   - React Plugin: Enables Vite to understand and compile JSX and use React's
//     Fast Refresh for a better development experience.
//   - Tailwind CSS Plugin: Integrates Tailwind CSS directly into the Vite build
//     process (specific to Tailwind CSS v4).
//   - Server Configuration: Configures the development server to be accessible
//     on the local network (`host: '0.0.0.0'`).
//   - Path Alias: Critically, it configures the '@/' import alias to point to
//     the 'src' directory, allowing for cleaner and more maintainable import paths.
//
// ====================================================================================

// SECTION 1: IMPORTS
// -------------------------------------------------------------------------------------------------
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// Import the built-in 'path' module from Node.js to handle file paths.
import path from 'path'


// SECTION 2: VITE CONFIGURATION EXPORT
// -------------------------------------------------------------------------------------------------
export default defineConfig({
  // --- Plugins ---
  // An array of plugins used by Vite.
  plugins: [
    react(),
    tailwindcss()
  ],

  // --- Development Server Options ---
  // Configures how the `npm run dev` server behaves.
  server: {
    // '0.0.0.0' makes the server accessible from other devices on your network.
    host: '0.0.0.0',
    port: 5173
  }, // <-- CORRECTED: Added the missing comma.

  // --- Module Resolution ---
  // Defines how Vite should handle import statements.
  resolve: {
    alias: {
      // Maps the "@" alias to the absolute path of the "src" directory.
      // This is essential for the Shadcn/ui components to work correctly.
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
