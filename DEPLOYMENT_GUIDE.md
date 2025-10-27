# Kanari DEX - Complete Deployment & Usage Guide

## 📦 Contract Deployment Information

Your DEX contracts have been successfully deployed to IOTA Testnet!

### Deployed Addresses

```
Package ID: 0x1bdc310c564c57c090db0c526174fd2081656c830c875906491f1cabe889d5a9
Transaction: AUdk8Yam73Pw8cNpquZiYpRT48kP466MNAcUrRWpwDUW

KANARI Token:
├─ Treasury Cap: 0x6571c9406c05d9ba9e10f696094d91d4b68c17869659a6cab8f5d2bcb0c9661f
├─ Metadata: 0xe3d4c27471665745dc39949c53dcecdaab4c5bbd6bb7b1edc5b56d2eaacfd4da
└─ Type: 0x1bdc310c564c57c090db0c526174fd2081656c830c875906491f1cabe889d5a9::kanari::KANARI

Upgrade Cap: 0xf0f41049f132c3dd5fe68e9101369f04155817153fbb2cd6d5cc775768270134

Modules: DEX, DEXFactory, kanari
```

## 🚀 Quick Start

### 1. Frontend Setup

```bash
cd frontend
bun install
bun dev
```

The frontend will be available at http://localhost:3000

### 2. Connect Your Wallet

1. Install IOTA Wallet browser extension
2. Switch to IOTA Testnet
3. Get testnet tokens from the faucet
4. Connect your wallet in the dApp

## 📋 Step-by-Step Usage

### Step 1: Create a Pool

Before you can swap or add liquidity, you need to create a pool:

1. Navigate to **Create Pool** tab
2. Select fee tier:
   - 0.1% - Best for stablecoin pairs
   - 0.5% - Best for most pairs (recommended)
   - 1.0% - Best for exotic pairs
3. Click **Create Pool**
4. Approve transaction in wallet
5. **IMPORTANT**: Save the Pool ID and Registry ID from transaction results

**Transaction Example:**
```typescript
// The transaction will create two objects:
// 1. LiquidityPool (shared object) - This is your Pool ID
// 2. PoolRegistry (shared object) - This is your Registry ID
```

### Step 2: Mint KANARI Tokens (Optional)

If you need KANARI tokens for testing, you can mint them using the treasury cap:

```bash
iota client call \
  --package 0x1bdc310c564c57c090db0c526174fd2081656c830c875906491f1cabe889d5a9 \
  --module kanari \
  --function mint \
  --args 0x6571c9406c05d9ba9e10f696094d91d4b68c17869659a6cab8f5d2bcb0c9661f 1000000000000 <YOUR_ADDRESS> \
  --gas-budget 10000000
```

### Step 3: Add Initial Liquidity

1. Navigate to **Liquidity** tab → **Add Liquidity**
2. Enter Pool ID and Registry ID (from Step 1)
3. Enter amounts for both KANARI and IOTA
   - Example: 1000 KANARI + 100 IOTA
4. Set slippage tolerance (0.5% recommended)
5. Click **Add Liquidity**
6. Approve transaction

**Note**: The first liquidity provider establishes the initial price ratio!

### Step 4: Swap Tokens

1. Navigate to **Swap** tab
2. Enter Pool ID
3. Enter amount to swap
4. Click direction button to switch between KANARI→IOTA or IOTA→KANARI
5. Set slippage tolerance
6. Click **Swap**
7. Approve transaction

### Step 5: Monitor Pool

1. Navigate to **Pool Info** tab
2. Enter Pool ID
3. Click **Fetch** to view:
   - Current reserves
   - Token prices
   - LP token supply
   - Fee tier
   - Total Value Locked (TVL)

## 🔧 CLI Commands

### Create Pool (CLI)

```bash
iota client call \
  --package 0x1bdc310c564c57c090db0c526174fd2081656c830c875906491f1cabe889d5a9 \
  --module DEX \
  --function create_pool \
  --type-args \
    "0x1bdc310c564c57c090db0c526174fd2081656c830c875906491f1cabe889d5a9::kanari::KANARI" \
    "0x2::iota::IOTA" \
  --args 50 \
  --gas-budget 50000000
```

### Add Liquidity (CLI)

```bash
iota client call \
  --package 0x1bdc310c564c57c090db0c526174fd2081656c830c875906491f1cabe889d5a9 \
  --module DEX \
  --function add_liquidity \
  --type-args \
    "0x1bdc310c564c57c090db0c526174fd2081656c830c875906491f1cabe889d5a9::kanari::KANARI" \
    "0x2::iota::IOTA" \
  --args <POOL_ID> <REGISTRY_ID> <KANARI_COIN> <IOTA_COIN> 0 \
  --gas-budget 50000000
```

### Swap Tokens (CLI)

