// ==============================================================================
// FILE: utils/fileUtils.js
// ==============================================================================
// Overview:
// This module provides utility functions for file operations related to templates,
// inventories, and directory management in the Vlabs backend. It handles reading
// and parsing template configurations, retrieving template content, and ensuring
// directories exist for file operations.
//
// Key Features:
// - Discovers templates from a configuration file or directory, optionally filtered by category.
// - Retrieves content and metadata for a specific template, including parameters.
// - Ensures directories exist for file operations (e.g., saving reports).
//
// Dependencies:
// - fs: Node.js module for file system operations.
// - path: Node.js module for path manipulation.
// - js-yaml: Library for parsing YAML configuration files.
// - ../config/paths: Path constants for template directories.
//
// How to Use:
// 1. Place this file in /vlabs/backend/utils/.
// 2. Import in route files: `const { getTemplatesConfig, getTemplateContent, ensureDirectoryExists } = require('../utils/fileUtils');`.
// 3. Call `getTemplatesConfig(category)` to discover templates, optionally filtered.
// 4. Call `getTemplateContent(templateId)` to retrieve a specific template's details.
// 5. Call `ensureDirectoryExists(dirPath)` to create a directory if it doesn't exist.
// 6. Ensure template files, configuration (e.g., templates.yml), and output directories are in the correct paths.
// 7. Verify Docker volume mounts provide access to template and output directories.

// ==============================================================================
// SECTION 1: IMPORTS
// ==============================================================================
const fs = require("fs"); // File system operations
const path = require("path"); // Path manipulation
const yaml = require("js-yaml"); // YAML parsing
const { TEMPLATES_CONFIG_FILE_PATH_IN_CONTAINER, TEMPLATES_DIRECTORY_PATH } = require("../config/paths"); // Path constants

// Debug imports to confirm paths
console.log(`[FILEUTILS] Loading paths from: ${require.resolve("../config/paths")}`);

// ==============================================================================
// SECTION 2: TEMPLATE DISCOVERY
// ==============================================================================
// Discover templates, optionally filtered by category
async function getTemplatesConfig(category = null) {
  try {
    if (!fs.existsSync(TEMPLATES_CONFIG_FILE_PATH_IN_CONTAINER)) {
      console.error(`[FILEUTILS] Templates configuration not found: ${TEMPLATES_CONFIG_FILE_PATH_IN_CONTAINER}`);
      console.error(`[FILEUTILS] Directory contents:`, fs.readdirSync(path.dirname(TEMPLATES_CONFIG_FILE_PATH_IN_CONTAINER)));
      throw new Error("Templates configuration not found");
    }

    const config = yaml.load(fs.readFileSync(TEMPLATES_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"));
    if (!config || !config.templates) {
      console.error(`[FILEUTILS] Templates configuration malformed at: ${TEMPLATES_CONFIG_FILE_PATH_IN_CONTAINER}`);
      throw new Error("Templates configuration malformed");
    }

    // Support both array and object formats for backward compatibility
    const templates = Array.isArray(config.templates)
      ? config.templates
      : Object.entries(config.templates).map(([id, def]) => ({ id, ...def }));

    // Group templates by category
    const categorizedTemplates = {};
    templates.forEach((template) => {
      const templateCategory = template.category || "uncategorized";
      if (!categorizedTemplates[templateCategory]) {
        categorizedTemplates[templateCategory] = [];
      }
      if (!category || templateCategory === category) {
        categorizedTemplates[templateCategory].push({
          id: template.id,
          name: template.name || template.id,
          path: path.join(TEMPLATES_DIRECTORY_PATH, `${template.template_file || template.id}.j2`),
          description: template.description || "",
          parameters: template.parameters || [], // Include parameters for discovery
        });
      }
    });

    console.log(`[FILEUTILS] Discovered templates for categories: ${Object.keys(categorizedTemplates).join(", ")}`);
    return categorizedTemplates;
  } catch (error) {
    console.error(`[FILEUTILS] Error in getTemplatesConfig: ${error.message}`);
    throw error;
  }
}

// ==============================================================================
// SECTION 3: TEMPLATE CONTENT
// ==============================================================================
// Retrieve details and content for a specific template
async function getTemplateContent(templateId) {
  try {
    if (!fs.existsSync(TEMPLATES_CONFIG_FILE_PATH_IN_CONTAINER)) {
      console.error(`[FILEUTILS] Templates configuration not found: ${TEMPLATES_CONFIG_FILE_PATH_IN_CONTAINER}`);
      console.error(`[FILEUTILS] Directory contents:`, fs.readdirSync(path.dirname(TEMPLATES_CONFIG_FILE_PATH_IN_CONTAINER)));
      throw new Error("Templates configuration not found");
    }

    const config = yaml.load(fs.readFileSync(TEMPLATES_CONFIG_FILE_PATH_IN_CONTAINER, "utf8"));
    const templateDef = Array.isArray(config.templates)
      ? config.templates.find((t) => t.id === templateId)
      : config.templates[templateId];

    if (!templateDef) {
      console.error(`

[FILEUTILS] Template not found: ${templateId}`);
      return null;
    }

    const templateFile = templateDef.template_file || `${templateId}.j2`;
    const templatePath = path.join(TEMPLATES_DIRECTORY_PATH, templateFile);
    if (!fs.existsSync(templatePath)) {
      console.error(`[FILEUTILS] Template file not found: ${templatePath}`);
      throw new Error(`Template file not found: ${templateId}`);
    }

    const content = fs.readFileSync(templatePath, "utf8");
    return {
      id: templateDef.id,
      name: templateDef.name || templateDef.id,
      category: templateDef.category || "uncategorized",
      description: templateDef.description || "",
      path: templatePath,
      content,
      parameters: templateDef.parameters || [], // Include parameters
    };
  } catch (error) {
    console.error(`[FILEUTILS] Error in getTemplateContent: ${error.message}`);
    throw error;
  }
}

// ==============================================================================
// SECTION 4: DIRECTORY MANAGEMENT
// ==============================================================================
// Ensure a directory exists, creating it if necessary
function ensureDirectoryExists(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`[FILEUTILS] Created directory: ${dirPath}`);
    }
  } catch (error) {
    console.error(`[FILEUTILS] Error creating directory ${dirPath}: ${error.message}`);
    throw error;
  }
}

// ==============================================================================
// SECTION 5: EXPORTS
// ==============================================================================
module.exports = {
  getTemplatesConfig,
  getTemplateContent,
  ensureDirectoryExists,
};
