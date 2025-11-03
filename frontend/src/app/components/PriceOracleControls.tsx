"use client";

import React, { useState } from "react";
import { CONTRACTS, MODULES, ORACLE_FUNCTIONS, DEEPBOOK } from "../lib/contracts";

export type SignAndExecute = (payload: unknown, callbacks?: unknown) => void;

type ClientWithGetObject = {
    getObject?: (args: { id: string; options?: unknown }) => Promise<unknown>;
};

type Props = {
    poolId: string;
    tokenXTypeFull: string | null;
    tokenYTypeFull: string | null;
    client: unknown;
    currentAccount: { address?: string } | null;
    signAndExecute: SignAndExecute; // pass-through from useSignAndExecuteTransaction
};

export default function PriceOracleControls({ poolId, tokenXTypeFull, tokenYTypeFull, client, signAndExecute }: Props) {
    const [oracleId, setOracleId] = useState("");
    // known oracles saved locally (id + optional pool association)
    const [knownOracles, setKnownOracles] = useState<Array<{ id: string; pool?: string }>>([]);
    const [oracleMaxObservations, setOracleMaxObservations] = useState<number>(100);
    const [oracleInfo, setOracleInfo] = useState<{ observations?: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [twapWindow, setTwapWindow] = useState<number>(60);
    const [twapTimestampMs, setTwapTimestampMs] = useState<number>(() => Date.now());
    const [twapResult, setTwapResult] = useState<{ raw?: string; formatted?: string } | null>(null);
    const [usedFallback, setUsedFallback] = useState(false);
    const [lastOracleJson, setLastOracleJson] = useState<string | null>(null);
    const [lastOracleParsed, setLastOracleParsed] = useState<Record<string, unknown> | null>(null);
    const [showOracleJson, setShowOracleJson] = useState(false);
    const [displayDecimals, setDisplayDecimals] = useState<number>(6);

    const handleCreateOracle = async () => {
        if (!tokenXTypeFull || !tokenYTypeFull) return alert("Fetch pool to auto-detect token types first");
        if (!poolId) return alert("Provide a pool ID first");

        setLoading(true);
        try {
            const tx = new (await import("@iota/iota-sdk/transactions")).Transaction();
            tx.moveCall({
                target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX_FACTORY}::${ORACLE_FUNCTIONS.CREATE_ORACLE}`,
                arguments: [tx.object(poolId), tx.pure.u64(oracleMaxObservations), tx.object("0x6")],
                typeArguments: [tokenXTypeFull, tokenYTypeFull],
            });

            signAndExecute({ transaction: tx }, {
                onSuccess: (res: unknown) => {
                    const r = res as { digest?: string } | null;
                    alert(`Create oracle submitted. Digest: ${r?.digest}`);
                },
                onError: (err: unknown) => { console.error(err); alert(String(err)); },
            });
        } catch (e) {
            console.error(e);
            alert(String(e));
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateOracle = async () => {
        if (!tokenXTypeFull || !tokenYTypeFull) return alert("Fetch pool to auto-detect token types first");
        if (!poolId || !oracleId) return alert("Provide both pool ID and oracle ID");

        setLoading(true);
        try {
            const tx = new (await import("@iota/iota-sdk/transactions")).Transaction();
            tx.moveCall({
                target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEX_FACTORY}::${ORACLE_FUNCTIONS.UPDATE_ORACLE}`,
                arguments: [tx.object(oracleId), tx.object(poolId), tx.object("0x6")],
                typeArguments: [tokenXTypeFull, tokenYTypeFull],
            });

            signAndExecute({ transaction: tx }, {
                onSuccess: (res: unknown) => {
                    const r = res as { digest?: string } | null;
                    alert(`Update oracle submitted. Digest: ${r?.digest}`);
                },
                onError: (err: unknown) => { console.error(err); alert(String(err)); },
            });
        } catch (e) {
            console.error(e);
            alert(String(e));
        } finally {
            setLoading(false);
        }
    };

    const fetchOracleInfo = async () => {
        if (!oracleId) return alert("Please enter an oracle ID");
        try {
            const cli = client as unknown as ClientWithGetObject;
            const obj = await cli.getObject?.({ id: oracleId, options: { showContent: true } });
            if (obj && typeof obj === "object") {
                const o = obj as { data?: { content?: { dataType?: string; fields?: unknown } } };
                if (o.data?.content?.dataType === "moveObject") {
                    const fields = o.data.content.fields as Record<string, unknown> | undefined;
                    const obs = fields?.observations as unknown;
                    if (Array.isArray(obs)) setOracleInfo({ observations: obs.length });
                    else setOracleInfo({ observations: undefined });
                } else {
                    alert("Invalid oracle object");
                }
            } else {
                alert("No object returned");
            }
        } catch (err) {
            console.error(err);
            alert(String(err));
        }
    };

    const handleGetTwapAtTime = async () => {
        if (!oracleId) return alert("Please enter an oracle ID");
        if (!tokenXTypeFull || !tokenYTypeFull) return alert("Fetch pool to auto-detect token types first");
        if (!twapWindow || twapWindow <= 0) return alert("Time window must be > 0 seconds");

        try {
            const cli = client as unknown as { callReadOnly?: (opts: unknown) => Promise<unknown>; readMove?: (opts: unknown) => Promise<unknown>; devInspect?: (opts: unknown) => Promise<unknown> } | null;

            // Prepare args: oracle id, time_window (u64), current_timestamp_ms (u64)
            const args = [oracleId, twapWindow, twapTimestampMs];

            let res: unknown = null;

            // reset fallback flag before attempting read-only calls
            setUsedFallback(false);
            setLastOracleJson(null);

            if (cli && typeof cli.callReadOnly === "function") {
                res = await cli.callReadOnly({
                    package: CONTRACTS.PACKAGE_ID,
                    module: MODULES.PRICE_ORACLE,
                    function: ORACLE_FUNCTIONS.GET_TWAP_PRICE_AT_TIME,
                    arguments: args,
                    typeArguments: [tokenXTypeFull, tokenYTypeFull],
                });
                setUsedFallback(false);
            } else if (cli && typeof cli.readMove === "function") {
                res = await cli.readMove({
                    package: CONTRACTS.PACKAGE_ID,
                    module: MODULES.PRICE_ORACLE,
                    function: ORACLE_FUNCTIONS.GET_TWAP_PRICE_AT_TIME,
                    arguments: args,
                    typeArguments: [tokenXTypeFull, tokenYTypeFull],
                });
                setUsedFallback(false);
            } else if (cli && typeof cli.devInspect === "function") {
                // devInspect requires constructing a transaction; use a minimal moveCall for inspection
                const { Transaction } = await import("@iota/iota-sdk/transactions");
                const tx = new Transaction();
                tx.moveCall({
                    target: `${CONTRACTS.PACKAGE_ID}::${MODULES.PRICE_ORACLE}::${ORACLE_FUNCTIONS.GET_TWAP_PRICE_AT_TIME}`,
                    arguments: [tx.object(oracleId), tx.pure.u64(twapWindow), tx.pure.u64(twapTimestampMs)],
                    typeArguments: [tokenXTypeFull, tokenYTypeFull],
                });
                res = await cli.devInspect({ transaction: tx });
            } else {
                // Fallback: attempt to fetch the oracle object and compute TWAP locally from stored observations
                // This works because observations are stored on-chain as (timestamp, price_cumulative)
                const cliObj = client as unknown as ClientWithGetObject | null;
                if (!cliObj || typeof cliObj.getObject !== "function") {
                    throw new Error("Client does not support read-only calls and object fetch not available");
                }

                const obj = await cliObj.getObject?.({ id: oracleId, options: { showContent: true } });
                if (!obj || typeof obj !== "object") throw new Error("Failed to fetch oracle object for local TWAP computation");
                const o = obj as { data?: { content?: { dataType?: string; fields?: unknown } } };
                if (o.data?.content?.dataType !== "moveObject") throw new Error("Invalid oracle object");
                const fields = o.data.content.fields as Record<string, unknown> | undefined;
                // store JSON for user debugging / to provide sample
                try {
                    setLastOracleJson(JSON.stringify(fields ?? null, null, 2));
                    setLastOracleParsed(fields ?? null);
                } catch {
                    setLastOracleJson(null);
                    setLastOracleParsed(null);
                }
                setUsedFallback(true);
                const obsRaw = fields?.observations as unknown;
                if (!Array.isArray(obsRaw) || obsRaw.length < 2) throw new Error("Not enough observations to calculate TWAP");

                // Normalize observations: try to extract { timestamp, price_cumulative }
                const observations: Array<{ timestamp: number; price_cumulative: bigint }> = [];
                for (const item of obsRaw as unknown[]) {
                    if (!item) continue;
                    // item might be an object with numeric or string fields, or nested under 'fields'
                    let ts: number | null = null;
                    let pc: bigint | null = null;
                    if (typeof item === "object") {
                        const it = item as Record<string, unknown>;
                        // direct fields
                        if (typeof it.timestamp === "number") ts = it.timestamp as number;
                        if (typeof it.timestamp === "string") ts = Number(it.timestamp);
                        const pcRaw = it.price_cumulative ?? it.priceCumulative ?? it.price_cumulative_u128 ?? it.price;
                        if (typeof pcRaw === "string") { try { pc = BigInt(pcRaw); } catch { pc = null; } }
                        if (typeof pcRaw === "number") { try { pc = BigInt(Math.floor(pcRaw)); } catch { pc = null; } }
                        // sometimes wrapped: { fields: { timestamp: ..., price_cumulative: ... } }
                        // handle nested 'fields' wrapper if present
                        const itemObj = item as Record<string, unknown>;
                        const nested = itemObj.fields;
                        if (nested && typeof nested === "object") {
                            const f = nested as Record<string, unknown>;
                            if (ts == null && (typeof f.timestamp === "number" || typeof f.timestamp === "string")) ts = Number(f.timestamp);
                            const pf = f.price_cumulative ?? f.priceCumulative ?? f.price;
                            if (pf != null && pc == null) {
                                try { pc = typeof pf === "string" ? BigInt(pf) : BigInt(Math.floor(Number(pf))); } catch { /* ignore */ }
                            }
                        }
                    }
                    if (ts != null && pc != null) observations.push({ timestamp: ts, price_cumulative: pc });
                }

                if (observations.length < 2) throw new Error("Parsed observations insufficient for TWAP");

                // Observations should be sorted by timestamp; ensure ascending
                observations.sort((a, b) => a.timestamp - b.timestamp);

                const current_time_sec = Math.floor(twapTimestampMs / 1000);
                const target_start_time = current_time_sec > twapWindow ? current_time_sec - twapWindow : 0;

                // Binary search: find rightmost obs.timestamp <= target_start_time
                let left = 0;
                let right = observations.length - 1;
                while (left < right) {
                    const mid = left + Math.floor((right - left + 1) / 2);
                    if (observations[mid].timestamp <= target_start_time) left = mid;
                    else right = mid - 1;
                }
                const start_idx = left;
                const end_idx = observations.length - 1;
                if (end_idx <= start_idx) throw new Error("Not enough observation span for TWAP calculation");

                const start_obs = observations[start_idx];
                const end_obs = observations[end_idx];
                const price_delta = end_obs.price_cumulative - start_obs.price_cumulative; // bigint
                const time_delta = BigInt(end_obs.timestamp - start_obs.timestamp);
                if (time_delta <= BigInt(0)) throw new Error("Invalid time delta in observations");
                const twap_u128 = price_delta / time_delta; // bigint representing price * PRICE_PRECISION

                const rawLocal = twap_u128.toString();
                // Format
                const prec = DEEPBOOK.PRICE_SCALE || 1_000_000_000;
                let formattedLocal: string | undefined;
                try {
                    const whole = twap_u128 / BigInt(prec);
                    const frac = twap_u128 % BigInt(prec);
                    const fracStr = frac.toString().padStart(String(prec).length - 1, "0");
                    formattedLocal = `${whole.toString()}.${fracStr}`;
                } catch {
                    formattedLocal = rawLocal;
                }

                setTwapResult({ raw: rawLocal, formatted: formattedLocal });
                return; // done with fallback
            }

            // mark not using fallback when read-only returned a result
            setUsedFallback(false);

            // Interpret response conservatively: could be raw u128 string or wrapped object
            let raw: string | undefined;
            if (res == null) {
                throw new Error("No response from client");
            }
            if (typeof res === "string" || typeof res === "number") raw = String(res);
            else if (Array.isArray(res) && res.length > 0) raw = String(res[0]);
            else if (typeof res === "object") {
                const r = res as Record<string, unknown>;
                // common wrapper shapes used elsewhere: { result: <val> } or { data: <val> } or direct return
                if ("Ok" in r) raw = String((r as Record<string, unknown>).Ok);
                else raw = String(r.result ?? r.data ?? r.value ?? JSON.stringify(r));
            }

            // Format result: convert u128 raw to human number dividing by PRICE_PRECISION
            let formatted: string | undefined;
            try {
                const prec = DEEPBOOK.PRICE_SCALE || 1_000_000_000;
                if (raw) {
                    // raw may be a big integer string; use BigInt if possible
                    try {
                        const bi = BigInt(raw);
                        const whole = bi / BigInt(prec);
                        const frac = bi % BigInt(prec);
                        const precDigits = String(prec).length - 1;
                        let fracStr = frac.toString().padStart(precDigits, "0");
                        // trim trailing zeros according to displayDecimals
                        const show = Math.min(displayDecimals, precDigits);
                        if (show < precDigits) {
                            fracStr = fracStr.slice(0, show);
                            // trim trailing zeros
                            fracStr = fracStr.replace(/0+$/g, "");
                        } else {
                            fracStr = fracStr.replace(/0+$/g, "");
                        }

                        // format integer part with grouping (commas) and locale
                        const fmtInt = (() => {
                            const s = whole.toString();
                            // if small enough, use Intl for locale-aware grouping
                            try {
                                const num = Number(s);
                                if (Number.isFinite(num) && Math.abs(num) <= Number.MAX_SAFE_INTEGER) {
                                    return new Intl.NumberFormat(navigator.language).format(num);
                                }
                            } catch { /* fallback to manual grouping */ }
                            return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                        })();

                        formatted = fracStr ? `${fmtInt}.${fracStr}` : `${fmtInt}`;
                    } catch {
                        const n = Number(raw);
                        if (!Number.isFinite(n)) formatted = raw;
                        else formatted = new Intl.NumberFormat(navigator.language, { maximumFractionDigits: displayDecimals }).format(n / (DEEPBOOK.PRICE_SCALE || 1_000_000_000));
                    }
                }
            } catch (e) {
                console.warn("Failed to format TWAP result", e);
            }

            setTwapResult({ raw: raw ?? undefined, formatted: formatted ?? undefined });
        } catch (err) {
            console.error(err);
            alert(String(err));
        }
    };

    // Local storage helpers for known oracles
    const loadKnownOracles = () => {
        try {
            const raw = localStorage.getItem("known_oracles_v1");
            if (!raw) return setKnownOracles([]);
            const arr = JSON.parse(raw) as Array<{ id: string; pool?: string }>;
            setKnownOracles(Array.isArray(arr) ? arr : []);
        } catch (e) {
            console.warn("Failed to load known oracles", e);
            setKnownOracles([]);
        }
    };

    // Load known oracles from on-chain events (OracleCreated)
    const loadKnownOraclesFromChain = React.useCallback(async () => {
        try {
            // helper: queryEvents with fallback
            const queryEventsWithFallback = async (clientObj: unknown, eventType: string, limit = 100) => {
                const cli = clientObj as { queryEvents?: (opts: unknown) => Promise<unknown> } | null;
                if (!cli || typeof cli.queryEvents !== "function") throw new Error("client.queryEvents not available");
                try { return await cli.queryEvents({ query: { MoveEventType: eventType }, limit }); }
                catch (e1) {
                    try { return await cli.queryEvents({ query: { moveEventType: eventType }, limit }); } catch { throw e1; }
                }
            };

            // helper: extract oracle and pool ids from event
            const getOracleFromEvent = (event: unknown): { id: string | null; pool?: string | null } => {
                if (!event || typeof event !== "object") return { id: null };
                const evt = event as Record<string, unknown>;
                const parsed = evt.parsedJson;
                if (!parsed) return { id: null };
                if (typeof parsed === "string") {
                    try {
                        const obj = JSON.parse(parsed) as Record<string, unknown>;
                        return {
                            id: String(obj.oracle_id ?? obj.oracleId ?? (obj.fields as Record<string, unknown>)?.oracle_id ?? "") || null,
                            pool: String(obj.pool_id ?? obj.poolId ?? (obj.fields as Record<string, unknown>)?.pool_id ?? "") || null,
                        };
                    } catch { return { id: null }; }
                }
                if (typeof parsed === "object") {
                    const p = parsed as Record<string, unknown>;
                    return {
                        id: String(p.oracle_id ?? p.oracleId ?? (p.fields as Record<string, unknown>)?.oracle_id ?? (p.data as Record<string, unknown>)?.oracle_id ?? "") || null,
                        pool: String(p.pool_id ?? p.poolId ?? (p.fields as Record<string, unknown>)?.pool_id ?? (p.data as Record<string, unknown>)?.pool_id ?? "") || null,
                    };
                }
                return { id: null };
            };

            const eventType = `${CONTRACTS.PACKAGE_ID}::${MODULES.PRICE_ORACLE}::OracleCreated`;
            const resp = await queryEventsWithFallback(client, eventType, 200);

            const respObj = resp && typeof resp === "object" ? (resp as Record<string, unknown>) : {};
            const events = Array.isArray(respObj.data) ? (respObj.data as unknown[]) : [];

            const found: Array<{ id: string; pool?: string }> = [];
            for (const ev of events) {
                const o = getOracleFromEvent(ev);
                if (!o.id) continue;
                if (!found.find((x) => x.id === o.id)) found.push({ id: o.id, pool: o.pool ?? undefined });
            }

            if (found.length > 0) {
                const raw = localStorage.getItem("known_oracles_v1");
                const local = raw ? (JSON.parse(raw) as Array<{ id: string; pool?: string }>) : [];
                const merged = [...found];
                for (const l of local) if (!merged.find((m) => m.id === l.id)) merged.push(l);
                setKnownOracles(merged.slice(0, 50));
                try { localStorage.setItem("known_oracles_v1", JSON.stringify(merged.slice(0, 50))); } catch { /* ignore */ }
                return;
            }

            loadKnownOracles();
        } catch (e) {
            console.warn("Failed to fetch oracles from chain, falling back to local storage", e);
            loadKnownOracles();
        }
    }, [client]);

    const saveOracleLocal = (id: string, pool?: string) => {
        if (!id) return;
        try {
            const raw = localStorage.getItem("known_oracles_v1");
            const arr = raw ? (JSON.parse(raw) as Array<{ id: string; pool?: string }>) : [];
            const exists = arr.find((o) => o.id === id);
            if (!exists) {
                arr.unshift({ id, pool });
                // keep up to 20 entries
                localStorage.setItem("known_oracles_v1", JSON.stringify(arr.slice(0, 20)));
                setKnownOracles(arr.slice(0, 20));
            }
        } catch (e) {
            console.warn("Failed to save known oracle", e);
        }
    };

    // initialize known oracles on mount: try on-chain first, then fallback to localStorage
    React.useEffect(() => {
        let mounted = true;
        (async () => {
            if (!mounted) return;
            try {
                await loadKnownOraclesFromChain();
            } catch {
                try { loadKnownOracles(); } catch { /* ignore */ }
            }
        })();

        return () => { mounted = false; };
    }, [loadKnownOraclesFromChain]);

    // Prepare grouped, deduplicated oracle list for the select control
    const uniqueKnownOracles = React.useMemo(() => {
        const map = new Map<string, { id: string; pool?: string }>();
        for (const o of knownOracles) {
            if (!o || !o.id) continue;
            if (!map.has(o.id)) map.set(o.id, o);
        }
        return Array.from(map.values());
    }, [knownOracles]);

    const groupedOracles = React.useMemo(() => {
        const groups: Record<string, Array<{ id: string; pool?: string }>> = {};
        for (const o of uniqueKnownOracles) {
            const key = o.pool || "__other__";
            if (!groups[key]) groups[key] = [];
            groups[key].push(o);
        }
        // make an ordered list: current pool first (if present), then other pools alphabetically, then __other__
        const orderedKeys: string[] = [];
        if (poolId && groups[poolId]) orderedKeys.push(poolId);
        const otherKeys = Object.keys(groups).filter((k) => k !== poolId && k !== "__other__").sort();
        orderedKeys.push(...otherKeys);
        if (groups["__other__"]) orderedKeys.push("__other__");

        return orderedKeys.map((k) => ({ key: k, items: groups[k] }));
    }, [uniqueKnownOracles, poolId]);

    const shortId = (id: string) => {
        if (!id) return "";
        if (id.length <= 18) return id;
        return `${id.slice(0, 8)}...${id.slice(-8)}`;
    };

    const poolOracles = React.useMemo(() => {
        if (!poolId) return [] as Array<{ id: string; pool?: string }>;
        return uniqueKnownOracles.filter((o) => o.pool === poolId);
    }, [uniqueKnownOracles, poolId]);


    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:col-span-2">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm sm:text-base">Price Oracle</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                <div className="sm:col-span-1">
                    <label className="text-xs text-gray-600">Max observations</label>
                    <input type="number" value={oracleMaxObservations} onChange={(e) => setOracleMaxObservations(Math.max(1, Number(e.target.value || 1)))} className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200" />
                </div>

                <div className="sm:col-span-1">
                    <button onClick={handleCreateOracle} disabled={loading || !tokenXTypeFull || !tokenYTypeFull} className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-200">Create Oracle</button>
                </div>

                <div className="sm:col-span-1">
                    <label className="text-xs text-gray-600">Oracle ID</label>
                    <div className="flex gap-2 items-center">
                        <select
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 bg-white"
                            value={oracleId || ""}
                            onChange={(e) => setOracleId(e.target.value)}
                        >
                            <option value="">-- choose or enter --</option>
                            {poolId ? (
                                poolOracles.length > 0 ? (
                                    poolOracles.map((o) => (
                                        <option key={o.id} value={o.id}>{shortId(o.id)}</option>
                                    ))
                                ) : (
                                    <option disabled>-- no known oracles for this pool --</option>
                                )
                            ) : (
                                groupedOracles.map((grp) => (
                                    <optgroup key={grp.key} label={grp.key === "__other__" ? "Other" : shortId(grp.key)}>
                                        {grp.items.map((o) => (
                                            <option key={o.id} value={o.id}>{shortId(o.id)}</option>
                                        ))}
                                    </optgroup>
                                ))
                            )}
                        </select>
                    </div>
                    <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => saveOracleLocal(oracleId, poolId || undefined)} disabled={!oracleId} className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-200">Save</button>
                        <button type="button" onClick={() => { setOracleId(""); }} className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">Clear</button>
                    </div>
                </div>
            </div>

            <div className="mt-3 flex gap-2">
                <button onClick={handleUpdateOracle} disabled={loading || !oracleId} className="px-3 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-gray-200">Update Oracle</button>
                <button onClick={fetchOracleInfo} disabled={!oracleId} className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">Fetch Oracle Info</button>
                {oracleInfo && <div className="ml-auto text-sm text-gray-700">Observations: {oracleInfo.observations ?? "?"}</div>}
            </div>

            {/* TWAP query */}
            <div className="mt-4 border-t pt-3">
                <h4 className="text-sm font-medium text-gray-800 mb-2">Query TWAP (get_twap_price_at_time)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                    <div>
                        <label className="text-xs text-gray-600">Time window (seconds)</label>
                        <input type="number" value={twapWindow} onChange={(e) => setTwapWindow(Math.max(1, Number(e.target.value || 1)))} className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200" />
                    </div>
                    <div>
                        <label className="text-xs text-gray-600">Current timestamp (ms)</label>
                        <div className="flex gap-2">
                            <input type="number" value={twapTimestampMs} onChange={(e) => setTwapTimestampMs(Number(e.target.value || Date.now()))} className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200" />
                            <button type="button" onClick={() => setTwapTimestampMs(Date.now())} className="px-3 py-2 bg-gray-100 rounded-lg border border-gray-200">Now</button>
                        </div>
                    </div>
                    <div>
                        <button onClick={handleGetTwapAtTime} disabled={!oracleId || !tokenXTypeFull || !tokenYTypeFull} className="w-full px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-200">Get TWAP</button>
                    </div>
                </div>

                {usedFallback && (
                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-100 text-sm text-yellow-800 rounded">
                        Using local computation fallback — TWAP computed from on-chain observations fetched via getObject().
                        {lastOracleJson && (
                            <div className="mt-2 flex flex-col gap-2">
                                <div className="flex gap-2">
                                    <button onClick={() => { navigator.clipboard?.writeText(lastOracleJson); alert('Oracle JSON copied to clipboard'); }} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs">Copy Oracle JSON</button>
                                    <button onClick={() => {
                                        try {
                                            const blob = new Blob([lastOracleJson], { type: 'application/json' });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `oracle-${oracleId || 'unknown'}.json`;
                                            document.body.appendChild(a);
                                            a.click();
                                            a.remove();
                                            URL.revokeObjectURL(url);
                                        } catch (e) { console.error(e); alert('Download failed'); }
                                    }} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs">Download JSON</button>
                                    <button onClick={() => setShowOracleJson((v) => !v)} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs">{showOracleJson ? 'Hide' : 'Show'} Oracle JSON</button>
                                </div>
                                <div className="text-xs text-gray-600">If parser fails, please paste this JSON in the issue so we can improve parsing.</div>
                                {showOracleJson && lastOracleJson && (
                                    <pre className="mt-2 max-h-56 overflow-auto bg-black text-white p-2 rounded text-xs">{lastOracleJson}</pre>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {twapResult && (
                    <div className="mt-3 bg-gray-50 p-3 rounded-lg border border-gray-100 text-sm text-gray-800">
                        <div className="flex items-center justify-between">
                            <div>Raw: <span className="font-mono">{twapResult.raw}</span></div>
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-600">Decimals:</label>
                                <select value={displayDecimals} onChange={(e) => setDisplayDecimals(Number(e.target.value))} className="text-xs px-2 py-1 border rounded">
                                    <option value={2}>2</option>
                                    <option value={4}>4</option>
                                    <option value={6}>6</option>
                                    <option value={9}>9</option>
                                </select>
                            </div>
                        </div>
                        <div className="mt-2">Formatted: <span className="font-mono">{twapResult.formatted ?? "?"}</span></div>
                        <div className="text-xs text-gray-500 mt-1">Note: value shown as Y per X, precision {DEEPBOOK.PRICE_SCALE}</div>
                    </div>
                )}

                {lastOracleParsed && Array.isArray((lastOracleParsed as Record<string, unknown>)?.observations) && (
                    <div className="mt-3">
                        <h5 className="text-sm font-medium text-gray-800 mb-2">Parsed Observations</h5>
                        <div className="overflow-auto max-h-48 border rounded">
                            <table className="w-full text-xs">
                                <thead className="bg-gray-100 sticky top-0">
                                    <tr>
                                        <th className="px-2 py-1 text-left">#</th>
                                        <th className="px-2 py-1 text-left">Timestamp (s)</th>
                                        <th className="px-2 py-1 text-left">ISO</th>
                                        <th className="px-2 py-1 text-right">price_cumulative</th>
                                        <th className="px-2 py-1 text-right">Spot</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {((lastOracleParsed as Record<string, unknown>).observations as unknown[]).map((it: unknown, idx: number) => {
                                        const itObj = it && typeof it === 'object' ? (it as Record<string, unknown>) : {};
                                        const f = (itObj.fields && typeof itObj.fields === 'object') ? (itObj.fields as Record<string, unknown>) : itObj;
                                        const ts = f?.timestamp ? Number(f.timestamp) : NaN;
                                        const pc = f?.price_cumulative ?? f?.priceCumulative ?? f?.price;
                                        const pcStr = pc != null ? String(pc) : "-";
                                        const iso = Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : "-";
                                        return (
                                            <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                                <td className="px-2 py-1">{idx}</td>
                                                <td className="px-2 py-1">{isNaN(ts) ? "-" : ts}</td>
                                                <td className="px-2 py-1">{iso}</td>
                                                <td className="px-2 py-1 text-right font-mono">{pcStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</td>
                                                <td className="px-2 py-1 text-right font-mono">
                                                    {
                                                        (() => {
                                                            // compute implied spot from this and previous observation
                                                            try {
                                                                if (idx === 0) return '-';
                                                                const prevRaw = ((lastOracleParsed as Record<string, unknown>).observations as unknown[])[idx - 1];
                                                                const prevObj = prevRaw && typeof prevRaw === 'object' ? (prevRaw as Record<string, unknown>) : {};
                                                                const pf = (prevObj.fields && typeof prevObj.fields === 'object') ? (prevObj.fields as Record<string, unknown>) : prevObj;
                                                                const prevTs = pf?.timestamp ? Number(pf.timestamp) : NaN;
                                                                const prevPcRaw = pf?.price_cumulative ?? pf?.priceCumulative ?? pf?.price;
                                                                if (!prevPcRaw || isNaN(prevTs) || isNaN(ts)) return '-';
                                                                const pcBig = BigInt(String(pc));
                                                                const prevBig = BigInt(String(prevPcRaw));
                                                                const dt = ts - prevTs;
                                                                if (dt <= 0) return '-';
                                                                const spotU128 = (pcBig - prevBig) / BigInt(dt); // price * PRECISION
                                                                const prec = DEEPBOOK.PRICE_SCALE || 1_000_000_000;
                                                                const whole = spotU128 / BigInt(prec);
                                                                const frac = spotU128 % BigInt(prec);
                                                                const precDigits = String(prec).length - 1;
                                                                let fracStr = frac.toString().padStart(precDigits, '0').slice(0, displayDecimals);
                                                                fracStr = fracStr.replace(/0+$/g, '');
                                                                const intFormatted = (() => {
                                                                    try {
                                                                        const num = Number(whole.toString());
                                                                        if (Number.isFinite(num) && Math.abs(num) <= Number.MAX_SAFE_INTEGER) {
                                                                            return new Intl.NumberFormat(navigator.language).format(num);
                                                                        }
                                                                    } catch { }
                                                                    return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                                                                })();
                                                                return fracStr ? `${intFormatted}.${fracStr}` : `${intFormatted}`;
                                                            } catch { return '-'; }
                                                        })()
                                                    }
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}