```bash
# Swap KANARI to IOTA
iota client call \
  --package 0x1bdc310c564c57c090db0c526174fd2081656c830c875906491f1cabe889d5a9 \
  --module DEX \
  --function swap_x_to_y \
  --type-args \
    "0x1bdc310c564c57c090db0c526174fd2081656c830c875906491f1cabe889d5a9::kanari::KANARI" \
    "0x2::iota::IOTA" \
  --args <POOL_ID> <KANARI_COIN> 0 \
  --gas-budget 50000000
```

## 🎯 Frontend Features

### Components

1. **SwapInterface** - Token swapping with slippage protection
2. **LiquidityInterface** - Add/remove liquidity
3. **CreatePool** - Create new pools with fee selection
4. **PoolInfo** - Real-time pool statistics
5. **WalletBalance** - Display KANARI and IOTA balances

### Key Features

- ✅ Real-time balance updates
- ✅ Slippage protection
- ✅ Transaction status notifications
- ✅ Responsive design
- ✅ Dark mode support
- ✅ Connect wallet integration

## 🔐 Security Features

1. **Slippage Protection**: All trades and liquidity operations include minimum output checks
2. **Overflow Protection**: Safe math operations prevent overflow attacks
3. **Minimum Liquidity Lock**: First LP locks 1000 units permanently
4. **Input Validation**: All inputs validated on-chain
5. **Immutable Metadata**: Token metadata is frozen

## 📊 Pool Mathematics

### Price Calculation

```
Price of Token X in terms of Token Y = Reserve Y / Reserve X
Price of Token Y in terms of Token X = Reserve X / Reserve Y
```

### Swap Output (Constant Product Formula)

```
Amount Out = (Amount In × Fee Multiplier × Reserve Out) / (Reserve In × 10000 + Amount In × Fee Multiplier)

Where Fee Multiplier = 10000 - Fee BPS
```

### LP Tokens Calculation

**Initial Liquidity:**
```
LP Tokens = sqrt(Amount X × Amount Y) - MINIMUM_LIQUIDITY
```

**Subsequent Liquidity:**
```
LP Tokens = min(
  (Amount X × Total LP Supply) / Reserve X,
  (Amount Y × Total LP Supply) / Reserve Y
)
```

## 🐛 Troubleshooting

### Common Issues

**Transaction Failed - Insufficient Liquidity**
- The pool doesn't have enough tokens for your swap
- Try a smaller amount or add more liquidity

**Transaction Failed - Slippage Exceeded**
- The price moved beyond your slippage tolerance
- Increase slippage tolerance or try again

**Pool Not Found**
- Verify the Pool ID is correct
- Make sure the pool has been created

**Insufficient Balance**
- You don't have enough tokens
- Check your wallet balance
- For KANARI tokens, you may need to mint some

**Wrong Network**
- Ensure you're connected to IOTA Testnet
- Check your wallet network settings

### Getting Help

1. Check transaction in IOTA Explorer: https://explorer.iota.org/testnet
2. Review frontend console for errors (F12)
3. Verify all contract addresses are correct
4. Ensure sufficient gas for transactions

## 🌐 Network Information

- **Network**: IOTA Testnet
- **RPC URL**: Provided by @iota/dapp-kit
- **Explorer**: https://explorer.iota.org/testnet
- **Faucet**: Available through IOTA Wallet

## 📱 Mobile Support

The frontend is fully responsive and works on mobile devices:
- ✅ Mobile-optimized UI
- ✅ Touch-friendly controls
- ✅ Wallet Connect support

## 🔄 Updating the Frontend

If contract addresses change, update `src/app/lib/contracts.ts`:

```typescript
export const CONTRACTS = {
  PACKAGE_ID: "<NEW_PACKAGE_ID>",
  KANARI: {
    TREASURY_CAP: "<NEW_TREASURY_CAP>",
    METADATA: "<NEW_METADATA>",
    TYPE: "<NEW_TYPE>",
  },
  // ...
};
```

## 📈 Next Steps

1. ✅ Create your first pool
2. ✅ Add liquidity
3. ✅ Perform test swaps
4. ⬜ Monitor pool performance
5. ⬜ Deploy to mainnet (when ready)

## 🎨 Customization

### Changing Theme Colors

Edit `src/app/globals.css` to customize colors:

```css
@theme {
  /* Add your custom colors */
}
```

### Adding New Token Pairs

1. Deploy new pool with `create_pool`
2. Update contract addresses in `contracts.ts`
3. Add UI for new pair in components

## 📚 Additional Resources

- [IOTA Documentation](https://docs.iota.org/)
- [Move Language Book](https://move-language.github.io/move/)
- [dApp Kit Docs](https://sdk.iota.org/dapp-kit)
- [Next.js Documentation](https://nextjs.org/docs)

## 🎉 Congratulations!

Your Kanari Network DEX is now live on IOTA Testnet! Start trading, providing liquidity, and exploring decentralized finance on IOTA.

---

**Need Help?** Check the troubleshooting section or review the transaction logs in the IOTA Explorer.
