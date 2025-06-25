// src/components/ScriptStatisticsChart.jsx
import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Label } from "recharts";

/**
 * @description A presentational component for displaying script statistics as a pie chart.
 * It shows the distribution of scripts by category and the total number of scripts.
 * @param {object} props - The component props.
 * @param {Array<object>} props.data - An array of objects, each with 'name' (category) and 'value' (count).
 * @param {number} props.totalScripts - The total number of scripts.
 */
function ScriptStatisticsChart({ data, totalScripts }) {
  // Define colors for the pie chart. These can be customized.
  const COLORS = [
    "#6BBD45",
    "#8BC34A",
    "#A1D36F",
    "#B3E594",
    "#C5F7B9",
    "#D9FAE7",
    "#A0DEB7",
    "#76C6A0",
  ];

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 flex flex-col items-center justify-center text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Script Statistics
        </h2>
        <p className="text-gray-600">No scripts to display statistics.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 flex flex-col items-center justify-center text-center">
      <h2 className="text-xl font-bold text-gray-900 mb-4">
        Script Statistics
      </h2>
      <>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              fill="#8884d8"
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
              <Label
                value={totalScripts}
                position="center"
                fill="#000"
                className="font-bold text-3xl"
              />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-4 w-full text-left">
          {data.map((entry, index) => (
            <div
              key={entry.name}
              className="flex items-center justify-between text-gray-700 text-sm mb-1"
            >
              <div className="flex items-center">
                <span
                  className="inline-block w-3 h-3 rounded-full mr-2"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                ></span>
                {entry.name}
              </div>
              <span className="inline-block border border-gray-400 rounded px-2 py-0.5 text-xs font-semibold">
                {entry.value}
              </span>
            </div>
          ))}
        </div>
      </>
    </div>
  );
}

export default ScriptStatisticsChart;
