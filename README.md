Short guide — Kanari Network DEX
=================================

This repository contains the Kanari Network DEX (Decentralized Exchange) with the following modules:

- `kanari` - KANARI token implementation
- `DEX` - Core AMM (Automated Market Maker) liquidity pool logic
- `DEXFactory` - Entry point functions for creating and managing pools
- `PriceOracle` - TWAP (Time-Weighted Average Price) oracle for manipulation-resistant price feeds

## Features

### Token (kanari module)

- Creates KANARI token with `TreasuryCap` during `init`
- `mint(treasury_cap, amount, recipient)` — mint new KANARI coins
- Standard coin operations (transfer, balance, etc.)

### DEX (Core AMM)

- **Duplicate Pool Prevention** — Uses GlobalPoolRegistry to prevent creating duplicate pools for the same token pair (works even if tokens are swapped)
- Constant product AMM (x * y = k) with three fee tiers
- Slippage protection on all operations
- LP token receipts for liquidity providers
- Overflow-safe math with u128
- Minimum liquidity lock to prevent attacks

### Price Oracle (TWAP)

- **Manipulation Resistant** — Time-weighted average prices prevent flash attacks
- **Gas Efficient** — No external oracle dependencies
- **Configurable History** — Adjustable observation window (e.g., 100 observations)
- **Multiple Time Windows** — Support for 1m, 5m, 15m, 1h TWAP calculations
- See [ORACLE_GUIDE.md](./ORACLE_GUIDE.md) for detailed documentation

### Fee Tiers

- Low: 0.1% (10 bps) - Best for stablecoin pairs
- Medium: 0.5% (50 bps) - Best for most pairs  
- High: 1.0% (100 bps) - Best for exotic pairs

Prerequisites
-------------

- Installed `iota` CLI with keystore/private key for signing
- Signing address must have IOTA coins for gas fees
- Node.js/Bun for frontend development

Build and Publish
-----------------

### Build Move modules

```powershell
iota move build --skip-fetch-latest-git-deps
```

### Publish to network

```powershell
iota client publish --skip-fetch-latest-git-deps
```

Save the Package ID from the publish output for use in the frontend.

DEX Setup
---------

### 1. Create Global Registry (One-time setup)

Before creating any pools, you must create the GlobalPoolRegistry:

```powershell
iota client call --package <PACKAGE_ID> --module DEXFactory --function create_registry
```

**Important:** Save the `GlobalPoolRegistry` object ID from the transaction output. You'll need to add it to your frontend configuration.

### 2. Configure Frontend

Edit `frontend/src/app/lib/contracts.ts`:

```typescript
export const CONTRACTS = {
  PACKAGE_ID: "0x...", // Your deployed package ID
  REGISTRY_ID: "0x...", // GlobalPoolRegistry object ID from step 1
  
  KANARI: {
    TREASURY_CAP: "0x...",
    METADATA: "0x...",
    TYPE: "0x...::kanari::KANARI",
  },
  
  IOTA: {
    TYPE: "0x2::iota::IOTA",
  },
  // ...
};
```

### 3. Create a Pool

```powershell
# Create KANARI/IOTA pool with 0.5% fee
iota client call \
  --package <PACKAGE_ID> \
  --module DEXFactory \
  --function create_pool \
  --type-args <PACKAGE_ID>::kanari::KANARI 0x2::iota::IOTA \
  --args <REGISTRY_ID> 50
```

**Note:** If you try to create a duplicate pool for the same token pair, the transaction will abort with error code 9 (`E_POOL_ALREADY_EXISTS`).

### 4. Add Liquidity

```powershell
iota client call \
  --package <PACKAGE_ID> \
  --module DEXFactory \
  --function add_liquidity \
  --type-args <TOKEN_X_TYPE> <TOKEN_Y_TYPE> \
  --args <POOL_ID> <COIN_X_ID> <COIN_Y_ID> 0
```

### 5. Swap Tokens

