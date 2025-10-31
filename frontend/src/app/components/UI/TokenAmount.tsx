"use client";

import TokenAvatar from "./TokenAvatar";
import { DEFAULT_TOKENS } from "../../lib/contracts";

interface Props {
  label: string;
  amount: string;
  onChange: (v: string) => void;
  tokenSymbol?: string | null;
  tokenType?: string | null;
  onOpenSelector: () => void;
  balance?: string;
  onMax?: () => void;
  onHalf?: () => void;
}

export default function TokenAmount({
  label,
  amount,
  onChange,
  tokenSymbol,
  tokenType,
  onOpenSelector,
  balance,
  onMax,
  onHalf,
}: Props) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 mb-2 relative h-auto sm:h-32">
      <div className="flex justify-between mb-2">
        <span className="text-sm text-gray-600">{label}</span>
      </div>

      <button
        onClick={onOpenSelector}
        className="absolute top-4 right-4 flex items-center gap-3 px-3 py-2 rounded-lg bg-white text-sm font-medium text-gray-900"
        type="button"
      >
        {/* TokenAvatar will attempt to load provided imgSrc (from DEFAULT_TOKENS) or /logos/<symbol>.svg and fall back to initial */}
        {(() => {
          const found = tokenType ? DEFAULT_TOKENS.find((d) => d.type === tokenType) : undefined;
          return (
            <TokenAvatar symbol={tokenSymbol ?? undefined} tokenType={tokenType ?? undefined} size={32} imgSrc={found?.logo} verified={!!found?.verified} />
          );
        })()}
        <div className="text-left">
          <div className="font-semibold text-sm leading-tight">
            {tokenSymbol ?? label}
          </div>
          <div className="text-xs text-gray-500 truncate max-w-[120px] sm:max-w-60" title={tokenType ?? ""}>
            {tokenType ? tokenType.split("::").slice(-2).join("::") : ""}
          </div>
        </div>
      </button>

      <div className="flex items-start gap-4">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={amount}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.0"
          className="flex-1 text-3xl font-semibold bg-transparent border-none outline-none text-gray-900"
        />
      </div>

      <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
        <div>
          Balance: {balance ?? "0"} {tokenSymbol}
        </div>
        <div className="flex gap-6">
          <button onClick={onHalf} type="button" className="px-3 py-1 rounded-lg bg-transparent hover:bg-gray-100">50%</button>
          <button onClick={onMax} type="button" className="px-3 py-1 rounded-lg bg-transparent hover:bg-gray-100">Max</button>
        </div>
      </div>
    </div>
  );
}
