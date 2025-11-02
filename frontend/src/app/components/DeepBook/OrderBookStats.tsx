"use client";

import { useState, useEffect, useCallback } from "react";
import { useIotaClient } from "@iota/dapp-kit";
import { formatAmount } from "../../lib/contracts";
import Card from "../UI/Card";

interface OrderBookStatsProps {
  bookId: string;
  baseToken: string;
  quoteToken: string;
  baseDecimals?: number;
  quoteDecimals?: number;
}

interface BookStats {
  bestBid: number;
  bestAsk: number;
  spread: number;
  bidCount: number;
  askCount: number;
  maxDepth: number;
  bookDepth: {
    totalBidQuantity: number;
    totalAskQuantity: number;
  };
  feeBalances: {
    base: number;
    quote: number;
  };
  lockedBalances: {
    base: number;
    quote: number;
  };
}

export default function OrderBookStats({
  bookId,
  baseToken,
  quoteToken,
  baseDecimals = 9,
  quoteDecimals = 9,
}: OrderBookStatsProps) {
  const [stats, setStats] = useState<BookStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = useIotaClient();

  // Fetch statistics by reading order book object directly (no devInspect issues!)
  const fetchStats = useCallback(async () => {
    if (!bookId || !bookId.trim()) return;
    if (!baseToken || !quoteToken) {
      setError("Please select both base and quote tokens");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch the order book object directly
      const bookObject = await client.getObject({
        id: bookId,
        options: {
          showContent: true,
          showType: true,
        },
      });

      if (!bookObject.data || bookObject.data.content?.dataType !== "moveObject") {
        throw new Error("Invalid order book object");
      }

      type OrderEntry = {
        price?: string | number;
        quantity?: string | number;
        filled?: string | number;
      };

      type BookObjectFields = {
        bids?: OrderEntry[];
        asks?: OrderEntry[];
        max_depth?: string | number;
        base_balance?: string | number;
        quote_balance?: string | number;
        fee_balance_base?: string | number;
        fee_balance_quote?: string | number;
      } & Record<string, unknown>;

      const fields = bookObject.data.content.fields as BookObjectFields;
      
      // Extract data from object fields
      const bids = fields.bids || [];
      const asks = fields.asks || [];
  const maxDepth = parseInt(String(fields.max_depth || "0"), 10);
  const baseBalance = parseInt(String(fields.base_balance || "0"), 10);
  const quoteBalance = parseInt(String(fields.quote_balance || "0"), 10);
  const feeBalanceBase = parseInt(String(fields.fee_balance_base || "0"), 10);
  const feeBalanceQuote = parseInt(String(fields.fee_balance_quote || "0"), 10);
      
      // Calculate stats from bids/asks arrays
      const bidCount = Array.isArray(bids) ? bids.length : 0;
      const askCount = Array.isArray(asks) ? asks.length : 0;
      
      // Get best bid (first bid if any - bids are sorted highest first)
      let bestBid = 0;
      if (Array.isArray(bids) && bids.length > 0) {
        const firstBid = bids[0];
  bestBid = parseInt(String(firstBid?.price || "0"), 10);
      }
      
      // Get best ask (first ask if any - asks are sorted lowest first)
      let bestAsk = 0;
      if (Array.isArray(asks) && asks.length > 0) {
        const firstAsk = asks[0];
  bestAsk = parseInt(String(firstAsk?.price || "0"), 10);
      }
      
      // Calculate spread
      const spread = bestBid > 0 && bestAsk > 0 && bestAsk > bestBid ? bestAsk - bestBid : 0;
      
      // Calculate total bid/ask quantities (unfilled amounts)
      let totalBidQuantity = 0;
      if (Array.isArray(bids)) {
        for (const bid of bids) {
          const qty = parseInt(String(bid?.quantity || "0"), 10);
          const filled = parseInt(String(bid?.filled || "0"), 10);
          totalBidQuantity += Math.max(0, qty - filled);
        }
      }
      
      let totalAskQuantity = 0;
      if (Array.isArray(asks)) {
        for (const ask of asks) {
          const qty = parseInt(String(ask?.quantity || "0"), 10);
          const filled = parseInt(String(ask?.filled || "0"), 10);
          totalAskQuantity += Math.max(0, qty - filled);
        }
      }

      const parsed: BookStats = {
        bestBid,
        bestAsk,
        spread,
        bidCount,
        askCount,
        maxDepth,
        bookDepth: {
          totalBidQuantity,
          totalAskQuantity,
        },
        feeBalances: {
          base: feeBalanceBase,
          quote: feeBalanceQuote,
        },
        lockedBalances: {
          base: baseBalance,
          quote: quoteBalance,
        },
      };

      setStats(parsed);
    } catch (err: unknown) {
      console.error("Fetch stats error:", err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(String(err));
      }
    } finally {
      setLoading(false);
    }
  }, [bookId, baseToken, quoteToken, client]);

  // Auto-fetch with debounce to avoid hammering the API
  useEffect(() => {
    if (!bookId || !bookId.trim()) return;
    
    const timer = setTimeout(() => {
      fetchStats();
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [bookId, baseToken, quoteToken, fetchStats]);

  const renderAmount = (v: number, decimals = 9) => {
    try {
      return formatAmount(v, decimals);
    } catch {
      return String(v);
    }
  };

  return (
    <Card maxWidth="max-w-6xl" className="w-full mx-auto mb-6">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Order Book Statistics</h2>
        <div>
          <button
            className="px-3 py-1 bg-blue-600 text-white rounded"
            onClick={() => fetchStats()}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium text-gray-600 mb-1">Best Bid</div>
            <div className="text-2xl font-bold text-green-600">{stats ? renderAmount(stats.bestBid, 9) : "—"}</div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-600 mb-1">Best Ask</div>
            <div className="text-2xl font-bold text-red-600">{stats ? renderAmount(stats.bestAsk, 9) : "—"}</div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-600 mb-1">Spread</div>
            <div className="text-xl font-semibold text-gray-800">{stats ? renderAmount(stats.spread, 9) : "—"}</div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium text-gray-600 mb-1">Bid Count</div>
            <div className="text-xl font-semibold text-gray-800">{stats ? stats.bidCount : "—"}</div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-600 mb-1">Ask Count</div>
            <div className="text-xl font-semibold text-gray-800">{stats ? stats.askCount : "—"}</div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-600 mb-1">Max Depth</div>
            <div className="text-xl font-semibold text-gray-800">{stats ? stats.maxDepth : "—"}</div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium text-gray-600 mb-1">Total Bid Quantity</div>
            <div className="text-xl font-semibold text-gray-800">{stats ? renderAmount(stats.bookDepth.totalBidQuantity, baseDecimals) : "—"}</div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-600 mb-1">Total Ask Quantity</div>
            <div className="text-xl font-semibold text-gray-800">{stats ? renderAmount(stats.bookDepth.totalAskQuantity, baseDecimals) : "—"}</div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-600 mb-1">Fee Balances (base / quote)</div>
            <div className="text-lg font-semibold text-gray-800">{stats ? `${renderAmount(stats.feeBalances.base, baseDecimals)} / ${renderAmount(stats.feeBalances.quote, quoteDecimals)}` : "—"}</div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-600 mb-1">Locked Balances (base / quote)</div>
            <div className="text-lg font-semibold text-gray-800">{stats ? `${renderAmount(stats.lockedBalances.base, baseDecimals)} / ${renderAmount(stats.lockedBalances.quote, quoteDecimals)}` : "—"}</div>
          </div>
        </div>
      </div>

      {error && <div className="p-4 text-sm text-red-600">Error: {error}</div>}
    </Card>
  );
}
