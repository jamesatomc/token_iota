import { useState, useEffect } from "react";
import { useIotaClient } from "@iota/dapp-kit";
import { CONTRACTS, MODULES } from "../lib/contracts";

// Helper: safely extract pool id from event parsedJson (handles object, nested, or stringified JSON)
const getPoolIdFromEvent = (event: unknown): string => {
  if (!event || typeof event !== "object") return "";
  const evt = event as Record<string, unknown>;
  const parsed = evt.parsedJson;
  if (!parsed) return "";

  if (typeof parsed === "string") {
    try {
      const obj = JSON.parse(parsed) as Record<string, unknown>;
      return String(
        obj.pool_id ?? obj.poolId ?? (obj.fields as Record<string, unknown>)?.pool_id ?? ""
      );
    } catch {
      return "";
    }
  }

  if (typeof parsed === "object") {
    const p = parsed as Record<string, unknown>;
    return String(
      p.pool_id ??
        p.poolId ??
        (p.fields as Record<string, unknown>)?.pool_id ??
        (p.data as Record<string, unknown>)?.pool_id ??
        ""
    );
  }
  return "";
};

// Helper: query events with fallback for different key casing
const queryEventsWithFallback = async (client: unknown, eventType: string, limit = 50) => {
  // runtime-check that client exposes queryEvents
  const cli = client as { queryEvents?: (opts: unknown) => Promise<unknown> } | null;
  if (!cli || typeof cli.queryEvents !== "function") {
    throw new Error("client.queryEvents not available");
  }

  try {
    return await cli.queryEvents({
      query: { MoveEventType: eventType },
      limit,
    });
  } catch (e1) {
    // try lower-case key if API expects that
    try {
      return await cli.queryEvents({
        query: { moveEventType: eventType },
        limit,
      });
    } catch {
      // rethrow original to preserve context
      throw e1;
    }
  }
};

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

type RawRecord = Record<string, unknown>;

function safeParse(o: unknown): RawRecord {
  // narrow to object before using
  if (o && typeof o === "object" && !Array.isArray(o)) {
    return o as RawRecord;
  }
  return {};
}

export function usePools() {
  const [pools, setPools] = useState<PoolData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = useIotaClient();

  useEffect(() => {
    let mounted = true;

    const fetchPools = async () => {
      if (!client) return;

      if (mounted) {
        setLoading(true);
        setError(null);
      }

      try {
        const eventType = `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX}::PoolCreated`;

        const response = await queryEventsWithFallback(client, eventType, 50);

        const poolsData: PoolData[] = [];

        // ensure we have an array to iterate
        const respObj =
          response && typeof response === "object"
            ? (response as Record<string, unknown>)
            : {};
        const events = Array.isArray(respObj.data)
          ? (respObj.data as unknown[])
          : [];

        for (const event of events) {
          const poolId = getPoolIdFromEvent(event);
          if (!poolId) continue;

          // fee may be available on event or later from object; try to read if present
          let feeBps = "0";
          const evtObj = event as Record<string, unknown>;
          const parsed = evtObj.parsedJson;
          if (parsed) {
            const parsedObj = safeParse(parsed);
            feeBps = String(parsedObj["fee_bps"] ?? parsedObj["feeBps"] ?? feeBps);
          }

          // Fetch pool object for type and reserves
          try {
            // narrow client.getObject safely without using `any`
            const clientWithGet =
              client && typeof client === "object"
                ? (client as { getObject?: (opts: unknown) => Promise<unknown> } | null)
                : null;

            if (!clientWithGet || typeof clientWithGet.getObject !== "function") {
              console.warn?.(`client.getObject not available for pool ${poolId}`);
              continue;
            }

            const poolObjectRaw = await clientWithGet.getObject({
              id: poolId,
              options: {
                showContent: true,
                showType: true,
              },
            });

            const poolObject =
              poolObjectRaw && typeof poolObjectRaw === "object"
                ? (poolObjectRaw as Record<string, unknown>)
                : {};

            const dataObj =
              poolObject && typeof poolObject === "object"
                ? (poolObject.data as Record<string, unknown> | undefined)
                : undefined;

            const contentObj =
              dataObj && typeof dataObj === "object"
                ? (dataObj.content as Record<string, unknown> | undefined)
                : undefined;

            const typeStr = dataObj?.type as string | undefined;

            if (contentObj && contentObj.dataType === "moveObject" && typeStr) {
              const fields =
                contentObj.fields && typeof contentObj.fields === "object"
                  ? (contentObj.fields as Record<string, unknown>)
                  : {};

              // type may look like: "...::DEX::LiquidityPool<0x...::token::TOKEN, 0x2::iota::IOTA>"
              const typeMatch = String(typeStr).match(/LiquidityPool<(.+),\s*(.+)>/);

              let tokenX = "";
              let tokenY = "";
              let tokenXSymbol = "Token X";
              let tokenYSymbol = "Token Y";

              if (typeMatch && typeMatch.length >= 3) {
                tokenX = typeMatch[1].trim();
                tokenY = typeMatch[2].trim();

                const xParts = tokenX.split("::");
                const yParts = tokenY.split("::");
                tokenXSymbol = xParts[xParts.length - 1] || tokenXSymbol;
                tokenYSymbol = yParts[yParts.length - 1] || tokenYSymbol;
              }

              // fields naming can vary; try common variants
              const reserveX = String(
                fields["balance_x"] ?? fields["reserve_x"] ?? fields["x_balance"] ?? "0"
              );
              const reserveY = String(
                fields["balance_y"] ?? fields["reserve_y"] ?? fields["y_balance"] ?? "0"
              );
              const lpSupply = String(
                fields["lp_supply"] ?? fields["total_supply"] ?? fields["supply"] ?? "0"
              );

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
              // skip if no moveObject or no type info
              console.warn?.(`Pool object missing type/content for ${poolId}`);
            }
          } catch (err) {
            console.warn?.(`Could not fetch details for pool ${poolId}:`, err);
          }
        }

        // keep unique by poolId (first occurrence assumed most recent from query order)
        const uniquePools = poolsData.reduce((acc, pool) => {
          if (!acc.find((p) => p.poolId === pool.poolId)) acc.push(pool);
          return acc;
        }, [] as PoolData[]);

        if (mounted) {
          setPools(uniquePools);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to fetch pools");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchPools();

    return () => {
      mounted = false;
    };
    // CONTRACTS.PACKAGE_ID and MODULES.DEX are stable constants; only watch client here
  }, [client]);

  return { pools, loading, error };
}
