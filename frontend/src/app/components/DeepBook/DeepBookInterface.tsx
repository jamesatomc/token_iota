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
import PriceChart from "./PriceChart";

export default function DeepBookInterface() {
  const [feeBps] = useState(30);
  const [maxDepth] = useState(1000);
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
  // price: allow human decimal input and normalized u64. The UI shows both.
  const [humanPrice, setHumanPrice] = useState("");
  const [price, setPrice] = useState(""); // normalized u64 string
  const [quantity, setQuantity] = useState("");
  const [loadingOrder, setLoadingOrder] = useState(false);

  // Best bid/ask prices for quick trade
  const [bestBidPrice, setBestBidPrice] = useState<string | undefined>();
  const [bestAskPrice, setBestAskPrice] = useState<string | undefined>();

  // Price history (mid prices) for the selected book
  const [priceHistory, setPriceHistory] = useState<Array<{ ts: number; price: number }>>([]);

  // Registered trading pairs from registry
  const [registeredPairs, setRegisteredPairs] = useState<Array<{
    bookId: string;
    baseToken: string;
    quoteToken: string;
    baseSymbol: string;
    quoteSymbol: string;
  }>>([]);
  const [loadingPairs, setLoadingPairs] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Used to manually trigger refresh

  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();
  const client = useIotaClient();

  // Build a token list from registered pairs so TokenSelector can show all tokens present in registry
  const availableTokensFromPairs: TokenItem[] = (() => {
    try {
      const types = new Set<string>();
      registeredPairs.forEach((p) => {
        if (p.baseToken) types.add(p.baseToken);
        if (p.quoteToken) types.add(p.quoteToken);
      });
      const items: TokenItem[] = [];
      types.forEach((t) => {
        const found = DEFAULT_TOKENS.find((d) => d.type === t);
        if (found) items.push(found);
        else items.push({ type: t, symbol: t.split("::").pop() || t });
      });
      return items;
    } catch {
      return [];
    }
  })();

  // helper: get decimals for a token type from DEFAULT_TOKENS (fallback to 9)
  const getDecimals = (type: string) => {
    const t = DEFAULT_TOKENS.find((x) => x.type === type);
    return t && typeof t.decimals === "number" ? t.decimals : 9;
  };

  // helper: convert bigint token amount to a human string with trailing zeros trimmed
  const humanizeAmount = (amt: bigint | null | undefined, decimals: number) => {
    if (amt === null || amt === undefined) return "";
    try {
      const s = formatAmount(amt, decimals);
      // trim trailing zeros and optional decimal point
      return s.replace(/\.?0+$/, "");
    } catch {
      return "";
    }
  };

  // helper: robustly extract numeric amount from a coin-like object returned by client.getCoins
  type CoinLike = { amount?: string | number | bigint; balance?: string | number; value?: string | number; coinAmount?: string | number; amountMicro?: string | number } | null | undefined;
  const extractCoinValue = useCallback((coin: CoinLike): bigint | null => {
    if (!coin) return null;
    const maybe = (coin as CoinLike)?.amount ?? (coin as CoinLike)?.balance ?? (coin as CoinLike)?.value ?? (coin as CoinLike)?.coinAmount ?? (coin as CoinLike)?.amountMicro ?? null;
    if (maybe === null || maybe === undefined) return null;
    try {
      // many SDKs return string or number
      if (typeof maybe === "string") return BigInt(maybe);
      if (typeof maybe === "number") return BigInt(Math.floor(maybe));
      if (typeof maybe === "bigint") return maybe;
    } catch {
      return null;
    }
    return null;
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
              setPriceHistory((prev) => {
                const next = prev.concat({ ts: Date.now(), price: mid! });
                return next.slice(-60);
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
    const iv = setInterval(fetchPrices, 10000); // refresh every 10s
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, [bookId, bookSelect, client]);

  // Fetch registered trading pairs from registry
  useEffect(() => {
    const fetchRegisteredPairs = async () => {
      const registryId = CONTRACTS.REGISTRY_BOOK_ID;
      console.log("🔍 Checking registry:", registryId);

      if (!registryId || registryId.trim() === "") {
        console.log("❌ No registry ID configured");
        return;
      }

      setLoadingPairs(true);
      try {
        console.log("📡 Fetching registry object...");

        // First, get the registry object to see its structure
        const registryObjInfo = await client.getObject({
          id: registryId,
          options: { showContent: true, showType: true },
        });

        console.log("📦 Registry object:", JSON.stringify(registryObjInfo, null, 2));

        // Check if registry has the 'books' table field
        let booksTableId = null;
        if (registryObjInfo?.data?.content && "fields" in registryObjInfo.data.content) {
          const registryFields = registryObjInfo.data.content.fields as unknown as Record<string, unknown>;
          console.log("📚 Registry fields:", registryFields);
          if (registryFields.books) {
            // Books is a Table object, extract its ID
            if (typeof registryFields.books === 'object' && 'fields' in (registryFields.books as object)) {
              // Safe access: cast to unknown then inspect properties in a type-safe manner
              const bfUnknown = registryFields.books as unknown;
              if (typeof bfUnknown === 'object' && bfUnknown !== null) {
                const bfRec = bfUnknown as Record<string, unknown>;
                const fieldsObj = bfRec.fields as Record<string, unknown> | undefined;
                if (fieldsObj) {
                  const idObj = fieldsObj.id as Record<string, unknown> | string | undefined;
                  if (typeof idObj === 'string') booksTableId = idObj;
                  else if (typeof idObj === 'object' && idObj !== null) booksTableId = (idObj as Record<string, unknown>).id as string | undefined || null;
                }
              }
            } else if (typeof registryFields.books === 'string') {
              booksTableId = registryFields.books;
            }
            console.log("📖 Books table ID:", booksTableId);
          }
        }

        // Try to get dynamic fields from the books table (not registry itself)
        const parentId = booksTableId || registryId;
        console.log("📡 Fetching dynamic fields from:", parentId);
        const registryObj = await client.getDynamicFields({
          parentId: parentId,
        });

        console.log("📋 Dynamic fields result:", JSON.stringify(registryObj, null, 2));
        console.log("📊 Number of fields:", registryObj?.data?.length || 0);

        if (!registryObj?.data || registryObj.data.length === 0) {
          console.log("❗ Registry is empty. Make sure you:");
          console.log("   1. Use the latest Package ID:", CONTRACTS.PACKAGE_ID);
          console.log("   2. Click 'Get or Create Order Book' button (not command line)");
          console.log("   3. Wait for transaction to complete");
          console.log("   4. Check transaction includes:", `${CONTRACTS.PACKAGE_ID}::DeepBook::get_or_create_order_book`);
        }

        if (registryObj?.data && Array.isArray(registryObj.data)) {
          const pairs: typeof registeredPairs = [];

          for (const field of registryObj.data) {
            try {
              console.log("🔑 Processing field:", field);

              // Get the dynamic field object which contains the book address
              // Use the books table ID as parent, not the registry ID
              const fieldObj = await client.getDynamicFieldObject({
                parentId: parentId, // Use books table ID, not registry ID
                name: field.name,
              });

              console.log("📄 Field object:", fieldObj);

              let bookAddress = null;

              // Try to extract book address from field object
              if (fieldObj?.data?.content && "fields" in fieldObj.data.content) {
                const fields = fieldObj.data.content.fields as unknown as Record<string, unknown>;
                // Extract common string-valued fields
                bookAddress = (fields.value as string) || (fields.book_id as string) || (fields.id as string) || null;
              }
              // If field object query failed, try to extract from objectId
              else if (fieldObj?.data?.objectId) {
                bookAddress = fieldObj.data.objectId;
              }
              // Try from field.objectId as fallback
              else if (field.objectId) {
                bookAddress = field.objectId;
              }

              console.log("📘 Book address:", bookAddress);

              if (!bookAddress) {
                console.warn("⚠️ No book address found, skipping field");
                console.warn("Field data:", JSON.stringify(field, null, 2));
                continue;
              }

              // Get the book object to extract token types
              const bookObj = await client.getObject({
                id: bookAddress,
                options: { showType: true },
              });

              console.log("📖 Book object:", bookObj);

              if (bookObj?.data?.type) {
                const typeStr = bookObj.data.type as string;
                console.log("🏷️ Type string:", typeStr);

                // Parse type: "0xPACKAGE::DeepBook::OrderBook<BASE_TYPE, QUOTE_TYPE>"
                const match = typeStr.match(/<(.+),\s*(.+)>/);

                if (match && match[1] && match[2]) {
                  const baseType = match[1].trim();
                  const quoteType = match[2].trim();
                  console.log("✅ Parsed types:", { baseType, quoteType });

                  // Get symbols
                  const getSymbol = (type: string) => {
                    const token = DEFAULT_TOKENS.find((t) => t.type === type);
                    return token?.symbol || type.split("::").pop() || "???";
                  };

                  const pair = {
                    bookId: bookAddress,
                    baseToken: baseType,
                    quoteToken: quoteType,
                    baseSymbol: getSymbol(baseType),
                    quoteSymbol: getSymbol(quoteType),
                  };

                  console.log("✨ Added pair:", pair);
                  pairs.push(pair);
                } else {
                  console.warn("⚠️ Failed to parse type:", typeStr);
                }
              }
            } catch (err) {
              console.warn("❌ Failed to process dynamic field:", err);
            }
          }

          console.log("🎉 Total pairs found:", pairs.length);
          if (pairs.length > 0) {
            console.table(pairs);
          }
          setRegisteredPairs(pairs);
        } else {
          console.log("❌ No dynamic fields data found");
          console.log("Registry might be empty or inaccessible");
        }
      } catch (err) {
        console.error("❌ Failed to fetch registered pairs:", err);
      } finally {
        setLoadingPairs(false);
      }
    };

    fetchRegisteredPairs();
    // Refresh every 30 seconds
    const iv = setInterval(fetchRegisteredPairs, 30000);
    return () => clearInterval(iv);
  }, [client, lastCreatedId, refreshTrigger]); // Re-fetch when a new book is created or manual refresh

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

  const handleCreateBook = useCallback(async () => {
    if (!currentAccount) {
      alert("Connect wallet to create an order book");
      return;
    }

    // Check if base and quote tokens are the same
    if (baseToken === quoteToken) {
      alert("❌ Invalid token pair!\n\nBase token and Quote token must be different.\n\nPlease select different tokens for the trading pair.");
      return;
    }

    setLoadingCreate(true);
    try {
      const tx = new Transaction();

      // Build call spec using GlobalOrderBookRegistry
      const registryId = CONTRACTS.REGISTRY_BOOK_ID;
      const objIdRegex = /^0x[0-9a-fA-F]{64}$/;

      let callSpec: Parameters<typeof tx.moveCall>[0];

      if (registryId && registryId.trim() !== "" && objIdRegex.test(registryId)) {
        // Use get_or_create_order_book with registry (returns existing or creates new)
        // This function returns the book address and prevents duplicate books
        callSpec = {
          target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEEPBOOK}::${DEEPBOOK_FUNCTIONS.GET_OR_CREATE}`,
          arguments: [tx.object(registryId), tx.pure.u64(feeBps), tx.pure.u64(maxDepth)],
          typeArguments: [baseToken, quoteToken],
        };
      } else if (registryId && registryId.trim() !== "") {
        // Registry is set but invalid format — log and fall back to non-registry create
        console.warn("Configured registry id looks invalid, falling back to non-registry create:", registryId);
        alert("⚠️ Configured registry id is invalid. Falling back to direct create.\n\nTo use the registry:\n1. Deploy with: iota client call --package <PACKAGE_ID> --module DeepBook --function create_global_registry\n2. Copy the created GlobalOrderBookRegistry object ID\n3. Set it in CONTRACTS.REGISTRY_BOOK_ID in contracts.ts");
        callSpec = {
          target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEEPBOOK}::${DEEPBOOK_FUNCTIONS.CREATE_ORDER_BOOK}`,
          arguments: [tx.pure.u64(feeBps), tx.pure.u64(maxDepth)],
          typeArguments: [baseToken, quoteToken],
        };
      } else {
        // No registry configured — call plain create (allows duplicate books)
        console.warn("No registry configured. Using direct create (allows duplicate books).");
        callSpec = {
          target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEEPBOOK}::${DEEPBOOK_FUNCTIONS.CREATE_ORDER_BOOK}`,
          arguments: [tx.pure.u64(feeBps), tx.pure.u64(maxDepth)],
          typeArguments: [baseToken, quoteToken],
        };
      }

      // Debug log the payload so dry-run type mismatches can be diagnosed easily
      try {
        console.debug("DeepBook - moveCall payload:", callSpec);
        // also log prepared tx after adding the moveCall (some SDKs embed commands)
      } catch (logErr) {
        console.warn("Failed to log tx payload", logErr);
      }

      tx.moveCall(callSpec);

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (r) => {
            console.log("create_order_book success", r);
            try {
              const res = r as unknown;

              // helper: recursively search response for candidate object ids
              const candidates: string[] = [];
              const idRegex = /^0x[0-9a-fA-F]{64}$/;

              const pushFrom = (val: unknown) => {
                if (val === null || val === undefined) return;
                if (typeof val === "string") {
                  const s = val as string;
                  if (idRegex.test(s)) {
                    candidates.push(s);
                    return;
                  }
                }
                if (Array.isArray(val)) {
                  (val as unknown[]).forEach(pushFrom);
                  return;
                }
                if (typeof val === "object") {
                  const obj = val as Record<string, unknown>;
                  // Common places: returnValues, effects.createdObjects (array of objects), events (array)
                  Object.entries(obj).forEach(([k, v]) => {
                    // If event object contains nested fields like { type: "...::OrderBookCreated", data: { book_id: "0x..." } }
                    if (k && k.toLowerCase().includes("event") && v) pushFrom(v);
                    else if (k && k.toLowerCase().includes("created") && v) pushFrom(v);
                    else if (k && k.toLowerCase().includes("return") && v) pushFrom(v);
                    else if (k && (k === "objectId" || k === "id" || k === "book_id" || k === "address")) pushFrom(v);
                    else pushFrom(v);
                  });
                }
              };

              pushFrom(res);

              // prefer the first candidate that looks like an object id
              const found = candidates.length > 0 ? candidates[0] : null;

              if (found) {
                setLastCreatedId(found);
                setBookId(found);
                setBookSelect(found);
                const useRegistry = CONTRACTS.REGISTRY_BOOK_ID && CONTRACTS.REGISTRY_BOOK_ID.trim() !== "";

                // Trigger re-fetch of registered pairs by updating lastCreatedId
                // The useEffect will automatically re-run
                setTimeout(() => {
                  console.log("🔄 Triggering pairs refresh after order book creation...");
                  setLoadingPairs(true);
                }, 2000);

                alert(`✅ ${useRegistry ? 'Order book ready' : 'Order book created'}\n\nBook ID: ${found}\n\n${useRegistry ? '(Retrieved from registry or newly created)\n\nRefreshing trading pairs list...' : '(Newly created - not registered)'}`);
              } else {
                alert("⚠️ Transaction submitted but could not auto-detect book ID.\n\nPlease:\n1. Check the transaction in IOTA Explorer\n2. Find the OrderBookCreated event or created object\n3. Copy the book_id / object ID\n4. Paste it into the OrderBook ID field below");
              }
            } catch (err) {
              console.warn("failed to parse create result", err);
              alert("✅ Transaction submitted successfully!\n\nCheck IOTA Explorer for:\n• OrderBookCreated event with book_id\n• Created OrderBook object\n\nCopy the object ID to use below.");
            }
          },
          onError: (e) => {
            console.error("create_order_book error:", e);
            const errStr = String(e);

            // Parse common errors
            if (errStr.includes("E_SAME_TOKEN_PAIR")) {
              alert("❌ Invalid token pair!\n\nBase token and Quote token cannot be the same.\n\nPlease select different tokens for your trading pair.");
            } else if (errStr.includes("E_ORDERBOOK_ALREADY_EXISTS") || errStr.includes("already exists")) {
              alert("❌ Order book already exists for this token pair!\n\nThis pair is already registered in the global registry.\nUse a different token pair or query the existing book.");
            } else if (errStr.includes("E_INVALID_FEE")) {
              alert("❌ Invalid fee setting!\n\nFee must be ≤ 1000 basis points (10%)");
            } else if (errStr.includes("E_INVALID_DEPTH")) {
              alert("❌ Invalid depth setting!\n\nDepth must be between 1 and 10,000");
            } else if (errStr.includes("Insufficient")) {
              alert("❌ Insufficient gas!\n\nPlease ensure you have enough IOTA for gas fees.");
            } else {
              alert(`❌ Failed to create order book\n\nError: ${errStr}\n\nCheck console for details.`);
            }
          },
        }
      );
    } catch (err) {
      console.error("Error preparing order book tx:", err);
      alert(`❌ Failed to prepare transaction\n\nError: ${String(err)}\n\nPlease check:\n• Wallet is connected\n• Token types are valid\n• Network connection`);
    } finally {
      setLoadingCreate(false);
    }
  }, [signAndExecute, feeBps, maxDepth, baseToken, quoteToken, currentAccount]);

  const handlePlaceOrder = useCallback(async () => {
    if (!currentAccount) {
      alert("Connect wallet to place orders");
      return;
    }
    if (!bookId || !bookId.trim()) {
      alert("Please provide the OrderBook object id (bookId)");
      return;
    }
    if (!price || !quantity) {
      alert("Enter price and quantity");
      return;
    }

    setLoadingOrder(true);
    try {
      const tx = new Transaction();

      // convert price and quantity to u64 values expected by Move
      // price is expected as normalized integer (price * PRICE_SCALE). In UI we expect user to supply normalized integer string or simple numeric — we accept raw string and attempt to parse as integer.
      const priceU64 = BigInt(price);
      // quantity may be entered as a decimal (e.g. 0.1). Parse to smallest units using base token decimals.
      const baseDecimals = getDecimals(baseToken);
      const quoteDecimals = getDecimals(quoteToken);
      const quantityU64 = BigInt(parseAmount(quantity, baseDecimals));

      // Build coin input depending on side
      if (side === "bid") {
        // payment: Coin<Quote> (quote token provided by taker). If quote is IOTA, split from gas.
        let coinIn;
        if (quoteToken === CONTRACTS.IOTA.TYPE) {
          // requiredQuote in quote subunits = (quantity_sub * price_norm / PRICE_SCALE)
          const priceScale = BigInt(DEEPBOOK.PRICE_SCALE as number);
          let requiredQuote = (quantityU64 * priceU64) / priceScale;
          const diff = quoteDecimals - baseDecimals;
          if (diff > 0) {
            requiredQuote = requiredQuote * (BigInt(10) ** BigInt(diff));
          } else if (diff < 0) {
            requiredQuote = requiredQuote / (BigInt(10) ** BigInt(-diff));
          }
          const reqStr = requiredQuote.toString();
          [coinIn] = tx.splitCoins(tx.gas, [reqStr]);
        } else {
          // fetch coins for quoteToken
          const coins = await client.getCoins({ owner: currentAccount.address, coinType: quoteToken });
          if (!coins || !coins.data || coins.data.length === 0) {
            alert("No coins for quote token available to fund bid");
            setLoadingOrder(false);
            return;
          }
          const [primary, ...rest] = coins.data;
          if (rest.length > 0) {
            tx.mergeCoins(tx.object(primary.coinObjectId), rest.map((c) => tx.object(c.coinObjectId)));
          }
          // split exact amount; compute required
          const priceScale = BigInt(DEEPBOOK.PRICE_SCALE as number);
          let requiredQuote = (quantityU64 * priceU64) / priceScale;
          const diff = quoteDecimals - baseDecimals;
          if (diff > 0) {
            requiredQuote = requiredQuote * (BigInt(10) ** BigInt(diff));
          } else if (diff < 0) {
            requiredQuote = requiredQuote / (BigInt(10) ** BigInt(-diff));
          }
          [coinIn] = tx.splitCoins(tx.object(primary.coinObjectId), [requiredQuote.toString()]);
        }

        // Move signature: place_bid(book: &mut OrderBook<Base,Quote>, price: u64, quantity: u64, payment: Coin<Quote>, ctx: &mut TxContext)
        // So arguments must be [book, price, quantity, payment]
        const callSpec = {
          target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEEPBOOK}::${DEEPBOOK_FUNCTIONS.PLACE_BID}`,
          arguments: [tx.object(bookId), tx.pure.u64(priceU64.toString()), tx.pure.u64(quantityU64.toString()), coinIn],
          typeArguments: [baseToken, quoteToken],
        } as Parameters<typeof tx.moveCall>[0];
        console.debug("DeepBook - placeBid payload:", callSpec);
        tx.moveCall(callSpec);
      } else {
        // ask: base_coin: Coin<Base>
        let coinIn;
        if (baseToken === CONTRACTS.IOTA.TYPE) {
          const requiredBase = quantityU64.toString();
          [coinIn] = tx.splitCoins(tx.gas, [requiredBase]);
        } else {
          const coins = await client.getCoins({ owner: currentAccount.address, coinType: baseToken });
          if (!coins || !coins.data || coins.data.length === 0) {
            alert("No coins for base token available to fund ask");
            setLoadingOrder(false);
            return;
          }
          const [primary, ...rest] = coins.data;
          if (rest.length > 0) {
            tx.mergeCoins(tx.object(primary.coinObjectId), rest.map((c) => tx.object(c.coinObjectId)));
          }
          [coinIn] = tx.splitCoins(tx.object(primary.coinObjectId), [quantityU64.toString()]);
        }

        // Move signature: place_ask(book: &mut OrderBook<Base,Quote>, price: u64, quantity: u64, base_coin: Coin<Base>, ctx: &mut TxContext)
        const callSpec = {
          target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEEPBOOK}::${DEEPBOOK_FUNCTIONS.PLACE_ASK}`,
          arguments: [tx.object(bookId), tx.pure.u64(priceU64.toString()), tx.pure.u64(quantityU64.toString()), coinIn],
          typeArguments: [baseToken, quoteToken],
        } as Parameters<typeof tx.moveCall>[0];
        console.debug("DeepBook - placeAsk payload:", callSpec);
        tx.moveCall(callSpec);
      }

      signAndExecute({ transaction: tx }, {
        onSuccess: (r) => {
          console.log("place order success", r);
          const orderType = side === "bid" ? "Buy" : "Sell";
          alert(`✅ ${orderType} order submitted!\n\nQuantity: ${quantity}\nPrice: ${humanPrice || price}\n\nCheck transaction in IOTA Explorer for:\n• OrderPlaced event (if resting)\n• OrderMatched event (if filled)\n• Your updated balance`);

          // Clear form
          setHumanPrice("");
          setPrice("");
          setQuantity("");
        },
        onError: (e) => {
          console.error("place order error:", e);
          const errStr = String(e);

          // Parse common errors
          if (errStr.includes("E_INSUFFICIENT_LIQUIDITY")) {
            alert(`❌ Insufficient ${side === "bid" ? "quote" : "base"} token balance!\n\nYou need ${side === "bid" ? "quote (payment)" : "base"} tokens to place this order.\n\nCheck your wallet balance.`);
          } else if (errStr.includes("E_INVALID_PRICE")) {
            alert("❌ Invalid price!\n\nPrice must be greater than 0.");
          } else if (errStr.includes("E_INVALID_QUANTITY")) {
            alert("❌ Invalid quantity!\n\nQuantity must be greater than 0.");
          } else if (errStr.includes("not found") || errStr.includes("does not exist")) {
            alert("❌ Order book not found!\n\nThe specified OrderBook object ID does not exist or is invalid.\n\nPlease verify the book ID.");
          } else if (errStr.includes("Insufficient")) {
            alert("❌ Insufficient funds or gas!\n\nPlease ensure you have:\n• Enough tokens for the order\n• Enough IOTA for gas fees");
          } else {
            alert(`❌ Failed to place order\n\nError: ${errStr}\n\nCheck console for details.`);
          }
        },
      });
    } catch (err) {
      console.error("Error preparing order tx:", err);
      alert(`❌ Failed to prepare order\n\nError: ${String(err)}\n\nPlease check:\n• Order book ID is valid\n• Token balances are sufficient\n• Price and quantity are valid`);
    } finally {
      setLoadingOrder(false);
    }
  }, [signAndExecute, client, currentAccount, bookId, baseToken, quoteToken, price, quantity, side, humanPrice]);

  return (
    <div className="min-h-[420px] w-full max-w-6xl mx-auto px-4">
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
                    const quote = (q * p) / BigInt(DEEPBOOK.PRICE_SCALE as number);
                    return formatAmount(quote, quoteDecimals);
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

      {/* Quick Trade & Order Book View */}
      {(bookId && bookId.trim() !== "") || (bookSelect && bookSelect !== "" && bookSelect !== "manual") ? (
        <div className="mt-6 space-y-6">
          {/* Price Chart */}
          <div className="p-4 rounded-xl bg-white border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-700">Price (mid)</div>
              <div className="text-xs text-gray-500">{priceHistory.length > 0 ? `${priceHistory[priceHistory.length - 1].price.toLocaleString(undefined, { maximumFractionDigits: 6 })} (human)` : '-'}</div>
            </div>
            {/* Responsive chart container: chart will fill available width */}
            <div style={{ width: '100%' }}>
              <PriceChart data={priceHistory} height={96} />
            </div>
          </div>
          {/* Quick Trade */}
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

          {/* Order Book View */}
          <OrderBookView
            bookId={bookId || bookSelect}
            baseToken={baseToken}
            quoteToken={quoteToken}
            baseDecimals={getDecimals(baseToken)}
          />
        </div>
      ) : null}
    </div>
  );
}
