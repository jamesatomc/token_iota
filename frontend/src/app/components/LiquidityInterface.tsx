"use client";

import { useState } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { CONTRACTS, MODULES, DEX_FUNCTIONS, parseAmount } from "../lib/contracts";

export default function LiquidityInterface() {
  const [tab, setTab] = useState<"add" | "remove">("add");
  const [amountX, setAmountX] = useState("");
  const [amountY, setAmountY] = useState("");
  const [lpAmount, setLpAmount] = useState("");
  const [poolId, setPoolId] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [loading, setLoading] = useState(false);
  
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();

  const handleAddLiquidity = async () => {
    if (!currentAccount || !amountX || !amountY || !poolId) {
      alert("Please fill all fields and connect wallet");
      return;
    }

    setLoading(true);
    try {
      const tx = new Transaction();
      
      const amountXParsed = parseAmount(amountX);
      const amountYParsed = parseAmount(amountY);
      
      // Calculate estimated LP tokens (simplified)
      const estimatedLP = Math.sqrt(parseFloat(amountX) * parseFloat(amountY));
      const minLpAmount = parseAmount((estimatedLP * (1 - parseFloat(slippage) / 100)).toString());

      tx.moveCall({
        target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX_FACTORY}::${DEX_FUNCTIONS.ADD_LIQUIDITY}`,
        arguments: [
          tx.object(poolId),
          tx.object(amountXParsed), // coin_x
          tx.object(amountYParsed), // coin_y
          tx.pure.u64(minLpAmount),
        ],
        typeArguments: [CONTRACTS.KANARI.TYPE, CONTRACTS.IOTA.TYPE],
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
    if (!currentAccount || !lpAmount || !poolId) {
      alert("Please fill all fields and connect wallet");
      return;
    }

    setLoading(true);
    try {
      const tx = new Transaction();
      
      const lpAmountParsed = parseAmount(lpAmount);
      
      // Calculate minimum amounts (with slippage)
      const minAmountX = "0"; // You should calculate this based on pool state
      const minAmountY = "0";

      tx.moveCall({
        target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX_FACTORY}::${DEX_FUNCTIONS.REMOVE_LIQUIDITY}`,
        arguments: [
          tx.object(poolId),
          tx.object(lpAmountParsed), // lp_token
          tx.pure.u64(minAmountX),
          tx.pure.u64(minAmountY),
        ],
        typeArguments: [CONTRACTS.KANARI.TYPE, CONTRACTS.IOTA.TYPE],
      });

      signAndExecute(
        {
          transaction: tx,
        },
        {
          onSuccess: (result) => {
            console.log("Remove liquidity successful:", result);
            alert(`Liquidity removed! Digest: ${result.digest}`);
            setLpAmount("");
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

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-6 max-w-md w-full">
      <div className="flex mb-6 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
        <button
          onClick={() => setTab("add")}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            tab === "add"
              ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow"
              : "text-zinc-600 dark:text-zinc-400"
          }`}
        >
          Add Liquidity
        </button>
        <button
          onClick={() => setTab("remove")}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            tab === "remove"
              ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow"
              : "text-zinc-600 dark:text-zinc-400"
          }`}
        >
          Remove Liquidity
        </button>
      </div>

      {/* Pool and Registry IDs */}
      <div className="space-y-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">
            Pool ID
          </label>
          <input
            type="text"
            value={poolId}
            onChange={(e) => setPoolId(e.target.value)}
            placeholder="0x..."
            className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {tab === "add" ? (
        <>
          {/* KANARI Amount */}
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4 mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">KANARI</span>
            </div>
            <input
              type="number"
              value={amountX}
              onChange={(e) => setAmountX(e.target.value)}
              placeholder="0.0"
              className="w-full text-2xl font-semibold bg-transparent border-none outline-none text-zinc-900 dark:text-white"
            />
          </div>

          {/* IOTA Amount */}
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4 mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">IOTA</span>
            </div>
            <input
              type="number"
              value={amountY}
              onChange={(e) => setAmountY(e.target.value)}
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
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {value}%
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleAddLiquidity}
            disabled={loading || !currentAccount}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-300 disabled:dark:bg-zinc-700 text-white font-semibold py-4 rounded-xl transition-colors"
          >
            {loading ? "Adding..." : !currentAccount ? "Connect Wallet" : "Add Liquidity"}
          </button>
        </>
      ) : (
        <>
          {/* LP Token Amount */}
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4 mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">LP Tokens</span>
            </div>
            <input
              type="number"
              value={lpAmount}
              onChange={(e) => setLpAmount(e.target.value)}
              placeholder="0.0"
              className="w-full text-2xl font-semibold bg-transparent border-none outline-none text-zinc-900 dark:text-white"
            />
          </div>

          <button
            onClick={handleRemoveLiquidity}
            disabled={loading || !currentAccount}
            className="w-full bg-red-500 hover:bg-red-600 disabled:bg-zinc-300 disabled:dark:bg-zinc-700 text-white font-semibold py-4 rounded-xl transition-colors"
          >
            {loading ? "Removing..." : !currentAccount ? "Connect Wallet" : "Remove Liquidity"}
          </button>
        </>
      )}
    </div>
  );
}
