// ==============================================================================
// FILE: utils/fileUtils.js (Refactored for Directory Scanning)
// ==============================================================================
// Overview:
// This module provides utility functions for file operations related to templates.
// It is specifically designed to discover templates by scanning a categorized
// directory structure (templates/<category>/<file>.yml), making the system
// flexible and removing the need for a single monolithic configuration file.
//
// Key Features:
// - Discovers templates by scanning the filesystem for .yml files within category subdirectories.
// - Retrieves content and metadata for a specific template, including its Jinja2 content.
// - Caches template configurations in memory to improve performance and reduce disk I/O.
//
// Dependencies:
// - fs.promises: Modern, promise-based Node.js module for file system operations.
// - path: Node.js module for path manipulation.
// - js-yaml: Library for parsing YAML configuration files.
// - ../config/paths: Path constants pointing to the root templates directory.

// ==============================================================================
// SECTION 1: IMPORTS
// ==============================================================================
const fs = require("fs").promises; // Use the promise-based version of fs
const path = require("path");
const yaml = require("js-yaml");
const { TEMPLATES_DIRECTORY_PATH } = require("../config/paths"); // Ensure this points to the root 'templates' directory

/**
 * Caches the template configuration to avoid repeated file system reads.
 * This simple in-memory cache is cleared on server restart.
 */
let templateCache = null;

// ==============================================================================
// SECTION 2: TEMPLATE DISCOVERY (REWRITTEN FOR DIRECTORY SCANNING)
// ==============================================================================
/**
 * Scans the template directory structure (templates/<category>/<file>.yml)
 * and builds a comprehensive, categorized list of all available templates.
 *
 * @param {string} [filterCategory=null] - Optional category to filter results.
 * @returns {Promise<Object>} A promise that resolves to an object where keys are categories
 *                            and values are arrays of template metadata objects.
 */
async function getTemplatesConfig(filterCategory = null) {
  // Return from cache if available and no filter is applied
  if (templateCache && !filterCategory) {
    console.log("[fileUtils] Returning all templates from cache.");
    return templateCache;
  }

  console.log(`[fileUtils] Scanning for templates in: ${TEMPLATES_DIRECTORY_PATH}`);
  const categorizedTemplates = {};

  try {
    // 1. Read the top-level directory to find category folders (e.g., 'interfaces', 'protocols')
    const categoryDirs = await fs.readdir(TEMPLATES_DIRECTORY_PATH, { withFileTypes: true });

    for (const categoryDir of categoryDirs) {
      if (!categoryDir.isDirectory()) continue; // Skip files, only process directories

      const categoryName = categoryDir.name;
      const categoryPath = path.join(TEMPLATES_DIRECTORY_PATH, categoryName);

      // Initialize array for the category
      if (!categorizedTemplates[categoryName]) {
        categorizedTemplates[categoryName] = [];
      }

      // 2. Read all files within the category folder
      const filesInDir = await fs.readdir(categoryPath);
      const ymlFiles = filesInDir.filter(file => file.endsWith(".yml"));

      for (const ymlFile of ymlFiles) {
        try {
          // 3. Read and parse the YAML file content
          const ymlPath = path.join(categoryPath, ymlFile);
          const fileContent = await fs.readFile(ymlPath, "utf-8");
          const parsedYaml = yaml.load(fileContent);

          // The YAML structure contains a 'templates' array
          if (!parsedYaml || !Array.isArray(parsedYaml.templates)) continue;

          for (const template of parsedYaml.templates) {
            const templateFilePath = path.join(categoryPath, template.template_file);

            // 4. Enrich the template object with data derived from its location
            const enrichedTemplate = {
              ...template, // All properties from YAML (id, name, description, parameters)
              category: categoryName, // Set category from the folder name
              path: templateFilePath, // Store the full path to the .j2 file for later use
            };

            categorizedTemplates[categoryName].push(enrichedTemplate);
            console.log(`[fileUtils] Discovered template: '${template.id}' in category '${categoryName}'`);
          }
        } catch (parseError) {
            console.error(`[fileUtils] ERROR: Could not parse or process YAML file: ${ymlFile} in ${categoryName}. Skipping.`, parseError);
        }
      }
    }

    // Cache the full result if no filter was applied
    if (!filterCategory) {
        templateCache = categorizedTemplates;
    }

    // If a filter was applied, return only the filtered data
    if (filterCategory) {
        return { [filterCategory]: categorizedTemplates[filterCategory] || [] };
    }

    return categorizedTemplates;

  } catch (error) {
    console.error("[fileUtils] CRITICAL: Failed to scan templates directory.", error);
    templateCache = null; // Invalidate cache on error
    throw new Error("Could not discover templates. Check server logs for details.");
  }
}

// ==============================================================================
// SECTION 3: TEMPLATE CONTENT (REWRITTEN TO USE CACHE/SCANNER)
// ==============================================================================
/**
 * Retrieves the full details for a single template, including its Jinja2 content.
 *
 * @param {string} templateId - The unique ID of the template to find (e.g., "interface_config").
 * @returns {Promise<Object|null>} A promise resolving to the full template object or null if not found.
 */
async function getTemplateContent(templateId) {
  try {
    // 1. Get all templates using the main discovery function to ensure cache is populated
    const allTemplatesByCategory = await getTemplatesConfig();
    const allTemplates = Object.values(allTemplatesByCategory).flat();

    // 2. Find the specific template by its ID in the discovered list
    const templateInfo = allTemplates.find(t => t.id === templateId);

    if (!templateInfo) {
      console.warn(`[fileUtils] getTemplateContent: Template ID '${templateId}' not found after scanning.`);
      return null;
    }

    // 3. Read the content of the .j2 file using the path stored during discovery
    const content = await fs.readFile(templateInfo.path, "utf-8");

    // 4. Return the complete template object with its content
    return { ...templateInfo, content };

  } catch (error) {
    console.error(`[fileUtils] CRITICAL: Error in getTemplateContent for ID '${templateId}':`, error);
    throw error;
  }
}

// ==============================================================================
// SECTION 4: DIRECTORY MANAGEMENT (Unchanged)
// ==============================================================================
// Ensure a directory exists, creating it if necessary
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') { // Ignore error if directory already exists
      console.error(`[fileUtils] Error creating directory ${dirPath}: ${error.message}`);
      throw error;
    }
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
