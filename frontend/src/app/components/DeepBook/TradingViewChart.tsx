"use client";

import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
} from "chart.js";
import "chartjs-adapter-date-fns" assert { type: "javascript" };

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale
);

interface TradingViewChartProps {
  bookId: string;
  baseSymbol: string;
  quoteSymbol: string;
  priceData?: Array<{
    time: number;
    price: number;
  }>;
}

export default function TradingViewChart({ baseSymbol, quoteSymbol, priceData = [] }: TradingViewChartProps) {
  // Sort and format data for Chart.js
  const sortedData = [...priceData].sort((a, b) => a.time - b.time);

  const chartData = {
    labels: sortedData.map((point) => new Date(point.time * 1000)),
    datasets: [
      {
        label: `${baseSymbol}/${quoteSymbol} Price`,
        data: sortedData.map((point) => point.price),
        borderColor: "rgb(41, 98, 255)",
        backgroundColor: "rgba(41, 98, 255, 0.1)",
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "top" as const,
      },
      tooltip: {
        mode: "index" as const,
        intersect: false,
        callbacks: {
          label: (tooltipItem: { parsed: { y: number | null } }) => {
            const value = tooltipItem.parsed.y;
            return value !== null ? `Price: ${value.toFixed(6)}` : '';
          },
        },
      },
    },
    scales: {
      x: {
        type: "time" as const,
        time: {
          unit: "minute" as const,
          displayFormats: {
            minute: "HH:mm",
            hour: "HH:mm",
          },
        },
        grid: {
          display: false,
        },
      },
      y: {
        beginAtZero: false,
        grid: {
          color: "#f0f0f0",
        },
        ticks: {
          callback: (value: string | number) => Number(value).toFixed(6),
        },
      },
    },
    interaction: {
      mode: "nearest" as const,
      axis: "x" as const,
      intersect: false,
    },
  };

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          {baseSymbol}/{quoteSymbol} Price Chart
        </h3>
        <div className="text-xs text-gray-500">
          {priceData.length > 0 ? `${priceData.length} data points` : "No data yet"}
        </div>
      </div>
      <div className="w-full rounded-xl border border-gray-200 bg-white p-4" style={{ height: "400px" }}>
        {priceData.length > 0 ? (
          <Line data={chartData} options={options} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-gray-500">
            Chart will display once trading activity begins
          </div>
        )}
      </div>
    </div>
  );
}
