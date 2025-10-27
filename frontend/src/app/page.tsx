"use client";

import { ConnectButton } from "@iota/dapp-kit";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <div>
        <h1 className="text-2xl font-bold mb-4">Welcome to Token dApp</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">IOTA providers are configured in the app shell.</p>
        <ConnectButton />
      </div>
    </div>
  );
}
