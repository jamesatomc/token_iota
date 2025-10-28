"use client";

import { useState, useEffect } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount, useIotaClient } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { CONTRACTS, MODULES, DEX_FUNCTIONS, parseAmount } from "../lib/contracts";
import { usePools } from "../hooks/usePools";

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
  const [lpTokens, setLPTokens] = useState<LPTokenInfo[]>([]);
  
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();
  const client = useIotaClient();
  const { pools, loading: poolsLoading } = usePools();

  // Fetch user's LP tokens for selected pool
  useEffect(() => {
    const fetchLPTokens = async () => {
      if (!currentAccount || !client || !selectedPool) return;

      try {
        // Find the selected pool's token types
        const pool = pools.find(p => p.poolId === selectedPool);
        if (!pool || !pool.tokenX || !pool.tokenY) {
          setLPTokens([]);
          return;
        }

        const lpTokenType = `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX}::LPToken<${pool.tokenX}, ${pool.tokenY}>`;
        
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
        
        // Log for debugging
        console.log("Found LP tokens:", tokenData);
      } catch (error) {
        console.error("Error fetching LP tokens:", error);
      }
    };

    fetchLPTokens();
  }, [currentAccount, client, selectedPool, pools, tab]); // Re-fetch when pool changes

  const handleAddLiquidity = async () => {
    if (!currentAccount || !amountX || !amountY || !selectedPool) {
      alert("Please fill all fields and connect wallet");
      return;
    }

    // Find selected pool to get token types
    const pool = pools.find(p => p.poolId === selectedPool);
    if (!pool || !pool.tokenX || !pool.tokenY) {
      alert("Invalid pool selected");
      return;
    }

    // Validate amounts
    const amountXNum = parseFloat(amountX);
    const amountYNum = parseFloat(amountY);
    
    if (amountXNum <= 0 || amountYNum <= 0) {
      alert("Please enter valid amounts greater than 0");
      return;
    }

    // Check for potential overflow in Move contract
    const MAX_SAFE_AMOUNT = 4_000_000_000; // ~4 billion in human-readable units
    
    if (amountXNum > MAX_SAFE_AMOUNT || amountYNum > MAX_SAFE_AMOUNT) {
      alert(`Amount too large! Maximum supported: ${MAX_SAFE_AMOUNT.toLocaleString()} tokens per side`);
      return;
    }
    
    const productCheck = amountXNum * amountYNum;
    if (productCheck > 10_000_000_000_000) { // 10 trillion (10^13)
      alert("Product of amounts is too large! Try reducing both amounts.\nMax safe product: 10 trillion");
      return;
    }

    setLoading(true);
    try {
      const tx = new Transaction();
      
      const amountXParsed = parseAmount(amountX);
      const amountYParsed = parseAmount(amountY);
      
      console.log("Adding liquidity:", {
        tokenX: pool.tokenXSymbol,
        tokenY: pool.tokenYSymbol,
        amountX,
        amountY,
        amountXParsed,
        amountYParsed,
      });
      
      const minLpAmount = "0"; // Let contract decide minimum

      // Check if tokenX is IOTA (0x2::iota::IOTA)
      const isTokenXIota = pool.tokenX === "0x2::iota::IOTA";
      const isTokenYIota = pool.tokenY === "0x2::iota::IOTA";

      let coinX;
      let coinY;

      // Handle Token X
      if (isTokenXIota) {
        // Token X is IOTA - split from gas
        [coinX] = tx.splitCoins(tx.gas, [amountXParsed]);
      } else {
        // Token X is custom token - fetch and merge
        const tokenXCoins = await client.getCoins({
          owner: currentAccount.address,
          coinType: pool.tokenX,
        });

        if (tokenXCoins.data.length === 0) {
          alert(`You don't have any ${pool.tokenXSymbol} tokens.`);
          setLoading(false);
          return;
        }

        const totalTokenX = tokenXCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0));
        const requiredTokenX = BigInt(amountXParsed);
        
        if (totalTokenX < requiredTokenX) {
          alert(`Insufficient ${pool.tokenXSymbol} balance!\nYou have: ${Number(totalTokenX) / 1e9}\nRequired: ${amountXNum}`);
          setLoading(false);
          return;
        }

        const [primaryCoinX, ...restCoinsX] = tokenXCoins.data;
        
        if (restCoinsX.length > 0) {
          tx.mergeCoins(
            tx.object(primaryCoinX.coinObjectId),
            restCoinsX.map((coin) => tx.object(coin.coinObjectId))
          );
        }

        [coinX] = tx.splitCoins(tx.object(primaryCoinX.coinObjectId), [amountXParsed]);
      }

      // Handle Token Y
      if (isTokenYIota) {
        // Token Y is IOTA - split from gas
        [coinY] = tx.splitCoins(tx.gas, [amountYParsed]);
      } else {
        // Token Y is custom token - fetch and merge
        const tokenYCoins = await client.getCoins({
          owner: currentAccount.address,
          coinType: pool.tokenY,
        });

        if (tokenYCoins.data.length === 0) {
          alert(`You don't have any ${pool.tokenYSymbol} tokens.`);
          setLoading(false);
          return;
        }

        const totalTokenY = tokenYCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0));
        const requiredTokenY = BigInt(amountYParsed);
        
        if (totalTokenY < requiredTokenY) {
          alert(`Insufficient ${pool.tokenYSymbol} balance!\nYou have: ${Number(totalTokenY) / 1e9}\nRequired: ${amountYNum}`);
          setLoading(false);
          return;
        }

        const [primaryCoinY, ...restCoinsY] = tokenYCoins.data;
        
        if (restCoinsY.length > 0) {
          tx.mergeCoins(
            tx.object(primaryCoinY.coinObjectId),
            restCoinsY.map((coin) => tx.object(coin.coinObjectId))
          );
        }

        [coinY] = tx.splitCoins(tx.object(primaryCoinY.coinObjectId), [amountYParsed]);
      }

      // Add liquidity with dynamic token types
      tx.moveCall({
        target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX_FACTORY}::${DEX_FUNCTIONS.ADD_LIQUIDITY}`,
        arguments: [
          tx.object(selectedPool),
          coinX,
          coinY,
          tx.pure.u64(minLpAmount),
        ],
        typeArguments: [pool.tokenX, pool.tokenY],
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

    // Find selected pool to get token types
    const pool = pools.find(p => p.poolId === selectedPool);
    if (!pool || !pool.tokenX || !pool.tokenY) {
      alert("Invalid pool selected");
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
        target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX_FACTORY}::${DEX_FUNCTIONS.REMOVE_LIQUIDITY}`,
        arguments: [
          tx.object(selectedPool),
          tx.object(selectedLPToken), // LP Token object ID
          tx.pure.u64(minAmountX),
          tx.pure.u64(minAmountY),
        ],
        typeArguments: [pool.tokenX, pool.tokenY], // Use dynamic types
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
            Select Pool
          </label>
          {poolsLoading ? (
            <div className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-center">
              Loading pools...
            </div>
          ) : pools.length > 0 ? (
            <>
              <select
                value={selectedPool}
                onChange={(e) => setSelectedPool(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a pool...</option>
                {pools.map((pool) => (
                  <option key={pool.poolId} value={pool.poolId}>
                    {pool.tokenXSymbol}/{pool.tokenYSymbol} - {pool.poolId.slice(0, 8)}...{pool.poolId.slice(-6)} - Fee: {(parseInt(pool.feeBps) / 100).toFixed(2)}%
                    {pool.reserveX && pool.reserveY && (
                      ` - ${(parseInt(pool.reserveX) / 1e9).toFixed(2)} ${pool.tokenXSymbol} / ${(parseInt(pool.reserveY) / 1e9).toFixed(2)} ${pool.tokenYSymbol}`
                    )}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                ✅ {pools.length} pool{pools.length > 1 ? 's' : ''} available
              </p>
            </>
          ) : (
            <div className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm">
              ⚠️ No pools found. Please create a pool first using the "Create Pool" tab.
            </div>
          )}
        </div>
      </div>

      {tab === "add" ? (
        <>
          {/* Token X Amount */}
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4 mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {selectedPool && pools.find(p => p.poolId === selectedPool)?.tokenXSymbol || "Token X"}
              </span>
            </div>
            <input
              type="number"
              value={amountX}
              onChange={(e) => setAmountX(e.target.value)}
              placeholder="0.0"
              className="w-full text-2xl font-semibold bg-transparent border-none outline-none text-zinc-900 dark:text-white"
            />
          </div>

          {/* Token Y Amount */}
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4 mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {selectedPool && pools.find(p => p.poolId === selectedPool)?.tokenYSymbol || "Token Y"}
              </span>
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
                <p className="font-medium mb-2">⚠️ No LP tokens found</p>
                <p className="text-xs">
                  Add liquidity to the current pool to receive LP tokens.
                  <br />
                  <span className="text-amber-600 dark:text-amber-400">
                    Note: LP tokens from old deployments won't work with the new pool.
                  </span>
                </p>
              </div>
            ) : (
              <>
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
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  ℹ️ Found {lpTokens.length} LP token{lpTokens.length > 1 ? 's' : ''} from package: {CONTRACTS.PACKAGE_ID.slice(0, 8)}...
                </p>
              </>
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
