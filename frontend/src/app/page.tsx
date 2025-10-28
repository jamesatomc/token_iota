"use client";

import { useState } from "react";
import { ConnectButton, useCurrentAccount } from "@iota/dapp-kit";
import SwapInterface from "./components/SwapInterface";
import LiquidityInterface from "./components/LiquidityInterface";
import CreatePool from "./components/CreatePool";
import PoolInfo from "./components/PoolInfo";
import WalletBalance from "./components/WalletBalance";
import MintKanari from "./components/MintKanari";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"swap" | "liquidity" | "pool" | "info" | "mint">("swap");
  const currentAccount = useCurrentAccount();

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-white to-purple-50 dark:from-zinc-900 dark:via-black dark:to-zinc-900 font-sans">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-linear-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-xl">K</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-zinc-900 dark:text-white">Kanari Network DEX</h1>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">Powered by IOTA</p>
              </div>
            </div>
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Navigation Tabs */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-white dark:bg-zinc-900 rounded-2xl p-2 shadow-lg border border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setActiveTab("swap")}
              className={`px-6 py-3 rounded-xl font-medium transition-all ${
                activeTab === "swap"
                  ? "bg-blue-500 text-white shadow-md"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              Swap
            </button>
            <button
              onClick={() => setActiveTab("liquidity")}
              className={`px-6 py-3 rounded-xl font-medium transition-all ${
                activeTab === "liquidity"
                  ? "bg-blue-500 text-white shadow-md"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              Liquidity
            </button>
            <button
              onClick={() => setActiveTab("mint")}
              className={`px-6 py-3 rounded-xl font-medium transition-all ${
                activeTab === "mint"
                  ? "bg-yellow-500 text-white shadow-md"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              Mint
            </button>
            <button
              onClick={() => setActiveTab("pool")}
              className={`px-6 py-3 rounded-xl font-medium transition-all ${
                activeTab === "pool"
                  ? "bg-blue-500 text-white shadow-md"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              Create Pool
            </button>
            <button
              onClick={() => setActiveTab("info")}
              className={`px-6 py-3 rounded-xl font-medium transition-all ${
                activeTab === "info"
                  ? "bg-blue-500 text-white shadow-md"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              Pool Info
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex justify-center gap-6">
          <div className="shrink-0">
            {activeTab === "swap" && <SwapInterface />}
            {activeTab === "liquidity" && <LiquidityInterface />}
            {activeTab === "mint" && <MintKanari />}
            {activeTab === "pool" && <CreatePool />}
            {activeTab === "info" && <PoolInfo />}
          </div>
          
          {/* Sidebar with wallet info */}
          {/* {currentAccount && (
            <div className="hidden lg:block w-80 shrink-0">
              <WalletBalance />
            </div>
          )} */}
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 max-w-5xl mx-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 shadow-lg border border-zinc-200 dark:border-zinc-800">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">Fast Swaps</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Trade tokens instantly with low fees and minimal slippage
            </p>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 shadow-lg border border-zinc-200 dark:border-zinc-800">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">Earn Fees</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Provide liquidity and earn trading fees from every swap
            </p>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 shadow-lg border border-zinc-200 dark:border-zinc-800">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">Secure & Audited</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Built on IOTA with comprehensive security measures
            </p>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 mt-20 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
          <p>Kanari Network DEX © 2025 | Built on IOTA</p>
        </div>
      </footer>
    </div>
  );
}
