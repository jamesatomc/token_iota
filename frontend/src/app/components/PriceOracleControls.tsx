"use client";

import React, { useState } from "react";
import { CONTRACTS, MODULES, ORACLE_FUNCTIONS } from "../lib/contracts";

// minimal ReadOnlyClient type used in PoolInfo
type ReadOnlyClient = {
    callReadOnly?: (args: unknown) => Promise<unknown>;
    readMove?: (args: unknown) => Promise<unknown>;
    devInspect?: (args: unknown) => Promise<unknown>;
};

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

export default function PriceOracleControls({ poolId, tokenXTypeFull, tokenYTypeFull, client, currentAccount, signAndExecute }: Props) {
    const [oracleId, setOracleId] = useState("");
    // known oracles saved locally (id + optional pool association)
    const [knownOracles, setKnownOracles] = useState<Array<{ id: string; pool?: string }>>([]);
    const [oracleMaxObservations, setOracleMaxObservations] = useState<number>(100);
    const [oracleInfo, setOracleInfo] = useState<{ observations?: number } | null>(null);
    const [loading, setLoading] = useState(false);

    const [timeWindow, setTimeWindow] = useState<number>(60);
    const [twapResult, setTwapResult] = useState<string | null>(null);
    const [spotPrice, setSpotPrice] = useState<string | null>(null);
    const [observationIndex, setObservationIndex] = useState<number>(0);
    const [observationAtIndex, setObservationAtIndex] = useState<{ timestamp: string; cumulative: string } | null>(null);

    const callReadOnlyMove = async (
        pkg: string,
        moduleName: string,
        func: string,
        args: unknown[] = [],
        typeArgs: string[] = []
    ): Promise<unknown> => {
        const cli = client as unknown as ReadOnlyClient;
        try {
            if (cli && typeof cli.callReadOnly === "function") {
                return await cli.callReadOnly({ package: pkg, module: moduleName, function: func, arguments: args, typeArguments: typeArgs });
            }
            if (cli && typeof cli.readMove === "function") {
                return await cli.readMove({ package: pkg, module: moduleName, function: func, arguments: args, typeArguments: typeArgs });
            }
        } catch (e) {
            console.warn("read-only move helper failed (callReadOnly/readMove)", e);
        }

        try {
            if (cli && typeof cli.devInspect === "function") {
                const inspect = await cli.devInspect({ sender: currentAccount?.address ?? "0x0", package: pkg, module: moduleName, function: func, arguments: args, typeArguments: typeArgs });
                return inspect;
            }
        } catch (e) {
            console.warn("devInspect fallback failed", e);
        }

        throw new Error("No read-only move API available on client");
    };

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

    const fetchTwapAtTime = async () => {
        if (!oracleId) return alert("Please enter an oracle ID");
        if (!tokenXTypeFull || !tokenYTypeFull) return alert("Fetch pool to auto-detect token types first");
        setLoading(true);
        try {
            const nowMs = Date.now();
            const res = await callReadOnlyMove(CONTRACTS.PACKAGE_ID, MODULES.PRICE_ORACLE, ORACLE_FUNCTIONS.GET_TWAP_AT_TIME, [oracleId, String(timeWindow), String(nowMs)], [tokenXTypeFull, tokenYTypeFull]);
            if (res == null) setTwapResult(null);
            else if (typeof res === "string" || typeof res === "number") setTwapResult(String(res));
            else if (Array.isArray(res) && res.length > 0) setTwapResult(String(res[0]));
            else setTwapResult(JSON.stringify(res));
        } catch (err) { console.error(err); alert(String(err)); } finally { setLoading(false); }
    };

    const fetchSpotPrice = async () => {
        if (!poolId) return alert("Please provide a pool ID");
        if (!tokenXTypeFull || !tokenYTypeFull) return alert("Fetch pool to auto-detect token types first");
        setLoading(true);
        try {
            const res = await callReadOnlyMove(CONTRACTS.PACKAGE_ID, MODULES.PRICE_ORACLE, ORACLE_FUNCTIONS.GET_SPOT_PRICE, [poolId], [tokenXTypeFull, tokenYTypeFull]);
            if (res == null) setSpotPrice(null);
            else if (typeof res === "string" || typeof res === "number") setSpotPrice(String(res));
            else if (Array.isArray(res) && res.length > 0) setSpotPrice(String(res[0]));
            else setSpotPrice(JSON.stringify(res));
        } catch (err) { console.error(err); alert(String(err)); } finally { setLoading(false); }
    };

    const fetchObservationAtIndex = async () => {
        if (!oracleId) return alert("Please enter an oracle ID");
        if (!tokenXTypeFull || !tokenYTypeFull) return alert("Fetch pool to auto-detect token types first");
        setLoading(true);
        try {
            const res = await callReadOnlyMove(CONTRACTS.PACKAGE_ID, MODULES.PRICE_ORACLE, ORACLE_FUNCTIONS.GET_OBSERVATION_AT_INDEX, [oracleId, String(observationIndex)], [tokenXTypeFull, tokenYTypeFull]);
            if (res == null) setObservationAtIndex(null);
            else if (Array.isArray(res) && res.length >= 2) setObservationAtIndex({ timestamp: String(res[0]), cumulative: String(res[1]) });
            else if (typeof res === "object") {
                const r = res as Record<string, unknown>;
                const ts = r["0"] ?? r["timestamp"] ?? r["time"] ?? null;
                const cum = r["1"] ?? r["price_cumulative"] ?? r["cumulative"] ?? null;
                setObservationAtIndex({ timestamp: String(ts ?? "?"), cumulative: String(cum ?? "?") });
            } else setObservationAtIndex({ timestamp: String(res), cumulative: "?" });
        } catch (err) { console.error(err); alert(String(err)); } finally { setLoading(false); }
    };

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

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                <div>
                    <label className="text-xs text-gray-600">TWAP Window (s)</label>
                    <input type="number" min={1} value={timeWindow} onChange={(e) => setTimeWindow(Math.max(1, Number(e.target.value || 1)))} className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200" />
                </div>

                <div className="flex gap-2 items-center">
                    <button onClick={fetchTwapAtTime} disabled={!oracleId} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-200">Fetch TWAP</button>
                    <div className="text-sm text-gray-700 truncate">TWAP: {twapResult ?? "-"}</div>
                </div>

                <div className="flex gap-2 items-center">
                    <button onClick={fetchSpotPrice} disabled={!poolId} className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">Fetch Spot Price</button>
                    <div className="text-sm text-gray-700 truncate">Spot: {spotPrice ?? "-"}</div>
                </div>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                <div>
                    <label className="text-xs text-gray-600">Observation index</label>
                    <input type="number" min={0} value={observationIndex} onChange={(e) => setObservationIndex(Math.max(0, Number(e.target.value || 0)))} className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200" />
                </div>

                <div className="sm:col-span-2 flex items-center gap-2">
                    <button onClick={fetchObservationAtIndex} disabled={!oracleId} className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">Fetch Observation</button>
                    <div className="text-sm text-gray-700">
                        {observationAtIndex ? <div className="font-mono text-xs">ts: {observationAtIndex.timestamp} • cum: {observationAtIndex.cumulative}</div> : <div className="text-gray-500">No observation loaded</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}
