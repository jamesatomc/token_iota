"use client";

import { useCurrentAccount, useIotaClient, useIotaClientQuery } from "@iota/dapp-kit";
import { CONTRACTS, formatAmount, computeActiveLpSupply } from "../lib/contracts";
import { useEffect, useState } from "react";

export default function WalletBalance() {
  const currentAccount = useCurrentAccount();
  const client = useIotaClient();

  const [viewedPool, setViewedPool] = useState<{ poolId: string; burnAddr?: string; burnedAmount?: string; activeLp?: string; lpSupply?: string } | null>(null);

  // Fetch IOTA balance
  const { data: iotaBalance } = useIotaClientQuery(
    "getBalance",
    {
      owner: currentAccount?.address || "",
      coinType: CONTRACTS.IOTA.TYPE,
    },
    {
      enabled: !!currentAccount,
    }
  );

  // Fetch KANARI balance
  const { data: kanariBalance } = useIotaClientQuery(
    "getBalance",
    {
      owner: currentAccount?.address || "",
      coinType: CONTRACTS.KANARI.TYPE,
    },
    {
      enabled: !!currentAccount,
    }
  );

  // try to show burn/reserved LP info for the last-viewed pool (set by PoolInfo)
  useEffect(() => {
    const load = async () => {
      try {
        const pid = localStorage.getItem("lastViewedPoolId");
        if (!pid) return;
        // fetch pool object
        const poolObj = await client.getObject({ id: pid, options: { showContent: true, showType: true } });
        if (poolObj.data?.content?.dataType !== "moveObject") return;
        const fields = poolObj.data.content.fields as Record<string, unknown> | undefined;
        const lpSupplyStr = String((fields?.['lp_supply'] as string) ?? "0");

        // extract burn reserve address similarly to PoolInfo
        const rawBurn = fields?.['burn_reserve'];
        let burnAddr: string | null = null;
        if (typeof rawBurn === 'string') {
          burnAddr = rawBurn;
        } else if (rawBurn && typeof rawBurn === 'object') {
          const rb = rawBurn as Record<string, unknown>;
          if (typeof rb['Some'] === 'string') burnAddr = rb['Some'] as string;
          else if (typeof rb['some'] === 'string') burnAddr = rb['some'] as string;
          else if (typeof rb['value'] === 'string') burnAddr = rb['value'] as string;
          else {
            const keys = Object.keys(rb);
            if (keys.length === 1 && typeof rb[keys[0]] === 'string') burnAddr = rb[keys[0]] as string;
          }
        }

        let burnedAmount = "0";
        if (burnAddr) {
          try {
            const b = await client.getObject({ id: burnAddr, options: { showContent: true } });
            if (b.data?.content?.dataType === "moveObject") {
              const bf = b.data.content.fields as Record<string, unknown> | undefined;
              if (bf && bf['amount'] !== undefined) burnedAmount = String(bf['amount']);
            }
          } catch (err) {
            console.warn("Failed to load burn object in WalletBalance:", err);
          }
        }

        // compute active LP
        try {
          const total = BigInt(lpSupplyStr || "0");
          const reserved = BigInt(burnedAmount || "0");
          const active = computeActiveLpSupply(total, reserved);
          setViewedPool({ poolId: pid, burnAddr: burnAddr ?? undefined, burnedAmount: burnedAmount, activeLp: String(active.toString()), lpSupply: lpSupplyStr });
        } catch {
          setViewedPool({ poolId: pid, burnAddr: burnAddr ?? undefined, burnedAmount: burnedAmount, activeLp: undefined, lpSupply: lpSupplyStr });
        }
      } catch {
        // ignore
      }
    };
    void load();
  }, [client]);

  if (!currentAccount) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-lg border border-zinc-200 dark:border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">Your Balances</h3>
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">IOTA</span>
          <span className="text-sm font-mono font-semibold text-zinc-900 dark:text-white">
            {iotaBalance ? formatAmount(BigInt(iotaBalance.totalBalance)) : "0.000000000"}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">KANARI</span>
          <span className="text-sm font-mono font-semibold text-zinc-900 dark:text-white">
            {kanariBalance ? formatAmount(BigInt(kanariBalance.totalBalance)) : "0.000000000"}
          </span>
        </div>
      </div>
      {/* Pool burn/reserved info for last viewed pool (set in PoolInfo) */}
      {viewedPool && (
        <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-500 dark:text-zinc-500">Last viewed pool</span>
            <span className="font-mono text-zinc-700 dark:text-zinc-300">
              {viewedPool.poolId.slice(0, 6)}...{viewedPool.poolId.slice(-4)}
            </span>
          </div>
          <div className="mt-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-zinc-600">Burn Reserve</span>
              <span className="font-mono text-zinc-700">{viewedPool.burnAddr ? `${viewedPool.burnAddr.slice(0,6)}...${viewedPool.burnAddr.slice(-4)}` : "—"}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-zinc-600">Burned LP</span>
              <span className="font-mono font-semibold">{viewedPool.burnedAmount ? formatAmount(BigInt(viewedPool.burnedAmount)) : "0"}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-zinc-600">Active LP</span>
              <span className="font-mono font-semibold">{viewedPool.activeLp ? formatAmount(BigInt(viewedPool.activeLp)) : viewedPool.lpSupply ? formatAmount(BigInt(viewedPool.lpSupply)) : "0"}</span>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex justify-between items-center text-xs">
          <span className="text-zinc-500 dark:text-zinc-500">Address</span>
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {currentAccount.address.slice(0, 6)}...{currentAccount.address.slice(-4)}
          </span>
        </div>
      </div>
    </div>
  );
}
