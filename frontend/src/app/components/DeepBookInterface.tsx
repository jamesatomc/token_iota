"use client";

import { useState } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount, useIotaClient } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import {
  CONTRACTS,
  MODULES,
  DEEPBOOK_FUNCTIONS,
  DEEPBOOK,
  parseAmount,
  formatAmount,
} from "../lib/contracts";
import TokenSelector from "./TokenSelector";
import Card from "./UI/Card";

type CoinInfo = { coinObjectId: string };

// Shorten Move type string like "0x5fd5...::kanari::KANARI" -> "kanari::KANARI"
const shortType = (t?: string) => {
  if (!t) return "";
  try {
    const parts = t.split("::");
    if (parts.length >= 2) return parts.slice(-2).join("::");
    return t;
  } catch {
    return t;
  }
};

export default function DeepBookInterface() {
  const [bookId, setBookId] = useState("");
  const [isBid, setIsBid] = useState(true);
  const [baseType, setBaseType] = useState<string | null>(null);
  const [quoteType, setQuoteType] = useState<string | null>(null);
  const [baseSymbol, setBaseSymbol] = useState<string | null>(null);
  const [quoteSymbol, setQuoteSymbol] = useState<string | null>(null);
  const [showSelectorBase, setShowSelectorBase] = useState(false);
  const [showSelectorQuote, setShowSelectorQuote] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [quantityInput, setQuantityInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [feeBps, setFeeBps] = useState<number>(DEEPBOOK.DEFAULT_FEE_BPS);
  const [maxDepth, setMaxDepth] = useState<number>(1000);

  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const client = useIotaClient();
  const currentAccount = useCurrentAccount();

  // Helper to compute normalized price (u64 style) and amounts using DEEPBOOK.PRICE_SCALE
  const computePriceNormalized = (priceStr: string) => {
    // priceStr is a human readable decimal (eg "0.123")
    const parsed = parseFloat(priceStr || "0");
    return Math.round(parsed * DEEPBOOK.PRICE_SCALE);
  };

  const placeOrder = async () => {
    if (!currentAccount || !client) return alert("Connect wallet and ensure client is available");
    if (!bookId) return alert("Enter book object ID");
    if (!baseType || !quoteType) return alert("Select base and quote tokens");
    if (!priceInput || !quantityInput) return alert("Enter price and quantity");

    setLoading(true);
    try {
      const tx = new Transaction();
      const priceNormalized = computePriceNormalized(priceInput); // integer scaled by PRICE_SCALE

      // quantityBase is in base token smallest units (string). parseAmount returns a string.
      const quantityBaseStr = parseAmount(quantityInput);
      const quantityBaseBigInt = BigInt(quantityBaseStr);

      if (isBid) {
        // For a bid we need to supply quote amount = quantity_base * price / PRICE_SCALE
        const quoteRequiredBigInt = (quantityBaseBigInt * BigInt(priceNormalized)) / BigInt(DEEPBOOK.PRICE_SCALE);

        let coinArg;
        if (quoteType === CONTRACTS.IOTA.TYPE) {
          // Split from gas
          const [coinIn] = tx.splitCoins(tx.gas, [quoteRequiredBigInt]);
          coinArg = coinIn;
        } else {
          // Fetch user's quote coins and prepare a coin argument
          const coins = await client.getCoins({ owner: currentAccount.address, coinType: quoteType });
          if (!coins || !coins.data || coins.data.length === 0) {
            alert("No quote tokens available for payment");
            setLoading(false);
            return;
          }
          const primary = coins.data[0];
          const rest = coins.data.slice(1);
          if (rest.length > 0) {
            tx.mergeCoins(tx.object(primary.coinObjectId), rest.map((c: CoinInfo) => tx.object(c.coinObjectId)));
          }

          const [splitCoin] = tx.splitCoins(tx.object(primary.coinObjectId), [quoteRequiredBigInt]);
          coinArg = splitCoin;
        }

        tx.moveCall({
          target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEEPBOOK}::${DEEPBOOK_FUNCTIONS.PLACE_BID}`,
          arguments: [
            tx.object(bookId),
            tx.pure.u64(priceNormalized),
            tx.pure.u64(Number(quantityBaseBigInt.toString())),
            coinArg,
          ],
          typeArguments: [baseType, quoteType],
        });
      } else {
        // ASK: provide base coin equal to quantityBase
        let coinArg;
        if (baseType === CONTRACTS.IOTA.TYPE) {
          const [coinIn] = tx.splitCoins(tx.gas, [quantityBaseBigInt]);
          coinArg = coinIn;
        } else {
          const coins = await client.getCoins({ owner: currentAccount.address, coinType: baseType });
          if (!coins || !coins.data || coins.data.length === 0) {
            alert("No base tokens available to place ask");
            setLoading(false);
            return;
          }
          const primary = coins.data[0];
          const rest = coins.data.slice(1);
          if (rest.length > 0) {
            tx.mergeCoins(tx.object(primary.coinObjectId), rest.map((c: CoinInfo) => tx.object(c.coinObjectId)));
          }

          const [splitCoin] = tx.splitCoins(tx.object(primary.coinObjectId), [quantityBaseBigInt]);
          coinArg = splitCoin;
        }

        tx.moveCall({
          target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEEPBOOK}::${DEEPBOOK_FUNCTIONS.PLACE_ASK}`,
          arguments: [
            tx.object(bookId),
            tx.pure.u64(priceNormalized),
            tx.pure.u64(Number(quantityBaseBigInt.toString())),
            coinArg,
          ],
          typeArguments: [baseType, quoteType],
        });
      }

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: () => {
            alert("Order placed (transaction sent)");
            setPriceInput("");
            setQuantityInput("");
          },
          onError: (err) => {
            console.error(err);
            alert("Order failed: " + (err?.message ?? String(err)));
          },
        }
      );
    } catch (e) {
      console.error(e);
      alert(String(e));
    } finally {
      setLoading(false);
    }
  };

  // Create an OrderBook on-chain and capture the created object id
  const createOrderBook = async () => {
    if (!currentAccount || !client) return alert("Connect wallet and ensure client is available");
    if (!baseType || !quoteType) return alert("Select base and quote tokens before creating book");

    setCreating(true);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEEPBOOK}::${DEEPBOOK_FUNCTIONS.CREATE_ORDER_BOOK}`,
        arguments: [tx.pure.u64(feeBps), tx.pure.u64(maxDepth)],
        typeArguments: [baseType, quoteType],
      });

      signAndExecute({ transaction: tx }, {
        onSuccess: (res: unknown) => {
          // Try to extract created object id from common response shapes
          try {
            const r = res as any;
            // common places: r.effects.created, r.createdObjects, r.created
            const created = r?.effects?.created ?? r?.createdObjects ?? r?.created ?? r?.effects?.created_objects;
            let objId = "";
            if (Array.isArray(created) && created.length > 0) {
              const first = created[0];
              objId = first?.objectId || first?.id || first?.object_id || first?.reference || first?.objectIdHex || first?.object_id_hex || "";
            }

            if (!objId && r?.effects?.events) {
              // fallback: look through effects events for created objectId
              for (const ev of r.effects.events) {
                if (ev?.data?.objectId) { objId = ev.data.objectId; break; }
              }
            }

            if (objId) {
              setBookId(objId);
              try { void navigator.clipboard.writeText(objId); } catch {}
              alert("Order book created: " + objId + " (copied to clipboard)");
            } else {
              alert("Order book created — but could not parse object id automatically. Check transaction effects in console.");
              console.log("create_order_book result:", res);
            }
          } catch (e) {
            console.error(e);
            alert("Created but failed to parse response. Check console.");
          }
        },
        onError: (err) => {
          console.error(err);
          alert("Create order book failed: " + (err?.message ?? String(err)));
        }
      });
    } catch (e) {
      console.error(e);
      alert(String(e));
    } finally {
      setCreating(false);
    }
  };

  // Trade preview values (quote required, fee, maker/taker flows)
  const computePreview = () => {
    try {
      if (!priceInput || !quantityInput) return null;
      const priceNormalized = computePriceNormalized(priceInput);
      const quantityBaseStr = parseAmount(quantityInput);
      const quantityBaseBigInt = BigInt(quantityBaseStr);

      const quoteRequiredBigInt = (quantityBaseBigInt * BigInt(priceNormalized)) / BigInt(DEEPBOOK.PRICE_SCALE);
      const feeBigInt = (quoteRequiredBigInt * BigInt(DEEPBOOK.DEFAULT_FEE_BPS)) / BigInt(10000);

      const humanQuote = formatAmount(quoteRequiredBigInt, 9);
      const humanFee = formatAmount(feeBigInt, 9);

      if (isBid) {
        return {
          takerLabel: "You (Taker / Buyer)",
          takerProvides: `${humanQuote} quote`,
          takerReceives: `${quantityInput} base`,
          takerPaysFee: `${humanFee} quote`,
          makerLabel: "Maker (Seller)",
          makerProvides: `${quantityInput} base`,
          makerReceives: `${formatAmount(quoteRequiredBigInt - feeBigInt, 9)} quote`,
        };
      } else {
        return {
          takerLabel: "You (Taker / Seller)",
          takerProvides: `${quantityInput} base`,
          takerReceives: `${formatAmount(quoteRequiredBigInt - feeBigInt, 9)} quote`,
          takerPaysFee: `${humanFee} quote`,
          makerLabel: "Maker (Buyer)",
          makerProvides: `${humanQuote} quote`,
          makerReceives: `${quantityInput} base`,
        };
      }
    } catch {
      return null;
    }
  };

  const preview = computePreview();

  return (
    <Card className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">DeepBook</h3>
        <div className="text-sm text-gray-500">Book object: {bookId ? bookId.slice(0, 8) + "..." + bookId.slice(-6) : "(not set)"}</div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-gray-700">Book Object ID</label>
        <input
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
          placeholder="0x..."
          className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex items-center gap-2 mt-2">
          <input
            type="number"
            value={feeBps}
            onChange={(e) => setFeeBps(Math.max(0, Math.min(1000, Number(e.target.value || 0))))}
            className="w-28 px-3 py-2 rounded-lg border border-gray-300"
            title="Fee (basis points)"
          />
          <label className="text-sm text-gray-600">fee (bps)</label>

          <input
            type="number"
            value={maxDepth}
            onChange={(e) => setMaxDepth(Math.max(1, Math.min(10000, Number(e.target.value || 1))))}
            className="w-28 px-3 py-2 rounded-lg border border-gray-300"
            title="max depth per side"
          />
          <label className="text-sm text-gray-600">max depth</label>

          <button
            onClick={createOrderBook}
            disabled={creating}
            className="ml-auto px-4 py-2 rounded-lg bg-green-600 text-white text-sm"
          >
            {creating ? "Creating..." : "Create Order Book"}
          </button>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-gray-700">Side</label>
        <div className="inline-flex rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setIsBid(true)}
            className={`px-4 py-2 rounded-lg font-medium ${isBid ? "bg-blue-600 text-white shadow" : "text-gray-700"}`}>
            Bid
          </button>
          <button
            onClick={() => setIsBid(false)}
            className={`px-4 py-2 rounded-lg font-medium ${!isBid ? "bg-blue-600 text-white shadow" : "text-gray-700"}`}>
            Ask
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700">Base token</label>
          <button
            onClick={() => setShowSelectorBase(true)}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-left flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
              {baseSymbol ? baseSymbol[0] : "T"}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{baseSymbol ?? (baseType ? shortType(baseType) : "Select")}</div>
              <div className="text-xs text-gray-500 truncate">{baseType ? shortType(baseType) : ""}</div>
            </div>
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700">Quote token</label>
          <button
            onClick={() => setShowSelectorQuote(true)}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-left flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-amber-400 text-white flex items-center justify-center font-bold text-sm">
              {quoteSymbol ? quoteSymbol[0] : "T"}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{quoteSymbol ?? (quoteType ? shortType(quoteType) : "Select")}</div>
              <div className="text-xs text-gray-500 truncate">{quoteType ? shortType(quoteType) : ""}</div>
            </div>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700">Price (human)</label>
          <input
            placeholder="e.g. 0.123"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700">Quantity (human)</label>
          <input
            placeholder="e.g. 100"
            value={quantityInput}
            onChange={(e) => setQuantityInput(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={placeOrder}
          disabled={loading}
          className="w-full px-6 py-3 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-60"
        >
          {loading ? "Sending..." : (isBid ? "Place Bid" : "Place Ask")}
        </button>
      </div>

      {preview && (
        <div className="mt-4 p-4 rounded-lg border border-gray-100 bg-gray-50">
          <div className="text-sm font-semibold mb-2">Trade preview</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="text-sm">
              <div className="font-medium">{preview.takerLabel}</div>
              <div className="text-gray-700">Provides: {preview.takerProvides}</div>
              <div className="text-gray-700">Receives: {preview.takerReceives}</div>
              <div className="text-gray-500">Fee (you pay): {preview.takerPaysFee}</div>
            </div>
            <div className="text-sm">
              <div className="font-medium">{preview.makerLabel}</div>
              <div className="text-gray-700">Provides: {preview.makerProvides}</div>
              <div className="text-gray-700">Receives: {preview.makerReceives}</div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 text-sm text-gray-500">
        Notes: price uses {DEEPBOOK.PRICE_SCALE.toLocaleString()} scale (9 decimals). Quantity is parsed with the app default decimals.
      </div>

      {/* Token selector modals */}
      <TokenSelector
        isOpen={showSelectorBase}
        onClose={() => setShowSelectorBase(false)}
        onSelect={(type: string, symbol: string) => {
          setBaseType(type);
          setBaseSymbol(symbol);
        }}
      />

      <TokenSelector
        isOpen={showSelectorQuote}
        onClose={() => setShowSelectorQuote(false)}
        onSelect={(type: string, symbol: string) => {
          setQuoteType(type);
          setQuoteSymbol(symbol);
        }}
      />
    </Card>
  );
}
