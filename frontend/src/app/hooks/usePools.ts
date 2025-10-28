import { useState, useEffect } from "react";
import { useIotaClient } from "@iota/dapp-kit";
import { CONTRACTS, MODULES } from "../lib/contracts";

export interface PoolData {
  poolId: string;
  feeBps: string;
  tokenX: string; // Full type path
  tokenY: string; // Full type path
  tokenXSymbol?: string; // Display name (e.g., "KANARI")
  tokenYSymbol?: string; // Display name (e.g., "IOTA")
  reserveX?: string;
  reserveY?: string;
  lpSupply?: string;
}

export function usePools() {
  const [pools, setPools] = useState<PoolData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = useIotaClient();

  useEffect(() => {
    const fetchPools = async () => {
      if (!client) return;

      setLoading(true);
      setError(null);

      try {
        // Query PoolCreated events from the package
        const eventType = `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX}::PoolCreated`;
        
        const response = await client.queryEvents({
          query: {
            MoveEventType: eventType,
          },
          limit: 50, // Get last 50 pools created
        });

        // Extract pool data from events
        const poolsData: PoolData[] = [];
        
        for (const event of response.data) {
          const parsed = event.parsedJson;
          if (parsed && typeof parsed === "object") {
            const parsedObj = parsed as Record<string, unknown>;
            const poolId = String(parsedObj.pool_id ?? "");
            const feeBps = String(parsedObj.fee_bps ?? "0");

            // Fetch current pool state to get reserves AND token types
            try {
              const poolObject = await client.getObject({
                id: poolId,
                options: {
                  showContent: true,
                  showType: true, // Important: need type to extract X, Y
                },
              });

                if (poolObject.data?.content?.dataType === "moveObject" && poolObject.data.type) {
                const fields = (poolObject.data.content.fields ?? {}) as Record<string, unknown>;
                
                // Extract token types from pool type string
                // Format: "0x...::DEX::LiquidityPool<0x...::token::TOKEN, 0x2::iota::IOTA>"
                const typeMatch = poolObject.data.type.match(/LiquidityPool<(.+),\s*(.+)>/);
                
                let tokenX = "";
                let tokenY = "";
                let tokenXSymbol = "Token X";
                let tokenYSymbol = "Token Y";
                
                if (typeMatch && typeMatch.length >= 3) {
                  tokenX = typeMatch[1].trim();
                  tokenY = typeMatch[2].trim();
                  
                  // Extract symbol from type (last part after ::)
                  const xParts = tokenX.split("::");
                  const yParts = tokenY.split("::");
                  tokenXSymbol = xParts[xParts.length - 1] || "Token X";
                  tokenYSymbol = yParts[yParts.length - 1] || "Token Y";
                }
                
                const reserveX = String(fields["balance_x"] ?? "0");
                const reserveY = String(fields["balance_y"] ?? "0");
                const lpSupply = String(fields["lp_supply"] ?? "0");

                poolsData.push({
                  poolId,
                  feeBps,
                  tokenX,
                  tokenY,
                  tokenXSymbol,
                  tokenYSymbol,
                  reserveX,
                  reserveY,
                  lpSupply,
                });
              } else {
                // Pool exists but we couldn't get details
                console.warn(`Could not get type info for pool ${poolId}`);
              }
            } catch (err) {
              console.warn(`Could not fetch details for pool ${poolId}:`, err);
            }
          }
        }

        // Filter out duplicates (keep the most recent)
        const uniquePools = poolsData.reduce((acc, pool) => {
          if (!acc.find(p => p.poolId === pool.poolId)) {
            acc.push(pool);
          }
          return acc;
        }, [] as PoolData[]);

        setPools(uniquePools);
        console.log("Found pools:", uniquePools);
      } catch (err) {
        console.error("Error fetching pools:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch pools");
      } finally {
        setLoading(false);
      }
    };

    fetchPools();
  }, [client]);

  return { pools, loading, error };
}
