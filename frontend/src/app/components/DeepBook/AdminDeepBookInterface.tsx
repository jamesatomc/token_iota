"use client";

import { useEffect, useState, useCallback } from "react";
import { useSignAndExecuteTransaction, useCurrentAccount, useIotaClient } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import Card from "../UI/Card";
import { CONTRACTS, MODULES, DEFAULT_TOKENS, parseAmount } from "../../lib/contracts";

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
          const registryFields = registryObjInfo.data.content.fields as unknown as Record<string, unknown>;
          if (registryFields.books) {
            try {
              const bfUnknown = registryFields.books as any;
              const fieldsObj = bfUnknown.fields as Record<string, unknown> | undefined;
              if (fieldsObj) {
                const idObj = fieldsObj.id as unknown;
                if (typeof idObj === "string") booksTableId = idObj;
                else if (typeof idObj === "object" && idObj !== null) booksTableId = (idObj as any).id as string | undefined || null;
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
              const fields = fieldObj.data.content.fields as unknown as Record<string, unknown>;
              bookAddress = (fields.value as string) || (fields.book_id as string) || (fields.id as string) || null;
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

      signAndExecute({ transaction: tx }, { onSuccess: (r) => { alert("Set admin transaction submitted"); }, onError: (e) => { alert(`Failed: ${String(e)}`); } });
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

      signAndExecute({ transaction: tx }, { onSuccess: (r) => { alert("Withdraw transaction submitted"); }, onError: (e) => { alert(`Failed: ${String(e)}`); } });
    } catch (err) {
      console.error(err);
      alert(`Error preparing tx: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [currentAccount, selectedBook, withdrawTo, withdrawBaseAmount, withdrawQuoteAmount, registeredPairs, signAndExecute]);

  return (
    <Card>
      <h3 className="mb-2">DeepBook Admin Panel</h3>
      <div className="mb-3">
        <label className="block text-sm font-medium">Select Order Book</label>
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
