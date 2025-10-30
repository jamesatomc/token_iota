"use client";

import { useState, useEffect, useCallback } from "react";
import { useCurrentAccount, useIotaClient } from "@iota/dapp-kit";
import { useSignAndExecuteTransaction } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { CONTRACTS, MODULES, DEEPBOOK_FUNCTIONS, DEEPBOOK, formatAmount } from "../lib/contracts";
import Card from "./UI/Card";

interface Order {
  id: string;
  maker: string;
  is_bid: boolean;
  price: string;
  quantity: string;
  filled: string;
  locked_amount: string;
}

interface OrderBookViewProps {
  bookId: string;
  baseToken: string;
  quoteToken: string;
  baseDecimals?: number;
}

export default function OrderBookView({
  bookId,
  baseToken,
  quoteToken,
  baseDecimals = 9,
}: OrderBookViewProps) {
  const [bids, setBids] = useState<Order[]>([]);
  const [asks, setAsks] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [showMyOrders, setShowMyOrders] = useState(false);

  const currentAccount = useCurrentAccount();
  const client = useIotaClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  // Fetch order book data
  const fetchOrderBook = useCallback(async () => {
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

        const toStr = (v: unknown): string | undefined => {
          if (v === null || v === undefined) return undefined;
          if (typeof v === "string") return v;
          if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
          if (typeof v === "object") {
            try {
              const maybe = v as { toString?: () => string };
              if (typeof maybe.toString === "function") return maybe.toString();
            } catch {
              return undefined;
            }
          }
          return undefined;
        };

        // Parse bids
        const bidsData = safeArray(fields?.["bids"]);
        const parsedBids: Order[] = bidsData.map((bid) => {
          const b = bid as Record<string, unknown> | undefined;
          const bFields = b?.["fields"] as Record<string, unknown> | undefined;
          const id = toStr(b?.["id"]) || toStr(bFields?.["id"]) || "0";
          const maker = toStr(b?.["maker"]) || toStr(bFields?.["maker"]) || "";
          const price = toStr(b?.["price"]) || toStr(bFields?.["price"]) || "0";
          const quantity = toStr(b?.["quantity"]) || toStr(bFields?.["quantity"]) || "0";
          const filled = toStr(b?.["filled"]) || toStr(bFields?.["filled"]) || "0";
          const locked_amount = toStr(b?.["locked_amount"]) || toStr(bFields?.["locked_amount"]) || "0";

          return {
            id,
            maker,
            is_bid: true,
            price,
            quantity,
            filled,
            locked_amount,
          };
        });

        // Parse asks
        const asksData = safeArray(fields?.["asks"]);
        const parsedAsks: Order[] = asksData.map((ask) => {
          const a = ask as Record<string, unknown> | undefined;
          const aFields = a?.["fields"] as Record<string, unknown> | undefined;
          const id = toStr(a?.["id"]) || toStr(aFields?.["id"]) || "0";
          const maker = toStr(a?.["maker"]) || toStr(aFields?.["maker"]) || "";
          const price = toStr(a?.["price"]) || toStr(aFields?.["price"]) || "0";
          const quantity = toStr(a?.["quantity"]) || toStr(aFields?.["quantity"]) || "0";
          const filled = toStr(a?.["filled"]) || toStr(aFields?.["filled"]) || "0";
          const locked_amount = toStr(a?.["locked_amount"]) || toStr(aFields?.["locked_amount"]) || "0";

          return {
            id,
            maker,
            is_bid: false,
            price,
            quantity,
            filled,
            locked_amount,
          };
        });

        setBids(parsedBids);
        setAsks(parsedAsks);
      }
    } catch (err) {
      console.error("Failed to fetch order book:", err);
    } finally {
      setLoading(false);
    }
  }, [bookId, client]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    fetchOrderBook();
    const interval = setInterval(fetchOrderBook, 10000);
    return () => clearInterval(interval);
  }, [fetchOrderBook]);

  // Cancel order
  const handleCancelOrder = useCallback(
    async (orderId: string) => {
      if (!currentAccount) {
        alert("⚠️ Please connect your wallet to cancel orders");
        return;
      }

      if (!confirm(`Cancel order #${orderId}?`)) return;

      setCancelling(orderId);
      try {
        const tx = new Transaction();

        tx.moveCall({
          target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEEPBOOK}::${DEEPBOOK_FUNCTIONS.CANCEL_ORDER}`,
          arguments: [tx.object(bookId), tx.pure.u64(orderId)],
          typeArguments: [baseToken, quoteToken],
        });

        signAndExecute(
          { transaction: tx },
          {
            onSuccess: () => {
              alert(`✅ Order #${orderId} cancelled successfully!\n\nYour locked funds have been returned.`);
              fetchOrderBook(); // Refresh
            },
            onError: (e) => {
              console.error("Cancel order error:", e);
              const errStr = String(e);

              if (errStr.includes("E_ORDER_NOT_FOUND")) {
                alert(`❌ Order #${orderId} not found!\n\nIt may have been filled or already cancelled.`);
              } else if (errStr.includes("E_UNAUTHORIZED")) {
                alert(`❌ Unauthorized!\n\nYou can only cancel your own orders.`);
              } else {
                alert(`❌ Failed to cancel order\n\nError: ${errStr}`);
              }
            },
          }
        );
      } catch (err) {
        console.error("Error preparing cancel tx:", err);
        alert(`❌ Failed to prepare transaction\n\n${String(err)}`);
      } finally {
        setCancelling(null);
      }
    },
    [currentAccount, signAndExecute, bookId, baseToken, quoteToken, fetchOrderBook]
  );

  // Format price from normalized to human-readable
  const formatPrice = (priceStr: string) => {
    try {
      const priceNorm = BigInt(priceStr);
      const priceScale = BigInt(DEEPBOOK.PRICE_SCALE as number);
      const priceFloat = Number(priceNorm) / Number(priceScale);
      return priceFloat.toFixed(6);
    } catch {
      return "0";
    }
  };

  // Format quantity
  const formatQuantity = (qtyStr: string, decimals: number) => {
    try {
      return formatAmount(BigInt(qtyStr), decimals);
    } catch {
      return "0";
    }
  };

  // Filter orders by current user
  const myBids = showMyOrders && currentAccount ? bids.filter((b) => b.maker === currentAccount.address) : bids;
  const myAsks = showMyOrders && currentAccount ? asks.filter((a) => a.maker === currentAccount.address) : asks;

  const displayBids = showMyOrders ? myBids : bids;
  const displayAsks = showMyOrders ? myAsks : asks;

  return (
    <Card maxWidth="max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Order Book</h3>
          <p className="text-sm text-gray-600">
            {baseToken.split("::").pop()} / {quoteToken.split("::").pop()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowMyOrders(!showMyOrders)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              showMyOrders
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {showMyOrders ? "📋 My Orders" : "📊 All Orders"}
          </button>
          <button
            onClick={fetchOrderBook}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "🔄 Loading..." : "🔄 Refresh"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bids (Buy Orders) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-green-700">
              🟢 Bids (Buy) - {displayBids.length}
            </h4>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {displayBids.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No buy orders
              </div>
            ) : (
              displayBids.map((bid) => {
                const remaining = BigInt(bid.quantity) - BigInt(bid.filled);
                const isMyOrder = currentAccount && bid.maker === currentAccount.address;

                return (
                  <div
                    key={bid.id}
                    className={`p-3 rounded-lg border ${
                      isMyOrder
                        ? "border-blue-300 bg-blue-50"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-gray-500">
                            #{bid.id}
                          </span>
                          {isMyOrder && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white font-medium">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <div className="text-xs text-gray-500">Price</div>
                            <div className="font-semibold text-green-700">
                              {formatPrice(bid.price)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Quantity</div>
                            <div className="font-medium">
                              {formatQuantity(remaining.toString(), baseDecimals)}
                            </div>
                          </div>
                        </div>
                        {BigInt(bid.filled) > 0 && (
                          <div className="text-xs text-gray-500 mt-1">
                            Filled: {formatQuantity(bid.filled, baseDecimals)} /{" "}
                            {formatQuantity(bid.quantity, baseDecimals)}
                          </div>
                        )}
                      </div>
                      {isMyOrder && (
                        <button
                          onClick={() => handleCancelOrder(bid.id)}
                          disabled={cancelling === bid.id}
                          className="ml-3 px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          {cancelling === bid.id ? "⏳" : "❌ Cancel"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Asks (Sell Orders) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-red-700">
              🔴 Asks (Sell) - {displayAsks.length}
            </h4>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {displayAsks.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No sell orders
              </div>
            ) : (
              displayAsks.map((ask) => {
                const remaining = BigInt(ask.quantity) - BigInt(ask.filled);
                const isMyOrder = currentAccount && ask.maker === currentAccount.address;

                return (
                  <div
                    key={ask.id}
                    className={`p-3 rounded-lg border ${
                      isMyOrder
                        ? "border-blue-300 bg-blue-50"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-gray-500">
                            #{ask.id}
                          </span>
                          {isMyOrder && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white font-medium">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <div className="text-xs text-gray-500">Price</div>
                            <div className="font-semibold text-red-700">
                              {formatPrice(ask.price)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Quantity</div>
                            <div className="font-medium">
                              {formatQuantity(remaining.toString(), baseDecimals)}
                            </div>
                          </div>
                        </div>
                        {BigInt(ask.filled) > 0 && (
                          <div className="text-xs text-gray-500 mt-1">
                            Filled: {formatQuantity(ask.filled, baseDecimals)} /{" "}
                            {formatQuantity(ask.quantity, baseDecimals)}
                          </div>
                        )}
                      </div>
                      {isMyOrder && (
                        <button
                          onClick={() => handleCancelOrder(ask.id)}
                          disabled={cancelling === ask.id}
                          className="ml-3 px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          {cancelling === ask.id ? "⏳" : "❌ Cancel"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-xs text-gray-500">Total Bids</div>
            <div className="text-lg font-bold text-green-700">{bids.length}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Total Asks</div>
            <div className="text-lg font-bold text-red-700">{asks.length}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">My Bids</div>
            <div className="text-lg font-bold text-blue-700">{myBids.length}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">My Asks</div>
            <div className="text-lg font-bold text-blue-700">{myAsks.length}</div>
          </div>
        </div>
      </div>
    </Card>
  );
}
