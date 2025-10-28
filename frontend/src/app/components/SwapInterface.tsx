"use client";

import { useState } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount, useIotaClient } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { CONTRACTS, MODULES, DEX_FUNCTIONS, parseAmount, formatAmount } from "../lib/contracts";
import { usePools } from "../hooks/usePools";

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
    setAmountIn(amountOut);
    setAmountOut(amountIn);
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 max-w-md w-full">
      <h2 className="text-2xl font-bold mb-6 text-zinc-900 dark:text-white">Swap Tokens</h2>
      
      {/* Pool Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">
          Select Pool
        </label>
        {poolsLoading ? (
          <div className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-center">
            Loading pools...
          </div>
        ) : pools.length > 0 ? (
          <select
            value={poolId}
            onChange={(e) => setPoolId(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <div className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm">
            ⚠️ No pools found. Please create a pool first.
          </div>
        )}
      </div>

      {/* From Token */}
      <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4 mb-2">
        <div className="flex justify-between mb-2">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">From</span>
          <span className="text-sm font-medium text-zinc-900 dark:text-white">
            {poolId && pools.find(p => p.poolId === poolId) 
              ? (isXtoY ? pools.find(p => p.poolId === poolId)?.tokenXSymbol : pools.find(p => p.poolId === poolId)?.tokenYSymbol)
              : (isXtoY ? "Token X" : "Token Y")}
          </span>
        </div>
        <input
          type="number"
          value={amountIn}
          onChange={(e) => setAmountIn(e.target.value)}
          placeholder="0.0"
          className="w-full text-2xl font-semibold bg-transparent border-none outline-none text-zinc-900 dark:text-white"
        />
      </div>

      {/* Switch Button */}
      <div className="flex justify-center -my-2 relative z-10">
        <button
          onClick={switchDirection}
          className="bg-white dark:bg-zinc-800 border-4 border-zinc-50 dark:border-zinc-900 rounded-full p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
        >
          <svg className="w-6 h-6 text-zinc-600 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
      </div>

      {/* To Token */}
      <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4 mb-4">
        <div className="flex justify-between mb-2">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">To</span>
          <span className="text-sm font-medium text-zinc-900 dark:text-white">
            {poolId && pools.find(p => p.poolId === poolId) 
              ? (isXtoY ? pools.find(p => p.poolId === poolId)?.tokenYSymbol : pools.find(p => p.poolId === poolId)?.tokenXSymbol)
              : (isXtoY ? "Token Y" : "Token X")}
          </span>
        </div>
        <input
          type="number"
          value={amountOut}
          onChange={(e) => setAmountOut(e.target.value)}
          placeholder="0.0"
          className="w-full text-2xl font-semibold bg-transparent border-none outline-none text-zinc-900 dark:text-white"
        />
      </div>

      {/* Slippage */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">
          Slippage Tolerance (%)
        </label>
        <div className="flex gap-2">
          {["0.1", "0.5", "1.0"].map((value) => (
            <button
              key={value}
              onClick={() => setSlippage(value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                slippage === value
                  ? "bg-blue-500 text-white"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >
              {value}%
            </button>
          ))}
          <input
            type="number"
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
            className="flex-1 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm"
            placeholder="Custom"
          />
        </div>
      </div>

      {/* Swap Button */}
      <button
        onClick={handleSwap}
        disabled={loading || !currentAccount || !amountIn || !poolId}
        className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-300 disabled:dark:bg-zinc-700 text-white font-semibold py-4 rounded-xl transition-colors disabled:cursor-not-allowed"
      >
        {loading ? "Swapping..." : !currentAccount ? "Connect Wallet" : "Swap"}
      </button>
    </div>
  );
}
