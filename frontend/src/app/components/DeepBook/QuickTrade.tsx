"use client";

import { useState, useCallback } from "react";
import { useCurrentAccount, useIotaClient } from "@iota/dapp-kit";
import { useSignAndExecuteTransaction } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { CONTRACTS, MODULES, DEEPBOOK_FUNCTIONS, DEEPBOOK, parseAmount, formatAmount } from "../../lib/contracts";
import Card from "../UI/Card";

interface QuickTradeProps {
  bookId: string;
  baseToken: string;
  quoteToken: string;
  baseDecimals?: number;
  quoteDecimals?: number;
  bestBidPrice?: string; // normalized price
  bestAskPrice?: string; // normalized price
  baseBalance?: bigint | null;
  quoteBalance?: bigint | null;
}

export default function QuickTrade({
  bookId,
  baseToken,
  quoteToken,
  baseDecimals = 9,
  quoteDecimals = 9,
  bestBidPrice,
  bestAskPrice,
  baseBalance,
  quoteBalance,
}: QuickTradeProps) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("");
  const [orderType, setOrderType] = useState<number>(0); // 0=limit,1=IOC,2=FOK,3=PostOnly
  const [loading, setLoading] = useState(false);

  const currentAccount = useCurrentAccount();
  const client = useIotaClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  // helper: safe BigInt power of 10 for decimal adjustments
  const pow10Big = (exp: number) => {
    if (!Number.isInteger(exp) || exp <= 0) return BigInt(1);
    const safeExp = Math.min(Math.max(exp, 0), 36);
    return BigInt(10) ** BigInt(safeExp);
  };

  // Format price from normalized to human
  const formatPrice = (priceStr: string | undefined) => {
    if (!priceStr) return "N/A";
    try {
      const priceNorm = BigInt(priceStr);
      const priceScale = BigInt(DEEPBOOK.PRICE_SCALE as number);
      const priceFloat = Number(priceNorm) / Number(priceScale);
      return priceFloat.toFixed(6);
    } catch {
      return "N/A";
    }
  };

  // Human-readable available balance string depending on side
  const availableStr = (() => {
    try {
      if (side === 'buy') {
        if (quoteBalance === undefined || quoteBalance === null) return '-';
        return formatAmount(quoteBalance, quoteDecimals).replace(/\.?0+$/, '');
      } else {
        if (baseBalance === undefined || baseBalance === null) return '-';
        return formatAmount(baseBalance, baseDecimals).replace(/\.?0+$/, '');
      }
    } catch {
      return '-';
    }
  })();

  const handleQuickTrade = useCallback(async () => {
    if (!currentAccount) {
      alert("⚠️ Please connect your wallet");
      return;
    }

    if (!quantity || parseFloat(quantity) <= 0) {
      alert("⚠️ Enter a valid quantity");
      return;
    }

    const priceToUse = side === "buy" ? bestAskPrice : bestBidPrice;
    if (!priceToUse || priceToUse === "0") {
      alert(`⚠️ No ${side === "buy" ? "sell" : "buy"} orders available to match against`);
      return;
    }

    setLoading(true);
    try {
      const tx = new Transaction();

      const quantityU64 = BigInt(parseAmount(quantity, baseDecimals));
      const priceU64 = BigInt(priceToUse);

      if (side === "buy") {
        // Place bid at best ask price (will match immediately)
        let coinIn;
        const priceScale = BigInt(DEEPBOOK.PRICE_SCALE as number);
        const diff = quoteDecimals - baseDecimals;

        // compute requiredQuote with numerator/denominator and ceil
        let numerator = quantityU64 * priceU64;
        let denominator = priceScale;
        if (diff > 0) numerator = numerator * pow10Big(diff);
        else if (diff < 0) denominator = denominator * pow10Big(-diff);
        let requiredQuote = (numerator + denominator - BigInt(1)) / denominator;

        // Add 1% buffer for slippage
        requiredQuote = (requiredQuote * BigInt(101) + BigInt(99)) / BigInt(100);

        if (quoteToken === CONTRACTS.IOTA.TYPE) {
          [coinIn] = tx.splitCoins(tx.gas, [requiredQuote.toString()]);
        } else {
          const coins = await client.getCoins({ owner: currentAccount.address, coinType: quoteToken });
          if (!coins || !coins.data || coins.data.length === 0) {
            alert("❌ No quote token available");
            setLoading(false);
            return;
          }
          const [primary, ...rest] = coins.data;
          if (rest.length > 0) {
            tx.mergeCoins(tx.object(primary.coinObjectId), rest.map((c) => tx.object(c.coinObjectId)));
          }
          [coinIn] = tx.splitCoins(tx.object(primary.coinObjectId), [requiredQuote.toString()]);
        }

        tx.moveCall({
          target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEEPBOOK}::${DEEPBOOK_FUNCTIONS.PLACE_BID}`,
          arguments: [tx.object(bookId), tx.pure.u64(priceU64.toString()), tx.pure.u64(quantityU64.toString()), coinIn, tx.pure.u8(orderType)],
          typeArguments: [baseToken, quoteToken],
        });
      } else {
        // Place ask at best bid price (will match immediately)
        let coinIn;
        if (baseToken === CONTRACTS.IOTA.TYPE) {
          [coinIn] = tx.splitCoins(tx.gas, [quantityU64.toString()]);
        } else {
          const coins = await client.getCoins({ owner: currentAccount.address, coinType: baseToken });
          if (!coins || !coins.data || coins.data.length === 0) {
            alert("❌ No base token available");
            setLoading(false);
            return;
          }
          const [primary, ...rest] = coins.data;
          if (rest.length > 0) {
            tx.mergeCoins(tx.object(primary.coinObjectId), rest.map((c) => tx.object(c.coinObjectId)));
          }
          [coinIn] = tx.splitCoins(tx.object(primary.coinObjectId), [quantityU64.toString()]);
        }

        tx.moveCall({
          target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEEPBOOK}::${DEEPBOOK_FUNCTIONS.PLACE_ASK}`,
          arguments: [tx.object(bookId), tx.pure.u64(priceU64.toString()), tx.pure.u64(quantityU64.toString()), coinIn, tx.pure.u8(orderType)],
          typeArguments: [baseToken, quoteToken],
        });
      }

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: () => {
            alert(
              `✅ ${side === "buy" ? "Buy" : "Sell"} order executed!\n\nQuantity: ${quantity}\nPrice: ${formatPrice(priceToUse)}\n\nCheck your balance for updates.`
            );
            setQuantity("");
          },
          onError: (e) => {
            console.error("Quick trade error:", e);
            alert(`❌ Trade failed\n\n${String(e)}`);
          },
        }
      );
    } catch (err) {
      console.error("Error preparing quick trade:", err);
      alert(`❌ Failed to prepare transaction\n\n${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [
    currentAccount,
    quantity,
    side,
    baseToken,
    quoteToken,
    bookId,
    bestBidPrice,
    bestAskPrice,
    baseDecimals,
    quoteDecimals,
    orderType,
    client,
    signAndExecute,
  ]);

  return (
    <Card maxWidth="max-w-md">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-gray-900 mb-1">⚡ Quick Trade</h3>
        <p className="text-sm text-gray-600">Execute at best available price</p>
      </div>

      {/* Side Selector */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setSide("buy")}
          className={`flex-1 py-3 rounded-xl font-semibold transition-colors ${
            side === "buy"
              ? "bg-green-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          🟢 Buy
        </button>
        <button
          onClick={() => setSide("sell")}
          className={`flex-1 py-3 rounded-xl font-semibold transition-colors ${
            side === "sell"
              ? "bg-red-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          🔴 Sell
        </button>
      </div>

      {/* Order type selector (Limit / IOC / FOK / PostOnly) */}
      <div className="mb-4">
        <label className="text-sm text-gray-600">Order Type</label>
        <div className="mt-2">
          <select value={orderType} onChange={(e) => setOrderType(Number(e.target.value))} className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white">
            <option value={0}>Limit</option>
            <option value={1}>IOC (Immediate or Cancel)</option>
            <option value={2}>FOK (Fill or Kill)</option>
            <option value={3}>PostOnly</option>
          </select>
        </div>
      </div>

      {/* Price Display */}
      <div className="mb-4 p-4 rounded-xl bg-gray-50 border border-gray-200">
        <div className="text-xs text-gray-500 mb-1">
          {side === "buy" ? "Best Ask (Sell)" : "Best Bid (Buy)"} Price
        </div>
        <div className="text-2xl font-bold text-gray-900">
          {formatPrice(side === "buy" ? bestAskPrice : bestBidPrice)}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {quoteToken.split("::").pop()} per {baseToken.split("::").pop()}
        </div>
      </div>

      {/* Quantity Input */}
      <div className="mb-4">
        <label className="text-sm text-gray-600 mb-2 block">
          Quantity ({baseToken.split("::").pop()})
        </label>
        <div>
          <input
            type="text"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 100"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white"
          />

          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-gray-500">in {baseToken.split("::").pop()}</div>
            <div className="flex items-center gap-2">
              <div className="text-xs text-gray-500">Available: <span className="font-mono">{availableStr}</span></div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    // 50% logic depends on side
                    try {
                      if (side === 'sell') {
                        if (!baseBalance) return;
                        const half = baseBalance / BigInt(2);
                        setQuantity(formatAmount(half, baseDecimals).replace(/\.?0+$/, ''));
                      } else {
                        // buy: compute how much base can be bought with 50% of quoteBalance
                        if (!quoteBalance) return;
                        const priceToUse = bestAskPrice;
                        if (!priceToUse) return;
                        const priceU64 = BigInt(priceToUse);
                        const priceScale = BigInt(DEEPBOOK.PRICE_SCALE as number);
                        const availableQuote = quoteBalance / BigInt(2);
                        const diff = (quoteDecimals || 9) - (baseDecimals || 9);
                        const pow = pow10Big(Math.abs(diff));
                        let qtyU64: bigint;
                        if (diff >= 0) {
                          qtyU64 = (availableQuote * priceScale) / priceU64 / pow;
                        } else {
                          qtyU64 = (availableQuote * priceScale) / priceU64 * pow;
                        }
                        setQuantity(formatAmount(qtyU64, baseDecimals).replace(/\.?0+$/, ''));
                      }
                    } catch {
                      // ignore
                    }
                  }}
                  className="px-2 py-1 text-xs bg-gray-100 rounded-lg"
                >
                  50%
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      if (side === 'sell') {
                        if (!baseBalance) return;
                        setQuantity(formatAmount(baseBalance, baseDecimals).replace(/\.?0+$/, ''));
                      } else {
                        if (!quoteBalance) return;
                        const priceToUse = bestAskPrice;
                        if (!priceToUse) return;
                        const priceU64 = BigInt(priceToUse);
                        const priceScale = BigInt(DEEPBOOK.PRICE_SCALE as number);
                        const availableQuote = quoteBalance;
                        const diff = (quoteDecimals || 9) - (baseDecimals || 9);
                        const pow = pow10Big(Math.abs(diff));
                        let qtyU64: bigint;
                        if (diff >= 0) {
                          qtyU64 = (availableQuote * priceScale) / priceU64 / pow;
                        } else {
                          qtyU64 = (availableQuote * priceScale) / priceU64 * pow;
                        }
                        setQuantity(formatAmount(qtyU64, baseDecimals).replace(/\.?0+$/, ''));
                      }
                    } catch {
                      // ignore
                    }
                  }}
                  className="px-2 py-1 text-xs bg-gray-100 rounded-lg"
                >
                  100%
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Estimated Total */}
      {quantity && parseFloat(quantity) > 0 && (side === "buy" ? bestAskPrice : bestBidPrice) && (
        <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200">
          <div className="text-xs text-blue-700 mb-1">Estimated Total</div>
          <div className="text-lg font-bold text-blue-900">
            {(() => {
              try {
                const priceToUse = side === "buy" ? bestAskPrice : bestBidPrice;
                if (!priceToUse) return "N/A";
                const p = BigInt(priceToUse);
                const q = BigInt(parseAmount(quantity, baseDecimals));
                
                // Match Move formula: (q * p * 10^{quote_decimals}) / (PRICE_SCALE * 10^{base_decimals})
                const priceScale = BigInt(DEEPBOOK.PRICE_SCALE as number);
                const diff = quoteDecimals - baseDecimals;
                let numerator = q * p;
                let denominator = priceScale;
                if (diff > 0) numerator = numerator * (BigInt(10) ** BigInt(diff));
                else if (diff < 0) denominator = denominator * (BigInt(10) ** BigInt(-diff));
                const total = numerator / denominator;
                
                return formatAmount(total, quoteDecimals);
              } catch {
                return "N/A";
              }
            })()}{" "}
            {quoteToken.split("::").pop()}
          </div>
        </div>
      )}

      {/* Execute Button */}
      <button
        onClick={handleQuickTrade}
        disabled={loading || !quantity || parseFloat(quantity) <= 0}
        className={`w-full py-3 rounded-xl font-semibold transition-colors ${
          side === "buy"
            ? "bg-green-600 hover:bg-green-700 text-white"
            : "bg-red-600 hover:bg-red-700 text-white"
        } disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed`}
      >
        {loading ? "⏳ Processing..." : side === "buy" ? "🟢 Buy Now" : "🔴 Sell Now"}
      </button>

      <div className="mt-3 text-xs text-gray-500 text-center">
        ⚠️ Order will execute at best available price. Includes 1% slippage buffer.
      </div>
    </Card>
  );
}
