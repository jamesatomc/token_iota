"use client";

import { useState, useEffect } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount, useIotaClient } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { CONTRACTS, MODULES, DEX_FUNCTIONS, parseAmount } from "../lib/contracts";

interface PoolInfo {
  objectId: string;
  reserveX: string;
  reserveY: string;
  fee: string;
}

interface LPTokenInfo {
  objectId: string;
  amount: string;
}

export default function LiquidityInterface() {
  const [tab, setTab] = useState<"add" | "remove">("add");
  const [amountX, setAmountX] = useState("");
  const [amountY, setAmountY] = useState("");
  const [selectedPool, setSelectedPool] = useState("");
  const [selectedLPToken, setSelectedLPToken] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [loading, setLoading] = useState(false);
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [lpTokens, setLPTokens] = useState<LPTokenInfo[]>([]);
  const [loadingPools, setLoadingPools] = useState(false);
  
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();
  const client = useIotaClient();

  // Fetch available pools
  useEffect(() => {
    const fetchPools = async () => {
      if (!client) return;
      
      setLoadingPools(true);
      try {
        // Since pools are shared objects, we need to use a different approach
        // Query by using getObject on known pool addresses or use indexer
        // For now, we'll keep this simple - user can still manually get pool IDs from explorer
        // In production, you'd want to maintain a registry or use an indexer
        
        // Temporary: Check if there are any pools in recent transactions
        // Better approach: Store pool IDs in a registry contract or off-chain DB
        setPools([]);
        
      } catch (error) {
        console.error("Error fetching pools:", error);
      } finally {
        setLoadingPools(false);
      }
    };

    fetchPools();
  }, [client]);

  // Fetch user's LP tokens
  useEffect(() => {
    const fetchLPTokens = async () => {
      if (!currentAccount || !client) return;

      try {
        const lpTokenType = `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX}::LPToken<${CONTRACTS.KANARI.TYPE}, ${CONTRACTS.IOTA.TYPE}>`;
        
        const response = await client.getOwnedObjects({
          owner: currentAccount.address,
          filter: {
            StructType: lpTokenType,
          },
          options: {
            showContent: true,
            showType: true,
          },
        });

        const tokenData: LPTokenInfo[] = response.data
          .filter((obj) => obj.data?.content?.dataType === "moveObject")
          .map((obj: any) => ({
            objectId: obj.data.objectId,
            amount: obj.data.content?.fields?.amount || "0",
          }));

        setLPTokens(tokenData);
      } catch (error) {
        console.error("Error fetching LP tokens:", error);
      }
    };

    fetchLPTokens();
  }, [currentAccount, client]);

  const handleAddLiquidity = async () => {
    if (!currentAccount || !amountX || !amountY || !selectedPool) {
      alert("Please fill all fields and connect wallet");
      return;
    }

    // Validate amounts
    const kanariAmount = parseFloat(amountX);
    const iotaAmount = parseFloat(amountY);
    
    if (kanariAmount <= 0 || iotaAmount <= 0) {
      alert("Please enter valid amounts greater than 0");
      return;
    }

    // Check for potential overflow (product should be less than u64 max when in smallest units)
    // For safety, keep product under 10^15 to avoid overflow in safe_mul
    const productCheck = kanariAmount * iotaAmount;
    if (productCheck > 1000000) { // ~10^6 in human-readable units
      alert("Amounts too large! The product of KANARI × IOTA exceeds safe limits.\nTry smaller amounts (e.g., 100 KANARI with 1 IOTA).");
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

      // Get KANARI coins from user's balance
      const kanariCoins = await client.getCoins({
        owner: currentAccount.address,
        coinType: CONTRACTS.KANARI.TYPE,
      });

      if (kanariCoins.data.length === 0) {
        alert("You don't have any KANARI tokens. Please mint some first.");
        setLoading(false);
        return;
      }

      // Calculate total KANARI balance
      const totalKanari = kanariCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0));
      const requiredKanari = BigInt(amountXParsed);
      
      if (totalKanari < requiredKanari) {
        alert(`Insufficient KANARI balance!\nYou have: ${Number(totalKanari) / 1e9} KANARI\nRequired: ${kanariAmount} KANARI`);
        setLoading(false);
        return;
      }

      // Merge all KANARI coins into one if there are multiple
      const [primaryKanariCoin, ...restKanariCoins] = kanariCoins.data;
      
      if (restKanariCoins.length > 0) {
        tx.mergeCoins(
          tx.object(primaryKanariCoin.coinObjectId),
          restKanariCoins.map((coin) => tx.object(coin.coinObjectId))
        );
      }

      // Split the exact amount needed for liquidity
      const [coinX] = tx.splitCoins(tx.object(primaryKanariCoin.coinObjectId), [amountXParsed]);

      // Split IOTA (Y token) from gas coin
      const [coinY] = tx.splitCoins(tx.gas, [amountYParsed]);

      tx.moveCall({
        target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX}::${DEX_FUNCTIONS.ADD_LIQUIDITY}`,
        arguments: [
          tx.object(selectedPool),
          coinX,
          coinY,
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
    if (!currentAccount || !selectedLPToken || !selectedPool) {
      alert("Please fill all fields and connect wallet");
      return;
    }

    // Validate that selectedLPToken looks like an object ID
    if (!selectedLPToken.startsWith("0x")) {
      alert("Please select a valid LP Token.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const tx = new Transaction();
      
      // Calculate minimum amounts (with slippage) - set to 0 for now
      const minAmountX = "0";
      const minAmountY = "0";

      tx.moveCall({
        target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX}::${DEX_FUNCTIONS.REMOVE_LIQUIDITY}`,
        arguments: [
          tx.object(selectedPool),
          tx.object(selectedLPToken), // LP Token object ID
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
            setSelectedLPToken("");
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

      {/* Pool Selection */}
      <div className="space-y-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">
            Pool Address
          </label>
          {pools.length > 0 ? (
            <select
              value={selectedPool}
              onChange={(e) => setSelectedPool(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a pool...</option>
              {pools.map((pool) => (
                <option key={pool.objectId} value={pool.objectId}>
                  Pool {pool.objectId.slice(0, 8)}... (Fee: {(parseInt(pool.fee) / 100).toFixed(1)}%)
                </option>
              ))}
            </select>
          ) : (
            <>
              <input
                type="text"
                value={selectedPool}
                onChange={(e) => setSelectedPool(e.target.value)}
                placeholder="0x..."
                className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                💡 Enter the Pool ID from your "Create Pool" transaction or IOTA Explorer
              </p>
            </>
          )}
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
          {/* LP Token Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300">
              Select LP Token to Remove
            </label>
            {lpTokens.length === 0 ? (
              <div className="text-sm text-zinc-500 p-4 border border-zinc-300 dark:border-zinc-700 rounded-lg">
                You don't have any LP tokens. Add liquidity first to receive LP tokens.
              </div>
            ) : (
              <select
                value={selectedLPToken}
                onChange={(e) => setSelectedLPToken(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select LP token...</option>
                {lpTokens.map((token) => (
                  <option key={token.objectId} value={token.objectId}>
                    {token.objectId.slice(0, 8)}... (Amount: {(parseInt(token.amount) / 1e9).toFixed(4)} LP)
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            onClick={handleRemoveLiquidity}
            disabled={loading || !currentAccount || lpTokens.length === 0}
            className="w-full bg-red-500 hover:bg-red-600 disabled:bg-zinc-300 disabled:dark:bg-zinc-700 text-white font-semibold py-4 rounded-xl transition-colors"
          >
            {loading ? "Removing..." : !currentAccount ? "Connect Wallet" : "Remove Liquidity"}
          </button>
        </>
      )}
    </div>
  );
}
