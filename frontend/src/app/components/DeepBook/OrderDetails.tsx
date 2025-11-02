"use client";

import { useState, useEffect, useCallback } from "react";
import { useIotaClient } from "@iota/dapp-kit";
import { DEEPBOOK, formatAmount } from "../../lib/contracts";
import Card from "../UI/Card";

interface OrderDetailsProps {
  bookId: string;
  baseToken: string;
  quoteToken: string;
  baseDecimals?: number;
  quoteDecimals?: number;
}

interface DetailedOrder {
  id: string;
  maker: string;
  is_bid: boolean;
  price: string;
  quantity: string;
  filled: string;
  locked_amount: string;
  index: number;
}

export default function OrderDetails({
  bookId,
  baseToken,
  quoteToken,
  baseDecimals = 9,
  quoteDecimals = 6,
}: OrderDetailsProps) {
  const [bids, setBids] = useState<DetailedOrder[]>([]);
  const [asks, setAsks] = useState<DetailedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<DetailedOrder | null>(null);
  const [viewMode, setViewMode] = useState<"bids" | "asks">("bids");

  const client = useIotaClient();

  // Fetch detailed order book
  const fetchOrderDetails = useCallback(async () => {
    if (!bookId || !bookId.trim()) return;

    setLoading(true);
    try {
      // Get the OrderBook object to read bids and asks
      const obj = await client.getObject({
        id: bookId,
        options: { showContent: true },
      });

      if (obj?.data?.content && "fields" in obj.data.content) {
        const fields = (obj.data.content as { fields?: unknown }).fields as
          | Record<string, unknown>
          | undefined;

        const safeArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

        const toStr = (v: unknown): string => {
          if (v === null || v === undefined) return "0";
          if (typeof v === "string") return v;
          if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
          if (typeof v === "object") {
            try {
              const maybe = v as { toString?: () => string };
              if (typeof maybe.toString === "function") return maybe.toString();
            } catch {
              return "0";
            }
          }
          return "0";
        };

        // Parse bids with index
        const bidsData = safeArray(fields?.["bids"]);
        const parsedBids: DetailedOrder[] = bidsData.map((bid, index) => {
          const b = bid as Record<string, unknown> | undefined;
          const bFields = b?.["fields"] as Record<string, unknown> | undefined;

          return {
            id: toStr(b?.["id"] || bFields?.["id"]),
            maker: toStr(b?.["maker"] || bFields?.["maker"]),
            is_bid: true,
            price: toStr(b?.["price"] || bFields?.["price"]),
            quantity: toStr(b?.["quantity"] || bFields?.["quantity"]),
            filled: toStr(b?.["filled"] || bFields?.["filled"]),
            locked_amount: toStr(b?.["locked_amount"] || bFields?.["locked_amount"]),
            index,
          };
        });

        // Parse asks with index
        const asksData = safeArray(fields?.["asks"]);
        const parsedAsks: DetailedOrder[] = asksData.map((ask, index) => {
          const a = ask as Record<string, unknown> | undefined;
          const aFields = a?.["fields"] as Record<string, unknown> | undefined;

          return {
            id: toStr(a?.["id"] || aFields?.["id"]),
            maker: toStr(a?.["maker"] || aFields?.["maker"]),
            is_bid: false,
            price: toStr(a?.["price"] || aFields?.["price"]),
            quantity: toStr(a?.["quantity"] || aFields?.["quantity"]),
            filled: toStr(a?.["filled"] || aFields?.["filled"]),
            locked_amount: toStr(a?.["locked_amount"] || aFields?.["locked_amount"]),
            index,
          };
        });

        setBids(parsedBids);
        setAsks(parsedAsks);
      }
    } catch (err) {
      console.error("Failed to fetch order details:", err);
    } finally {
      setLoading(false);
    }
  }, [bookId, client]);

  // Auto-refresh
  useEffect(() => {
    fetchOrderDetails();
    const interval = setInterval(fetchOrderDetails, 15000);
    return () => clearInterval(interval);
  }, [fetchOrderDetails]);

  // Format price
  const formatPrice = (priceStr: string) => {
    try {
      const priceNorm = BigInt(priceStr);
      const priceScale = BigInt(DEEPBOOK.PRICE_SCALE as number);
      return (Number(priceNorm) / Number(priceScale)).toFixed(9);
    } catch {
      return "0.000000000";
    }
  };

  // Calculate fill percentage
  const getFillPercent = (filled: string, quantity: string): number => {
    try {
      const f = Number(filled);
      const q = Number(quantity);
      if (q === 0) return 0;
      return (f / q) * 100;
    } catch {
      return 0;
    }
  };

  // Shorten address
  const shortenAddress = (addr: string): string => {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const baseSymbol = baseToken.split("::").pop() || "BASE";
  const quoteSymbol = quoteToken.split("::").pop() || "QUOTE";

  const displayOrders = viewMode === "bids" ? bids : asks;
  const orderColor = viewMode === "bids" ? "green" : "red";

  return (
    <Card maxWidth="max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-900">🔍 Order Details</h3>
          <p className="text-sm text-gray-600 mt-1">
            Detailed view of all orders in the book
          </p>
        </div>
        <button
          onClick={fetchOrderDetails}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loading ? "🔄 Loading..." : "🔄 Refresh"}
        </button>
      </div>

      {/* View Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setViewMode("bids")}
          className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-colors ${
            viewMode === "bids"
              ? "bg-green-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          🟢 Bids ({bids.length})
        </button>
        <button
          onClick={() => setViewMode("asks")}
          className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-colors ${
            viewMode === "asks"
              ? "bg-red-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          🔴 Asks ({asks.length})
        </button>
      </div>

      {/* Orders Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={`bg-${orderColor}-50 border-b-2 border-${orderColor}-200`}>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Index</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Order ID</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Maker</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Price</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Quantity</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Filled</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Progress</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Locked</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">Action</th>
            </tr>
          </thead>
          <tbody>
            {displayOrders.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  No {viewMode} orders found
                </td>
              </tr>
            ) : (
              displayOrders.map((order) => {
                const fillPercent = getFillPercent(order.filled, order.quantity);

                return (
                  <tr
                    key={`${order.id}-${order.index}`}
                    className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-700 font-mono">#{order.index}</td>
                    <td className="px-4 py-3 text-gray-700 font-mono">{order.id}</td>
                    <td className="px-4 py-3">
                      <span
                        className="text-gray-700 font-mono text-xs cursor-pointer hover:text-blue-600"
                        title={order.maker}
                      >
                        {shortenAddress(order.maker)}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold text-${orderColor}-700`}>
                      {formatPrice(order.price)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {formatAmount(BigInt(order.quantity), baseDecimals)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {formatAmount(BigInt(order.filled), baseDecimals)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className={`bg-${orderColor}-600 h-2 rounded-full transition-all`}
                            style={{ width: `${fillPercent}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-600 min-w-12">
                          {fillPercent.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {order.is_bid
                        ? formatAmount(BigInt(order.locked_amount), quoteDecimals)
                        : formatAmount(BigInt(order.locked_amount), baseDecimals)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="px-3 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-medium transition-colors"
                      >
                        👁️ Details
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-xs text-gray-500">Total Orders</div>
            <div className="text-lg font-bold text-gray-900">{displayOrders.length}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Total Volume</div>
            <div className="text-lg font-bold text-gray-900">
              {formatAmount(
                displayOrders.reduce((sum, o) => sum + BigInt(o.quantity), BigInt(0)),
                baseDecimals
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Filled Volume</div>
            <div className="text-lg font-bold text-gray-900">
              {formatAmount(
                displayOrders.reduce((sum, o) => sum + BigInt(o.filled), BigInt(0)),
                baseDecimals
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Remaining Volume</div>
            <div className="text-lg font-bold text-gray-900">
              {formatAmount(
                displayOrders.reduce(
                  (sum, o) => sum + (BigInt(o.quantity) - BigInt(o.filled)),
                  BigInt(0)
                ),
                baseDecimals
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                {selectedOrder.is_bid ? "🟢" : "🔴"} Order #{selectedOrder.id}
              </h3>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Type</div>
                  <div className={`font-semibold ${selectedOrder.is_bid ? "text-green-700" : "text-red-700"}`}>
                    {selectedOrder.is_bid ? "BID (Buy)" : "ASK (Sell)"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Index Position</div>
                  <div className="font-semibold text-gray-900">#{selectedOrder.index}</div>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Maker Address</div>
                <div className="font-mono text-sm text-gray-900 break-all">{selectedOrder.maker}</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Price ({quoteSymbol})</div>
                  <div className="text-lg font-bold text-gray-900">{formatPrice(selectedOrder.price)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Quantity ({baseSymbol})</div>
                  <div className="text-lg font-bold text-gray-900">
                    {formatAmount(BigInt(selectedOrder.quantity), baseDecimals)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Filled ({baseSymbol})</div>
                  <div className="text-lg font-bold text-blue-700">
                    {formatAmount(BigInt(selectedOrder.filled), baseDecimals)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Remaining ({baseSymbol})</div>
                  <div className="text-lg font-bold text-orange-700">
                    {formatAmount(
                      BigInt(selectedOrder.quantity) - BigInt(selectedOrder.filled),
                      baseDecimals
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-2">Fill Progress</div>
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div
                    className={`${selectedOrder.is_bid ? "bg-green-600" : "bg-red-600"} h-4 rounded-full transition-all flex items-center justify-center text-xs text-white font-medium`}
                    style={{
                      width: `${getFillPercent(selectedOrder.filled, selectedOrder.quantity)}%`,
                    }}
                  >
                    {getFillPercent(selectedOrder.filled, selectedOrder.quantity).toFixed(1)}%
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">
                  Locked Amount ({selectedOrder.is_bid ? quoteSymbol : baseSymbol})
                </div>
                <div className="text-lg font-bold text-purple-700">
                  {selectedOrder.is_bid
                    ? formatAmount(BigInt(selectedOrder.locked_amount), quoteDecimals)
                    : formatAmount(BigInt(selectedOrder.locked_amount), baseDecimals)}
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedOrder(null)}
              className="mt-6 w-full px-4 py-3 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
