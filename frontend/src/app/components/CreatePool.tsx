"use client";

import { useState } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { CONTRACTS, MODULES, DEX_FUNCTIONS } from "../lib/contracts";

export default function CreatePool() {
  const [feeType, setFeeType] = useState<"low" | "med" | "high">("med");
  const [loading, setLoading] = useState(false);
  
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();

  const feeValues = {
    low: { bps: CONTRACTS.FEE_LOW, display: "0.1%" },
    med: { bps: CONTRACTS.FEE_MED, display: "0.5%" },
    high: { bps: CONTRACTS.FEE_HIGH, display: "1.0%" },
  };

  const handleCreatePool = async () => {
    if (!currentAccount) {
      alert("Please connect your wallet");
      return;
    }

    setLoading(true);
    try {
      const tx = new Transaction();
      
      const feeBps = feeValues[feeType].bps;

      tx.moveCall({
        target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX_FACTORY}::${DEX_FUNCTIONS.CREATE_POOL}`,
        arguments: [
          tx.pure.u64(feeBps),
        ],
        typeArguments: [CONTRACTS.KANARI.TYPE, CONTRACTS.IOTA.TYPE],
      });

      signAndExecute(
        {
          transaction: tx,
        },
        {
          onSuccess: (result) => {
            console.log("Pool created successfully:", result);
            alert(`Pool created successfully! Digest: ${result.digest}\n\nPlease check the transaction to get Pool ID and Registry ID from created objects.`);
          },
          onError: (error) => {
            console.error("Pool creation failed:", error);
            alert(`Failed to create pool: ${error.message}`);
          },
        }
      );
    } catch (error) {
      console.error("Error creating pool:", error);
      alert(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 max-w-md w-full">
      <h2 className="text-2xl font-bold mb-6 text-zinc-900 dark:text-white">Create New Pool</h2>
      
      <div className="mb-6">
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          Create a new liquidity pool for KANARI/IOTA pair
        </p>
        
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Important</p>
              <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                After creating the pool, save the Pool ID and Registry ID from the transaction result. You'll need them to add liquidity.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-3 text-zinc-700 dark:text-zinc-300">
          Select Fee Tier
        </label>
        <div className="space-y-3">
          {(Object.keys(feeValues) as Array<keyof typeof feeValues>).map((key) => (
            <button
              key={key}
              onClick={() => setFeeType(key)}
              className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                feeType === key
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold text-zinc-900 dark:text-white">
                    {feeValues[key].display} Fee
                  </div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                    {key === "low" && "Best for stablecoin pairs"}
                    {key === "med" && "Best for most pairs"}
                    {key === "high" && "Best for exotic pairs"}
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    feeType === key
                      ? "border-blue-500 bg-blue-500"
                      : "border-zinc-300 dark:border-zinc-600"
                  }`}
                >
                  {feeType === key && (
                    <div className="w-2 h-2 bg-white rounded-full" />
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4 mb-6">
        <h3 className="font-medium text-zinc-900 dark:text-white mb-2">Pool Details</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-600 dark:text-zinc-400">Token X:</span>
            <span className="font-medium text-zinc-900 dark:text-white">KANARI</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-600 dark:text-zinc-400">Token Y:</span>
            <span className="font-medium text-zinc-900 dark:text-white">IOTA</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-600 dark:text-zinc-400">Fee:</span>
            <span className="font-medium text-zinc-900 dark:text-white">{feeValues[feeType].display}</span>
          </div>
        </div>
      </div>

      <button
        onClick={handleCreatePool}
        disabled={loading || !currentAccount}
        className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-300 disabled:dark:bg-zinc-700 text-white font-semibold py-4 rounded-xl transition-colors disabled:cursor-not-allowed"
      >
        {loading ? "Creating Pool..." : !currentAccount ? "Connect Wallet" : "Create Pool"}
      </button>
    </div>
  );
}
