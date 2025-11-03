"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount, useIotaClient } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { CONTRACTS, MODULES, DEX_FUNCTIONS, parseAmount, DEFAULT_TOKENS, computeActiveLpSupply, formatAmount } from "../lib/contracts";
import { usePools } from "../hooks/usePools";
import TokenSelector from "./UI/TokenSelector";
import Card from "./UI/Card";
import TokenAvatar from "./UI/TokenAvatar";
import PoolSelect from "./UI/PoolSelect";
import TokenAmount from "./UI/TokenAmount";
import SlippageSelector from "./UI/SlippageSelector";

export default function SwapInterface() {
  const [amountIn, setAmountIn] = useState("");
  const [amountOut, setAmountOut] = useState("");
  const [isXtoY, setIsXtoY] = useState(true); // true: Token X to Token Y
  const [slippage, setSlippage] = useState("0.5"); // 0.5% default
  const [poolId, setPoolId] = useState("");
  const [loading, setLoading] = useState(false);
  const [userHasSwitched, setUserHasSwitched] = useState(false); // Track if user manually switched

  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();
  const client = useIotaClient();
  const { pools, loading: poolsLoading } = usePools();

  // Token selector modal state for selecting 'From' or 'To' token
  const [showSelectorFrom, setShowSelectorFrom] = useState(false);
  const [showSelectorTo, setShowSelectorTo] = useState(false);

  // Token types/symbols to display (derived from selected pool by default)
  const [tokenFromType, setTokenFromType] = useState<string | null>(null);
  const [tokenFromSymbol, setTokenFromSymbol] = useState<string | null>(null);
  const [tokenToType, setTokenToType] = useState<string | null>(null);
  const [tokenToSymbol, setTokenToSymbol] = useState<string | null>(null);

  // Balances map for quick display
  const [balancesMap, setBalancesMap] = useState<Record<string, string>>({});

  // memoize token candidates to avoid recomputing on every render
  const tokenCandidates = useMemo(() => {
    const fromPools = pools
      .flatMap((p) => [
        { type: p.tokenX, symbol: p.tokenXSymbol || p.tokenX },
        { type: p.tokenY, symbol: p.tokenYSymbol || p.tokenY },
      ]);

    const fromDefaults = DEFAULT_TOKENS.map((t) => ({ type: t.type, symbol: t.symbol }));

    return [...fromDefaults, ...fromPools].reduce((acc: { type: string; symbol: string }[], t) => {
      if (!acc.find((x) => x.type === t.type)) acc.push(t);
      return acc;
    }, [] as { type: string; symbol: string }[]);
  }, [pools]);

  // Build token items for TokenSelector: enrich candidates with any data from DEFAULT_TOKENS
  const tokenItemsForSelector = useMemo(() => {
    return tokenCandidates.map((t) => {
      const found = DEFAULT_TOKENS.find((d) => d.type === t.type);
      if (found) return found;
      // fallback shape expected by TokenSelector (TokenItem)
      return { type: t.type, symbol: t.symbol, name: undefined, decimals: 9 };
    });
  }, [tokenCandidates]);

  // memoize selected pool object for quick access
  const selectedPoolObj = useMemo(() => pools.find((p) => p.poolId === poolId) ?? null, [pools, poolId]);

  // UI state for burn/reserved LP info for selected pool
  const [poolUi, setPoolUi] = useState<{ burnAddr?: string; burnedAmount?: string; activeLp?: string; lpSupply?: string } | null>(null);

  // helper to extract Option<address>-like shapes returned by some backends
  const extractOptionAddress = (raw: unknown): string | null => {
    if (!raw) return null;
    if (typeof raw === "string") return raw;
    if (typeof raw === "object" && raw !== null) {
      const rb = raw as Record<string, unknown>;
      if (typeof rb["Some"] === "string") return rb["Some"] as string;
      if (typeof rb["some"] === "string") return rb["some"] as string;
      if (typeof rb["value"] === "string") return rb["value"] as string;
      const keys = Object.keys(rb);
      if (keys.length === 1 && typeof rb[keys[0]] === "string") return rb[keys[0]] as string;
    }
    return null;
  };

  // Fetch burn reserve object and compute active LP when pool changes
  useEffect(() => {
    const load = async () => {
      if (!poolId || !client) {
        setPoolUi(null);
        return;
      }

      try {
        const poolObj = await client.getObject({ id: poolId, options: { showContent: true, showType: true } });
        if (poolObj.data?.content?.dataType !== "moveObject") {
          setPoolUi(null);
          return;
        }
        const fields = poolObj.data.content.fields as Record<string, unknown> | undefined;
        const lpSupplyStr = String((fields?.["lp_supply"] as string) ?? "0");

        const rawBurn = fields?.["burn_reserve"];
        const burnAddr = extractOptionAddress(rawBurn);

        let burnedAmount = "0";
        if (burnAddr) {
          try {
            const b = await client.getObject({ id: burnAddr, options: { showContent: true } });
            if (b.data?.content?.dataType === "moveObject") {
              const bf = b.data.content.fields as Record<string, unknown> | undefined;
              if (bf && bf['amount'] !== undefined) burnedAmount = String(bf['amount']);
            }
          } catch (e) {
            console.warn("Failed to fetch burn reserve object in SwapInterface:", e);
          }
        }

        try {
          const total = BigInt(lpSupplyStr || "0");
          const reserved = BigInt(burnedAmount || "0");
          const active = computeActiveLpSupply(total, reserved);
          setPoolUi({ burnAddr: burnAddr ?? undefined, burnedAmount: burnedAmount, activeLp: String(active.toString()), lpSupply: lpSupplyStr });
        } catch {
          setPoolUi({ burnAddr: burnAddr ?? undefined, burnedAmount: burnedAmount, activeLp: undefined, lpSupply: lpSupplyStr });
        }
      } catch (e) {
        console.warn("Error loading pool burn info:", e);
        setPoolUi(null);
      }
    };
    void load();
  }, [poolId, client]);

  // Fetch balances for chosen tokens when pool or account changes
  const fetchBalances = useCallback(async () => {
    if (!client || !currentAccount) return;
    const map: Record<string, string> = {};

    const typesToFetch = new Set<string>();
    if (tokenFromType) typesToFetch.add(tokenFromType);
    if (tokenToType) typesToFetch.add(tokenToType);
    tokenCandidates.forEach((t) => typesToFetch.add(t.type));

    await Promise.all(
      Array.from(typesToFetch).map(async (t) => {
        try {
          if (t === CONTRACTS.IOTA.TYPE) {
            try {
              const bal = await (client as unknown as { getBalance?: (opts: { owner: string }) => Promise<{ total?: number | string } | undefined> }).getBalance?.({ owner: currentAccount.address });
              if (bal && typeof bal === "object" && (typeof bal.total === "number" || typeof bal.total === "string")) {
                map[t] = String(bal.total ?? 0);
                return;
              }
            } catch {
              // ignore and fall back to coins
            }
          }

          const resp = await client.getCoins({ owner: currentAccount.address, coinType: t });
          const total = (resp.data || []).reduce((acc: bigint, c: unknown) => {
            const balanceVal = (c as { balance?: string | number } | undefined)?.balance ?? 0;
            return acc + BigInt(String(balanceVal));
          }, BigInt(0));
          map[t] = total.toString();
        } catch {
          map[t] = "0";
        }
      })
    );

    // set once after building map
    setBalancesMap((prev) => ({ ...prev, ...map }));
  }, [client, currentAccount, tokenFromType, tokenToType, tokenCandidates]);

  const handleSwap = async () => {
    if (!currentAccount || !amountIn || !poolId) {
      alert("Please connect wallet, enter amount, and select pool");
      return;
    }

    // Find selected pool to get token types
    const pool = pools.find(p => p.poolId === poolId);
    if (!pool || !pool.tokenX || !pool.tokenY) {
      alert("Invalid pool selected");
      return;
    }

    setLoading(true);
    try {
      const tx = new Transaction();

      // Calculate minimum amount out with slippage
      const minAmountOut = parseAmount(
        (parseFloat(amountOut || "0") * (1 - parseFloat(slippage) / 100)).toString()
      );

      const amountInParsed = parseAmount(amountIn);

      if (isXtoY) {
        // Swap Token X to Token Y
        const isTokenXIota = pool.tokenX === CONTRACTS.IOTA.TYPE;

        let coinIn;

        if (isTokenXIota) {
          // Token X is IOTA - split from gas
          [coinIn] = tx.splitCoins(tx.gas, [amountInParsed]);
        } else {
          // Token X is custom token - fetch and merge
          const tokenXCoins = await client.getCoins({
            owner: currentAccount.address,
            coinType: pool.tokenX,
          });

          if (tokenXCoins.data.length === 0) {
            alert(`You don't have any ${pool.tokenXSymbol} tokens.`);
            setLoading(false);
            return;
          }

          const [primaryCoin, ...restCoins] = tokenXCoins.data;

          if (restCoins.length > 0) {
            tx.mergeCoins(
              tx.object(primaryCoin.coinObjectId),
              restCoins.map((coin) => tx.object(coin.coinObjectId))
            );
          }

          [coinIn] = tx.splitCoins(tx.object(primaryCoin.coinObjectId), [amountInParsed]);
        }

        tx.moveCall({
          target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX_FACTORY}::${DEX_FUNCTIONS.SWAP_X_TO_Y}`,
          arguments: [
            tx.object(poolId),
            coinIn,
            tx.pure.u64(minAmountOut),
          ],
          typeArguments: [pool.tokenX, pool.tokenY],
        });
      } else {
        // Swap Token Y to Token X
        const isTokenYIota = pool.tokenY === CONTRACTS.IOTA.TYPE;

        let coinIn;

        if (isTokenYIota) {
          // Token Y is IOTA - split from gas
          [coinIn] = tx.splitCoins(tx.gas, [amountInParsed]);
        } else {
          // Token Y is custom token - fetch and merge
          const tokenYCoins = await client.getCoins({
            owner: currentAccount.address,
            coinType: pool.tokenY,
          });

          if (tokenYCoins.data.length === 0) {
            alert(`You don't have any ${pool.tokenYSymbol} tokens.`);
            setLoading(false);
            return;
          }

          const [primaryCoin, ...restCoins] = tokenYCoins.data;

          if (restCoins.length > 0) {
            tx.mergeCoins(
              tx.object(primaryCoin.coinObjectId),
              restCoins.map((coin) => tx.object(coin.coinObjectId))
            );
          }

          [coinIn] = tx.splitCoins(tx.object(primaryCoin.coinObjectId), [amountInParsed]);
        }

        tx.moveCall({
          target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX_FACTORY}::${DEX_FUNCTIONS.SWAP_Y_TO_X}`,
          arguments: [
            tx.object(poolId),
            coinIn,
            tx.pure.u64(minAmountOut),
          ],
          typeArguments: [pool.tokenX, pool.tokenY],
        });
      }

      signAndExecute(
        {
          transaction: tx,
        },
        {
          onSuccess: (result) => {
            console.log("Swap successful:", result);
            alert(`Swap successful! Digest: ${result.digest}`);
            setAmountIn("");
            setAmountOut("");
          },
          onError: (error) => {
            console.error("Swap failed:", error);
            alert(`Swap failed: ${error.message}`);
          },
        }
      );
    } catch (error) {
      console.error("Error creating swap transaction:", error);
      alert(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const switchDirection = () => {
    // Toggle direction
    setIsXtoY(!isXtoY);

    // Swap tokens and symbols
    const tempType = tokenFromType;
    const tempSymbol = tokenFromSymbol;

    setTokenFromType(tokenToType);
    setTokenFromSymbol(tokenToSymbol);
    setTokenToType(tempType);
    setTokenToSymbol(tempSymbol);

    // Swap amounts
    const tempAmount = amountIn;
    setAmountIn(amountOut);
    setAmountOut(tempAmount);

    // Mark that user has manually switched
    setUserHasSwitched(true);

    // Refetch balances for the newly selected 'from' token
    void fetchBalances();
  };

  // Update tokens when pool changes


  // Effect: when pool selected, set token types
  useEffect(() => {
    if (!poolId) return;
    const p = selectedPoolObj;
    if (!p) return;

    // If user has manually switched, respect their choice
    if (userHasSwitched) {
      void fetchBalances();
      return;
    }

    // Otherwise, set tokens from pool
    setTokenFromType(p.tokenX);
    setTokenFromSymbol(p.tokenXSymbol || (p.tokenX.split("::").pop() ?? null));
    setTokenToType(p.tokenY);
    setTokenToSymbol(p.tokenYSymbol || (p.tokenY.split("::").pop() ?? null));
    void fetchBalances();
  }, [poolId, selectedPoolObj, fetchBalances, userHasSwitched]);

  // Effect: refetch balances when account/client change
  useEffect(() => {
    void fetchBalances();
  }, [client, currentAccount, fetchBalances]);

  const getHumanBalance = (t?: string | null) => {
    if (!t) return 0;
    try {
      const raw = balancesMap[t];
      if (!raw) return 0;
      return Number(raw) / 1e9;
    } catch {
      return 0;
    }
  };

  // helpers to convert between human (decimal) and raw (base units, 1e9)
  const rawFromHuman = (humanStr: string) => {
    try {
      const v = parseFloat(humanStr || "0");
      if (!isFinite(v) || v <= 0) return BigInt(0);
      return BigInt(Math.floor(v * 1e9));
    } catch {
      return BigInt(0);
    }
  };

  const humanFromRaw = (raw: bigint, decimals = 9, maxFraction = 6) => {
    try {
      const div = 10 ** decimals;
      const n = Number(raw) / div;
      // Return a plain numeric string (no locale grouping) so values can be
      // parsed back with parseFloat when the user switches directions or edits
      // the amount. Trim trailing zeros.
      const fixed = n.toFixed(maxFraction);
      return fixed.replace(/\.?(?:0+)$/, "");
    } catch {
      // fallback
      return "0";
    }
  };

  // Shorten a Move type string like "0x5fd5...::kanari::KANARI" -> "kanari::KANARI"
  // Helper to shorten move types was removed because it's unused. Keep type display logic inline when needed.

  // Compute expected output amount when amountIn changes
  useEffect(() => {
    const computeOutput = () => {
      if (!poolId || !amountIn) {
        setAmountOut("");
        return;
      }

      const pool = pools.find((p) => p.poolId === poolId);
      if (!pool) {
        setAmountOut("");
        return;
      }

      // raw reserves
      const reserveX = BigInt(pool.reserveX || "0");
      const reserveY = BigInt(pool.reserveY || "0");

      // parse input to raw units (1e9)
      const rawIn = rawFromHuman(amountIn);
      if (rawIn <= BigInt(0)) {
        setAmountOut("");
        return;
      }

      // use BigInt for fee arithmetic to avoid mixing number and bigint
      const feeBps = BigInt(Number(pool.feeBps ?? 50));
      const BASIS = BigInt(10000);

      // set which side is in/out depending on direction
      const balanceIn = isXtoY ? reserveX : reserveY;
      const balanceOut = isXtoY ? reserveY : reserveX;

      if (balanceIn <= BigInt(0) || balanceOut <= BigInt(0)) {
        setAmountOut("");
        return;
      }

      // amount_in_with_fee = rawIn * (BASIS - feeBps)
      const amountInWithFee = rawIn * (BASIS - feeBps);

      const numerator = amountInWithFee * balanceOut;
      const denominator = balanceIn * BASIS + amountInWithFee;
      if (denominator === BigInt(0)) {
        setAmountOut("");
        return;
      }

      const outRaw = numerator / denominator;

      // format human output (use decimal formatting for all tokens so
      // small IOTA outputs < 1 are visible instead of rounding to 0)
      setAmountOut(humanFromRaw(outRaw, 9, 6));
    };

    try {
      computeOutput();
    } catch {
      setAmountOut("");
    }
  }, [amountIn, poolId, pools, isXtoY]);

  const formatBalance = (t?: string | null) => {
    if (!t) return "0";
    const raw = balancesMap[t];
    if (!raw) return "0";
    const human = Number(raw) / 1e9;
    if (t === CONTRACTS.IOTA.TYPE) {
      // show IOTA as whole units (no decimals)
      return Math.floor(human).toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
    return human.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  const handleMax = () => {
    if (!tokenFromType) return;
    const human = getHumanBalance(tokenFromType);
    setAmountIn(String(human));
  };

  const handleHalf = () => {
    if (!tokenFromType) return;
    const human = getHumanBalance(tokenFromType) / 2;
    setAmountIn(String(human));
  };

  const handlePoolChange = (newPoolId: string) => {
    setPoolId(newPoolId);
    setUserHasSwitched(false); // Reset switch flag when pool changes
  };

  return (

    <Card maxWidth="max-w-full sm:max-w-md" minHeight="h-auto sm:min-h-[560px] min-h-[480px]" className="shadow-sm mx-auto w-full p-4 sm:p-6 overflow-x-hidden">
      <h2 className="text-xl sm:text-2xl font-bold mb-6 text-gray-900">Swap Tokens</h2>

      {/* Pool Selection */}
      <PoolSelect poolId={poolId} setPoolId={handlePoolChange} pools={pools} loading={poolsLoading} />

      {/* Show selected pair (avatars + symbols) similar to LiquidityInterface */}
      {selectedPoolObj && (
        (() => {
          const fx = tokenItemsForSelector.find((t) => t.type === selectedPoolObj.tokenX);
          const fy = tokenItemsForSelector.find((t) => t.type === selectedPoolObj.tokenY);
          return (
            <div className="mt-4 bg-white rounded-lg p-4 border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2 items-center">
                  <TokenAvatar symbol={selectedPoolObj.tokenXSymbol} tokenType={selectedPoolObj.tokenX} size={32} imgSrc={fx?.logo} verified={!!fx?.verified} />
                  <TokenAvatar symbol={selectedPoolObj.tokenYSymbol} tokenType={selectedPoolObj.tokenY} size={32} imgSrc={fy?.logo} verified={!!fy?.verified} />
                </div>
                <div className="ml-3">
                  <div className="font-semibold">{selectedPoolObj.tokenXSymbol}/{selectedPoolObj.tokenYSymbol}</div>
                  <div className="text-xs text-gray-500">{selectedPoolObj.tokenXSymbol} paired with native {selectedPoolObj.tokenYSymbol} (fee: {(parseInt(selectedPoolObj.feeBps || "0") / 100).toFixed(1)}%)</div>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* Burn / reserved LP info for the selected pool */}
      {poolUi && (
        <div className="mb-4 bg-gray-50 rounded-lg p-3 text-sm">
          <div className="flex justify-between items-center">
            <div className="text-gray-700">Burn Reserve</div>
            <div className="font-mono text-gray-800">{poolUi.burnAddr ? `${poolUi.burnAddr.slice(0, 8)}...${poolUi.burnAddr.slice(-6)}` : "—"}</div>
          </div>
          <div className="flex justify-between items-center mt-1">
            <div className="text-gray-700">Burned LP</div>
            <div className="font-mono font-semibold text-gray-900">{poolUi.burnedAmount ? formatAmount(BigInt(poolUi.burnedAmount)) : "0"}</div>
          </div>
          <div className="flex justify-between items-center mt-1">
            <div className="text-gray-700">Active LP</div>
            <div className="font-mono font-semibold text-gray-900">{poolUi.activeLp ? formatAmount(BigInt(poolUi.activeLp)) : poolUi.lpSupply ? formatAmount(BigInt(poolUi.lpSupply)) : "0"}</div>
          </div>
        </div>
      )}

      {/* From Token */}
      <TokenAmount
        label="From"
        amount={amountIn}
        onChange={setAmountIn}
        tokenSymbol={tokenFromSymbol ?? pools.find((p) => p.poolId === poolId)?.tokenXSymbol}
        tokenType={tokenFromType ?? pools.find((p) => p.poolId === poolId)?.tokenX}
        onOpenSelector={() => setShowSelectorFrom(true)}
        balance={formatBalance(tokenFromType)}
        onMax={handleMax}
        onHalf={handleHalf}
      />

      {/* Switch Button */}
      <div className="flex justify-center -my-2 relative z-10">
        <button
          onClick={switchDirection}
          aria-label="Switch direction"
          className="bg-white border-4 border-gray-50 rounded-full p-2 hover:bg-gray-100 cursor-pointer transition-transform duration-150 ease-in-out hover:scale-105 active:scale-95"
        >
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
      </div>

      {/* To Token */}
      <TokenAmount
        label="To"
        amount={amountOut}
        onChange={setAmountOut}
        tokenSymbol={tokenToSymbol ?? pools.find((p) => p.poolId === poolId)?.tokenYSymbol}
        tokenType={tokenToType ?? pools.find((p) => p.poolId === poolId)?.tokenY}
        onOpenSelector={() => setShowSelectorTo(true)}
        balance={formatBalance(tokenToType)}
      />

      {showSelectorFrom && (
        <TokenSelector
          isOpen={showSelectorFrom}
          onClose={() => setShowSelectorFrom(false)}
          tokens={tokenItemsForSelector}
          onSelect={(type, symbol) => {
            setTokenFromType(type);
            setTokenFromSymbol(symbol);
            setShowSelectorFrom(false);
            void fetchBalances();
          }}
        />
      )}

      {showSelectorTo && (
        <TokenSelector
          isOpen={showSelectorTo}
          onClose={() => setShowSelectorTo(false)}
          tokens={tokenItemsForSelector}
          onSelect={(type, symbol) => {
            setTokenToType(type);
            setTokenToSymbol(symbol);
            setShowSelectorTo(false);
            void fetchBalances();
          }}
        />
      )}

      {/* Slippage */}
      <SlippageSelector slippage={slippage} setSlippage={setSlippage} />

      {/* Swap Button */}
      <button
        onClick={handleSwap}
        disabled={loading || !currentAccount || !amountIn || !poolId}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white font-semibold py-4 rounded-xl transition-colors disabled:cursor-not-allowed"
      >
        {loading ? "Swapping..." : !currentAccount ? "Connect Wallet" : "Swap"}
      </button>
    </Card>
  );
}
