"use client";

import { useState, useMemo } from "react";
import { usePools } from "../hooks/usePools";
import { useCurrentAccount, useIotaClient, useSignAndExecuteTransaction } from "@iota/dapp-kit";
import { formatAmount as rawFormatAmount, CONTRACTS, MODULES, DEX_FUNCTIONS, computeActiveLpSupply } from "../lib/contracts";
import Card from "./UI/Card";

interface PoolData {
  balance_x: string;
  balance_y: string;
  fee_bps: string;
  lp_supply: string;
}

interface RawFields {
  balance_x?: string | number;
  balance_y?: string | number;
  fee_bps?: string | number;
  lp_supply?: string | number;
  token_x?: string | number;
  token_y?: string | number;
}

// helper moved out to avoid recreation on every render
const toAmount = (s: string) => {
  if (!s) return 0;
  // if it's an integer string, prefer BigInt to preserve precision
  if (/^\d+$/.test(s)) {
    try {
      return BigInt(s);
    } catch {
      const n = Number(s);
      return isNaN(n) ? 0 : n;
    }
  }
  const n = Number(s);
  return isNaN(n) ? 0 : n;
};

// lightweight wrapper to keep formatting consistent
const formatAmount = (v: unknown): string => {
  try {
    // cast the imported formatter to a function that accepts unknown to avoid explicit `any`
    const fn = rawFormatAmount as (arg: unknown) => string;
    return fn(v);
  } catch {
    return String(v);
  }
};

