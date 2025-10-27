"use client";

import { useState } from "react";
import { useCurrentAccount, useIotaClient } from "@iota/dapp-kit";
import { CONTRACTS, formatAmount } from "../lib/contracts";

export default function PoolInfo() {
  const [poolId, setPoolId] = useState("");
  const [poolData, setPoolData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  const client = useIotaClient();
  const currentAccount = useCurrentAccount();

  const fetchPoolInfo = async () => {
    if (!poolId) {
      alert("Please enter a pool ID");
      return;
    }

    setLoading(true);
    try {
      // Fetch pool object
      const poolObject = await client.getObject({
        id: poolId,
        options: {
          showContent: true,
          showType: true,
        },
      });

      if (poolObject.data?.content?.dataType === "moveObject") {
        const fields = poolObject.data.content.fields as any;
        
        setPoolData({
          balance_x: fields.balance_x || "0",
          balance_y: fields.balance_y || "0",
          fee_bps: fields.fee_bps || "0",
          lp_supply: fields.lp_supply || "0",
        });
      } else {
        alert("Invalid pool object");
      }
    } catch (error) {
      console.error("Error fetching pool info:", error);
      alert(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const calculatePrice = () => {
    if (!poolData || poolData.balance_x === "0" || poolData.balance_y === "0") {
      return { kanariPerIota: "0", iotaPerKanari: "0" };
    }

    const balanceX = parseFloat(poolData.balance_x);
    const balanceY = parseFloat(poolData.balance_y);

    return {
      kanariPerIota: (balanceX / balanceY).toFixed(6),
      iotaPerKanari: (balanceY / balanceX).toFixed(6),
    };
  };

  const prices = calculatePrice();

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 max-w-md w-full">
      <h2 className="text-2xl font-bold mb-6 text-zinc-900 dark:text-white">Pool Information</h2>
      
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">
          Pool ID
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={poolId}
            onChange={(e) => setPoolId(e.target.value)}
            placeholder="0x..."
            className="flex-1 px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={fetchPoolInfo}
            disabled={loading || !poolId}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-300 disabled:dark:bg-zinc-700 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? "..." : "Fetch"}
          </button>
        </div>
      </div>

      {poolData && (
        <div className="space-y-4">
          {/* Reserves */}
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4">
            <h3 className="font-semibold text-zinc-900 dark:text-white mb-3">Reserves</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-zinc-600 dark:text-zinc-400">KANARI</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-white">
                  {formatAmount(poolData.balance_x)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-600 dark:text-zinc-400">IOTA</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-white">
                  {formatAmount(poolData.balance_y)}
                </span>
              </div>
            </div>
          </div>

          {/* Prices */}
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4">
            <h3 className="font-semibold text-zinc-900 dark:text-white mb-3">Prices</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-zinc-600 dark:text-zinc-400">1 IOTA =</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-white">
                  {prices.kanariPerIota} KANARI
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-600 dark:text-zinc-400">1 KANARI =</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-white">
                  {prices.iotaPerKanari} IOTA
                </span>
              </div>
            </div>
          </div>

          {/* Pool Stats */}
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4">
            <h3 className="font-semibold text-zinc-900 dark:text-white mb-3">Pool Stats</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-zinc-600 dark:text-zinc-400">LP Supply</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-white">
                  {formatAmount(poolData.lp_supply)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-600 dark:text-zinc-400">Fee</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-white">
                  {(parseInt(poolData.fee_bps) / 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-600 dark:text-zinc-400">TVL (USD)</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-white">
                  ${((parseFloat(formatAmount(poolData.balance_y)) * 0.15) * 2).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Share Calculator (if user has LP tokens) */}
          {currentAccount && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Your Position</h3>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Connect your wallet and check your LP tokens to see your pool share.
              </p>
            </div>
          )}
        </div>
      )}

      {!poolData && !loading && (
        <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
          Enter a pool ID to view information
        </div>
      )}
    </div>
  );
}
