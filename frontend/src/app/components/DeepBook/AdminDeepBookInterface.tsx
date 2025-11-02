"use client";

import { useEffect, useState, useCallback } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount, useIotaClient } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import Card from "../UI/Card";
import { CONTRACTS, MODULES, DEFAULT_TOKENS, parseAmount, formatAmount } from "../../lib/contracts";

type ReadOnlyClient = {
  callReadOnly?: (args: unknown) => Promise<unknown>;
  readMove?: (args: unknown) => Promise<unknown>;
  devInspect?: (args: unknown) => Promise<unknown>;
};

type RegisteredPair = {
  bookId: string;
  baseToken: string;
  quoteToken: string;
  baseSymbol: string;
  quoteSymbol: string;
};

const getDecimals = (type: string) => {
  const t = DEFAULT_TOKENS.find((x) => x.type === type);
  return t && typeof t.decimals === "number" ? t.decimals : 9;
};

export default function AdminDeepBookInterface() {
  const client = useIotaClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();

  const [registeredPairs, setRegisteredPairs] = useState<RegisteredPair[]>([]);
  const [loadingPairs, setLoadingPairs] = useState(false);
  const [selectedBook, setSelectedBook] = useState<string>("");
  const [feeBalances, setFeeBalances] = useState<{ base?: string; quote?: string } | null>(null);

  const [newAdmin, setNewAdmin] = useState("");
  const [withdrawTo, setWithdrawTo] = useState("");
  const [withdrawBaseAmount, setWithdrawBaseAmount] = useState("");
  const [withdrawQuoteAmount, setWithdrawQuoteAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchRegisteredPairs = async () => {
      const registryId = CONTRACTS.REGISTRY_BOOK_ID;
      if (!registryId) return;
      setLoadingPairs(true);
      try {
        const registryObjInfo = await client.getObject({ id: registryId, options: { showContent: true, showType: true } });

        // attempt to find the inner books table id (same approach as DeepBookInterface)
        let booksTableId: string | null = null;
        if (registryObjInfo?.data?.content && "fields" in registryObjInfo.data.content) {
          const registryFields = (registryObjInfo.data.content as unknown as Record<string, unknown>).fields as Record<string, unknown> | undefined;
          if (registryFields && registryFields.books) {
            try {
              const bfUnknown = registryFields.books as unknown;
              const fieldsObj = (bfUnknown && typeof bfUnknown === "object" && "fields" in bfUnknown) ? ((bfUnknown as Record<string, unknown>).fields as Record<string, unknown> | undefined) : undefined;
              if (fieldsObj) {
                const idObj = fieldsObj.id as unknown;
                if (typeof idObj === "string") booksTableId = idObj;
                else if (typeof idObj === "object" && idObj !== null) {
                  const idProp = (idObj as Record<string, unknown>).id;
                  if (typeof idProp === "string") booksTableId = idProp;
                }
              }
            } catch {
              // ignore
            }
          }
        }

        const parentId = booksTableId || CONTRACTS.REGISTRY_BOOK_ID;
        const registryObj = await client.getDynamicFields({ parentId });
        if (!registryObj?.data || registryObj.data.length === 0) {
          setRegisteredPairs([]);
          return;
        }

        const pairs: RegisteredPair[] = [];
        const idRegex = /^0x[0-9a-fA-F]{64}$/;

        for (const field of registryObj.data) {
          try {
            const fieldObj = await client.getDynamicFieldObject({ parentId, name: field.name });
            let bookAddress: string | null = null;
            if (fieldObj?.data?.content && "fields" in fieldObj.data.content) {
              const fields = (fieldObj.data.content as unknown as Record<string, unknown>).fields as Record<string, unknown> | undefined;
              const maybe = (fields?.value ?? fields?.book_id ?? fields?.id) as unknown;
              if (typeof maybe === "string") bookAddress = maybe;
            } else if (fieldObj?.data?.objectId) {
              bookAddress = fieldObj.data.objectId;
            } else if (field.objectId) {
              bookAddress = field.objectId;
            }

            if (!bookAddress || !idRegex.test(bookAddress)) continue;

            const bookObj = await client.getObject({ id: bookAddress, options: { showType: true } });
            if (bookObj?.data?.type) {
              const typeStr = bookObj.data.type as string;
              const match = typeStr.match(/<(.+),\s*(.+)>/);
              if (match && match[1] && match[2]) {
                const baseType = match[1].trim();
                const quoteType = match[2].trim();
                const getSymbol = (type: string) => {
                  const token = DEFAULT_TOKENS.find((t) => t.type === type);
                  return token?.symbol || type.split("::").pop() || type;
                };
                pairs.push({ bookId: bookAddress, baseToken: baseType, quoteToken: quoteType, baseSymbol: getSymbol(baseType), quoteSymbol: getSymbol(quoteType) });
              }
            }
          } catch (err) {
            // ignore field parse errors
            console.warn("Failed to process registry field", err);
          }
        }

        if (mounted) setRegisteredPairs(pairs);
      } catch (err) {
        console.error("Failed to fetch registered pairs:", err);
      } finally {
        if (mounted) setLoadingPairs(false);
      }
    };

    fetchRegisteredPairs();
    const iv = setInterval(fetchRegisteredPairs, 30000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, [client]);

  // Fetch fee balances for the selected book so UI can show collected fees
  useEffect(() => {
    let mounted = true;
    const fetchFees = async (bookId: string) => {
      if (!bookId) {
        if (mounted) setFeeBalances(null);
        return;
      }

      try {
        const bookObj = await client.getObject({ id: bookId, options: { showContent: true, showType: true } });
        if (!bookObj?.data?.content) {
          if (mounted) setFeeBalances(null);
          return;
        }

        let fields: Record<string, unknown> | undefined = undefined;
        if (bookObj.data.content && "fields" in bookObj.data.content) {
          fields = (bookObj.data.content as unknown as Record<string, unknown>).fields as Record<string, unknown> | undefined;
        }

        const extract = (raw: unknown): string | null => {
          if (raw == null) return null;
          if (typeof raw === "string" || typeof raw === "number") return String(raw);
          if (typeof raw === "object") {
            const o = raw as Record<string, unknown>;
            if (typeof o.value === "string" || typeof o.value === "number") return String(o.value);
            if (typeof o.amount === "string" || typeof o.amount === "number") return String(o.amount);
            if (o.value && typeof o.value === "object") {
              const inner = o.value as Record<string, unknown>;
              if (typeof inner.value === "string" || typeof inner.value === "number") return String(inner.value);
              if (typeof inner.amount === "string" || typeof inner.amount === "number") return String(inner.amount);
            }
            const keys = Object.keys(o);
            if (keys.length === 1) {
              const v = o[keys[0]];
              if (typeof v === "string" || typeof v === "number") return String(v);
            }
          }
          return null;
        };

        let baseRaw: string | null = null;
        let quoteRaw: string | null = null;

        if (fields) {
          baseRaw = extract(fields.fee_balance_base ?? fields.feeBalanceBase ?? fields.fee_base ?? fields.base_fee);
          quoteRaw = extract(fields.fee_balance_quote ?? fields.feeBalanceQuote ?? fields.fee_quote ?? fields.quote_fee);
        }

        // fallback: try read-only wrapper if available
        try {
          const cli = client as unknown as ReadOnlyClient;
          if ((baseRaw == null || quoteRaw == null) && cli && typeof cli.callReadOnly === "function") {
            const readRes = await cli.callReadOnly({
              package: CONTRACTS.PACKAGE_ID,
              module: MODULES.DEEPBOOK,
              function: "get_fee_balances",
              arguments: [bookId],
              typeArguments: [],
            });
            if (Array.isArray(readRes) && readRes.length >= 2) {
              baseRaw = baseRaw ?? String(readRes[0]);
              quoteRaw = quoteRaw ?? String(readRes[1]);
            } else if (readRes && typeof readRes === "object") {
              const rr = readRes as Record<string, unknown>;
              const maybe = rr.result ?? rr.value ?? rr.Ok ?? rr;
              if (Array.isArray(maybe) && maybe.length >= 2) {
                baseRaw = baseRaw ?? String(maybe[0]);
                quoteRaw = quoteRaw ?? String(maybe[1]);
              }
            }
          }
        } catch {
          // ignore read-only failure
        }

        if (mounted) setFeeBalances({ base: baseRaw ?? undefined, quote: quoteRaw ?? undefined });
      } catch (err) {
        console.warn("Failed to fetch book fees:", err);
        if (mounted) setFeeBalances(null);
      }
    };

    fetchFees(selectedBook);
    return () => { mounted = false; };
  }, [selectedBook, client]);

  const handleSetAdmin = useCallback(async () => {
    if (!currentAccount) return alert("Connect wallet to set admin");
    if (!selectedBook) return alert("Select a book first");
    if (!newAdmin || newAdmin.trim() === "") return alert("Provide new admin address");

    setBusy(true);
    try {
      const tx = new Transaction();
      const registryId = CONTRACTS.REGISTRY_BOOK_ID;
      tx.moveCall({
        target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEEPBOOK}::set_book_admin`,
        arguments: [tx.object(registryId), tx.pure.address(selectedBook), tx.pure.address(newAdmin)],
      });

      signAndExecute({ transaction: tx }, { onSuccess: () => { alert("Set admin transaction submitted"); }, onError: (e) => { alert(`Failed: ${String(e)}`); } });
    } catch (err) {
      console.error(err);
      alert(`Error preparing tx: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [currentAccount, selectedBook, newAdmin, signAndExecute]);

  const handleWithdraw = useCallback(async () => {
    if (!currentAccount) return alert("Connect wallet to withdraw");
    if (!selectedBook) return alert("Select a book first");
    if (!withdrawTo || withdrawTo.trim() === "") return alert("Provide destination address");

    const pair = registeredPairs.find((p) => p.bookId === selectedBook);
    if (!pair) return alert("Selected book not in registry list");

    const baseDecimals = getDecimals(pair.baseToken);
    const quoteDecimals = getDecimals(pair.quoteToken);

    // Parse amounts as human decimals and convert to integer smallest-units
    const baseAmountParsed = withdrawBaseAmount && withdrawBaseAmount.trim() !== "" ? parseAmount(withdrawBaseAmount, baseDecimals) : "0";
    const quoteAmountParsed = withdrawQuoteAmount && withdrawQuoteAmount.trim() !== "" ? parseAmount(withdrawQuoteAmount, quoteDecimals) : "0";

    setBusy(true);
    try {
      const tx = new Transaction();
      const registryId = CONTRACTS.REGISTRY_BOOK_ID;

      tx.moveCall({
        target: `${CONTRACTS.PACKAGE_ID}::${MODULES.DEEPBOOK}::withdraw_fees`,
        arguments: [tx.object(registryId), tx.object(selectedBook), tx.pure.address(withdrawTo), tx.pure.u64(baseAmountParsed), tx.pure.u64(quoteAmountParsed)],
        typeArguments: [pair.baseToken, pair.quoteToken],
      });

      signAndExecute({ transaction: tx }, { onSuccess: () => { alert("Withdraw transaction submitted"); }, onError: (e) => { alert(`Failed: ${String(e)}`); } });
    } catch (err) {
      console.error(err);
      alert(`Error preparing tx: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [currentAccount, selectedBook, withdrawTo, withdrawBaseAmount, withdrawQuoteAmount, registeredPairs, signAndExecute]);

  // UI helpers for displaying collected fees
  const selectedPair = registeredPairs.find((p) => p.bookId === selectedBook);
  const baseSymbol = selectedPair?.baseSymbol ?? "BASE";
  const quoteSymbol = selectedPair?.quoteSymbol ?? "QUOTE";
  const baseDisplay = feeBalances?.base
    ? (() => {
      try {
        return selectedPair ? formatAmount(BigInt(feeBalances.base as string), getDecimals(selectedPair.baseToken)) : String(feeBalances.base);
      } catch {
        return String(feeBalances.base);
      }
    })()
    : "0";
  const quoteDisplay = feeBalances?.quote
    ? (() => {
      try {
        return selectedPair ? formatAmount(BigInt(feeBalances.quote as string), getDecimals(selectedPair.quoteToken)) : String(feeBalances.quote);
      } catch {
        return String(feeBalances.quote);
      }
    })()
    : "0";

  return (
    <Card>
      <h3 className="mb-2">DeepBook Admin Panel</h3>
      <div className="mb-3">
        <label className="block text-sm font-medium">Select Order Book</label>
        <div className="text-xs text-gray-600 mb-1">
          {loadingPairs ? (
            <span>Loading registered books...</span>
          ) : (
            <span>{registeredPairs.length} registered book(s)</span>
          )}
        </div>
        <select className="w-full p-2 border" value={selectedBook} onChange={(e) => setSelectedBook(e.target.value)}>
          <option value="">-- Select a registered book --</option>
          {registeredPairs.map((p) => (
            <option key={p.bookId} value={p.bookId}>{`${p.baseSymbol}/${p.quoteSymbol} — ${p.bookId}`}</option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <h4 className="font-medium">Set Book Admin (registry owner only)</h4>
        <input className="w-full p-2 border mt-2" placeholder="New admin address (0x...)" value={newAdmin} onChange={(e) => setNewAdmin(e.target.value)} />
        <button disabled={busy} className="mt-2 px-4 py-2 bg-blue-600 text-white" onClick={handleSetAdmin}>Set Admin</button>
      </div>

      <div>
        <h4 className="font-medium">Withdraw Collected Fees (book admin)</h4>
        <div className="text-sm text-gray-700 mt-2 mb-2">
          Collected fees: <span className="font-mono">{baseSymbol} {baseDisplay}</span> • <span className="font-mono">{quoteSymbol} {quoteDisplay}</span>
        </div>
        <input className="w-full p-2 border mt-2" placeholder="Destination address (0x...)" value={withdrawTo} onChange={(e) => setWithdrawTo(e.target.value)} />
        <div className="flex gap-2 mt-2">
          <input className="flex-1 p-2 border" placeholder="Base amount (human, e.g. 0.1)" value={withdrawBaseAmount} onChange={(e) => setWithdrawBaseAmount(e.target.value)} />
          <input className="flex-1 p-2 border" placeholder="Quote amount (human, e.g. 1.5)" value={withdrawQuoteAmount} onChange={(e) => setWithdrawQuoteAmount(e.target.value)} />
        </div>
        <button disabled={busy} className="mt-2 px-4 py-2 bg-green-600 text-white" onClick={handleWithdraw}>Withdraw Fees</button>
      </div>
    </Card>
  );
}
