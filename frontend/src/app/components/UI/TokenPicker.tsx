"use client";

import TokenAvatar from "./TokenAvatar";
import { DEFAULT_TOKENS } from "../../lib/contracts";

interface Props {
  label: string;
  tokenType: string;
  balance?: bigint | null;
  decimals: number;
  onOpen: () => void;
  // whether to show the Balance row (default true)
  showBalance?: boolean;
}

export default function TokenPicker({ label, tokenType, balance, decimals, onOpen, showBalance = true }: Props) {
  const symbol = tokenType.split("::").pop() || tokenType;

  const formatted = (() => {
    try {
      if (balance === null || balance === undefined) return "-";
      // format similar to contracts.formatAmount but avoid importing for small helper
      const num = typeof balance === 'bigint' ? Number(balance) : Number(balance);
      const out = (num / Math.pow(10, decimals)).toFixed(decimals);
      return out.replace(/\.?0+$/, "");
    } catch {
      return "-";
    }
  })();

  const foundDefault = DEFAULT_TOKENS.find((d) => d.type === tokenType);

  return (
    <div>
      <label className="text-sm text-gray-600">{label}</label>
      <button type="button" onClick={onOpen} className="mt-2 w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-3 min-w-0">
          <TokenAvatar symbol={symbol} tokenType={tokenType} size={40} className="shrink-0" imgSrc={foundDefault?.logo} verified={!!foundDefault?.verified} />
          <div className="min-w-0 text-left">
            <div className="font-semibold text-gray-900 flex items-center gap-2">
              <span>{symbol}</span>
              {foundDefault?.verified && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-600">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.707a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs text-gray-500 truncate" title={tokenType}>{tokenType ? tokenType.split("::").slice(-2).join("::") : tokenType}</div>
            </div>
            {showBalance && (
              <div className="text-xs text-gray-500 mt-1">Balance: <span className="font-mono">{formatted}</span></div>
            )}
          </div>
        </div>
        <div className="text-xs text-gray-500">Select</div>
      </button>
    </div>
  );
}
