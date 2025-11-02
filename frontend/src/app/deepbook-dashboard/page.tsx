"use client";

import { useState } from "react";
import { DEFAULT_TOKENS } from "../lib/contracts";
import OrderBookStats from "../components/DeepBook/OrderBookStats";
import OrderDetails from "../components/DeepBook/OrderDetails";
import OrderBookView from "../components/DeepBook/OrderBookView";
import Card from "../components/UI/Card";
import TokenSelector from "../components/UI/TokenSelector";

export default function DeepBookDashboard() {
    // Example: KANARI/IOTA order book
    const [bookId, setBookId] = useState("");
    const [baseToken, setBaseToken] = useState("");
    const [quoteToken, setQuoteToken] = useState("");
    const [baseDecimals, setBaseDecimals] = useState(9);
    const [quoteDecimals, setQuoteDecimals] = useState(9);
    const [showBaseSelector, setShowBaseSelector] = useState(false);
    const [showQuoteSelector, setShowQuoteSelector] = useState(false);
    const [activeTab, setActiveTab] = useState<"stats" | "details" | "orders">("stats");

    return (
        <div className="min-h-screen bg-linear-to-br from-blue-50 via-white to-purple-50 p-4 md:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">
                        📊 DeepBook Dashboard
                    </h1>
                    <p className="text-gray-600 text-lg">
                        Advanced Order Book Analytics & Management
                    </p>
                </div>

                {/* Order Book ID Input */}
                <Card>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                📖 Order Book ID
                            </label>
                            <input
                                type="text"
                                value={bookId}
                                onChange={(e) => setBookId(e.target.value)}
                                placeholder="Enter order book object ID (e.g., 0x123...)"
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Enter the order book ID to view detailed statistics and orders
                            </p>
                        </div>
                        {/* Base/Quote selector buttons */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Base Token</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setShowBaseSelector(true)}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-left bg-white hover:bg-gray-50"
                                    >
                                        {baseToken ? baseToken.split("::").pop() : "Select base token"}
                                    </button>
                                    {baseToken && (
                                        <button
                                            onClick={() => { setBaseToken(""); setBaseDecimals(9); }}
                                            className="px-3 py-2 rounded-lg bg-red-50 text-red-600 border border-red-100"
                                            title="Clear base token"
                                        >
                                            ✖
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Quote Token</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setShowQuoteSelector(true)}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-left bg-white hover:bg-gray-50"
                                    >
                                        {quoteToken ? quoteToken.split("::").pop() : "Select quote token"}
                                    </button>
                                    {quoteToken && (
                                        <button
                                            onClick={() => { setQuoteToken(""); setQuoteDecimals(9); }}
                                            className="px-3 py-2 rounded-lg bg-red-50 text-red-600 border border-red-100"
                                            title="Clear quote token"
                                        >
                                            ✖
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Tab Navigation */}
                {bookId && (
                    <>
                        <div className="flex gap-2 overflow-x-auto">
                            <button
                                onClick={() => setActiveTab("stats")}
                                className={`px-6 py-3 rounded-lg font-semibold whitespace-nowrap transition-colors ${activeTab === "stats"
                                        ? "bg-blue-600 text-white"
                                        : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
                                    }`}
                            >
                                📊 Statistics
                            </button>
                            <button
                                onClick={() => setActiveTab("details")}
                                className={`px-6 py-3 rounded-lg font-semibold whitespace-nowrap transition-colors ${activeTab === "details"
                                        ? "bg-blue-600 text-white"
                                        : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
                                    }`}
                            >
                                🔍 Order Details
                            </button>
                            <button
                                onClick={() => setActiveTab("orders")}
                                className={`px-6 py-3 rounded-lg font-semibold whitespace-nowrap transition-colors ${activeTab === "orders"
                                        ? "bg-blue-600 text-white"
                                        : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
                                    }`}
                            >
                                📋 Order Book View
                            </button>
                        </div>

                        {/* Content */}
                        <div className="animate-fadeIn">
                            {activeTab === "stats" && (
                                <OrderBookStats
                                    bookId={bookId}
                                    baseToken={baseToken}
                                    quoteToken={quoteToken}
                                    baseDecimals={baseDecimals}
                                    quoteDecimals={quoteDecimals}
                                />
                            )}

                            {activeTab === "details" && (
                                <OrderDetails
                                    bookId={bookId}
                                    baseToken={baseToken}
                                    quoteToken={quoteToken}
                                    baseDecimals={baseDecimals}
                                    quoteDecimals={quoteDecimals}
                                />
                            )}

                            {activeTab === "orders" && (
                                <OrderBookView
                                    bookId={bookId}
                                    baseToken={baseToken}
                                    quoteToken={quoteToken}
                                    baseDecimals={baseDecimals}
                                />
                            )}
                        </div>
                    </>
                )}

                {/* Empty State */}
                {!bookId && (
                    <Card>
                        <div className="text-center py-16">
                            <div className="text-6xl mb-4">📖</div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-2">
                                No Order Book Selected
                            </h3>
                            <p className="text-gray-600 mb-6">
                                Enter an order book ID above to view detailed analytics
                            </p>
                            <div className="space-y-2 text-sm text-gray-600">
                                <p>🔹 View real-time statistics and market depth</p>
                                <p>🔹 Analyze order details and liquidity distribution</p>
                                <p>🔹 Monitor best bid/ask prices and spreads</p>
                                <p>🔹 Track fee balances and locked funds</p>
                            </div>
                        </div>
                    </Card>
                )}

                {/* Features Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                    <Card>
                        <div className="text-center">
                            <div className="text-4xl mb-3">📊</div>
                            <h3 className="font-bold text-gray-900 mb-2">Statistics</h3>
                            <p className="text-sm text-gray-600">
                                Real-time market statistics including best bid/ask, spread, and liquidity depth
                            </p>
                        </div>
                    </Card>

                    <Card>
                        <div className="text-center">
                            <div className="text-4xl mb-3">🔍</div>
                            <h3 className="font-bold text-gray-900 mb-2">Order Details</h3>
                            <p className="text-sm text-gray-600">
                                Detailed view of all orders with fill progress and locked amounts
                            </p>
                        </div>
                    </Card>

                    <Card>
                        <div className="text-center">
                            <div className="text-4xl mb-3">📋</div>
                            <h3 className="font-bold text-gray-900 mb-2">Order Book</h3>
                            <p className="text-sm text-gray-600">
                                Live order book with ability to cancel your orders and monitor fills
                            </p>
                        </div>
                    </Card>
                </div>

                {/* Footer */}
                <div className="text-center py-8 text-sm text-gray-500">
                    <p>💡 All data auto-refreshes every 10-15 seconds</p>
                    <p className="mt-1">Built with DeepBook view functions</p>
                </div>
            </div>
            {/* Token selectors (modals) */}
            <TokenSelector
                isOpen={showBaseSelector}
                onClose={() => setShowBaseSelector(false)}
                onSelect={(tokenType: string) => {
                    setBaseToken(tokenType);
                    const found = DEFAULT_TOKENS.find((t) => t.type === tokenType);
                    setBaseDecimals(found && typeof found.decimals === 'number' ? found.decimals : 9);
                    setShowBaseSelector(false);
                }}
            />

            <TokenSelector
                isOpen={showQuoteSelector}
                onClose={() => setShowQuoteSelector(false)}
                onSelect={(tokenType: string) => {
                    setQuoteToken(tokenType);
                    const found = DEFAULT_TOKENS.find((t) => t.type === tokenType);
                    setQuoteDecimals(found && typeof found.decimals === 'number' ? found.decimals : 9);
                    setShowQuoteSelector(false);
                }}
            />
        </div>
    );
}
