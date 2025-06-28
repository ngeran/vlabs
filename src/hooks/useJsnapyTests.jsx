import { useEffect, useState } from "react";

const API_BASE_URL = "http://localhost:3001";

export const useJsnapyTests = () => {
  const [jsnapyTests, setJsnapyTests] = useState([]);
  const [selectedTests, setSelectedTests] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchTests() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/api/jsnapy/tests`);
        const data = await res.json();
        if (data.success && Array.isArray(data.tests)) {
          setJsnapyTests(data.tests);
          const initialSelected = {};
          data.tests.forEach((t) => {
            initialSelected[t] = false;
          });
          setSelectedTests(initialSelected);
        } else {
          setError(data.message || "Failed to fetch JSNAPy tests");
        }
      } catch (err) {
        setError(err.message || "Error fetching JSNAPy tests");
      } finally {
        setLoading(false);
      }
    }
    fetchTests();
  }, []);

  const toggleTest = (testName) => {
    setSelectedTests((prev) => ({
      ...prev,
      [testName]: !prev[testName],
    }));
  };

  const selectAll = () => {
    const allSelected = {};
    jsnapyTests.forEach((t) => (allSelected[t] = true));
    setSelectedTests(allSelected);
  };

  const clearAll = () => {
    const noneSelected = {};
    jsnapyTests.forEach((t) => (noneSelected[t] = false));
    setSelectedTests(noneSelected);
  };

  const getSelectedTestsCSV = () => {
    return Object.entries(selectedTests)
      .filter(([_, checked]) => checked)
      .map(([test]) => test)
      .join(",");
  };

  return {
    jsnapyTests,
    selectedTests,
    loading,
    error,
    toggleTest,
    selectAll,
    clearAll,
    getSelectedTestsCSV,
  };
};
