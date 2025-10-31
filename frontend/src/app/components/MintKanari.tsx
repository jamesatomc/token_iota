"use client";

import { useState } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { CONTRACTS, MODULES, parseAmount } from "../lib/contracts";
import Card from "./UI/Card";

export default function MintKanari() {
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [loading, setLoading] = useState(false);
  const [useCurrentAddress, setUseCurrentAddress] = useState(true);

  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();

  const handleMint = async () => {
    if (!currentAccount || !amount) {
      alert("Please connect wallet and enter amount");
      return;
    }

    const targetAddress = useCurrentAddress ? currentAccount.address : recipient;

    if (!targetAddress) {
      alert("Please enter recipient address");
      return;
    }

    setLoading(true);
    try {
      const tx = new Transaction();

      const amountParsed = parseAmount(amount);

      tx.moveCall({
        target: `${CONTRACTS.PACKAGE_ID}::${MODULES.KANARI}::mint`,
        arguments: [
          tx.object(CONTRACTS.KANARI.TREASURY_CAP),
          tx.pure.u64(amountParsed),
          tx.pure.address(targetAddress),
        ],
      });

      signAndExecute(
        {
          transaction: tx,
        },
        {
          onSuccess: (result) => {
            console.log("Mint successful:", result);
            alert(`Successfully minted ${amount} KANARI!\nDigest: ${result.digest}`);
            setAmount("");
            if (!useCurrentAddress) setRecipient("");
          },
          onError: (error) => {
            console.error("Mint failed:", error);
            alert(`Mint failed: ${error.message}`);
          },
        }
      );
    } catch (error) {
      console.error("Error creating mint transaction:", error);
      alert(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card maxWidth="max-w-md" minHeight="min-h-[560px]" className="shadow-sm mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Mint KANARI</h2>
          <p className="text-sm text-gray-600">Create new KANARI tokens</p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-2">
          <svg className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm font-medium text-yellow-900">Treasury Cap Required</p>
            <p className="text-sm text-yellow-800 mt-1">
              Only the treasury cap owner can mint new tokens.
            </p>
          </div>
        </div>
      </div>

      {/* Treasury Cap Info */}
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Treasury Cap</h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between items-start gap-2">
            <span className="text-gray-600">Address:</span>
            <span className="font-mono text-gray-900 text-right break-all">
              {CONTRACTS.KANARI.TREASURY_CAP.slice(0, 10)}...{CONTRACTS.KANARI.TREASURY_CAP.slice(-8)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Decimals:</span>
            <span className="font-mono text-gray-900">9</span>
          </div>
        </div>
      </div>

      {/* Amount Input */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-zinc-700">
          Amount to Mint
        </label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="w-full px-4 py-3 pr-20 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
            KANARI
          </div>
        </div>
        {amount && (
          <p className="mt-2 text-xs text-gray-500">
            Raw amount: {parseAmount(amount)} (with 9 decimals)
          </p>
        )}
      </div>

      {/* Quick Amount Buttons */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2 text-zinc-700">
          Quick Amounts
        </label>
        <div className="grid grid-cols-4 gap-2">
          {["100", "1000", "10000", "100000"].map((value) => (
            <button
              key={value}
              onClick={() => setAmount(value)}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              {parseInt(value).toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      {/* Recipient Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-3 text-zinc-700">
          Recipient
        </label>

        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setUseCurrentAddress(true)}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${useCurrentAddress
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
          >
            My Address
          </button>
          <button
            onClick={() => setUseCurrentAddress(false)}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${!useCurrentAddress
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
          >
            Other Address
          </button>
        </div>

        {useCurrentAddress ? (
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm font-mono text-gray-900 break-all">
              {currentAccount?.address || "Not connected"}
            </p>
          </div>
        ) : (
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x..."
            className="w-full px-4 py-3 rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />
        )}
      </div>

      {/* Mint Button */}
      <button
        onClick={handleMint}
        disabled={loading || !currentAccount || !amount}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white font-semibold py-4 rounded-xl transition-colors disabled:cursor-not-allowed shadow-lg"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Minting...
          </span>
        ) : !currentAccount ? (
          "Connect Wallet"
        ) : (
          "Mint KANARI"
        )}
      </button>

      {/* Additional Info */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">About Minting</h3>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Minting creates new KANARI tokens</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Requires Treasury Cap ownership</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Can mint to any address</span>
          </li>
        </ul>
      </div>
    </Card>
  );
}
