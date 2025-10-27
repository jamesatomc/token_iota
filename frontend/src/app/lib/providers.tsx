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
      packageId: "0xea1dd0a8298453ebabf41c8812528d196d7de8e814771ed999ae5de8f617f6a8",
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

