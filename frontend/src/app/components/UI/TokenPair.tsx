"use client";

import TokenAvatar from "./TokenAvatar";
import { DEFAULT_TOKENS } from "../../lib/contracts";

interface Props {
  baseSymbol?: string | null;
  quoteSymbol?: string | null;
  baseToken?: string | null;
  quoteToken?: string | null;
  size?: number;
}

export default function TokenPair({ baseSymbol, quoteSymbol, baseToken, quoteToken, size = 36 }: Props) {
  const short = (t?: string | null) => (t ? t.split("::").slice(-2).join("::") : "");

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center -space-x-2">
        {(() => {
          const f = baseToken ? DEFAULT_TOKENS.find((d) => d.type === baseToken) : undefined;
          return (
            <TokenAvatar symbol={baseSymbol ?? undefined} tokenType={baseToken ?? undefined} size={size} imgSrc={f?.logo} verified={!!f?.verified} />
          );
        })()}

        {(() => {
          const f = quoteToken ? DEFAULT_TOKENS.find((d) => d.type === quoteToken) : undefined;
          return (
            <TokenAvatar symbol={quoteSymbol ?? undefined} tokenType={quoteToken ?? undefined} size={size} imgSrc={f?.logo} verified={!!f?.verified} className="ml-1" />
          );
        })()}
      </div>

      <div className="text-left">
        <div className="font-semibold text-sm leading-tight">
          {(baseSymbol ?? short(baseToken) ?? "BASE").toString().toUpperCase()} / {(quoteSymbol ?? short(quoteToken) ?? "QUOTE").toString().toUpperCase()}
        </div>
        <div className="text-xs text-gray-500 truncate max-w-[220px] sm:max-w-[320px]">
          {short(baseToken)} / {short(quoteToken)}
        </div>
      </div>
    </div>
  );
}
