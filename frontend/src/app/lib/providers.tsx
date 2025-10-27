"use client";

import React from 'react';
import { createNetworkConfig, IotaClientProvider, WalletProvider } from '@iota/dapp-kit';
import { getFullnodeUrl } from '@iota/iota-sdk/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const { networkConfig } = createNetworkConfig({
  localnet: { url: getFullnodeUrl('localnet') },
  mainnet: { url: getFullnodeUrl('mainnet') },
  devnet: { url: getFullnodeUrl('devnet') },
  testnet: { url: getFullnodeUrl('testnet') },
});

const queryClient = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <IotaClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider>{children}</WalletProvider>
      </IotaClientProvider>
    </QueryClientProvider>
  );
}
