"use client";

import { useState, useCallback, useEffect } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount, useIotaClient } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { CONTRACTS, MODULES, DEEPBOOK_FUNCTIONS, DEFAULT_TOKENS, DEEPBOOK, parseAmount, formatAmount, TokenItem } from "../../lib/contracts";
import Card from "../UI/Card";
import TokenSelector from "../UI/TokenSelector";
import TokenPicker from "../UI/TokenPicker";
import OrderBookView from "./OrderBookView";
import QuickTrade from "./QuickTrade";
import TradingViewChart from "./TradingViewChart";

type TradingPair = {
  bookId: string;
  baseToken: string;
  quoteToken: string;
  baseSymbol: string;
  quoteSymbol: string;
};

type PricePoint = {
  time: number;
  price: number;
};

export default function DeepBookInterface() {
  const [feeBps] = useState(DEEPBOOK.DEFAULT_FEE_BPS);
  const [maxDepth] = useState(DEEPBOOK.MAX_DEPTH);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [bookId, setBookId] = useState("");
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);
  const [bookSelect, setBookSelect] = useState("");
  const [baseToken, setBaseToken] = useState(CONTRACTS.KANARI.TYPE);
  const [quoteToken, setQuoteToken] = useState(CONTRACTS.IOTA.TYPE);
  const [showSelectorBase, setShowSelectorBase] = useState(false);
  const [showSelectorQuote, setShowSelectorQuote] = useState(false);
  const [baseBalance, setBaseBalance] = useState<bigint | null>(null);
  const [quoteBalance, setQuoteBalance] = useState<bigint | null>(null);
  const [side, setSide] = useState<"bid" | "ask">("bid");
  const [orderType, setOrderType] = useState<number>(0);
  const [humanPrice, setHumanPrice] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [bestBidPrice, setBestBidPrice] = useState<string | undefined>();
  const [bestAskPrice, setBestAskPrice] = useState<string | undefined>();
  const [registeredPairs, setRegisteredPairs] = useState<TradingPair[]>([]);
  const [loadingPairs, setLoadingPairs] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);

  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();
  const client = useIotaClient();

  // Build available tokens from registered pairs
  const availableTokensFromPairs: TokenItem[] = (() => {
    const types = new Set<string>();
    registeredPairs.forEach((p) => {
      types.add(p.baseToken);
      types.add(p.quoteToken);
    });
    return Array.from(types).map((t) =>
      DEFAULT_TOKENS.find((d) => d.type === t) ||
      { type: t, symbol: t.split("::").pop() || t }
    );
  })();

  const getDecimals = (type: string) =>
    DEFAULT_TOKENS.find((x) => x.type === type)?.decimals ?? 9;

  const humanizeAmount = (amt: bigint | null | undefined, decimals: number) => {
    if (!amt) return "";
    try {
      return formatAmount(amt, decimals).replace(/\.?0+$/, "");
    } catch {
      return "";
    }
  };

  type CoinLike = { amount?: string | number | bigint; balance?: string | number } | null | undefined;
  const extractCoinValue = useCallback((coin: CoinLike): bigint | null => {
    if (!coin) return null;
    const val = coin.amount ?? coin.balance;
    if (!val) return null;
    try {
      return typeof val === "bigint" ? val : BigInt(Math.floor(Number(val)));
    } catch {
      return null;
    }
  }, []);

  // fetch balances for selected base and quote tokens
  useEffect(() => {
    let mounted = true;
    const fetchBalances = async () => {
      if (!currentAccount) {
        setBaseBalance(null);
        setQuoteBalance(null);
        return;
      }

      try {
        // base
        let bSum: bigint = BigInt(0);
        const baseCoins = await client.getCoins({ owner: currentAccount.address, coinType: baseToken });
        if (baseCoins && Array.isArray(baseCoins.data)) {
          for (const c of baseCoins.data) {
            const v = extractCoinValue(c);
            if (v !== null) bSum += v;
          }
        }

        // quote
        let qSum: bigint = BigInt(0);
        const quoteCoins = await client.getCoins({ owner: currentAccount.address, coinType: quoteToken });
        if (quoteCoins && Array.isArray(quoteCoins.data)) {
          for (const c of quoteCoins.data) {
            const v = extractCoinValue(c);
            if (v !== null) qSum += v;
          }
        }

        if (!mounted) return;
        setBaseBalance(bSum);
        setQuoteBalance(qSum);
      } catch {
        console.warn("Failed to fetch balances");
        if (mounted) {
          setBaseBalance(null);
          setQuoteBalance(null);
        }
      }
    };

    fetchBalances();
    const iv = setInterval(fetchBalances, 15000); // refresh every 15s
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, [currentAccount, client, baseToken, quoteToken, extractCoinValue]);

  // Fetch best bid/ask prices for quick trade
  useEffect(() => {
    let mounted = true;
    const fetchPrices = async () => {
      const activeBookId = bookId || (bookSelect !== "manual" && bookSelect !== "" ? bookSelect : "");
      if (!activeBookId || activeBookId.trim() === "") {
        setBestBidPrice(undefined);
        setBestAskPrice(undefined);
        return;
      }

      try {
        const obj = await client.getObject({
          id: activeBookId,
          options: { showContent: true },
        });

        if (obj?.data?.content && "fields" in obj.data.content) {
          const fields = obj.data.content.fields as unknown as Record<string, unknown>;

          // Get best bid (first element of bids array, highest price)
          const bidsData = fields.bids || [];
          if (Array.isArray(bidsData) && bidsData.length > 0) {
            const bestBid = bidsData[0];
            const bidPrice = bestBid?.price?.toString() || bestBid?.fields?.price?.toString();
            if (bidPrice && mounted) setBestBidPrice(bidPrice);
          } else if (mounted) {
            setBestBidPrice("0");
          }

          // Get best ask (first element of asks array, lowest price)
          const asksData = fields.asks || [];
          if (Array.isArray(asksData) && asksData.length > 0) {
            const bestAsk = asksData[0];
            const askPrice = bestAsk?.price?.toString() || bestAsk?.fields?.price?.toString();
            if (askPrice && mounted) setBestAskPrice(askPrice);
          } else if (mounted) {
            setBestAskPrice("0");
          }

          // capture mid price snapshot and append to history (convert from normalized u64 -> human float)
          try {
            const bidRaw = (Array.isArray(bidsData) && bidsData.length > 0) ? (bidsData[0]?.price ?? bidsData[0]?.fields?.price) : undefined;
            const askRaw = (Array.isArray(asksData) && asksData.length > 0) ? (asksData[0]?.price ?? asksData[0]?.fields?.price) : undefined;

            // Price scale (e.g. 1_000_000_000)
            const priceScale = Number(DEEPBOOK.PRICE_SCALE as number) || 1;

            let mid: number | undefined;
            try {
              const bidBig = bidRaw !== undefined ? BigInt(bidRaw.toString()) : undefined;
              const askBig = askRaw !== undefined ? BigInt(askRaw.toString()) : undefined;

              if (bidBig !== undefined && askBig !== undefined) {
                const midBig = (bidBig + askBig) / BigInt(2);
                mid = Number(midBig) / priceScale;
              } else if (bidBig !== undefined) {
                mid = Number(bidBig) / priceScale;
              } else if (askBig !== undefined) {
                mid = Number(askBig) / priceScale;
              }
            } catch {
              // fallback to Number parsing if BigInt fails for any reason
              const bidNum = bidRaw !== undefined ? Number(bidRaw.toString()) : undefined;
              const askNum = askRaw !== undefined ? Number(askRaw.toString()) : undefined;
              if (bidNum !== undefined && askNum !== undefined) mid = (bidNum + askNum) / 2 / priceScale;
              else if (bidNum !== undefined) mid = bidNum / priceScale;
              else if (askNum !== undefined) mid = askNum / priceScale;
            }

            if (mid !== undefined && mounted) {
              const now = Math.floor(Date.now() / 1000);
              setPriceHistory((prev) => {
                const newHistory = [...prev, { time: now, price: mid }];
                // Keep last 100 data points
                return newHistory.slice(-100);
              });
            }
          } catch {
            // ignore history capture errors
          }
        }
      } catch (err) {
        console.warn("Failed to fetch best prices:", err);
      }
    };

    fetchPrices();
    const iv = setInterval(fetchPrices, 10000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, [bookId, bookSelect, client]);

  // Helper to extract books table ID from registry
  const extractBooksTableId = (registryFields: Record<string, unknown>): string | null => {
    const books = registryFields.books;
    if (!books) return null;
    if (typeof books === 'string') return books;
    if (typeof books === 'object' && books !== null && 'fields' in books) {
      const fields = (books as Record<string, unknown>).fields as Record<string, unknown> | undefined;
      const id = fields?.id;
      return typeof id === 'string' ? id : (id as Record<string, unknown>)?.id as string || null;
    }
    return null;
  };

  const getSymbol = (type: string) =>
    DEFAULT_TOKENS.find((t) => t.type === type)?.symbol || type.split("::").pop() || "???";

  // Fetch registered trading pairs from registry
  useEffect(() => {
    const fetchRegisteredPairs = async () => {
      const registryId = CONTRACTS.REGISTRY_BOOK_ID;
      if (!registryId?.trim()) return;

      setLoadingPairs(true);
      try {
        const registryObjInfo = await client.getObject({
          id: registryId,
          options: { showContent: true, showType: true },
        });

        let booksTableId = null;
        if (registryObjInfo?.data?.content && "fields" in registryObjInfo.data.content) {
          const registryFields = registryObjInfo.data.content.fields as Record<string, unknown>;
          booksTableId = extractBooksTableId(registryFields);
        }

        const parentId = booksTableId || registryId;
        const registryObj = await client.getDynamicFields({ parentId });

        if (!registryObj?.data?.length) {
          console.log("Registry is empty");
          return;
        }

        const pairs: TradingPair[] = [];
        for (const field of registryObj.data) {
          try {
            const fieldObj = await client.getDynamicFieldObject({
              parentId,
              name: field.name,
            });

            const bookAddress =
              (fieldObj?.data?.content && "fields" in fieldObj.data.content
                ? (fieldObj.data.content.fields as Record<string, unknown>).value as string
                : fieldObj?.data?.objectId || field.objectId) as string;

            if (!bookAddress) continue;

            const bookObj = await client.getObject({
              id: bookAddress,
              options: { showType: true },
            });

            const typeStr = bookObj?.data?.type as string;
            const match = typeStr?.match(/<(.+),\s*(.+)>/);

            if (match?.[1] && match?.[2]) {
              pairs.push({
                bookId: bookAddress,
                baseToken: match[1].trim(),
                quoteToken: match[2].trim(),
                baseSymbol: getSymbol(match[1].trim()),
                quoteSymbol: getSymbol(match[2].trim()),
              });
            }
          } catch (err) {
            console.warn("Failed to process field:", err);
          }
        }

        setRegisteredPairs(pairs);
      } catch (err) {
        console.error("Failed to fetch pairs:", err);
      } finally {
        setLoadingPairs(false);
      }
    };

    fetchRegisteredPairs();
    const iv = setInterval(fetchRegisteredPairs, 30000);
    return () => clearInterval(iv);
  }, [client, lastCreatedId, refreshTrigger]);

  // When registered pairs are discovered, if the user hasn't selected a book yet,
  // auto-select the first registered pair so the UI supports arbitrary pairs by default.
  useEffect(() => {
    if (registeredPairs.length > 0 && (!bookSelect || bookSelect === "")) {
      const first = registeredPairs[0];
      if (first) {
        setBookSelect(first.bookId);
        setBookId(first.bookId);
        setBaseToken(first.baseToken);
        setQuoteToken(first.quoteToken);
      }
    }
  }, [registeredPairs, bookSelect]);
  // include bookSelect so the auto-select effect re-evaluates when the user's selection changes

  // update normalized price when humanPrice changes
  useEffect(() => {
    if (!humanPrice || humanPrice.trim() === "") {
      setPrice("");
      return;
    }

    const f = parseFloat(humanPrice);
    if (Number.isNaN(f)) {
      setPrice("");
      return;
    }

    // compute normalized price = floor(human * PRICE_SCALE)
    const normalized = Math.floor(f * (DEEPBOOK.PRICE_SCALE as number));
    try {
      setPrice(String(BigInt(normalized)));
    } catch {
      setPrice("");
    }
  }, [humanPrice]);

  const extractBookIdFromResult = (res: unknown): string | null => {
    const idRegex = /^0x[0-9a-fA-F]{64}$/;
    const candidates: string[] = [];

    const search = (val: unknown): void => {
      if (!val) return;
      if (typeof val === "string" && idRegex.test(val)) {
        candidates.push(val);
        return;
      }
      if (Array.isArray(val)) {
        val.forEach(search);
      } else if (typeof val === "object") {
        Object.values(val as Record<string, unknown>).forEach(search);
      }
    };

    search(res);
    return candidates[0] || null;
  };

  const handleCreateBook = useCallback(async () => {
    if (!currentAccount || baseToken === quoteToken) {
      alert(baseToken === quoteToken
        ? "❌ Base and Quote tokens must be different"
        : "Connect wallet first");
      return;
    }

    setLoadingCreate(true);
    try {
      const tx = new Transaction();
      const registryId = CONTRACTS.REGISTRY_BOOK_ID;
      const isValidRegistry = registryId && /^0x[0-9a-fA-F]{64}$/.test(registryId);
      const baseDecimals = getDecimals(baseToken);
      const quoteDecimals = getDecimals(quoteToken);

      const callSpec: Parameters<typeof tx.moveCall>[0] = isValidRegistry ? {
        target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEEPBOOK}::${DEEPBOOK_FUNCTIONS.GET_OR_CREATE_WITH_DECIMALS}`,
        arguments: [tx.object(registryId), tx.pure.u64(feeBps), tx.pure.u64(maxDepth), tx.pure.u8(baseDecimals), tx.pure.u8(quoteDecimals)],
        typeArguments: [baseToken, quoteToken],
      } : {
        target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEEPBOOK}::${DEEPBOOK_FUNCTIONS.CREATE_ORDER_BOOK_WITH_DECIMALS}`,
        arguments: [tx.pure.u64(feeBps), tx.pure.u64(maxDepth), tx.pure.u8(baseDecimals), tx.pure.u8(quoteDecimals)],
        typeArguments: [baseToken, quoteToken],
      };

      tx.moveCall(callSpec);

      signAndExecute({ transaction: tx }, {
        onSuccess: (r) => {
          const found = extractBookIdFromResult(r);
          if (found) {
            setLastCreatedId(found);
            setBookId(found);
            setBookSelect(found);
            setTimeout(() => setLoadingPairs(true), 2000);
            alert(`✅ Order book ${isValidRegistry ? 'ready' : 'created'}\n\nBook ID: ${found}`);
          } else {
            alert("⚠️ Check IOTA Explorer for the created OrderBook object ID");
          }
        },
        onError: (e) => {
          const errStr = String(e);
          const errorMsg =
            errStr.includes("E_SAME_TOKEN_PAIR") ? "Base and Quote must be different" :
              errStr.includes("already exists") ? "Order book already exists for this pair" :
                errStr.includes("E_INVALID_FEE") ? "Fee must be ≤ 1000 bps" :
                  errStr.includes("E_INVALID_DEPTH") ? "Depth must be 1-10,000" :
                    errStr.includes("Insufficient") ? "Insufficient gas" : errStr;
          alert(`❌ ${errorMsg}`);
        },
      });
    } catch (err) {
      alert(`❌ ${String(err)}`);
    } finally {
      setLoadingCreate(false);
    }
  }, [signAndExecute, feeBps, maxDepth, baseToken, quoteToken, currentAccount]);

  const computeQuoteRequired = (qBaseUnits: bigint, pNorm: bigint, baseDec: number, quoteDec: number) => {
    const priceScale = BigInt(DEEPBOOK.PRICE_SCALE as number);
    const diff = quoteDec - baseDec;
    let numerator = qBaseUnits * pNorm;
    let denominator = priceScale;
    if (diff > 0) numerator *= BigInt(10) ** BigInt(diff);
    else if (diff < 0) denominator *= BigInt(10) ** BigInt(-diff);
    return numerator / denominator;
  };

  const getCoinInput = useCallback(async (tx: Transaction, tokenType: string, amount: bigint) => {
    if (tokenType === CONTRACTS.IOTA.TYPE) {
      const [coin] = tx.splitCoins(tx.gas, [amount.toString()]);
      return coin;
    }
    const coins = await client.getCoins({ owner: currentAccount!.address, coinType: tokenType });
    if (!coins?.data?.length) throw new Error(`No ${tokenType} coins`);

    const [primary, ...rest] = coins.data;
    if (rest.length) tx.mergeCoins(tx.object(primary.coinObjectId), rest.map(c => tx.object(c.coinObjectId)));
    const [coin] = tx.splitCoins(tx.object(primary.coinObjectId), [amount.toString()]);
    return coin;
  }, [client, currentAccount]);

  const handlePlaceOrder = useCallback(async () => {
    if (!currentAccount || !bookId?.trim() || !price || !quantity) {
      alert("Please fill all fields and connect wallet");
      return;
    }

    setLoadingOrder(true);
    try {
      const tx = new Transaction();
      const priceU64 = BigInt(price);
      let baseDecimals = getDecimals(baseToken);
      let quoteDecimals = getDecimals(quoteToken);

      // Validate on-chain decimals
      try {
        const bookObj = await client.getObject({ id: bookId, options: { showContent: true } });
        if (bookObj?.data?.content && "fields" in bookObj.data.content) {
          const fields = bookObj.data.content.fields as Record<string, unknown>;
          const onchainBase = Number(fields.base_decimals ?? fields.baseDecimals);
          const onchainQuote = Number(fields.quote_decimals ?? fields.quoteDecimals);

          if (!isNaN(onchainBase) && onchainBase !== getDecimals(baseToken)) {
            alert(`❌ Decimals mismatch! Create a new order book with correct decimals.`);
            setLoadingOrder(false);
            return;
          }
          if (!isNaN(onchainBase)) baseDecimals = onchainBase;
          if (!isNaN(onchainQuote)) quoteDecimals = onchainQuote;
        }
      } catch (err) {
        console.warn('Using token decimals', err);
      }

      const quantityU64 = BigInt(parseAmount(quantity, baseDecimals));

      if (side === "bid") {
        const requiredQuote = computeQuoteRequired(quantityU64, priceU64, baseDecimals, quoteDecimals);
        if (requiredQuote <= BigInt(0)) {
          alert("❌ Amount too small");
          setLoadingOrder(false);
          return;
        }
        const buffer = (requiredQuote * BigInt(101) + BigInt(99)) / BigInt(100);
        const coinIn = await getCoinInput(tx, quoteToken, buffer);

        tx.moveCall({
          target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEEPBOOK}::${DEEPBOOK_FUNCTIONS.PLACE_BID}`,
          arguments: [tx.object(bookId), tx.pure.u64(priceU64.toString()), tx.pure.u64(quantityU64.toString()), coinIn, tx.pure.u8(orderType)],
          typeArguments: [baseToken, quoteToken],
        });
      } else {
        const coinIn = await getCoinInput(tx, baseToken, quantityU64);

        tx.moveCall({
          target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEEPBOOK}::${DEEPBOOK_FUNCTIONS.PLACE_ASK}`,
          arguments: [tx.object(bookId), tx.pure.u64(priceU64.toString()), tx.pure.u64(quantityU64.toString()), coinIn, tx.pure.u8(orderType)],
          typeArguments: [baseToken, quoteToken],
        });
      }

      signAndExecute({ transaction: tx }, {
        onSuccess: () => {
          alert(`✅ ${side === "bid" ? "Buy" : "Sell"} order submitted!`);
          setHumanPrice("");
          setPrice("");
          setQuantity("");
        },
        onError: (e) => {
          const errStr = String(e);
          const errorMsg =
            errStr.includes("E_INSUFFICIENT_LIQUIDITY") ? `Insufficient ${side === "bid" ? "quote" : "base"} balance` :
              errStr.includes("E_INVALID_PRICE") ? "Invalid price" :
                errStr.includes("E_INVALID_QUANTITY") ? "Invalid quantity" :
                  errStr.includes("E_OVERFLOW") ? "Values too large" :
                    errStr.includes("not found") ? "Order book not found" : errStr;
          alert(`❌ ${errorMsg}`);
        },
      });
    } catch (err) {
      alert(`❌ ${String(err)}`);
    } finally {
      setLoadingOrder(false);
    }
  }, [signAndExecute, client, currentAccount, bookId, baseToken, quoteToken, price, quantity, side, orderType, getCoinInput]);

  // Handler to populate order form when a price in the order book is clicked
  const handleSelectPriceFromBook = useCallback((priceNorm: string, selectedSide: "bid" | "ask") => {
    try {
      setSide(selectedSide);
      setPrice(priceNorm);
      const human = Number(BigInt(priceNorm)) / Number(DEEPBOOK.PRICE_SCALE as number);
      // Format with up to 9 decimals and trim trailing zeros
      const humanStr = (Number.isInteger(human) ? human.toString() : human.toFixed(9).replace(/\.?0+$/, ""));
      setHumanPrice(humanStr);
    } catch (err) {
      console.warn("Failed to set price from book click", err);
    }
  }, [setSide, setPrice, setHumanPrice]);

  return (
    <div className="min-h-[420px] w-full max-w-6xl mx-auto px-2 sm:px-4">
      <Card maxWidth="max-w-6xl" className="mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">DeepBook</h2>
            <p className="text-sm text-gray-600">Create order books and place limit orders</p>
            {CONTRACTS.REGISTRY_BOOK_ID && CONTRACTS.REGISTRY_BOOK_ID.trim() !== "" && (
              <p className="text-xs text-green-600 mt-1">✓ Registry enabled - prevents duplicate books</p>
            )}
            {(!CONTRACTS.REGISTRY_BOOK_ID || CONTRACTS.REGISTRY_BOOK_ID.trim() === "") && (
              <p className="text-xs text-orange-600 mt-1">⚠️ No registry - duplicate books allowed</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <TokenPicker label="Base Token" tokenType={baseToken} balance={baseBalance} decimals={getDecimals(baseToken)} onOpen={() => setShowSelectorBase(true)} />
          <TokenPicker label="Quote Token" tokenType={quoteToken} balance={quoteBalance} decimals={getDecimals(quoteToken)} onOpen={() => setShowSelectorQuote(true)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm text-gray-600">Fee (bps)</label>
            <div className="mt-2 text-lg font-medium text-gray-900">{feeBps}</div>
          </div>
          <div>
            <label className="text-sm text-gray-600">Max Depth</label>
            <div className="mt-2 text-lg font-medium text-gray-900">{maxDepth}</div>
          </div>
        </div>

        {/* Warning when same token selected */}
        {baseToken === quoteToken && (
          <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200">
            <div className="flex items-start gap-3">
              <div className="text-red-600 text-xl">⚠️</div>
              <div>
                <h4 className="font-semibold text-red-900 mb-1">Invalid Token Pair</h4>
                <p className="text-sm text-red-800">
                  Base token and Quote token cannot be the same. Please select different tokens to create a trading pair.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mb-6">
          <button onClick={handleCreateBook} disabled={loadingCreate || baseToken === quoteToken} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white font-semibold py-3 rounded-xl transition-colors disabled:cursor-not-allowed">
            {loadingCreate ? "Creating Order Book..." : (CONTRACTS.REGISTRY_BOOK_ID && CONTRACTS.REGISTRY_BOOK_ID.trim() !== "" ? "Get or Create Order Book" : "Create Order Book")}
          </button>
          {CONTRACTS.REGISTRY_BOOK_ID && CONTRACTS.REGISTRY_BOOK_ID.trim() !== "" && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              📋 Will return existing book if pair already exists, or create new one
            </p>
          )}
        </div>

        {(!CONTRACTS.REGISTRY_BOOK_ID || CONTRACTS.REGISTRY_BOOK_ID.trim() === "") && (
          <div className="mb-6 p-4 rounded-xl bg-orange-50 border border-orange-200">
            <div className="flex items-start gap-3">
              <div className="text-orange-600 text-xl">⚠️</div>
              <div>
                <h4 className="font-semibold text-orange-900 mb-1">Registry not configured</h4>
                <p className="text-sm text-orange-800 mb-2">
                  Without a registry, duplicate order books can be created for the same token pair.
                </p>
                <details className="text-xs text-orange-700">
                  <summary className="cursor-pointer font-medium hover:text-orange-900">How to setup registry</summary>
                  <div className="mt-2 space-y-1 pl-4">
                    <p>1. Run: <code className="bg-orange-100 px-1 py-0.5 rounded">iota client call --package {CONTRACTS.PACKAGE_ID.slice(0, 10)}... --module DeepBook --function create_global_registry</code></p>
                    <p>2. Copy the created GlobalOrderBookRegistry object ID</p>
                    <p>3. Update CONTRACTS.REGISTRY_BOOK_ID in frontend/src/app/lib/contracts.ts</p>
                  </div>
                </details>
              </div>
            </div>
          </div>
        )}

        <hr className="my-6" />

        <h3 className="text-lg font-medium mb-4">Place Limit Order</h3>

        {/* Show loading indicator for pairs */}
        {loadingPairs && CONTRACTS.REGISTRY_BOOK_ID && (
          <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <div className="animate-spin">⏳</div>
              <span>Loading registered trading pairs...</span>
            </div>
          </div>
        )}

        {/* Show count of registered pairs with refresh button */}
        {!loadingPairs && registeredPairs.length > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-green-700">
                {`✅ Found ${registeredPairs.length} registered trading pair${registeredPairs.length > 1 ? 's' : ''} in registry`}
              </div>
              <button
                onClick={() => {
                  console.log("🔄 Manual refresh triggered");
                  setRefreshTrigger(prev => prev + 1);
                }}
                className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg"
              >
                🔄 Refresh
              </button>
            </div>
          </div>
        )}

        {/* Show refresh button when no pairs found */}
        {!loadingPairs && registeredPairs.length === 0 && CONTRACTS.REGISTRY_BOOK_ID && (
          <div className="mb-4 p-3 rounded-xl bg-gray-50 border border-gray-200">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  ℹ️ No trading pairs found in registry.
                </div>
                <button
                  onClick={() => {
                    console.log("🔄 Manual refresh triggered");
                    setRefreshTrigger(prev => prev + 1);
                  }}
                  className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                >
                  🔄 Refresh
                </button>
              </div>
              <div className="text-xs text-gray-500">
                <strong>Registry ID:</strong> <code className="bg-gray-100 px-1 rounded">{CONTRACTS.REGISTRY_BOOK_ID.slice(0, 10)}...{CONTRACTS.REGISTRY_BOOK_ID.slice(-8)}</code>
              </div>
              <div className="text-xs text-gray-500">
                💡 Create an order book above using &quot;Get or Create Order Book&quot;, then click Refresh. Check browser console (F12) for detailed logs.
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm text-gray-600 flex items-center gap-1">
              OrderBook Object ID
              <span className="text-xs text-gray-400" title="The shared OrderBook object to place orders in">ⓘ</span>
            </label>
            <div className="mt-2">
              <select
                value={bookSelect}
                onChange={(e) => {
                  const v = e.target.value;
                  setBookSelect(v);
                  if (v === "") {
                    setBookId("");
                  } else if (v === "manual") {
                    setBookId("");
                  } else {
                    setBookId(v);
                    // Update base/quote tokens when selecting a registered pair
                    const pair = registeredPairs.find((p) => p.bookId === v);
                    if (pair) {
                      setBaseToken(pair.baseToken);
                      setQuoteToken(pair.quoteToken);
                    }
                  }
                }}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white"
              >
                <option value="">Select a book...</option>

                {/* Show registered pairs from registry */}
                {registeredPairs.length > 0 && (
                  <optgroup label="📋 Registered Pairs">
                    {registeredPairs.map((pair) => (
                      <option key={pair.bookId} value={pair.bookId}>
                        {pair.baseSymbol}/{pair.quoteSymbol} - {pair.bookId.slice(0, 8)}...{pair.bookId.slice(-6)}
                      </option>
                    ))}
                  </optgroup>
                )}

                {/* Show last created */}
                {lastCreatedId && (
                  <optgroup label="Recently Created">
                    <option value={lastCreatedId}>
                      Last created — {lastCreatedId.slice(0, 10)}...{lastCreatedId.slice(-6)}
                    </option>
                  </optgroup>
                )}

                <option value="manual">📝 Enter manually</option>
              </select>

              {/* Show info when no registered pairs */}
              {!loadingPairs && registeredPairs.length === 0 && CONTRACTS.REGISTRY_BOOK_ID && bookSelect === "" && (
                <div className="mt-3 p-3 rounded-xl bg-gray-50 border border-gray-200">
                  <div className="text-xs text-gray-600">
                    ℹ️ No trading pairs registered yet. Create a new order book above to get started.
                  </div>
                </div>
              )}

              {bookSelect === "manual" && (
                <input
                  value={bookId}
                  onChange={(e) => setBookId(e.target.value)}
                  placeholder="0x..."
                  className="mt-3 w-full px-4 py-3 rounded-xl border border-gray-200 bg-white"
                />
              )}

              {/* Show selected pair info */}
              {bookSelect && bookSelect !== "manual" && bookSelect !== "" && registeredPairs.length > 0 && (
                <div className="mt-3 p-3 rounded-xl bg-blue-50 border border-blue-200">
                  {(() => {
                    const pair = registeredPairs.find((p) => p.bookId === bookSelect);
                    if (pair) {
                      return (
                        <div className="text-xs text-blue-700">
                          <div className="font-bold mb-1">
                            Selected Pair: {pair.baseSymbol}/{pair.quoteSymbol}
                          </div>
                          <div className="font-mono text-blue-600 break-all max-w-full whitespace-normal">
                            Book ID: {pair.bookId}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}

              {lastCreatedId && bookSelect !== "manual" && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="text-xs text-green-700 font-mono break-all max-w-full whitespace-normal">{lastCreatedId}</div>
                  <button
                    onClick={() => {
                      setBookSelect(lastCreatedId);
                      setBookId(lastCreatedId);
                    }}
                    className="ml-auto px-3 py-1 rounded bg-green-600 text-white text-sm"
                    type="button"
                  >
                    Use this
                  </button>
                  <button
                    onClick={() => navigator.clipboard?.writeText(lastCreatedId)}
                    className="ml-2 px-3 py-1 rounded bg-gray-100 text-gray-800 text-sm"
                    type="button"
                  >
                    Copy
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-600">Side</label>
            <select value={side} onChange={(e) => setSide(e.target.value as "bid" | "ask")} className="mt-2 w-full px-4 py-3 rounded-xl border border-gray-200 bg-white">
              <option value="bid">Bid (buy)</option>
              <option value="ask">Ask (sell)</option>
            </select>

            <div className="mt-3">
              <label className="text-sm text-gray-600">Order Type</label>
              <select value={orderType} onChange={(e) => setOrderType(Number(e.target.value))} className="mt-2 w-full px-4 py-3 rounded-xl border border-gray-200 bg-white">
                <option value={0}>Limit</option>
                <option value={1}>IOC (Immediate or Cancel)</option>
                <option value={2}>FOK (Fill or Kill)</option>
                <option value={3}>PostOnly</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="text-sm text-gray-600 flex items-center gap-1">
              Price (human)
              <span className="text-xs text-gray-400" title="Enter decimal price (e.g. 1.5 means 1.5 quote per 1 base)">ⓘ</span>
            </label>
            <input value={humanPrice} onChange={(e) => setHumanPrice(e.target.value)} placeholder="e.g. 1.234" className="mt-2 w-full px-4 py-3 rounded-xl border border-gray-200 bg-white" />
            <div className="text-xs text-gray-500 mt-1">
              Normalized: <span className="font-mono">{price || "-"}</span>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              Quote/{baseToken.split("::").pop()} ratio
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-600 flex items-center gap-1">
              Quantity (base)
              <span className="text-xs text-gray-400" title="Amount of base token to buy/sell (decimal allowed)">ⓘ</span>
            </label>
            <div className="mt-2">
              <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 100 or 0.5" className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white" />

              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-gray-500">in {baseToken.split("::").pop()} tokens</div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-gray-500">Available: <span className="font-mono">{baseBalance !== null ? humanizeAmount(baseBalance, getDecimals(baseToken)) : '-'}</span></div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (!baseBalance) return;
                        const dec = getDecimals(baseToken);
                        const half = baseBalance / BigInt(2);
                        setQuantity(humanizeAmount(half, dec));
                      }}
                      disabled={!baseBalance}
                      className="px-2 py-1 text-xs bg-gray-100 rounded-lg disabled:opacity-50"
                    >
                      50%
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!baseBalance) return;
                        const dec = getDecimals(baseToken);
                        setQuantity(humanizeAmount(baseBalance, dec));
                      }}
                      disabled={!baseBalance}
                      className="px-2 py-1 text-xs bg-gray-100 rounded-lg disabled:opacity-50"
                    >
                      100%
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-600 flex items-center gap-1">
              Preview Quote
              <span className="text-xs text-gray-400" title="Estimated quote token amount for this order">ⓘ</span>
            </label>
            <div className="mt-2 px-4 py-3 rounded-xl border border-gray-100 bg-gray-50">
              <div className="text-lg font-semibold text-gray-900">
                {((price || "") && quantity) || (humanPrice && quantity) ? (() => {
                  try {
                    const p = price ? BigInt(price) : BigInt(Math.floor(parseFloat(humanPrice) * (DEEPBOOK.PRICE_SCALE as number)));
                    const baseDecimals = getDecimals(baseToken);
                    const quoteDecimals = getDecimals(quoteToken);
                    const q = BigInt(parseAmount(quantity || "0", baseDecimals));

                    // compute quote smallest units with correct decimal adjustment and rounding-up
                    const priceScale = BigInt(DEEPBOOK.PRICE_SCALE as number);
                    const diff = quoteDecimals - baseDecimals;
                    let numerator = q * p;
                    let denominator = priceScale;
                    if (diff > 0) numerator = numerator * (BigInt(10) ** BigInt(diff));
                    else if (diff < 0) denominator = denominator * (BigInt(10) ** BigInt(-diff));
                    const quoteSmall = (numerator + denominator - BigInt(1)) / denominator;

                    return formatAmount(quoteSmall, quoteDecimals);
                  } catch {
                    return "-";
                  }
                })() : "-"}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {quoteToken.split("::").pop()} tokens
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={handlePlaceOrder} disabled={loadingOrder} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white font-semibold py-3 rounded-xl transition-colors disabled:cursor-not-allowed">
            {loadingOrder ? "Submitting..." : "Place Order"}
          </button>
        </div>

        {showSelectorBase && (
          <TokenSelector isOpen={showSelectorBase} onClose={() => setShowSelectorBase(false)} tokens={[...DEFAULT_TOKENS, ...availableTokensFromPairs]} onSelect={(type) => { setBaseToken(type); setShowSelectorBase(false); }} />
        )}

        {showSelectorQuote && (
          <TokenSelector isOpen={showSelectorQuote} onClose={() => setShowSelectorQuote(false)} tokens={[...DEFAULT_TOKENS, ...availableTokensFromPairs]} onSelect={(type) => { setQuoteToken(type); setShowSelectorQuote(false); }} />
        )}
      </Card>

      /* Two-column layout: Order Book | Chart */
      {(bookId && bookId.trim() !== "") || (bookSelect && bookSelect !== "" && bookSelect !== "manual") ? (
        <div className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Order Book */}
            <div>
              <OrderBookView
                bookId={bookId || bookSelect}
                baseToken={baseToken}
                quoteToken={quoteToken}
                baseDecimals={getDecimals(baseToken)}
                onSelectPrice={handleSelectPriceFromBook}
              />
            </div>

            {/* Right: Chart */}
            <div>
              <TradingViewChart
                bookId={bookId || bookSelect}
                baseSymbol={DEFAULT_TOKENS.find((t) => t.type === baseToken)?.symbol || baseToken.split("::").pop() || "BASE"}
                quoteSymbol={DEFAULT_TOKENS.find((t) => t.type === quoteToken)?.symbol || quoteToken.split("::").pop() || "QUOTE"}
                priceData={priceHistory}
              />
            </div>

            {/* Right: Quick Trade and compact controls */}
            <div className="space-y-6">
              <QuickTrade
                bookId={bookId || bookSelect}
                baseToken={baseToken}
                quoteToken={quoteToken}
                baseDecimals={getDecimals(baseToken)}
                quoteDecimals={getDecimals(quoteToken)}
                bestBidPrice={bestBidPrice}
                bestAskPrice={bestAskPrice}
                baseBalance={baseBalance}
                quoteBalance={quoteBalance}
              />

              {/* Small summary card to show selected pair and quick actions */}
              <Card>
                <div className="text-sm text-gray-600">
                  <div className="font-semibold text-gray-900">Pair</div>
                  <div className="mt-1 text-sm text-gray-700">{DEFAULT_TOKENS.find((t) => t.type === baseToken)?.symbol || baseToken.split("::").pop()} / {DEFAULT_TOKENS.find((t) => t.type === quoteToken)?.symbol || quoteToken.split("::").pop()}</div>
                  <div className="mt-3">
                    <div className="text-xs text-gray-500">Best Bid</div>
                    <div className="font-medium text-green-700">{bestBidPrice && bestBidPrice !== "0" ? (Number(BigInt(bestBidPrice)) / Number(BigInt(DEEPBOOK.PRICE_SCALE as number))).toFixed(6) : 'N/A'}</div>
                  </div>
                  <div className="mt-3">
                    <div className="text-xs text-gray-500">Best Ask</div>
                    <div className="font-medium text-red-700">{bestAskPrice && bestAskPrice !== "0" ? (Number(BigInt(bestAskPrice)) / Number(BigInt(DEEPBOOK.PRICE_SCALE as number))).toFixed(6) : 'N/A'}</div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
