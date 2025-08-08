// src/hooks/useTemplateDiscovery.js
import { useState, useEffect, useCallback } from "react";

const API_BASE_URL = "http://localhost:3001";

// Hook: useTemplateDiscovery
export const useTemplateDiscovery = (templateSource) => {
  const [categorizedTemplates, setCategorizedTemplates] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const discoverTemplates = async () => {
      // Do not fetch if the source URL isn't provided
      if (!templateSource) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      console.log(`[useTemplateDiscovery] Fetching templates from ${templateSource}`);

      try {
        const response = await fetch(`${API_BASE_URL}${templateSource}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: null, environment: "development" }),
        });

        console.log(`[useTemplateDiscovery] Response status: ${response.status}`);
        const data = await response.json();
        console.log("[useTemplateDiscovery] Response data:", data);

        if (!response.ok) {
          throw new Error(data.message || `HTTP error! status: ${response.status}`);
        }

        if (data.success) {
          setCategorizedTemplates(data.discovered_templates || {});
        } else {
          throw new Error(data.message || "Template discovery failed.");
        }
      } catch (err) {
        console.error("[useTemplateDiscovery] Error:", err);
        setError(err.message);
        setCategorizedTemplates({});
      } finally {
        setLoading(false);
      }
    };

    discoverTemplates();
  }, [templateSource]); // Rerun effect if templateSource changes

  return { categorizedTemplates, loading, error };
};

// Hook: useTemplateGeneration
export const useTemplateGeneration = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateConfig = useCallback(async (templateId, parameters = {}) => {
    if (!templateId) {
      return { success: false, error: "Template ID is required." };
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/templates/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, parameters }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || `HTTP error! Status: ${response.status}` };
      }
      return data;
    } catch (err) {
      console.error("Configuration generation error:", err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, generateConfig };
};

// Hook: useTemplateDetail
export const useTemplateDetail = (templateId) => {
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTemplate = async () => {
      if (!templateId) {
        setTemplate(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/templates/${templateId}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || `HTTP error! status: ${response.status}`);
        }
        if (data.success) {
          setTemplate(data.template);
        } else {
          throw new Error(data.message || "Template fetch failed");
        }
      } catch (err) {
        console.error("Template detail error:", err);
        setError(err.message);
        setTemplate(null);
      } finally {
        setLoading(false);
      }
    };

    fetchTemplate();
  }, [templateId]);

  return { template, loading, error };
};
