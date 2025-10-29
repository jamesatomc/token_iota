"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  className?: string;
  /** Tailwind max-width class, e.g. 'max-w-md' */
  maxWidth?: string;
  /** extra style class for minHeight like 'min-h-[560px]' */
  minHeight?: string;
}

export default function Card({ children, className = "", maxWidth = "", minHeight = "", }: Props) {
  const base = `bg-white rounded-2xl shadow-lg p-6 w-full`;
  const mw = maxWidth ? `${maxWidth}` : "";
  const mh = minHeight ? `${minHeight}` : "";
  const cls = [base, mw, mh, className].filter(Boolean).join(" ");
  return <div className={cls}>{children}</div>;
}
