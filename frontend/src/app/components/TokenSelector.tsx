"use client";

import React, { useEffect, useState, useRef } from "react";
import { useIotaClient, useCurrentAccount } from "@iota/dapp-kit";
import TokenManager from "./TokenManager";

export interface TokenItem {
  type: string; // full Move type path
  symbol: string;
  name?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tokens: TokenItem[];
  onSelect: (tokenType: string, symbol: string) => void;
}

export default function TokenSelector({ isOpen, onClose, tokens, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const client = useIotaClient();
  const currentAccount = useCurrentAccount();

  // manage custom tokens and expose them before the balance-fetch effect so we can include them
  const [showManager, setShowManager] = useState(false);
  const [customTokens, setCustomTokens] = useState<TokenItem[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Shorten Move type string like "0x5fd5...::kanari::KANARI" -> "kanari::KANARI"
  const shortType = (t?: string) => {
    if (!t) return "";
    try {
      const parts = t.split("::");
      if (parts.length >= 2) return parts.slice(-2).join("::");
      return t;
    } catch (e) {
      return t;
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem("dex:customTokens");
      if (raw) {
        const parsed = JSON.parse(raw) as Array<{ type: string; symbol: string; name?: string }>;
        setCustomTokens(parsed.map((p) => ({ type: p.type, symbol: p.symbol, name: p.name })));
      } else {
        setCustomTokens([]);
      }
    } catch (e) {
      setCustomTokens([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    // reset search query and autofocus when opened
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 50);

    // Fetch balances for displayed tokens + custom tokens
    const fetchBalances = async () => {
      if (!client || !currentAccount) return;

      const newBalances: Record<string, string> = {};

      const allTokens = [...(tokens || []), ...customTokens].reduce((acc: TokenItem[], t) => {
        if (!acc.find((x) => x.type === t.type)) acc.push(t);
        return acc;
      }, [] as TokenItem[]);

      await Promise.all(
        allTokens.map(async (t) => {
          try {
            // Try to use getBalance when available for native IOTA
            if (t.type === "0x2::iota::IOTA") {
              try {
                // use any to avoid TS mismatch if getBalance not typed
                const bal = await (client as any).getBalance?.({ owner: currentAccount.address });
                if (bal && typeof bal === "object") {
                  // try to extract a numeric balance
                  if (typeof bal.total === "number" || typeof bal.total === "string") {
                    newBalances[t.type] = String(bal.total ?? "0");
                    return;
                  }
                }
              } catch (e) {
                // fallback to coins
              }
            }

            const resp = await client.getCoins({ owner: currentAccount.address, coinType: t.type });
            const total = (resp.data || []).reduce((acc: bigint, c: any) => acc + BigInt(c.balance || 0), BigInt(0));
            newBalances[t.type] = total.toString();
          } catch (e) {
            newBalances[t.type] = "0";
          }
        })
      );

      setBalances(newBalances);
    };

    void fetchBalances();
  }, [isOpen, client, currentAccount, tokens, customTokens]);



  if (!isOpen) return null;

  // combine passed tokens with custom tokens stored locally
  const combinedTokens = [...(tokens || []), ...customTokens].reduce((acc: TokenItem[], t) => {
    if (!acc.find((x) => x.type === t.type)) acc.push(t);
    return acc;
  }, [] as TokenItem[]);

  const filtered = combinedTokens.filter((t) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      t.symbol.toLowerCase().includes(q) || (t.name || "").toLowerCase().includes(q) || t.type.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl bg-white dark:bg-zinc-900 rounded-xl shadow-lg overflow-hidden">
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              className="flex-1 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 focus:outline-none bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
              placeholder="Search tokens..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button onClick={onClose} className="px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300">Close</button>
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {filtered.map((t) => (
            <button
              key={t.type}
              onClick={() => {
                onSelect(t.type, t.symbol);
                onClose();
              }}
              className="w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">{t.symbol?.[0] || "T"}</div>
                <div className="min-w-0 flex items-center gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-zinc-900 dark:text-white text-sm leading-tight">{t.symbol}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[420px]" title={t.type}>{t.name || shortType(t.type)}</div>
                  </div>

                  {/* copy icon (icon-only, toggles to check on success) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      try {
                        void navigator.clipboard.writeText(t.type);
                        setCopiedType(t.type);
                        setTimeout(() => setCopiedType((cur) => (cur === t.type ? null : cur)), 1400);
                      } catch (err) {
                        // ignore
                      }
                    }}
                    className="ml-1 p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
                    title={copiedType === t.type ? "Copied" : "Copy full token type"}
                    aria-label={copiedType === t.type ? "Copied" : "Copy full token type"}
                  >
                    {copiedType === t.type ? (
                      // check icon
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-600">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8.414 8.414a1 1 0 01-1.414 0L3.293 11.12a1 1 0 011.414-1.414l2.293 2.293 7.707-7.707a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      // clipboard icon
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-zinc-500 dark:text-zinc-300">
                        <path d="M9 2a1 1 0 00-1 1v1H6a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2V6a2 2 0 00-2-2h-2V3a1 1 0 00-1-1H9z" />
                        <path d="M9 4h2v1H9V4z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="text-right text-sm text-zinc-700 dark:text-zinc-300 min-w-[88px]">
                <div className="mt-1">
                  {balances[t.type]
                    ? (t.type === "0x2::iota::IOTA"
                        ? Math.floor(Number(balances[t.type]) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 0 })
                        : (Number(balances[t.type]) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 6 }))
                    : "-"}
                </div>
              </div>
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="p-6 text-center text-zinc-500">No tokens found</div>
          )}
        </div>
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 text-center">
          <button
            onClick={() => setShowManager(true)}
            className="text-sm text-blue-600 dark:text-blue-400 underline"
          >
            Missing a token? Manage custom tokens
          </button>
        </div>
      </div>

      <TokenManager
        isOpen={showManager}
        onClose={() => {
          setShowManager(false);
          // refresh custom tokens and balances
          try {
            const raw = localStorage.getItem("dex:customTokens");
            if (raw) {
              const parsed = JSON.parse(raw) as Array<{ type: string; symbol: string; name?: string }>;
              setCustomTokens(parsed.map((p) => ({ type: p.type, symbol: p.symbol, name: p.name })));
            } else {
              setCustomTokens([]);
            }
          } catch (e) {
            setCustomTokens([]);
          }
          void (async () => {
            // trigger balances refresh
            if ((window as any).requestIdleCallback) {
              (window as any).requestIdleCallback(() => {});
            }
          })();
        }}
        onChange={() => {
          try {
            const raw = localStorage.getItem("dex:customTokens");
            if (raw) {
              const parsed = JSON.parse(raw) as Array<{ type: string; symbol: string; name?: string }>;
              setCustomTokens(parsed.map((p) => ({ type: p.type, symbol: p.symbol, name: p.name })));
            } else {
              setCustomTokens([]);
            }
          } catch (e) {
            setCustomTokens([]);
          }
        }}
      />
    </div>
  );
}
