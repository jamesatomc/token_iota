"use client";

import { useState } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { CONTRACTS, MODULES, DEX_FUNCTIONS } from "../lib/contracts";
import TokenSelector from "./UI/TokenSelector";
import TokenPicker from "./UI/TokenPicker";
import { DEFAULT_TOKENS } from "../lib/contracts";
import Card from "./UI/Card";

export default function CreatePool() {
  const [feeType, setFeeType] = useState<"low" | "med" | "high">("med");
  const [tokenXType, setTokenXType] = useState(CONTRACTS.KANARI.TYPE);
  const [tokenYType, setTokenYType] = useState(CONTRACTS.IOTA.TYPE);
  const [loading, setLoading] = useState(false);
  const [showSelectorX, setShowSelectorX] = useState(false);
  const [showSelectorY, setShowSelectorY] = useState(false);


  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();

  // balances intentionally hidden in this UI

  const feeValues = {
    low: { bps: CONTRACTS.FEE_LOW, display: "0.1%" },
    med: { bps: CONTRACTS.FEE_MED, display: "0.5%" },
    high: { bps: CONTRACTS.FEE_HIGH, display: "1.0%" },
  };

  // default token list is provided by DEFAULT_TOKENS in contracts.ts

  const getSymbolForType = (t: string) => {
    if (!t) return "?";
    const found = DEFAULT_TOKENS.find((x) => x.type === t);
    if (found) return found.symbol;
    try {
      const raw = localStorage.getItem("dex:customTokens");
      if (raw) {
        const parsed = JSON.parse(raw) as Array<{ type: string; symbol: string }>;
        const hit = parsed.find((p) => p.type === t);
        if (hit) return hit.symbol;
      }
    } catch {
      // ignore
    }
    const parts = t.split("::");
    return parts[parts.length - 1] || t;
  };

  // shorten Move type: 0x...::module::NAME -> module::NAME
  const shortType = (t: string) => {
    if (!t) return "";
    try {
      const parts = t.split("::");
      if (parts.length >= 2) return parts.slice(-2).join("::");
      return t;
    } catch {
      return t;
    }
  };

  const handleCreatePool = async () => {
    if (!currentAccount) {
      alert("Please connect your wallet");
      return;
    }

    // Check if REGISTRY_ID is configured
    if (!CONTRACTS.REGISTRY_ID || !CONTRACTS.REGISTRY_ID.trim()) {
      alert("Registry ID not configured. Please set CONTRACTS.REGISTRY_ID in contracts.ts");
      return;
    }

    // Resolve selected token types
    const finalTokenX = tokenXType?.trim();
    const finalTokenY = tokenYType?.trim();

    // Validate token types
    if (!finalTokenX || !finalTokenY) {
      alert("Please provide both token types");
      return;
    }

    if (finalTokenX === finalTokenY) {
      alert("Token X and Token Y must be different");
      return;
    }

    // Basic validation for Move type format
    if (!finalTokenX.includes("::") || !finalTokenY.includes("::")) {
      alert("Invalid token format. Expected full Move type path like: 0xPACKAGE::module::TOKEN");
      return;
    }

    setLoading(true);
    try {
      const tx = new Transaction();

      const feeBps = feeValues[feeType].bps;

      tx.moveCall({
        target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX_FACTORY}::${DEX_FUNCTIONS.CREATE_POOL}`,
        arguments: [
          tx.object(CONTRACTS.REGISTRY_ID),
          tx.pure.u64(feeBps),
        ],
        typeArguments: [finalTokenX, finalTokenY],
      });

      signAndExecute(
        {
          transaction: tx,
        },
        {
          onSuccess: (result) => {
            console.log("Pool created successfully:", result);
            alert(`Pool created successfully! Digest: ${result.digest}\n\nPlease check the transaction to get Pool ID from created objects.`);
          },
          onError: (error) => {
            console.error("Pool creation failed:", error);
            const errorMsg = error.message || String(error);
            // Check for duplicate pool error (E_POOL_ALREADY_EXISTS = 9)
            if (errorMsg.includes("E_POOL_ALREADY_EXISTS") || errorMsg.includes("Aborted with code 9")) {
              alert(`Pool already exists for this token pair!\n\nA pool with these tokens has already been created. Please use the existing pool.`);
            } else {
              alert(`Failed to create pool: ${errorMsg}`);
            }
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
    <Card maxWidth="max-w-md" minHeight="min-h-[560px]" className="shadow-sm mx-auto w-full">
      <h2 className="text-2xl font-bold mb-6 text-gray-900">Create New Pool</h2>

      <div className="mb-6">
        <p className="text-sm text-gray-600 mb-4">
          Create a new liquidity pool for any token pair
        </p>

        {!CONTRACTS.REGISTRY_ID && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-sm font-medium text-yellow-900">Registry ID Not Set</p>
                <p className="text-sm text-yellow-800 mt-1">
                  Please set <code className="bg-yellow-100 px-1 rounded font-mono text-xs">CONTRACTS.REGISTRY_ID</code> in <code className="bg-yellow-100 px-1 rounded">contracts.ts</code> before creating pools.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Token X Selection (opens TokenSelector) */}
      <div className="mb-4">
        <TokenPicker
          label="First Token"
          tokenType={tokenXType}
          balance={null}
          decimals={DEFAULT_TOKENS.find((d) => d.type === tokenXType)?.decimals ?? 9}
          onOpen={() => setShowSelectorX(true)}
          showBalance={false}
        />
      </div>

      {/* Token Y Selection (opens TokenSelector) */}
      <div className="mb-6">
        <TokenPicker
          label="Second Token"
          tokenType={tokenYType}
          balance={null}
          decimals={DEFAULT_TOKENS.find((d) => d.type === tokenYType)?.decimals ?? 9}
          onOpen={() => setShowSelectorY(true)}
          showBalance={false}
        />
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-3 text-gray-700">
          Select Fee Tier
        </label>
        <div className="space-y-3">
          {(Object.keys(feeValues) as Array<keyof typeof feeValues>).map((key) => (
            <button
              key={key}
              onClick={() => setFeeType(key)}
              className={`w-full p-4 rounded-xl border-2 transition-all text-left ${feeType === key
                ? "border-blue-600 bg-gray-50"
                : "border-gray-200 hover:border-gray-300"
                }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold text-zinc-900">
                    {feeValues[key].display} Fee
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {key === "low" && "Best for stablecoin pairs"}
                    {key === "med" && "Best for most pairs"}
                    {key === "high" && "Best for exotic pairs"}
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${feeType === key
                    ? "border-blue-600 bg-blue-600"
                    : "border-gray-300"
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

      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <h3 className="font-medium text-gray-900 mb-2">Pool Details</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Token X:</span>
            <span className="font-medium text-gray-900 truncate ml-2 max-w-[200px]" title={shortType(tokenXType)}>
              {getSymbolForType(tokenXType)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Token Y:</span>
            <span className="font-medium text-gray-900 truncate ml-2 max-w-[200px]" title={shortType(tokenYType)}>
              {getSymbolForType(tokenYType)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Fee:</span>
            <span className="font-medium text-gray-900">{feeValues[feeType].display}</span>
          </div>
        </div>
      </div>

      <button
        onClick={handleCreatePool}
        disabled={loading || !currentAccount || !CONTRACTS.REGISTRY_ID}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white font-semibold py-4 rounded-xl transition-colors disabled:cursor-not-allowed"
      >
        {loading ? "Creating Pool..." : !currentAccount ? "Connect Wallet" : !CONTRACTS.REGISTRY_ID ? "Set Registry ID in contracts.ts" : "Create Pool"}
      </button>

      {showSelectorX && (
        <TokenSelector
          isOpen={showSelectorX}
          onClose={() => setShowSelectorX(false)}
          tokens={DEFAULT_TOKENS}
          onSelect={(type) => {
            setTokenXType(type);
            setShowSelectorX(false);
          }}
        />
      )}

      {showSelectorY && (
        <TokenSelector
          isOpen={showSelectorY}
          onClose={() => setShowSelectorY(false)}
          tokens={DEFAULT_TOKENS}
          onSelect={(type) => {
            setTokenYType(type);
            setShowSelectorY(false);
          }}
        />
      )}
    </Card>
  );
}
