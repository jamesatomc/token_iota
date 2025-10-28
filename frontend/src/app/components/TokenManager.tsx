"use client";

import React, { useEffect, useState } from "react";

export interface CustomToken {
  type: string;
  symbol: string;
  name?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onChange?: () => void; // called when tokens change
}

const STORAGE_KEY = "dex:customTokens";

function readStored(): CustomToken[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomToken[];
  } catch {
    return [];
  }
}

function writeStored(tokens: CustomToken[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // ignore
  }
}

export default function TokenManager({ isOpen, onClose, onChange }: Props) {
  const [tokens, setTokens] = useState<CustomToken[]>([]);
  const [type, setType] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // defer state updates to avoid synchronous setState inside effect
    setTimeout(() => {
      setTokens(readStored());
      setType("");
      setError(null);
    }, 0);
  }, [isOpen]);

  if (!isOpen) return null;

  const deriveSymbolFromType = (typeStr: string) => {
    const parts = typeStr.split("::");
    let sym = parts[parts.length - 1] || typeStr;
    sym = sym.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (!sym) sym = "TOKEN";
    return sym;
  };

  const handleAdd = () => {
    setError(null);
    const t = type.trim();
    if (!t) {
      setError("Type is required");
      return;
    }
    // Basic validation: require 0x prefix for address-like types
    if (!t.startsWith("0x")) {
      setError("Type must start with 0x (full Move type path)");
      return;
    }

    const exists = tokens.find((x) => x.type === t);
    if (exists) {
      setError("Token already added");
      return;
    }

    const s = deriveSymbolFromType(t);
    const next = [{ type: t, symbol: s }, ...tokens];
    setTokens(next);
    writeStored(next);
    setType("");
    if (onChange) onChange();
  };

  const handleRemove = (t: string) => {
    const next = tokens.filter((x) => x.type !== t);
    setTokens(next);
    writeStored(next);
    if (onChange) onChange();
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-xl font-semibold text-gray-900">Token Manager</h3>
          <button onClick={onClose} className="text-gray-700">✕</button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-gray-600">Token Type (full Move type)</label>
            <input value={type} onChange={(e) => setType(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900" placeholder="0x...::package::Module::NAME" />
          </div>

          {/* only token type is required; symbol is derived automatically */}

          {error && <div className="text-sm text-red-500">{error}</div>}

          <div className="flex gap-2">
            <button onClick={handleAdd} className="px-4 py-2 rounded-lg bg-blue-600 text-white">Add Custom Token</button>
            <button onClick={() => { setType(""); setError(null); }} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700">Clear</button>
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-800 mb-2">Custom Tokens</h4>
            {tokens.length === 0 ? (
              <div className="text-sm text-gray-500">No custom tokens added yet</div>
            ) : (
              <div className="space-y-2">
                {tokens.map((t) => (
                  <div key={t.type} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-gray-900">{t.symbol || deriveSymbolFromType(t.type)}</div>
                      <div className="text-xs text-gray-500 truncate max-w-[420px]" title={t.type}>{t.type}</div>
                    </div>
                    <button onClick={() => handleRemove(t.type)} className="text-sm text-red-500">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