```powershell
# Swap X for Y
iota client call \
  --package <PACKAGE_ID> \
  --module DEXFactory \
  --function swap_x_to_y \
  --type-args <TOKEN_X_TYPE> <TOKEN_Y_TYPE> \
  --args <POOL_ID> <COIN_X_ID> 0
```

Mint KANARI Tokens
------------------

```powershell
iota client call \
  --package <PACKAGE_ID> \
  --module kanari \
  --function mint \
  --args <TREASURY_CAP_ID> 1000000000 <RECIPIENT_ADDRESS>
```

Frontend Development
-------------------

### Install dependencies

```powershell
cd frontend
bun install
```

### Run development server

```powershell
bun run dev
```

### Build for production

```powershell
bun run build
```

Architecture
-----------

### GlobalPoolRegistry

- Singleton shared object that tracks all pools
- Maps `blake2b256(type_name<X> || type_name<Y>)` → pool address
- Prevents duplicate pools via table lookup before creation

### LiquidityPool<X, Y>

- Holds reserves of both tokens
- Tracks LP supply and fee tier
- Implements constant product formula with fees

### LPToken<X, Y>

- Receipt proving liquidity ownership
- Burned when removing liquidity
- Amount represents share of pool

View Functions
-------------

```move
// Check if pool exists for token pair
public fun pool_exists<X, Y>(registry: &GlobalPoolRegistry): bool

// Get pool address (returns Option<address>)
public fun get_pool_address<X, Y>(registry: &GlobalPoolRegistry): Option<address>

// Get pool reserves
public fun get_reserves<X, Y>(pool: &LiquidityPool<X, Y>): (u64, u64)

// Calculate swap output
public fun get_amount_out<X, Y>(pool: &LiquidityPool<X, Y>, amount_in: u64, is_x_to_y: bool): u64
```

Error Codes
----------

- `E_INSUFFICIENT_LIQUIDITY: 1` - Pool has no liquidity
- `E_INVALID_FEE: 2` - Fee not in allowed tiers (10, 50, or 100)
- `E_ZERO_AMOUNT: 3` - Cannot trade/add zero amount
- `E_INSUFFICIENT_LP_TOKENS: 4` - Not enough LP tokens to burn
- `E_SLIPPAGE_EXCEEDED: 5` - Output less than minimum requested
- `E_INVALID_POOL_STATE: 6` - Pool state inconsistent
- `E_MIN_LIQUIDITY: 7` - Initial LP too small
- `E_OVERFLOW: 8` - Integer overflow detected
- `E_POOL_ALREADY_EXISTS: 9` - **Pool already exists for this token pair**

Troubleshooting
--------------

### Pool Creation Fails with "E_POOL_ALREADY_EXISTS"

A pool for this token pair already exists. Use the existing pool instead of creating a new one.

### "Registry ID not configured"

Make sure `CONTRACTS.REGISTRY_ID` is set in `contracts.ts` with the GlobalPoolRegistry object ID.

### Gas Errors

Fund the signing address with IOTA coins or increase `--gas-budget`.

### Frontend Not Connecting

1. Check that wallet extension is installed and unlocked
2. Verify `PACKAGE_ID` and `REGISTRY_ID` in `contracts.ts`
3. Ensure you're on the correct network (mainnet/testnet)

Finding Object IDs
-----------------

List all objects owned by an address:

```powershell
iota client objects --owner <ADDRESS> --json
```

Look for:

- `TreasuryCap<...::kanari::KANARI>` - For minting KANARI
- `GlobalPoolRegistry` - For creating pools
- `LiquidityPool<X, Y>` - For pool operations
- `Coin<...>` - For trading/liquidity

Documentation
------------

See additional documentation:

- `DEEPBOOK_UI_GUIDE.md` - Frontend UI guide
- `DEEPBOOK_IMPROVEMENTS.md` - DEX architecture details
- `README_DEX.md` - Detailed DEX technical documentation

For more help, check the transaction output or provide the error message.
