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
                    <input type="text" value={oracleId} onChange={(e) => setOracleId(e.target.value)} placeholder="0x..." className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200" />
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
