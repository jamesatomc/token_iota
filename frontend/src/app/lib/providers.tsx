"use client";

import React from 'react';
import { createNetworkConfig, IotaClientProvider, WalletProvider } from '@iota/dapp-kit';
import { getFullnodeUrl } from '@iota/iota-sdk/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { networkConfig } = createNetworkConfig({
  localnet: { url: getFullnodeUrl('localnet'), },
  mainnet: { url: getFullnodeUrl('mainnet'), },
  devnet: { url: getFullnodeUrl('devnet'), },
  testnet: {
    url: getFullnodeUrl('testnet'),
    variables: {
      packageId: "0xe5699c0b8ba890ee2e4300e3ac9ca0bfe232c1faad0d3bf6d0043f980cafdcc6",
    },
  },
});

const queryClient = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <IotaClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>{children}</WalletProvider>
      </IotaClientProvider>
    </QueryClientProvider>
  );
}

