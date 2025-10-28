"use client";

import { useState } from "react";
import { useCurrentAccount, useIotaClient } from "@iota/dapp-kit";
import { formatAmount } from "../lib/contracts";

interface PoolData {
  balance_x: string;
  balance_y: string;
  fee_bps: string;
  lp_supply: string;
}

interface RawFields {
  balance_x?: string | number;
  balance_y?: string | number;
  fee_bps?: string | number;
  lp_supply?: string | number;
}

export default function PoolInfo() {
  const [poolId, setPoolId] = useState("");
  const [poolData, setPoolData] = useState<PoolData | null>(null);
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
        const fields = poolObject.data.content.fields as RawFields | undefined;

        setPoolData({
          balance_x: String(fields?.balance_x ?? "0"),
          balance_y: String(fields?.balance_y ?? "0"),
          fee_bps: String(fields?.fee_bps ?? "0"),
          lp_supply: String(fields?.lp_supply ?? "0"),
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

  const toAmount = (s: string) => {
    if (!s) return 0;
    // if it's an integer string, prefer BigInt to preserve precision
    if (/^\d+$/.test(s)) {
      try {
        return BigInt(s);
      } catch {
        const n = Number(s);
        return isNaN(n) ? 0 : n;
      }
    }
    const n = Number(s);
    return isNaN(n) ? 0 : n;
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 max-w-md w-full">
      <h2 className="text-2xl font-bold mb-6 text-gray-900">Pool Information</h2>
      
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-zinc-700">
          Pool ID
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={poolId}
            onChange={(e) => setPoolId(e.target.value)}
            placeholder="0x..."
            className="flex-1 px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            onClick={fetchPoolInfo}
            disabled={loading || !poolId}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? "..." : "Fetch"}
          </button>
        </div>
      </div>
 
      {poolData && (
        <div className="space-y-4">
          {/* Reserves */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Reserves</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">KANARI</span>
                <span className="font-mono font-semibold text-gray-900">
                  {formatAmount(toAmount(poolData.balance_x))}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">IOTA</span>
                <span className="font-mono font-semibold text-gray-900">
                  {formatAmount(toAmount(poolData.balance_y))}
                </span>
              </div>
            </div>
          </div>
 
          {/* Prices */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Prices</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">1 IOTA =</span>
                <span className="font-mono font-semibold text-gray-900">
                  {prices.kanariPerIota} KANARI
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">1 KANARI =</span>
                <span className="font-mono font-semibold text-gray-900">
                  {prices.iotaPerKanari} IOTA
                </span>
              </div>
            </div>
          </div>
 
          {/* Pool Stats */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Pool Stats</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">LP Supply</span>
                <span className="font-mono font-semibold text-gray-900">
                  {formatAmount(toAmount(poolData.lp_supply))}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Fee</span>
                <span className="font-mono font-semibold text-gray-900">
                  {(parseInt(poolData.fee_bps) / 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">TVL (USD)</span>
                <span className="font-mono font-semibold text-gray-900">
                  ${((parseFloat(formatAmount(toAmount(poolData.balance_y))) * 0.15) * 2).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
 
          {/* Share Calculator (if user has LP tokens) */}
          {currentAccount && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Your Position</h3>
              <p className="text-sm text-gray-700">
                Connect your wallet and check your LP tokens to see your pool share.
              </p>
            </div>
          )}
        </div>
      )}
 
      {!poolData && !loading && (
        <div className="text-center py-12 text-gray-500">
          Enter a pool ID to view information
        </div>
      )}
    </div>
  );
}