export default function PoolInfo() {
  // (Removed page lock) Pool info is now always visible; password gating removed.
  const [poolId, setPoolId] = useState("");
  const [poolData, setPoolData] = useState<PoolData | null>(null);
  const [loading, setLoading] = useState(false);
  // token type full Move type strings extracted from pool object (used for typeArguments)
  const [tokenXTypeFull, setTokenXTypeFull] = useState<string | null>(null);
  const [tokenYTypeFull, setTokenYTypeFull] = useState<string | null>(null);
  // new: labels for tokens (defaults kept for backward compatibility)
  const [tokenXLabel, setTokenXLabel] = useState("KANARI");
  const [tokenYLabel, setTokenYLabel] = useState("IOTA");
  // Oracle UI state
  const [oracleId, setOracleId] = useState("");
  const [oracleMaxObservations, setOracleMaxObservations] = useState<number>(100);
  const [oracleInfo, setOracleInfo] = useState<{ observations?: number } | null>(null);
  // manual/override token type args (allow user to query pool by types)
  const [tokenXTypeInput, setTokenXTypeInput] = useState<string>("");
  const [tokenYTypeInput, setTokenYTypeInput] = useState<string>("");
  // UI helper state for burn/reserved info
  const [poolUi, setPoolUi] = useState<{ burnAddr?: string; burnedAmount?: string; activeLp?: string } | null>(null);

  const client = useIotaClient();
  const currentAccount = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const { pools: availablePools, loading: poolsLoading } = usePools();

  const truncateId = (id: string, head = 8, tail = 6) => {
    if (!id) return "";
    if (id.length <= head + tail + 3) return id;
    return `${id.slice(0, head)}...${id.slice(-tail)}`;
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // small feedback
      // In this simple component we use alert for feedback to avoid adding toast deps
      // but keep it subtle
      alert("Pool ID copied to clipboard");
    } catch {
      alert("Failed to copy");
    }
  };

  const fetchPoolInfo = async () => {
    if (!poolId) {
      alert("Please enter a pool ID");
      return;
    }

    setLoading(true);
    try {
      // Fetch pool object
      const poolObject = await client.getObject({
        id: poolId,
        options: {
          showContent: true,
          showType: true,
        },
      });

      if (poolObject.data?.content?.dataType === "moveObject") {
        const fields = poolObject.data.content.fields as RawFields | undefined;

        // detect token labels:
        // priority: fields.token_x / fields.token_y
        // fallback: try to parse a type string for generics like <TokenA, TokenB>
        // otherwise keep defaults
        let xLabel = fields?.token_x ? String(fields.token_x) : undefined;
        let yLabel = fields?.token_y ? String(fields.token_y) : undefined;
        if (!xLabel || !yLabel) {
          const typeStr =
            String(poolObject.data?.type ?? poolObject.data?.content?.type ?? "");
          const matches = typeStr.match(/<\s*([^,>]+)\s*,\s*([^>]+)\s*>/);
          if (matches) {
            // set short labels
            xLabel = xLabel ?? matches[1].split("::").pop()?.trim();
            yLabel = yLabel ?? matches[2].split("::").pop()?.trim();
            // store full type args for oracle calls
            setTokenXTypeFull(matches[1].trim());
            setTokenYTypeFull(matches[2].trim());
          } else if (typeStr) {
            // fallback: try to extract last segments split by commas or generics-like text
            const parts = typeStr.split(/[,<>]/).map((s) => s.trim()).filter(Boolean);
            if (parts.length >= 2) {
              xLabel = xLabel ?? parts[parts.length - 2].split("::").pop()?.trim();
              yLabel = yLabel ?? parts[parts.length - 1].split("::").pop()?.trim();
              // attempt to capture full type args if available
              setTokenXTypeFull(parts[parts.length - 2]);
              setTokenYTypeFull(parts[parts.length - 1]);
            }
          }
        }
        if (xLabel) setTokenXLabel(xLabel.toUpperCase());
        if (yLabel) setTokenYLabel(yLabel.toUpperCase());

        // persist last-viewed pool so sidebar can show pool-specific info
        try { localStorage.setItem("lastViewedPoolId", poolId); } catch { }

        // try to extract burn reserve address (option type may be represented differently by backends)
        const extractOptionAddress = (raw: unknown): string | null => {
          if (!raw) return null;
          if (typeof raw === "string") return raw;
          if (typeof raw === "object" && raw !== null) {
            const rb = raw as Record<string, unknown>;
            if (typeof rb["Some"] === "string") return rb["Some"] as string;
            if (typeof rb["some"] === "string") return rb["some"] as string;
            if (typeof rb["value"] === "string") return rb["value"] as string;
            const keys = Object.keys(rb);
            if (keys.length === 1 && typeof rb[keys[0]] === "string") return rb[keys[0]] as string;
          }
          return null;
        };

        // attempt to read burn reserve and burned amount
        let burnedAmountStr = "0";
        const rawBurn = (poolObject.data.content.fields as Record<string, unknown> | undefined)?.["burn_reserve"];
        const burnAddr = extractOptionAddress(rawBurn);

        if (burnAddr) {
          // Prefer a read-only Move call if the SDK/client supports it. If not available
          // or it fails, fall back to fetching the burn object via getObject (existing behavior).
          const cliAny = client as any;
          let usedFallback = false;
          try {
            let readRes: any = null;
            // Try common SDK method names (callReadOnly / readMove) with a safe payload
            if (cliAny && typeof cliAny.callReadOnly === "function") {
              readRes = await cliAny.callReadOnly({
                package: CONTRACTS.PACKAGE_ID,
                module: MODULES.DEX,
                function: DEX_FUNCTIONS.GET_BURN_RESERVE,
                arguments: [burnAddr],
                typeArguments: [],
              });
            } else if (cliAny && typeof cliAny.readMove === "function") {
              readRes = await cliAny.readMove({
                package: CONTRACTS.PACKAGE_ID,
                module: MODULES.DEX,
                function: DEX_FUNCTIONS.GET_BURN_RESERVE,
                arguments: [burnAddr],
                typeArguments: [],
              });
            }

            // Interpret a variety of response shapes conservatively
            if (readRes != null) {
              if (typeof readRes === "string" || typeof readRes === "number") {
                burnedAmountStr = String(readRes);
              } else if (Array.isArray(readRes) && readRes.length > 0) {
                burnedAmountStr = String(readRes[0]);
              } else if (typeof readRes === "object") {
                // Common wrappers: { result: <val> } or { value: <val> }
                if (readRes.result != null) burnedAmountStr = String(readRes.result);
                else if (readRes.value != null) burnedAmountStr = String(readRes.value);
                else if (readRes.Ok != null) burnedAmountStr = String(readRes.Ok);
              }
            } else {
              usedFallback = true;
            }
          } catch (err) {
            // SDK read failed — mark to use fallback
            usedFallback = true;
            console.warn("Read-only move call for burn reserve failed, falling back to getObject:", err);
          }

          if (usedFallback) {
            try {
              const burnObj = await client.getObject({ id: burnAddr, options: { showContent: true } });
              if (burnObj.data?.content?.dataType === "moveObject") {
                const bfields = burnObj.data.content.fields as Record<string, unknown> | undefined;
                if (bfields?.amount) burnedAmountStr = String(bfields.amount);
              }
            } catch (err) {
              console.warn("Failed to fetch burn reserve object:", err);
            }
          }
        }

        setPoolData({
          balance_x: String(fields?.balance_x ?? "0"),
          balance_y: String(fields?.balance_y ?? "0"),
          fee_bps: String(fields?.fee_bps ?? "0"),
          lp_supply: String(fields?.lp_supply ?? "0"),
          // attach optional local-only helper fields for UI (we keep PoolData shape small; these are set via refs below)
        });

        // compute active LP and expose via a small UI state (keeps memo simple)
        try {
          const totalLp = BigInt(String(fields?.lp_supply ?? "0"));
          const reserved = BigInt(burnedAmountStr || "0");
          const active = computeActiveLpSupply(totalLp, reserved);
          setPoolUi({ burnAddr: burnAddr ?? undefined, burnedAmount: String(reserved.toString()), activeLp: String(active.toString()) });
        } catch {
          // ignore conversion issues
          setPoolUi(null);
        }
      } else {
        alert("Invalid pool object");
      }
    } catch (error) {
      console.error("Error fetching pool info:", error);
      alert(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Find pool by Move type arguments using the DEXFactory.get_pool_address read-only wrapper
  const findPoolByTypes = async () => {
    // prefer explicit input fields, fall back to detected full types
    const tx = tokenXTypeInput && tokenXTypeInput.trim() !== "" ? tokenXTypeInput.trim() : tokenXTypeFull;
    const ty = tokenYTypeInput && tokenYTypeInput.trim() !== "" ? tokenYTypeInput.trim() : tokenYTypeFull;
    if (!tx || !ty) {
      alert("Provide token type arguments or fetch a pool first to auto-fill types.");
      return;
    }

    setLoading(true);
    try {
      const cliAny = client as any;
      let readRes: any = null;
      const registryId = CONTRACTS.REGISTRY_DEX_ID;

      // Try common SDK read-only helpers (callReadOnly / readMove / devInspect)
      if (cliAny && typeof cliAny.callReadOnly === "function") {
        readRes = await cliAny.callReadOnly({
          package: CONTRACTS.PACKAGE_ID,
          module: MODULES.DEX_FACTORY,
          function: DEX_FUNCTIONS.GET_POOL_ADDRESS,
          arguments: [registryId],
          typeArguments: [tx, ty],
        });
      } else if (cliAny && typeof cliAny.readMove === "function") {
        readRes = await cliAny.readMove({
          package: CONTRACTS.PACKAGE_ID,
          module: MODULES.DEX_FACTORY,
          function: DEX_FUNCTIONS.GET_POOL_ADDRESS,
          arguments: [registryId],
          typeArguments: [tx, ty],
        });
      } else if (cliAny && typeof cliAny.devInspect === "function") {
        // devInspect may return a complex object; attempt to call it as a last resort
        try {
          const inspect = await cliAny.devInspect({
            sender: currentAccount?.address ?? "0x0",
            package: CONTRACTS.PACKAGE_ID,
            module: MODULES.DEX_FACTORY,
            function: DEX_FUNCTIONS.GET_POOL_ADDRESS,
            arguments: [registryId],
            typeArguments: [tx, ty],
          });
          readRes = inspect;
        } catch (e) {
          console.warn("devInspect failed:", e);
        }
      }

      // Interpret common shapes of readRes and extract an object id if present
      const idRegex = /0x[0-9a-fA-F]{64}/g;
      let foundId: string | null = null;
      try {
        const s = JSON.stringify(readRes);
        const m = s.match(idRegex);
        if (m && m.length > 0) foundId = m[0];
      } catch {
        // ignore
      }

      if (foundId) {
        setPoolId(foundId);
        alert(`Found pool: ${foundId}`);
      } else {
        alert("Pool not found for these token types.");
      }
    } catch (err) {
      console.error("Find pool failed:", err);
      alert(String(err));
    } finally {
      setLoading(false);
    }
  };

  // useMemo to avoid recalculating on each render
  const memoValues = useMemo(() => {
    if (!poolData) {
      return {
        kanariPerIota: "0",
        iotaPerKanari: "0",
        balanceXFormatted: "0",
        balanceYFormatted: "0",
        lpSupplyFormatted: "0",
        feePercent: "0",
        tvlUsd: "0.00",
      };
    }

    const balanceXNum = Number(poolData.balance_x);
    const balanceYNum = Number(poolData.balance_y);

    const kanariPerIota =
      balanceYNum === 0 ? "0" : (balanceXNum / balanceYNum).toFixed(6);
    const iotaPerKanari =
      balanceXNum === 0 ? "0" : (balanceYNum / balanceXNum).toFixed(6);

    const balanceXFormatted = formatAmount(toAmount(poolData.balance_x));
    const balanceYFormatted = formatAmount(toAmount(poolData.balance_y));
    const lpSupplyFormatted = formatAmount(toAmount(poolData.lp_supply));

    const feePercent = isNaN(parseInt(poolData.fee_bps))
      ? "0"
      : (parseInt(poolData.fee_bps) / 100).toFixed(2);

    // TVL: keep simple — use balance_y * 0.15 * 2 (as original) but ensure numeric
    const tvl =
      Number(String(formatAmount(toAmount(poolData.balance_y))).replace(/,/g, "")) || 0;
    const tvlUsd = ((tvl * 0.15) * 2).toFixed(2);

    return {
      kanariPerIota,
      iotaPerKanari,
      balanceXFormatted,
      balanceYFormatted,
      lpSupplyFormatted,
      feePercent,
      tvlUsd,
    };
  }, [poolData]);

  // Create oracle transaction
  const handleCreateOracle = async () => {
    if (!currentAccount) {
      alert("Please connect your wallet");
      return;
    }
    if (!poolId) {
      alert("Please fetch a pool and provide a pool ID first");
      return;
    }
    if (!tokenXTypeFull || !tokenYTypeFull) {
      alert("Unable to determine pool token types. Fetch pool info first.");
      return;
    }

    setLoading(true);
    try {
      const tx = new (await import("@iota/iota-sdk/transactions")).Transaction();

      tx.moveCall({
        target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX_FACTORY}::${DEX_FUNCTIONS.CREATE_ORACLE}`,
        arguments: [
          tx.object(poolId),
          tx.pure.u64(oracleMaxObservations),
          tx.object("0x6"), // system clock object
        ],
        typeArguments: [tokenXTypeFull, tokenYTypeFull],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (res) => {
            alert(`Create oracle submitted. Digest: ${res.digest}`);
          },
          onError: (err) => {
            console.error("Create oracle failed:", err);
            alert(`Create oracle failed: ${err?.message ?? String(err)}`);
          },
        }
      );
    } catch (e) {
      console.error(e);
      alert(String(e));
    } finally {
      setLoading(false);
    }
  };

  // Update oracle transaction (requires oracle object id)
  const handleUpdateOracle = async () => {
    if (!currentAccount) {
      alert("Please connect your wallet");
      return;
    }
    if (!poolId || !oracleId) {
      alert("Please provide both pool ID and oracle ID");
      return;
    }
    if (!tokenXTypeFull || !tokenYTypeFull) {
      alert("Unable to determine pool token types. Fetch pool info first.");
      return;
    }

    setLoading(true);
    try {
      const tx = new (await import("@iota/iota-sdk/transactions")).Transaction();

      tx.moveCall({
        target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX_FACTORY}::${DEX_FUNCTIONS.UPDATE_ORACLE}`,
        arguments: [
          tx.object(oracleId),
          tx.object(poolId),
          tx.object("0x6"),
        ],
        typeArguments: [tokenXTypeFull, tokenYTypeFull],
      });

      signAndExecute({ transaction: tx }, {
        onSuccess: (res) => alert(`Update oracle submitted. Digest: ${res.digest}`),
        onError: (err) => {
          console.error("Update oracle failed:", err);
          alert(`Update oracle failed: ${err?.message ?? String(err)}`);
        },
      });
    } catch (e) {
      console.error(e);
      alert(String(e));
    } finally {
      setLoading(false);
    }
  };

  // Fetch basic oracle info (observations count) via getObject
  const fetchOracleInfo = async () => {
    if (!oracleId) {
      alert("Please enter an oracle ID");
      return;
    }
    try {
      const obj = await client.getObject({ id: oracleId, options: { showContent: true } });
      if (obj.data?.content?.dataType === "moveObject") {
        const fields = obj.data.content.fields as unknown as Record<string, unknown>;
        const obs = fields?.observations as unknown;
        if (Array.isArray(obs)) {
          setOracleInfo({ observations: obs.length });
        } else if (typeof fields?.observations === "string") {
          // some backends may represent vectors differently; best-effort
          setOracleInfo({ observations: undefined });
        } else {
          setOracleInfo({ observations: undefined });
        }
      } else {
        alert("Invalid oracle object");
      }
    } catch (err) {
      console.error(err);
      alert(String(err));
    }
  };

  return (
    // container: responsive padding, max width and centered
    <Card maxWidth="max-w-md" minHeight="min-h-[560px]" className="shadow-sm mx-auto w-full">
      <h2 className="text-2xl font-bold mb-6 text-gray-900">Pool Information</h2>

      {/* Page lock removed — Pool info visible by default */}

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-zinc-700">
          Pool ID
        </label>

        {/* Dropdown to pick a pool (falls back to manual input) */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row gap-2 items-center w-full">
            <select
              value={availablePools.find((p) => p.poolId === poolId) ? poolId : ""}
              onChange={(e) => setPoolId(e.target.value)}
              disabled={poolsLoading}
              className="flex-1 w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none truncate sm:whitespace-nowrap"
            >
              <option value="">-- Choose a pool (or paste an ID below) --</option>
              {availablePools.map((p) => (
                <option key={p.poolId} value={p.poolId} title={p.poolId}>
                  {`${p.tokenXSymbol ?? "X"}/${p.tokenYSymbol ?? "Y"} — ${truncateId(p.poolId)}`}
                </option>
              ))}
            </select>

            <button
              onClick={fetchPoolInfo}
              disabled={loading || !poolId}
              className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? "..." : "Fetch"}
            </button>
          </div>

          {/* If a known pool is selected, show a compact readonly badge + copy button. Otherwise show paste input. */}
          {availablePools.find((p) => p.poolId === poolId) ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full">
              <div className="w-full sm:w-auto px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-700 truncate wrap-break-word">
                {truncateId(poolId)}
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(poolId)}
                className="w-full sm:w-auto px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => setPoolId("")}
                className="w-full sm:w-auto px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
              >
                Clear
              </button>
            </div>
          ) : (
            <input
              type="text"
              value={poolId}
              onChange={(e) => setPoolId(e.target.value)}
              placeholder="Or paste pool ID (0x...)"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 break-all"
            />
          )}
        </div>
      </div>

      {poolData && (
        // grid: single column on mobile, two columns on small+ screens to save vertical space
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Reserves */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm sm:text-base">Reserves</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm sm:text-base">{tokenXLabel}</span>
                <span className="font-mono font-semibold text-gray-900 text-sm sm:text-base truncate max-w-[140px] text-right">
                  {memoValues.balanceXFormatted}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm sm:text-base">{tokenYLabel}</span>
                <span className="font-mono font-semibold text-gray-900 text-sm sm:text-base truncate max-w-[140px] text-right">
                  {memoValues.balanceYFormatted}
                </span>
              </div>
            </div>
          </div>

          {/* Prices */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm sm:text-base">Prices</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm sm:text-base">1 {tokenYLabel} =</span>
                <span className="font-mono font-semibold text-gray-900 text-sm sm:text-base">
                  {memoValues.kanariPerIota} {tokenXLabel}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm sm:text-base">1 {tokenXLabel} =</span>
                <span className="font-mono font-semibold text-gray-900 text-sm sm:text-base">
                  {memoValues.iotaPerKanari} {tokenYLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Pool Stats */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm sm:text-base">Pool Stats</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm sm:text-base">LP Supply</span>
                <span className="font-mono font-semibold text-gray-900 text-sm sm:text-base truncate max-w-[140px] text-right">
                  {memoValues.lpSupplyFormatted}
                </span>
              </div>
              {poolUi && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-sm sm:text-base">Burn Reserve</span>
                    <span className="font-mono text-xs text-gray-700 truncate max-w-[140px] text-right">
                      {poolUi.burnAddr ? `${poolUi.burnAddr.slice(0, 8)}...${poolUi.burnAddr.slice(-6)}` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-sm sm:text-base">Burned LP</span>
                    <span className="font-mono font-semibold text-gray-900 text-sm sm:text-base">
                      {poolUi.burnedAmount ? formatAmount(BigInt(poolUi.burnedAmount)) : "0"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-sm sm:text-base">Active LP</span>
                    <span className="font-mono font-semibold text-gray-900 text-sm sm:text-base">
                      {poolUi.activeLp ? formatAmount(BigInt(poolUi.activeLp)) : memoValues.lpSupplyFormatted}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm sm:text-base">Fee</span>
                <span className="font-mono font-semibold text-gray-900 text-sm sm:text-base">
                  {memoValues.feePercent}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm sm:text-base">TVL (USD)</span>
                <span className="font-mono font-semibold text-gray-900 text-sm sm:text-base">
                  ${memoValues.tvlUsd}
                </span>
              </div>
            </div>
          </div>

          {/* Oracle Controls */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 sm:col-span-2">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm sm:text-base">Price Oracle</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
              <div className="sm:col-span-1">
                <label className="text-xs text-gray-600">Max observations</label>
                <input
                  type="number"
                  value={oracleMaxObservations}
                  onChange={(e) => setOracleMaxObservations(Math.max(1, Number(e.target.value || 1)))}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200"
                />
              </div>

              <div className="sm:col-span-1">
                <button
                  onClick={handleCreateOracle}
                  disabled={loading || !tokenXTypeFull || !tokenYTypeFull}
                  className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-200"
                >
                  Create Oracle
                </button>
              </div>

              <div className="sm:col-span-1">
                <label className="text-xs text-gray-600">Oracle ID</label>
                <input
                  type="text"
                  value={oracleId}
                  onChange={(e) => setOracleId(e.target.value)}
                  placeholder="0x..."
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={tokenXTypeInput}
                onChange={(e) => setTokenXTypeInput(e.target.value)}
                placeholder="Token X type (optional)"
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200"
              />
              <input
                type="text"
                value={tokenYTypeInput}
                onChange={(e) => setTokenYTypeInput(e.target.value)}
                placeholder="Token Y type (optional)"
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200"
              />
              <button
                onClick={findPoolByTypes}
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Find by types
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={handleUpdateOracle}
                disabled={loading || !oracleId}
                className="px-3 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-gray-200"
              >
                Update Oracle
              </button>

              <button
                onClick={fetchOracleInfo}
                disabled={!oracleId}
                className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Fetch Oracle Info
              </button>

              {oracleInfo && (
                <div className="ml-auto text-sm text-gray-700">Observations: {oracleInfo.observations ?? "?"}</div>
              )}
            </div>
          </div>

          {/* Share Calculator (if user has LP tokens) */}
          {currentAccount && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 sm:col-span-2">
              <h3 className="font-semibold text-gray-900 mb-2 text-sm sm:text-base">Your Position</h3>
              <p className="text-sm text-gray-700">
                Connect your wallet and check your LP tokens to see your pool share.
              </p>
            </div>
          )}
        </div>
      )}

      {!poolData && !loading && (
        <div className="text-center py-12 text-gray-500 text-sm sm:text-base">
          Enter a pool ID to view information
        </div>
      )}
    </Card>
  );
}
