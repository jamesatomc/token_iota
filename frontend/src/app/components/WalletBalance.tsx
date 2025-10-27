"use client";

import { useCurrentAccount, useIotaClientQuery } from "@iota/dapp-kit";
import { CONTRACTS, formatAmount } from "../lib/contracts";

export default function WalletBalance() {
  const currentAccount = useCurrentAccount();

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
