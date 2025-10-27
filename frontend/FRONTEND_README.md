# Kanari Network DEX Frontend

A decentralized exchange (DEX) frontend built with Next.js and IOTA dApp Kit for the Kanari Network.

## Features

- **Token Swapping**: Swap between KANARI and IOTA tokens with slippage protection
- **Liquidity Management**: Add and remove liquidity from pools
- **Pool Creation**: Create new liquidity pools with customizable fee tiers
- **Pool Information**: View real-time pool data, reserves, and pricing

## Tech Stack

- **Next.js 16** - React framework
- **@iota/dapp-kit** - IOTA wallet integration
- **@iota/iota-sdk** - IOTA blockchain SDK
- **TanStack Query** - Data fetching and caching
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- An IOTA wallet (e.g., IOTA Wallet browser extension)
- IOTA testnet tokens

### Installation

```bash
# Install dependencies
bun install
# or
npm install
```

### Configuration

The contract addresses are already configured in `src/app/lib/contracts.ts`:

```typescript
export const CONTRACTS = {
  PACKAGE_ID: "0x1bdc310c564c57c090db0c526174fd2081656c830c875906491f1cabe889d5a9",
  KANARI: {
    TREASURY_CAP: "0x6571c9406c05d9ba9e10f696094d91d4b68c17869659a6cab8f5d2bcb0c9661f",
    METADATA: "0xe3d4c27471665745dc39949c53dcecdaab4c5bbd6bb7b1edc5b56d2eaacfd4da",
    TYPE: "0x1bdc310c564c57c090db0c526174fd2081656c830c875906491f1cabe889d5a9::kanari::KANARI",
  },
};
```

### Running the Development Server

```bash
# Start the development server
bun dev
# or
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage Guide

### 1. Connect Your Wallet

Click the "Connect Wallet" button in the top-right corner and select your IOTA wallet.

### 2. Create a Pool (First Time)

1. Navigate to the "Create Pool" tab
2. Select a fee tier (0.1%, 0.5%, or 1.0%)
3. Click "Create Pool"
4. Approve the transaction in your wallet
5. **Important**: Save the Pool ID and Registry ID from the transaction result

### 3. Add Liquidity

1. Navigate to the "Liquidity" tab
2. Select "Add Liquidity"
3. Enter the Pool ID and Registry ID
4. Enter amounts for KANARI and IOTA
5. Set slippage tolerance
6. Click "Add Liquidity"
7. Approve the transaction

### 4. Swap Tokens

1. Navigate to the "Swap" tab
2. Enter the Pool ID
3. Enter the amount you want to swap
4. Click the swap direction button to switch between KANARI→IOTA and IOTA→KANARI
5. Set slippage tolerance
6. Click "Swap"
7. Approve the transaction

### 5. View Pool Information

1. Navigate to the "Pool Info" tab
2. Enter a Pool ID
3. Click "Fetch" to view:
   - Current reserves
   - Token prices
   - LP supply
   - Fee tier
   - Total Value Locked (TVL)

### 6. Remove Liquidity

1. Navigate to the "Liquidity" tab
2. Select "Remove Liquidity"
3. Enter the Pool ID and Registry ID
4. Enter the amount of LP tokens to burn
5. Click "Remove Liquidity"
6. Approve the transaction

## Component Structure

```
src/app/
├── components/
│   ├── SwapInterface.tsx       # Token swapping interface
│   ├── LiquidityInterface.tsx  # Add/remove liquidity
│   ├── CreatePool.tsx          # Pool creation
│   └── PoolInfo.tsx           # Pool information display
├── lib/
│   ├── contracts.ts           # Contract addresses and helpers
│   └── providers.tsx          # IOTA providers setup
├── page.tsx                   # Main page with tab navigation
└── layout.tsx                 # Root layout
```

## Contract Functions

### DEX Module Functions

- `create_pool<X, Y>` - Create a new liquidity pool
- `add_liquidity<X, Y>` - Add liquidity to a pool
- `remove_liquidity<X, Y>` - Remove liquidity from a pool
- `swap_x_to_y<X, Y>` - Swap token X for token Y
- `swap_y_to_x<X, Y>` - Swap token Y for token X
- `get_reserves<X, Y>` - Get pool reserves (view function)
- `get_lp_supply<X, Y>` - Get LP token supply (view function)
- `get_fee<X, Y>` - Get pool fee (view function)

## Fee Tiers

- **Low (0.1%)**: Best for stablecoin pairs
- **Medium (0.5%)**: Best for most pairs (default)
- **High (1.0%)**: Best for exotic pairs

## Security Features

- **Slippage Protection**: Set maximum acceptable slippage for trades
- **Minimum Liquidity Lock**: First LP provider locks minimum liquidity forever
- **Overflow Protection**: Safe math operations prevent overflow attacks
- **Input Validation**: All inputs are validated before transactions

## Troubleshooting

### Transaction Failed

- **Insufficient Balance**: Ensure you have enough tokens and IOTA for gas
- **Slippage Too Low**: Increase slippage tolerance
- **Wrong Pool ID**: Verify the Pool ID and Registry ID are correct
- **Gas Limit**: Transaction might need more gas

### Pool Not Found

- Ensure the Pool ID is correct
- The pool might not exist yet - create it first
- Check you're on the correct network (testnet)

### Wallet Connection Issues

- Install the IOTA Wallet browser extension
- Make sure you're on the testnet network
- Try refreshing the page and reconnecting

## Development

### Build for Production

```bash
bun run build
bun start
```

### Lint

```bash
bun run lint
```

## Network Configuration

The app is configured for IOTA testnet by default. To change networks, edit `src/app/lib/providers.tsx`:

```typescript
<IotaClientProvider networks={networkConfig} defaultNetwork="testnet">
```

Available networks: `localnet`, `devnet`, `testnet`, `mainnet`

## Resources

- [IOTA Documentation](https://docs.iota.org/)
- [IOTA dApp Kit](https://sdk.iota.org/dapp-kit)
- [Move Language](https://move-language.github.io/move/)

## License

MIT
