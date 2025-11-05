"use client";

import { useState } from "react";
import { ConnectButton } from "@iota/dapp-kit";
import Image from "next/image";
import SwapInterface from "./components/SwapInterface";
import LiquidityInterface from "./components/LiquidityInterface";
import CreatePool from "./components/CreatePool";
import PoolInfo from "./components/PoolInfo";
import DeepBookInterface from "./components/DeepBook/DeepBookInterface";


export default function Home() {
  const [activeTab, setActiveTab] = useState<"swap" | "liquidity" | "pool" | "info" | "deepbook">("swap");

  // typed tab keys to avoid `any`
  type TabKey = "swap" | "liquidity" | "pool" | "info" | "deepbook";
  const tabs: { key: TabKey; label: string }[] = [
    { key: "swap", label: "Swap" },
    { key: "liquidity", label: "Add" },
    { key: "deepbook", label: "DeepBook" },
    { key: "pool", label: "Create Pool" },
    { key: "info", label: "Pool Info" },
  ];

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      {/* Header (responsive: stacked on small screens, row on sm+) */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* left: logo + title */}
              <div className="flex items-center gap-3">
              <Image src="/kanari.svg" alt="Kanari logo" className="rounded-xl shrink-0" width={40} height={40} />
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900">Kanari Network DEX</h1>
                <p className="text-xs text-gray-600">Swap tokens, provide liquidity, or mint — fast and simple.</p>
              </div>
            </div>

            {/* right: pool TVL + connect (stack on very small screens) */}
            <div className="flex items-center gap-3 ml-auto sm:ml-0">
              <div className="hidden sm:flex items-center text-sm text-gray-700 gap-3 mr-2">
                <div className="text-xs text-gray-500">Pool TVL</div>
                <div className="font-semibold">$0</div>
              </div>
              <div>
                <ConnectButton />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Navigation Tabs */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex bg-white rounded-2xl p-2 shadow-sm border border-gray-200 overflow-x-auto no-scrollbar">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`whitespace-nowrap px-4 py-2 sm:px-6 sm:py-3 rounded-xl font-medium transition-all mx-1 ${activeTab === t.key ? "bg-blue-600 text-white shadow" : "text-gray-600 hover:bg-gray-100"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex flex-col md:flex-row justify-center gap-6">
          <div className="w-full md:flex-1">
            {activeTab === "swap" && <SwapInterface />}
            {activeTab === "liquidity" && <LiquidityInterface />}
            {activeTab === "deepbook" && <DeepBookInterface />}
            {activeTab === "pool" && <CreatePool />}
            {activeTab === "info" && <PoolInfo />}
          </div>

          {/* Sidebar with wallet info (hidden on small screens) */}
          {/* {currentAccount && (
            <div className="hidden lg:block w-80 shrink-0">
              <WalletBalance />
            </div>
          )} */}
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 max-w-5xl mx-auto">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Fast Swaps</h3>
            <p className="text-sm text-gray-600">
              Trade tokens instantly with low fees and minimal slippage
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Earn Fees</h3>
            <p className="text-sm text-gray-600">
              Provide liquidity and earn trading fees from every swap
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Secure & Audited</h3>
            <p className="text-sm text-gray-600">
              Built on IOTA with comprehensive security measures
            </p>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-20 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-gray-600">
          <p>Kanari Network DEX © 2025 | Built on IOTA</p>
        </div>
      </footer>
    </div>
  );
}
