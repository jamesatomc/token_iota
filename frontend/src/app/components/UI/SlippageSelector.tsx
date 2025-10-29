"use client";

import React from "react";

interface Props {
  slippage: string;
  setSlippage: (s: string) => void;
}

export default function SlippageSelector({ slippage, setSlippage }: Props) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-2 text-gray-700">Slippage Tolerance (%)</label>
      <div className="flex gap-2">
        {["0.1", "0.5", "1.0"].map((value) => (
          <button
            key={value}
            onClick={() => setSlippage(value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              slippage === value ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
            type="button"
          >
            {value}%
          </button>
        ))}

        <input
          type="number"
          value={slippage}
          onChange={(e) => setSlippage(e.target.value)}
          className="w-28 text-center px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm"
          placeholder="Custom"
        />
      </div>
    </div>
  );
}
