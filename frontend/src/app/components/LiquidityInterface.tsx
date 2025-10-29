"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount, useIotaClient } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { CONTRACTS, MODULES, DEX_FUNCTIONS, parseAmount } from "../lib/contracts";
import { usePools } from "../hooks/usePools";

interface LPTokenInfo {
  objectId: string;
  amount: string;
}

// Minimal local types to avoid `any` in a couple of places
interface Coin {
  balance?: number | string;
  coinObjectId?: string;
}

interface IotaClientWithBalance {
  getBalance?: (opts: { owner: string }) => Promise<{ total?: number | string } | null>;
}

interface OwnedObject {
  data: {
    objectId: string;
    content?: {
      dataType?: string;
      // use unknown instead of any to avoid ESLint no-explicit-any
      fields?: { amount?: string } | Record<string, unknown>;
    };
  };
}

export default function LiquidityInterface() {
  const [tab, setTab] = useState<"add" | "remove">("add");
  const [amountX, setAmountX] = useState("");
  const [amountY, setAmountY] = useState("");
  // removed isEstimating state (was unused)
  const [selectedPool, setSelectedPool] = useState("");
  const [selectedLPToken, setSelectedLPToken] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [loading, setLoading] = useState(false);
  const [lpTokens, setLPTokens] = useState<LPTokenInfo[]>([]);
  
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();
  const client = useIotaClient();
  const { pools, loading: poolsLoading } = usePools();
  const [poolBalances, setPoolBalances] = useState<Record<string, string>>({});

  // memoize selected pool object to avoid repeated finds
  const selectedPoolObj = useMemo(() => pools.find((x) => x.poolId === selectedPool) ?? null, [pools, selectedPool]);

  // fetch balances for selected pool token types
  useEffect(() => {
    const fetch = async () => {
      if (!client || !currentAccount || !selectedPoolObj) {
        setPoolBalances({});
        return;
      }
      const p = selectedPoolObj;
      const types = [p.tokenX, p.tokenY];
      const map: Record<string, string> = {};
      await Promise.all(types.map(async (t) => {
        try {
          if (t === "0x2::iota::IOTA") {
            try {
              const c = client as unknown as IotaClientWithBalance;
              const bal = await c.getBalance?.({ owner: currentAccount.address });
              if (bal && typeof bal === 'object' && (typeof bal.total === 'number' || typeof bal.total === 'string')) {
                map[t] = String(bal.total ?? 0);
                return;
              }
            } catch {
              // ignore balance lookup errors
            }
          }
          const resp = await client.getCoins({ owner: currentAccount.address, coinType: t });
          const total = (resp.data || []).reduce((acc: bigint, c: Coin) => acc + BigInt(c.balance || 0), BigInt(0));
          map[t] = total.toString();
        } catch {
          map[t] = '0';
        }
      }));
      setPoolBalances(map);
    };
    void fetch();
  }, [client, currentAccount, selectedPoolObj, pools]);

  // helper that uses memoized selectedPoolObj
  const formatPoolBalance = useCallback((t?: string | null) => {
    if (!t) return '0';
    const raw = poolBalances[t];
    if (!raw) return '0';
    const human = Number(raw) / 1e9;
    if (t === '0x2::iota::IOTA') return Math.floor(human).toLocaleString(undefined, { maximumFractionDigits: 0 });
    return human.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }, [poolBalances]);

  const getPoolHumanBalance = (t?: string | null) => {
    if (!t) return 0;
    const raw = poolBalances[t];
    if (!raw) return 0;
    return Number(raw) / 1e9;
  };

  // helpers to convert between human string and raw BigInt (1e9 base)
  const rawFromHuman = (humanStr: string) => {
    try {
      const v = parseFloat(humanStr || "0");
      if (!isFinite(v) || v <= 0) return BigInt(0);
      return BigInt(Math.floor(v * 1e9));
    } catch {
      return BigInt(0);
    }
  };

  const humanFromRawBig = (raw: bigint, maxFrac = 6) => {
    try {
      const human = Number(raw) / 1e9;
      return human.toLocaleString(undefined, { maximumFractionDigits: maxFrac });
    } catch {
      return "0";
    }
  };

  // compute counterpart amount to keep pool ratio: out = in * reserveOut / reserveIn
  const computeCounterpart = (inHumanStr: string, fromIsX: boolean) => {
    if (!selectedPool) return "";
    const p = pools.find((x) => x.poolId === selectedPool);
    if (!p) return "";
    const reserveX = BigInt(p.reserveX || "0");
    const reserveY = BigInt(p.reserveY || "0");
    if (reserveX === BigInt(0) || reserveY === BigInt(0)) return "";

    const rawIn = rawFromHuman(inHumanStr);
    if (rawIn === BigInt(0)) return "";

    let outRaw = BigInt(0);
    if (fromIsX) {
      // outRaw = rawIn * reserveY / reserveX
      outRaw = (rawIn * reserveY) / reserveX;
    } else {
      // outRaw = rawIn * reserveX / reserveY
      outRaw = (rawIn * reserveX) / reserveY;
    }

    return humanFromRawBig(outRaw, 6);
  };

  // handlers that compute counterpart immediately
  const handleAmountXChange = (val: string) => {
    setAmountX(val);
    const other = computeCounterpart(val, true);
    setAmountY(other);
  };

  const handleAmountYChange = (val: string) => {
    setAmountY(val);
    const other = computeCounterpart(val, false);
    setAmountX(other);
  };

  // Fetch user's LP tokens for selected pool
  useEffect(() => {
    const fetchLPTokens = async () => {
      if (!currentAccount || !client || !selectedPool) return;

      try {
        // Find the selected pool's token types
        const pool = pools.find(p => p.poolId === selectedPool);
        if (!pool || !pool.tokenX || !pool.tokenY) {
          setLPTokens([]);
          return;
        }

        const lpTokenType = `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX}::LPToken<${pool.tokenX}, ${pool.tokenY}>`;
        
        const response = await client.getOwnedObjects({
          owner: currentAccount.address,
          filter: {
            StructType: lpTokenType,
          },
          options: {
            showContent: true,
            showType: true,
          },
        });

        const tokenData: LPTokenInfo[] = (response.data || [])
          .filter((obj) => obj.data?.content?.dataType === "moveObject")
          .map((obj) => {
            const o = obj as OwnedObject;
            return {
              objectId: o.data.objectId,
              amount: String(o.data.content?.fields?.amount ?? "0"),
            };
          });

        setLPTokens(tokenData);
        
        // Log for debugging
        console.log("Found LP tokens:", tokenData);
      } catch (error) {
        console.error("Error fetching LP tokens:", error);
      }
    };

    fetchLPTokens();
  }, [currentAccount, client, selectedPool, pools, tab]); // Re-fetch when pool changes

  const handleAddLiquidity = async () => {
    if (!currentAccount || !amountX || !amountY || !selectedPool) {
      alert("Please fill all fields and connect wallet");
      return;
    }

    // Find selected pool to get token types
    const pool = pools.find(p => p.poolId === selectedPool);
    if (!pool || !pool.tokenX || !pool.tokenY) {
      alert("Invalid pool selected");
      return;
    }

    // Validate amounts
    const amountXNum = parseFloat(amountX);
    const amountYNum = parseFloat(amountY);
    
    if (amountXNum <= 0 || amountYNum <= 0) {
      alert("Please enter valid amounts greater than 0");
      return;
    }

    // Check for potential overflow in Move contract
    const MAX_SAFE_AMOUNT = 4_000_000_000; // ~4 billion in human-readable units
    
    if (amountXNum > MAX_SAFE_AMOUNT || amountYNum > MAX_SAFE_AMOUNT) {
      alert(`Amount too large! Maximum supported: ${MAX_SAFE_AMOUNT.toLocaleString()} tokens per side`);
      return;
    }
    
    const productCheck = amountXNum * amountYNum;
    if (productCheck > 10_000_000_000_000) { // 10 trillion (10^13)
      alert("Product of amounts is too large! Try reducing both amounts.\nMax safe product: 10 trillion");
      return;
    }

    setLoading(true);
    try {
      const tx = new Transaction();
      
      const amountXParsed = parseAmount(amountX);
      const amountYParsed = parseAmount(amountY);
      
      console.log("Adding liquidity:", {
        tokenX: pool.tokenXSymbol,
        tokenY: pool.tokenYSymbol,
        amountX,
        amountY,
        amountXParsed,
        amountYParsed,
      });
      
      const minLpAmount = "0"; // Let contract decide minimum

      // Check if tokenX is IOTA (0x2::iota::IOTA)
      const isTokenXIota = pool.tokenX === "0x2::iota::IOTA";
      const isTokenYIota = pool.tokenY === "0x2::iota::IOTA";

      let coinX;
      let coinY;

      // Handle Token X
      if (isTokenXIota) {
        // Token X is IOTA - split from gas
        [coinX] = tx.splitCoins(tx.gas, [amountXParsed]);
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

        const totalTokenX = tokenXCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0));
        const requiredTokenX = BigInt(amountXParsed);
        
        if (totalTokenX < requiredTokenX) {
          alert(`Insufficient ${pool.tokenXSymbol} balance!\nYou have: ${Number(totalTokenX) / 1e9}\nRequired: ${amountXNum}`);
          setLoading(false);
          return;
        }

        const [primaryCoinX, ...restCoinsX] = tokenXCoins.data;
        
        if (restCoinsX.length > 0) {
          tx.mergeCoins(
            tx.object(primaryCoinX.coinObjectId),
            restCoinsX.map((coin) => tx.object(coin.coinObjectId))
          );
        }

        [coinX] = tx.splitCoins(tx.object(primaryCoinX.coinObjectId), [amountXParsed]);
      }

      // Handle Token Y
      if (isTokenYIota) {
        // Token Y is IOTA - split from gas
        [coinY] = tx.splitCoins(tx.gas, [amountYParsed]);
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

        const totalTokenY = tokenYCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0));
        const requiredTokenY = BigInt(amountYParsed);
        
        if (totalTokenY < requiredTokenY) {
          alert(`Insufficient ${pool.tokenYSymbol} balance!\nYou have: ${Number(totalTokenY) / 1e9}\nRequired: ${amountYNum}`);
          setLoading(false);
          return;
        }

        const [primaryCoinY, ...restCoinsY] = tokenYCoins.data;
        
        if (restCoinsY.length > 0) {
          tx.mergeCoins(
            tx.object(primaryCoinY.coinObjectId),
            restCoinsY.map((coin) => tx.object(coin.coinObjectId))
          );
        }

        [coinY] = tx.splitCoins(tx.object(primaryCoinY.coinObjectId), [amountYParsed]);
      }

      // Add liquidity with dynamic token types
      tx.moveCall({
        target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX_FACTORY}::${DEX_FUNCTIONS.ADD_LIQUIDITY}`,
        arguments: [
          tx.object(selectedPool),
          coinX,
          coinY,
          tx.pure.u64(minLpAmount),
        ],
        typeArguments: [pool.tokenX, pool.tokenY],
      });

      signAndExecute(
        {
          transaction: tx,
        },
        {
          onSuccess: (result) => {
            console.log("Add liquidity successful:", result);
            alert(`Liquidity added! Digest: ${result.digest}`);
            setAmountX("");
            setAmountY("");
          },
          onError: (error) => {
            console.error("Add liquidity failed:", error);
            alert(`Failed: ${error.message}`);
          },
        }
      );
    } catch (error) {
      console.error("Error:", error);
      alert(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!currentAccount || !selectedLPToken || !selectedPool) {
      alert("Please fill all fields and connect wallet");
      return;
    }

    // Find selected pool to get token types
    const pool = pools.find(p => p.poolId === selectedPool);
    if (!pool || !pool.tokenX || !pool.tokenY) {
      alert("Invalid pool selected");
      return;
    }

    // Validate that selectedLPToken looks like an object ID
    if (!selectedLPToken.startsWith("0x")) {
      alert("Please select a valid LP Token.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const tx = new Transaction();
      
      // Calculate minimum amounts (with slippage) - set to 0 for now
      const minAmountX = "0";
      const minAmountY = "0";

      tx.moveCall({
        target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX_FACTORY}::${DEX_FUNCTIONS.REMOVE_LIQUIDITY}`,
        arguments: [
          tx.object(selectedPool),
          tx.object(selectedLPToken), // LP Token object ID
          tx.pure.u64(minAmountX),
          tx.pure.u64(minAmountY),
        ],
        typeArguments: [pool.tokenX, pool.tokenY], // Use dynamic types
      });

      signAndExecute(
        {
          transaction: tx,
        },
        {
          onSuccess: (result) => {
            console.log("Remove liquidity successful:", result);
            alert(`Liquidity removed! Digest: ${result.digest}`);
            setSelectedLPToken("");
          },
          onError: (error) => {
            console.error("Remove liquidity failed:", error);
            alert(`Failed: ${error.message}`);
          },
        }
      );
    } catch (error) {
      console.error("Error:", error);
      alert(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // (estimation debounce removed - state was unused)

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 max-w-md w-full min-h-[560px]">
      <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setTab("add")}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            tab === "add"
              ? "bg-white text-gray-900 shadow"
              : "text-gray-600"
          }`}
        >
          Add Liquidity
        </button>
        <button
          onClick={() => setTab("remove")}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            tab === "remove"
              ? "bg-white text-gray-900 shadow"
              : "text-gray-600"
          }`}
        >
          Remove Liquidity
        </button>
      </div>

      {/* Pool Selection */}
      <div className="space-y-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-3 text-gray-700">
            Select Liquidity Pool
          </label>
          {poolsLoading ? (
            <div className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 text-gray-500 text-center">
              Loading pools...
            </div>
          ) : pools.length > 0 ? (
            <>
              <select
                value={selectedPool}
                onChange={(e) => setSelectedPool(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a pool...</option>
                {pools.map((pool) => (
                  <option key={pool.poolId} value={pool.poolId}>
                    {pool.tokenXSymbol}/{pool.tokenYSymbol} - {pool.poolId.slice(0, 8)}...{pool.poolId.slice(-6)} - Fee: {(parseInt(pool.feeBps) / 100).toFixed(2)}%
                  </option>
                ))}
              </select>

              {/* show chosen pool card */}
              {selectedPool && (() => {
                const p = pools.find((x) => x.poolId === selectedPool);
                if (!p) return null;
                return (
                  <div className="mt-4 bg-white rounded-lg p-4 border border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-2">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">{p.tokenXSymbol?.[0] ?? 'X'}</div>
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">{p.tokenYSymbol?.[0] ?? 'Y'}</div>
                      </div>
                      <div className="ml-3">
                        <div className="font-semibold">{p.tokenXSymbol}/{p.tokenYSymbol}</div>
                        <div className="text-xs text-gray-500">{p.tokenXSymbol} paired with native {p.tokenYSymbol} (Dev fee: {(parseInt(p.feeBps)/100).toFixed(1)}%)</div>
                      </div>
                    </div>

                    <div className="mt-4 bg-gray-50 rounded-md p-3">
                      <div className="font-medium mb-2">Pool Information</div>
                      <div className="text-sm text-gray-600 grid grid-cols-2 gap-2">
                        <div> {p.tokenXSymbol} Reserve</div>
                        <div className="text-right">{p.reserveX ? (Number(p.reserveX)/1e9).toString() : '0'} {p.tokenXSymbol}</div>
                        <div>{p.tokenYSymbol} Reserve</div>
                        <div className="text-right">{p.reserveY ? (Number(p.reserveY)/1e9).toString() : '0'} {p.tokenYSymbol}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <p className="mt-2 text-xs text-gray-500">
                ✅ {pools.length} pool{pools.length > 1 ? 's' : ''} available
              </p>
            </>
          ) : (
            <div className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 text-gray-700 text-sm">
              ⚠️ No pools found. Please create a pool first using the &quot;Create Pool&quot; tab.
            </div>
          )}
        </div>
      </div>

      {tab === "add" ? (
        <>
          {/* Token X Amount */}
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{selectedPool && pools.find(p => p.poolId === selectedPool)?.tokenXSymbol || "Token X"} Amount</div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400 flex items-center gap-3">
                <div>Balance: {selectedPool ? (formatPoolBalance(pools.find(p => p.poolId === selectedPool)?.tokenX) ) : '0' } {pools.find(p => p.poolId === selectedPool)?.tokenXSymbol}</div>
                <button onClick={async () => { const v = getPoolHumanBalance(pools.find(p => p.poolId === selectedPool)?.tokenX); handleAmountXChange(String(v)); }} className="text-xs px-2 py-1 rounded bg-transparent hover:bg-gray-100">Max</button>
                <button onClick={async () => { const v = getPoolHumanBalance(pools.find(p => p.poolId === selectedPool)?.tokenX); handleAmountXChange(String(v/2)); }} className="text-xs px-2 py-1 rounded bg-transparent hover:bg-gray-100">50%</button>
              </div>
            </div>
 
            {/* token row */}
            <div className="mt-3">
              <button onClick={() => { /* could open token selector for liquidity */ }} className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-white text-left">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">{pools.find(p => p.poolId === selectedPool)?.tokenXSymbol?.[0] ?? 'T'}</div>
                <div>
                  <div className="font-semibold">{pools.find(p => p.poolId === selectedPool)?.tokenXSymbol ?? 'Token X'}</div>
                  <div className="text-xs text-gray-500">{pools.find(p => p.poolId === selectedPool)?.tokenXSymbol}</div>
                </div>
                <div className="ml-auto text-zinc-400">⇩</div>
              </button>
            </div>
 
            <div className="mt-4 bg-white rounded-lg p-4">
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={amountX}
                onChange={(e) => handleAmountXChange(e.target.value)}
                placeholder="0.0"
                className="w-full text-3xl font-semibold text-right bg-transparent border-none outline-none text-zinc-900"
              />
            </div>
          </div>
 
          {/* Token Y Amount */}
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{selectedPool && pools.find(p => p.poolId === selectedPool)?.tokenYSymbol || "Token Y"} Amount</div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400 flex items-center gap-3">
                <div>Balance: {selectedPool ? (formatPoolBalance(pools.find(p => p.poolId === selectedPool)?.tokenY) ) : '0' } {pools.find(p => p.poolId === selectedPool)?.tokenYSymbol}</div>
                <button onClick={async () => { const v = getPoolHumanBalance(pools.find(p => p.poolId === selectedPool)?.tokenY); handleAmountYChange(String(v)); }} className="text-xs px-2 py-1 rounded bg-transparent hover:bg-gray-100">Max</button>
                <button onClick={async () => { const v = getPoolHumanBalance(pools.find(p => p.poolId === selectedPool)?.tokenY); handleAmountYChange(String(v/2)); }} className="text-xs px-2 py-1 rounded bg-transparent hover:bg-gray-100">50%</button>
              </div>
            </div>
 
            {/* token row */}
            <div className="mt-3">
              <button onClick={() => { /* token selector */ }} className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-white text-left">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">{pools.find(p => p.poolId === selectedPool)?.tokenYSymbol?.[0] ?? 'T'}</div>
                <div>
                  <div className="font-semibold">{pools.find(p => p.poolId === selectedPool)?.tokenYSymbol ?? 'Token Y'}</div>
                  <div className="text-xs text-gray-500">{pools.find(p => p.poolId === selectedPool)?.tokenYSymbol}</div>
                </div>
                <div className="ml-auto text-zinc-400">⇩</div>
              </button>
            </div>
 
            <div className="mt-4 bg-white rounded-lg p-4">
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={amountY}
                onChange={(e) => handleAmountYChange(e.target.value)}
                placeholder="0.0"
                className="w-full text-3xl font-semibold text-right bg-transparent border-none outline-none text-zinc-900"
              />
            </div>
          </div>
 
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
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    slippage === value
                      ? "bg-blue-600 text-white"
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
 
          <button
            onClick={handleAddLiquidity}
            disabled={loading || !currentAccount}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2"><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>Adding...</span>
            ) : !currentAccount ? "Connect Wallet" : "Add Liquidity"}
          </button>
        
        {/* estimation spinner state: small debounce while user types */}
        
        </>
      ) : (
        <>
          {/* LP Token Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-gray-700">
              Select LP Token to Remove
            </label>
            {lpTokens.length === 0 ? (
              <div className="text-sm text-gray-500 p-4 border border-gray-300 rounded-lg">
                 <p className="font-medium mb-2">⚠️ No LP tokens found</p>
                 <p className="text-xs">
                   Add liquidity to the current pool to receive LP tokens.
                   <br />
                   <span className="text-amber-600 dark:text-amber-400">
                     Note: LP tokens from old deployments won&apos;t work with the new pool.
                   </span>
                 </p>
               </div>
             ) : (
               <>
                 <select
                   value={selectedLPToken}
                   onChange={(e) => setSelectedLPToken(e.target.value)}
                   className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                 >
                   <option value="">Select LP token...</option>
                   {lpTokens.map((token) => (
                     <option key={token.objectId} value={token.objectId}>
                       {token.objectId.slice(0, 8)}... (Amount: {(parseInt(token.amount) / 1e9).toFixed(4)} LP)
                     </option>
                   ))}
                 </select>
                 <p className="mt-2 text-xs text-gray-500">
                   ℹ️ Found {lpTokens.length} LP token{lpTokens.length > 1 ? 's' : ''} from package: {CONTRACTS.PACKAGE_ID.slice(0, 8)}...
                 </p>
               </>
             )}
           </div>
 
          <button
            onClick={handleRemoveLiquidity}
            disabled={loading || !currentAccount || lpTokens.length === 0}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-200 text-white font-semibold py-4 rounded-xl transition-colors"
          >
            {loading ? "Removing..." : !currentAccount ? "Connect Wallet" : "Remove Liquidity"}
          </button>
        </>
      )}
    </div>
  );
}
