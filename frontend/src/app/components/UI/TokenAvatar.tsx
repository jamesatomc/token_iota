"use client";

import { useState, useMemo } from "react";
import Image from "next/image";

interface Props {
  symbol?: string | null;
  tokenType?: string | null;
  size?: number; // px
  className?: string;
  imgSrc?: string; // optional explicit image URL
  verified?: boolean;
}

export default function TokenAvatar({ symbol, tokenType, size = 32, className = "", imgSrc, verified = false }: Props) {
  const [errored, setErrored] = useState(false);

  const logoUrl = useMemo(() => {
    if (imgSrc) return imgSrc;
    const s = (symbol || tokenType || "").toString();
    // Prefer a short symbol if available
    const short = symbol ? symbol.toString().toLowerCase() : (s.split("::").pop() || "");
    if (!short) return null;
    // Expect logos to be served from /logos/<symbol>.svg (add assets to public/logos/ if you want images)
    return `/logos/${short}.svg`;
  }, [symbol, tokenType, imgSrc]);

  const initial = (symbol && symbol[0]) || (tokenType && tokenType.split("::").pop()?.[0]) || "T";

  const sizeStyle = { width: `${size}px`, height: `${size}px` };

  // Wrap avatar with a relative container so we can overlay a verified badge
  return (
    <div style={sizeStyle} className={`${className} relative inline-block`}>
      {logoUrl && !errored ? (
        <Image
          src={logoUrl}
          alt={`${(symbol || tokenType || "token").toString()} logo`}
          width={size}
          height={size}
          onError={() => setErrored(true)}
          className={`rounded-full object-cover bg-white w-full h-full`}
          unoptimized
        />
      ) : (
        <div className={`rounded-full bg-blue-600 flex items-center justify-center text-white font-bold w-full h-full`}>{initial}</div>
      )}

      {verified && (
        <span className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full bg-white flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-green-600">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd" />
          </svg>
        </span>
      )}
    </div>
  );
}
