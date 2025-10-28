"use client";

import { useState, useEffect, useCallback } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount, useIotaClient } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { CONTRACTS, MODULES, DEX_FUNCTIONS, parseAmount } from "../lib/contracts";
import { usePools } from "../hooks/usePools";
import TokenSelector from "./TokenSelector";

export default function SwapInterface() {
  const [amountIn, setAmountIn] = useState("");
  const [amountOut, setAmountOut] = useState("");
  const [isXtoY, setIsXtoY] = useState(true); // true: Token X to Token Y
  const [slippage, setSlippage] = useState("0.5"); // 0.5% default
  const [poolId, setPoolId] = useState("");
  const [loading, setLoading] = useState(false);

  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();
  const client = useIotaClient();
  const { pools, loading: poolsLoading } = usePools();

  // Token selector modal state for selecting 'From' or 'To' token
  const [showTokenSelector, setShowTokenSelector] = useState(false);
  const [selectingFor, setSelectingFor] = useState<"from" | "to" | null>(null);

  // Token types/symbols to display (derived from selected pool by default)
  const [tokenFromType, setTokenFromType] = useState<string | null>(null);
  const [tokenFromSymbol, setTokenFromSymbol] = useState<string | null>(null);
  const [tokenToType, setTokenToType] = useState<string | null>(null);
  const [tokenToSymbol, setTokenToSymbol] = useState<string | null>(null);

  // Balances map for quick display
  const [balancesMap, setBalancesMap] = useState<Record<string, string>>({});

  const tokenCandidates = pools
    .flatMap((p) => [
      { type: p.tokenX, symbol: p.tokenXSymbol || p.tokenX },
      { type: p.tokenY, symbol: p.tokenYSymbol || p.tokenY },
    ])
    .reduce((acc: { type: string; symbol: string }[], t) => {
      if (!acc.find((x) => x.type === t.type)) acc.push(t);
      return acc;
    }, [] as { type: string; symbol: string }[]);

  // Fetch balances for chosen tokens when pool or account changes
  const fetchBalances = useCallback(async () => {
    if (!client || !currentAccount) return;
    const map: Record<string, string> = { ...(balancesMap || {}) };
    const typesToFetch = new Set<string>();
    if (tokenFromType) typesToFetch.add(tokenFromType);
    if (tokenToType) typesToFetch.add(tokenToType);
    // also fetch all candidate tokens for selector quick view
    tokenCandidates.forEach((t) => typesToFetch.add(t.type));

    await Promise.all(
      Array.from(typesToFetch).map(async (t) => {
        try {
          if (t === "0x2::iota::IOTA") {
            // Try SDK getBalance first, but if it doesn't return a numeric total,
            // fall back to summing coins (so we don't set 0 prematurely).
            try {
              const bal = await (client as unknown as { getBalance?: (opts: { owner: string }) => Promise<{ total?: number | string } | undefined> }).getBalance?.({ owner: currentAccount.address });
              if (bal && typeof bal === "object" && (typeof bal.total === "number" || typeof bal.total === "string")) {
                map[t] = String(bal.total ?? 0);
                return;
              }
            } catch {
              // ignore and fall back to coins
            }
            // fall through to summing coins below
          }

          const resp = await client.getCoins({ owner: currentAccount.address, coinType: t });
          const total = (resp.data || []).reduce((acc: bigint, c: unknown) => {
            const balanceVal = (c as { balance?: string | number } | undefined)?.balance ?? 0;
            return acc + BigInt(String(balanceVal));
          }, BigInt(0));
          map[t] = total.toString();
        } catch {
          map[t] = map[t] || "0";
        }
      })
    );

    setBalancesMap(map);
  }, [client, currentAccount, tokenFromType, tokenToType, /* tokenCandidates derived from pools */ balancesMap, tokenCandidates]);


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
        const isTokenXIota = pool.tokenX === "0x2::iota::IOTA";

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
        const isTokenYIota = pool.tokenY === "0x2::iota::IOTA";

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
    setIsXtoY(!isXtoY);
    // swap typed tokens and symbols so the UI reflects the new direction
    setTokenFromType((prevFrom) => {
      const prevTo = tokenToType;
      return prevTo ?? prevFrom;
    });
    setTokenToType((prevTo) => {
      const prevFrom = tokenFromType;
      return prevFrom ?? prevTo;
    });
    setTokenFromSymbol((prevFromSym) => {
      const prevToSym = tokenToSymbol;
      return prevToSym ?? prevFromSym;
    });
    setTokenToSymbol((prevToSym) => {
      const prevFromSym = tokenFromSymbol;
      return prevFromSym ?? prevToSym;
    });

    // swap amounts
    setAmountIn(amountOut);
    setAmountOut(amountIn);

    // refetch balances so displayed balances update for the newly selected 'from' token
    void fetchBalances();
  };

  // Update tokens when pool changes
  

  // Effect: when pool selected, set token types
  useEffect(() => {
    if (!poolId) return;
    const p = pools.find((x) => x.poolId === poolId);
    if (!p) return;
    setTokenFromType(p.tokenX);
    setTokenFromSymbol(p.tokenXSymbol || (p.tokenX.split("::").pop() ?? null));
    setTokenToType(p.tokenY);
    setTokenToSymbol(p.tokenYSymbol || (p.tokenY.split("::").pop() ?? null));
    // fetch balances for these tokens
    void fetchBalances();
  }, [poolId, pools, fetchBalances]);

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
      return n.toLocaleString(undefined, { maximumFractionDigits: maxFraction });
    } catch {
      // fallback
      return "0";
    }
  };

  // Shorten a Move type string like "0x5fd5...::kanari::KANARI" -> "kanari::KANARI"
  const shortType = (t?: string | null) => {
    if (!t) return "";
    try {
      const parts = t.split("::");
      if (parts.length >= 2) return parts.slice(-2).join("::");
      return t;
    } catch {
      return t;
    }
  };

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

      const feeBps = Number(pool.feeBps || 50);
      const BASIS = BigInt(10000);

      // set which side is in/out depending on direction
      const balanceIn = isXtoY ? reserveX : reserveY;
      const balanceOut = isXtoY ? reserveY : reserveX;

      if (balanceIn <= BigInt(0) || balanceOut <= BigInt(0)) {
        setAmountOut("");
        return;
      }

      // amount_in_with_fee = rawIn * (BASIS - feeBps)
      const amountInWithFee = rawIn * BigInt(BASIS - BigInt(feeBps));

      const numerator = amountInWithFee * balanceOut;
      const denominator = balanceIn * BASIS + amountInWithFee;
      if (denominator === BigInt(0)) {
        setAmountOut("");
        return;
      }

      const outRaw = numerator / denominator;

      // format human output (special-case IOTA to show integer)
      const toType = isXtoY ? pool.tokenY : pool.tokenX;
      if (toType === "0x2::iota::IOTA") {
        // show integer IOTA units
        const humanFloor = Number(outRaw / BigInt(1e9));
        setAmountOut(String(humanFloor));
      } else {
        setAmountOut(humanFromRaw(outRaw, 9, 6));
      }
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
    if (t === "0x2::iota::IOTA") {
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

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 max-w-md w-full">
      <h2 className="text-2xl font-bold mb-6 text-gray-900">Swap Tokens</h2>

      {/* Pool Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-gray-700">
          Select Pool
        </label>
        {poolsLoading ? (
          <div className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 text-gray-500 text-center">
            Loading pools...
          </div>
        ) : pools.length > 0 ? (
          <select
            value={poolId}
            onChange={(e) => setPoolId(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a pool...</option>
            {pools.map((pool) => (
              <option key={pool.poolId} value={pool.poolId}>
                {pool.tokenXSymbol}/{pool.tokenYSymbol} - {pool.poolId.slice(0, 8)}...{pool.poolId.slice(-6)} - Fee: {(parseInt(pool.feeBps) / 100).toFixed(2)}%
                {pool.reserveX && pool.reserveY && (
                  ` - TVL: ${(parseInt(pool.reserveX) / 1e9).toFixed(2)} ${pool.tokenXSymbol} / ${(parseInt(pool.reserveY) / 1e9).toFixed(2)} ${pool.tokenYSymbol}`
                )}
              </option>
            ))}
          </select>
        ) : (
          <div className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 text-gray-700 text-sm">
            ⚠️ No pools found. Please create a pool first.
          </div>
        )}
      </div>

      {/* From Token */}
      <div className="bg-gray-50 rounded-xl p-4 mb-2 relative">
        <div className="flex justify-between mb-2">
          <span className="text-sm text-gray-600">From</span>
        </div>

        {/* token badge top-right */}
        <button
          onClick={() => { setSelectingFor("from"); setShowTokenSelector(true); }}
          className="absolute top-4 right-4 flex items-center gap-3 px-3 py-2 rounded-lg bg-white text-sm font-medium text-gray-900"
        >
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
            {(tokenFromSymbol && tokenFromSymbol[0]) || "T"}
          </div>
          <div className="text-left">
            <div className="font-semibold text-sm leading-tight">{tokenFromSymbol ?? (pools.find(p => p.poolId === poolId)?.tokenXSymbol) ?? (isXtoY ? "Token X" : "Token Y")}</div>
            <div
              className="text-xs text-gray-500 truncate max-w-60"
              title={shortType(tokenFromType ?? pools.find(p => p.poolId === poolId)?.tokenX)}
            >
              {shortType(tokenFromType ?? pools.find(p => p.poolId === poolId)?.tokenX)}
            </div>
          </div>
        </button>

        <div className="flex items-start gap-4">
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
            placeholder="0.0"
            className="flex-1 text-3xl font-semibold bg-transparent border-none outline-none text-gray-900"
          />
        </div>

        <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
          <div>
            Balance: {formatBalance(tokenFromType)} {tokenFromSymbol ?? pools.find(p => p.poolId === poolId)?.tokenXSymbol}
          </div>
          <div className="flex gap-6">
            <button onClick={handleHalf} className="px-3 py-1 rounded-lg bg-transparent hover:bg-gray-100">50%</button>
            <button onClick={handleMax} className="px-3 py-1 rounded-lg bg-transparent hover:bg-gray-100">Max</button>
          </div>
        </div>
      </div>

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
      <div className="bg-gray-50 rounded-xl p-4 mb-4 relative">
        <div className="flex justify-between mb-2">
          <span className="text-sm text-gray-600">To</span>
        </div>

        {/* token badge top-right */}
        <button
          onClick={() => { setSelectingFor("to"); setShowTokenSelector(true); }}
          className="absolute top-4 right-4 flex items-center gap-3 px-3 py-2 rounded-lg bg-white text-sm font-medium text-gray-900"
        >
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
            {(tokenToSymbol && tokenToSymbol[0]) || "T"}
          </div>
          <div className="text-left">
            <div className="font-semibold text-sm leading-tight">{tokenToSymbol ?? (pools.find(p => p.poolId === poolId)?.tokenYSymbol) ?? (isXtoY ? "Token Y" : "Token X")}</div>
            <div
              className="text-xs text-gray-500 truncate max-w-60"
              title={shortType(tokenToType ?? pools.find(p => p.poolId === poolId)?.tokenY)}
            >
              {shortType(tokenToType ?? pools.find(p => p.poolId === poolId)?.tokenY)}
            </div>
          </div>
        </button>

        <div className="flex items-start gap-4">
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={amountOut}
            onChange={(e) => setAmountOut(e.target.value)}
            placeholder="0.0"
            className="flex-1 text-3xl font-semibold bg-transparent border-none outline-none text-gray-900"
          />
        </div>

        <div className="mt-3 text-sm text-gray-600 flex items-center justify-between">
          <div>
            Balance: {formatBalance(tokenToType)} {tokenToSymbol ?? pools.find(p => p.poolId === poolId)?.tokenYSymbol}
          </div>
        </div>
      </div>

      <TokenSelector
        isOpen={showTokenSelector}
        onClose={() => setShowTokenSelector(false)}
        tokens={tokenCandidates.map((t) => ({ type: t.type, symbol: t.symbol }))}
        onSelect={(type, symbol) => {
          if (selectingFor === "from") {
            setTokenFromType(type);
            setTokenFromSymbol(symbol);
          } else if (selectingFor === "to") {
            setTokenToType(type);
            setTokenToSymbol(symbol);
          }
          setShowTokenSelector(false);
          void fetchBalances();
        }}
      />

      {/* Slippage */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-gray-700">
          Slippage Tolerance (%)
        </label>
        <div className="flex gap-2">
          {["0.1", "0.5", "1.0"].map((value) => (
            <button
              key={value}
              onClick={() => setSlippage(value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${slippage === value
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
            >
              {value}%
            </button>
          ))}
          <input
            type="number"
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
            className="w-28 text-center px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm"
            placeholder="Custom"
          />
        </div>
      </div>

      {/* Swap Button */}
      <button
        onClick={handleSwap}
        disabled={loading || !currentAccount || !amountIn || !poolId}
        className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-semibold py-4 rounded-xl transition-colors disabled:cursor-not-allowed"
      >
        {loading ? "Swapping..." : !currentAccount ? "Connect Wallet" : "Swap"}
      </button>
    </div>
  );
}
