"use client";

import { useState, useMemo } from "react";
import { useCurrentAccount, useIotaClient } from "@iota/dapp-kit";
import { formatAmount as rawFormatAmount } from "../lib/contracts";

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
  token_x?: string | number;
  token_y?: string | number;
}

// helper moved out to avoid recreation on every render
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

// lightweight wrapper to keep formatting consistent
const formatAmount = (v: unknown): string => {
  try {
    // cast the imported formatter to a function that accepts unknown to avoid explicit `any`
    const fn = rawFormatAmount as (arg: unknown) => string;
    return fn(v);
  } catch {
    return String(v);
  }
};

export default function PoolInfo() {
  const [poolId, setPoolId] = useState("");
  const [poolData, setPoolData] = useState<PoolData | null>(null);
  const [loading, setLoading] = useState(false);
  // new: labels for tokens (defaults kept for backward compatibility)
  const [tokenXLabel, setTokenXLabel] = useState("KANARI");
  const [tokenYLabel, setTokenYLabel] = useState("IOTA");

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

        // detect token labels:
        // priority: fields.token_x / fields.token_y
        // fallback: try to parse a type string for generics like <TokenA, TokenB>
        // otherwise keep defaults
        let xLabel = fields?.token_x ? String(fields.token_x) : undefined;
        let yLabel = fields?.token_y ? String(fields.token_y) : undefined;
        if (!xLabel || !yLabel) {
          const typeStr =
            String(poolObject.data?.type ?? poolObject.data?.content?.type ?? "");
          const matches = typeStr.match(/<\s*([^,>]+)\s*,\s*([^>]+)\s*>/);
          if (matches) {
            xLabel = xLabel ?? matches[1].split("::").pop()?.trim();
            yLabel = yLabel ?? matches[2].split("::").pop()?.trim();
          } else if (typeStr) {
            // fallback: try to extract last segments split by commas or generics-like text
            const parts = typeStr.split(/[,<>]/).map((s) => s.trim()).filter(Boolean);
            if (parts.length >= 2) {
              xLabel = xLabel ?? parts[parts.length - 2].split("::").pop()?.trim();
              yLabel = yLabel ?? parts[parts.length - 1].split("::").pop()?.trim();
            }
          }
        }
        if (xLabel) setTokenXLabel(xLabel.toUpperCase());
        if (yLabel) setTokenYLabel(yLabel.toUpperCase());

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

  // useMemo to avoid recalculating on each render
  const memoValues = useMemo(() => {
    if (!poolData) {
      return {
        kanariPerIota: "0",
        iotaPerKanari: "0",
        balanceXFormatted: "0",
        balanceYFormatted: "0",
        lpSupplyFormatted: "0",
        feePercent: "0",
        tvlUsd: "0.00",
      };
    }

    const balanceXNum = Number(poolData.balance_x);
    const balanceYNum = Number(poolData.balance_y);

    const kanariPerIota =
      balanceYNum === 0 ? "0" : (balanceXNum / balanceYNum).toFixed(6);
    const iotaPerKanari =
      balanceXNum === 0 ? "0" : (balanceYNum / balanceXNum).toFixed(6);

    const balanceXFormatted = formatAmount(toAmount(poolData.balance_x));
    const balanceYFormatted = formatAmount(toAmount(poolData.balance_y));
    const lpSupplyFormatted = formatAmount(toAmount(poolData.lp_supply));

    const feePercent = isNaN(parseInt(poolData.fee_bps))
      ? "0"
      : (parseInt(poolData.fee_bps) / 100).toFixed(2);

    // TVL: keep simple — use balance_y * 0.15 * 2 (as original) but ensure numeric
    const tvl =
      Number(String(formatAmount(toAmount(poolData.balance_y))).replace(/,/g, "")) || 0;
    const tvlUsd = ((tvl * 0.15) * 2).toFixed(2);

    return {
      kanariPerIota,
      iotaPerKanari,
      balanceXFormatted,
      balanceYFormatted,
      lpSupplyFormatted,
      feePercent,
      tvlUsd,
    };
  }, [poolData]);

  return (
    // container: responsive padding, max width and centered
    <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 max-w-full sm:max-w-md md:max-w-lg w-full mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-gray-900">Pool Information</h2>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-zinc-700">
          Pool ID
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={poolId}
            onChange={(e) => setPoolId(e.target.value)}
            placeholder="0x..."
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 break-all"
          />
          <button
            onClick={fetchPoolInfo}
            disabled={loading || !poolId}
            className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? "..." : "Fetch"}
          </button>
        </div>
      </div>

      {poolData && (
        // grid: single column on mobile, two columns on small+ screens to save vertical space
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Reserves */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm sm:text-base">Reserves</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm sm:text-base">{tokenXLabel}</span>
                <span className="font-mono font-semibold text-gray-900 text-sm sm:text-base truncate max-w-[140px] text-right">
                  {memoValues.balanceXFormatted}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm sm:text-base">{tokenYLabel}</span>
                <span className="font-mono font-semibold text-gray-900 text-sm sm:text-base truncate max-w-[140px] text-right">
                  {memoValues.balanceYFormatted}
                </span>
              </div>
            </div>
          </div>

          {/* Prices */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm sm:text-base">Prices</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm sm:text-base">1 {tokenYLabel} =</span>
                <span className="font-mono font-semibold text-gray-900 text-sm sm:text-base">
                  {memoValues.kanariPerIota} {tokenXLabel}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm sm:text-base">1 {tokenXLabel} =</span>
                <span className="font-mono font-semibold text-gray-900 text-sm sm:text-base">
                  {memoValues.iotaPerKanari} {tokenYLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Pool Stats */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm sm:text-base">Pool Stats</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm sm:text-base">LP Supply</span>
                <span className="font-mono font-semibold text-gray-900 text-sm sm:text-base truncate max-w-[140px] text-right">
                  {memoValues.lpSupplyFormatted}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm sm:text-base">Fee</span>
                <span className="font-mono font-semibold text-gray-900 text-sm sm:text-base">
                  {memoValues.feePercent}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm sm:text-base">TVL (USD)</span>
                <span className="font-mono font-semibold text-gray-900 text-sm sm:text-base">
                  ${memoValues.tvlUsd}
                </span>
              </div>
            </div>
          </div>

          {/* Share Calculator (if user has LP tokens) */}
          {currentAccount && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 sm:col-span-2">
              <h3 className="font-semibold text-gray-900 mb-2 text-sm sm:text-base">Your Position</h3>
              <p className="text-sm text-gray-700">
                Connect your wallet and check your LP tokens to see your pool share.
              </p>
            </div>
          )}
        </div>
      )}

      {!poolData && !loading && (
        <div className="text-center py-12 text-gray-500 text-sm sm:text-base">
          Enter a pool ID to view information
        </div>
      )}
    </div>
  );
}
