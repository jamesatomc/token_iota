# 🚀 TWAP Oracle Deployment Guide

Complete guide to deploy and use the TWAP Price Oracle for your DEX pools.

## 📋 Prerequisites

- DEX already deployed with at least one liquidity pool
- Pool has sufficient liquidity (recommended minimum: $10,000)
- IOTA CLI configured with funded account

## 🏗️ Deployment Steps

### Step 1: Publish Updated Contract

```bash
# Build the contract
iota move build --skip-fetch-latest-git-deps

# Publish to network
iota client publish --gas-budget 500000000
```

Save the output:
- `PACKAGE_ID` - Your new package ID
- All module IDs and object IDs

### Step 2: Create Oracle for Your Pool

```bash
iota client call \
  --package <PACKAGE_ID> \
  --module DEXFactory \
  --function create_oracle \
  --type-args <TOKEN_X_TYPE> <TOKEN_Y_TYPE> \
  --args <POOL_OBJECT_ID> 100 0x6 \
  --gas-budget 50000000
```

**Arguments:**
- `TOKEN_X_TYPE`: Full type path (e.g., `0x123::kanari::KANARI`)
- `TOKEN_Y_TYPE`: Full type path (e.g., `0x2::iota::IOTA`)
- `POOL_OBJECT_ID`: Your liquidity pool object ID
- `100`: Number of observations to keep (adjust based on needs)
- `0x6`: System clock object (always `0x6`)

**Example:**
```bash
iota client call \
  --package 0x1b0fae0170d4d81cb152ad4984ef214293a37cc6fafbc519ec80dcab359c2e83 \
  --module DEXFactory \
  --function create_oracle \
  --type-args 0x1b0fae0170d4d81cb152ad4984ef214293a37cc6fafbc519ec80dcab359c2e83::kanari::KANARI 0x2::iota::IOTA \
  --args 0xf0f2fe...9155be 100 0x6 \
  --gas-budget 50000000
```

Save the **Oracle Object ID** from transaction output!

### Step 3: Initial Oracle Update

Update the oracle immediately after creation:

```bash
iota client call \
  --package <PACKAGE_ID> \
  --module DEXFactory \
  --function update_oracle \
  --type-args <TOKEN_X_TYPE> <TOKEN_Y_TYPE> \
  --args <ORACLE_ID> <POOL_ID> 0x6 \
  --gas-budget 10000000
```

## 🤖 Setup Automated Keeper

For accurate TWAP, oracles should be updated regularly. Here's a Node.js keeper bot:

### Install Dependencies

```bash
npm install @iota/iota-sdk dotenv
```

### Create Keeper Bot

```javascript
// keeper.js
import { getFullnodeUrl, IotaClient } from '@iota/iota-sdk/client';
import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';
import { Transaction } from '@iota/iota-sdk/transactions';
import dotenv from 'dotenv';

dotenv.config();

const PACKAGE_ID = process.env.PACKAGE_ID;
const ORACLE_ID = process.env.ORACLE_ID;
const POOL_ID = process.env.POOL_ID;
const TOKEN_X = process.env.TOKEN_X_TYPE;
const TOKEN_Y = process.env.TOKEN_Y_TYPE;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Initialize client
const client = new IotaClient({ url: getFullnodeUrl('testnet') });
const keypair = Ed25519Keypair.fromSecretKey(
  Buffer.from(PRIVATE_KEY, 'hex')
);

async function updateOracle() {
  try {
    console.log(`[${new Date().toISOString()}] Updating oracle...`);
    
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::DEXFactory::update_oracle`,
      arguments: [
        tx.object(ORACLE_ID),
        tx.object(POOL_ID),
        tx.object('0x6'), // Clock
      ],
      typeArguments: [TOKEN_X, TOKEN_Y],
    });
    
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: {
        showEffects: true,
      },
    });
    
    if (result.effects?.status?.status === 'success') {
      console.log('✅ Oracle updated successfully');
      console.log(`   Digest: ${result.digest}`);
    } else {
      console.error('❌ Update failed:', result.effects?.status);
    }
  } catch (error) {
    console.error('❌ Error updating oracle:', error.message);
  }
}

// Update every 5 minutes
const UPDATE_INTERVAL = 5 * 60 * 1000;

console.log('🤖 Oracle Keeper Bot Started');
console.log(`   Package: ${PACKAGE_ID}`);
console.log(`   Oracle: ${ORACLE_ID}`);
console.log(`   Pool: ${POOL_ID}`);
console.log(`   Update Interval: ${UPDATE_INTERVAL / 1000}s`);

// Update immediately on start
updateOracle();

// Then update on interval
setInterval(updateOracle, UPDATE_INTERVAL);
```

### Create .env File

```bash
# .env
PACKAGE_ID=0x1b0fae0170d4d81cb152ad4984ef214293a37cc6fafbc519ec80dcab359c2e83
ORACLE_ID=0x...
POOL_ID=0x...
TOKEN_X_TYPE=0x1b0fae0170d4d81cb152ad4984ef214293a37cc6fafbc519ec80dcab359c2e83::kanari::KANARI
TOKEN_Y_TYPE=0x2::iota::IOTA
PRIVATE_KEY=your_private_key_hex
```

### Run Keeper

```bash
node keeper.js
```

**Recommended:** Run as systemd service or PM2 process:

```bash
# With PM2
pm2 start keeper.js --name "oracle-keeper"
pm2 save
pm2 startup
```

## 📊 Using Oracle in Your DApp

### Frontend Integration

```typescript
import { Transaction } from '@iota/iota-sdk/transactions';

// Read TWAP (view function - free)
async function getTWAP(oracleId: string, timeWindow: number) {
  const tx = new Transaction();
  
  // This is a view-only call, no gas needed
  tx.moveCall({
    target: `${PACKAGE_ID}::PriceOracle::get_twap_price`,
    arguments: [
      tx.object(oracleId),
      tx.pure.u64(timeWindow), // seconds
      tx.object('0x6'),
    ],
    typeArguments: [TOKEN_X, TOKEN_Y],
  });
  
  const result = await client.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: '0x0', // Dummy sender for view calls
  });
  
  // Parse result (implementation depends on SDK version)
  return parseU128FromResult(result);
}

// Get 5-minute TWAP
const twap5m = await getTWAP(ORACLE_ID, 300);
console.log(`5-min TWAP: ${twap5m / 1e9} IOTA per TOKEN`);

// Get 1-hour TWAP
const twap1h = await getTWAP(ORACLE_ID, 3600);
console.log(`1-hour TWAP: ${twap1h / 1e9} IOTA per TOKEN`);
```

### Smart Contract Integration

```move
use kanari_network::PriceOracle;

public fun my_defi_function<X, Y>(
    oracle: &PriceOracle::PriceOracle<X, Y>,
    clock: &Clock,
) {
    // Get 15-minute TWAP for reliable pricing
    let price = PriceOracle::get_twap_price(oracle, 900, clock);
    
    // Use price for your logic
    // Price format: (token_y_amount / token_x_amount) × 10^9
}
```

## 🔍 Monitoring

### Check Oracle Status

```bash
# Get observation count
iota client call \
  --package <PACKAGE_ID> \
  --module PriceOracle \
  --function get_observation_count \
  --type-args <TOKEN_X> <TOKEN_Y> \
  --args <ORACLE_ID>

# Get latest update time
iota client call \
  --package <PACKAGE_ID> \
  --module PriceOracle \
  --function get_latest_observation_time \
  --type-args <TOKEN_X> <TOKEN_Y> \
  --args <ORACLE_ID>
```

### Monitor Events

Subscribe to oracle events:

```typescript
const unsubscribe = await client.subscribeEvent({
  filter: {
    MoveEventModule: {
      package: PACKAGE_ID,
      module: 'PriceOracle',
    },
  },
  onMessage: (event) => {
    console.log('Oracle Event:', event);
    
    if (event.type.includes('OracleUpdated')) {
      const { timestamp, price_cumulative, current_price } = event.parsedJson;
      console.log(`Price updated: ${current_price}`);
    }
  },
});
```

## 🎯 Configuration Guide

### Choosing `max_observations`

Based on update frequency:

| Update Frequency | Recommended max_observations | History Coverage |
|------------------|----------------------------|------------------|
| Every 1 minute | 60 | 1 hour |
| Every 5 minutes | 100 | ~8 hours |
| Every 15 minutes | 100 | ~25 hours |
| Every 30 minutes | 100 | ~50 hours |

**Rule of thumb:** `max_observations` should provide at least 8-12 hours of history.

### Choosing Time Window

For price queries:

| Use Case | Recommended Window | Rationale |
|----------|-------------------|-----------|
| Liquidations | 15-30 minutes | Balance safety vs responsiveness |
| Collateral Valuation | 5-15 minutes | More responsive to market |
| Settlement Prices | 1-4 hours | Very stable, manipulation-resistant |
| Long-term Analysis | 24 hours | Smoothed market trends |

**Best Practice:** Use multiple time windows and validate consistency:

```move
let twap_5m = get_twap_price(oracle, 300, clock);
let twap_15m = get_twap_price(oracle, 900, clock);

// Ensure prices don't deviate more than 10%
assert!(twap_5m <= twap_15m * 110 / 100, E_PRICE_MANIPULATION);
```

## 🛠️ Troubleshooting

### Error: "E_NO_OBSERVATIONS"

**Cause:** Oracle hasn't been updated yet or time window too large.

**Solution:**
1. Update oracle at least once: `update_oracle`
2. Reduce time window in query
3. Wait for more observations to accumulate

### Error: "E_INSUFFICIENT_LIQUIDITY"

**Cause:** Pool has zero liquidity or reserves are zero.

**Solution:**
1. Ensure pool has liquidity before creating oracle
2. Skip oracle update if pool is empty (keeper should check)

### Stale Oracle Data

**Symptoms:** TWAP doesn't reflect recent market changes.

**Solution:**
1. Check keeper bot is running: `pm2 list`
2. Verify keeper has gas: `iota client gas`
3. Reduce update interval (but consider gas costs)
4. Check network connectivity

### Price Seems Wrong

**Debugging:**
1. Check spot price vs TWAP:
   ```move
   let spot = get_spot_price(pool);
   let twap = get_twap_price(oracle, 300, clock);
   ```
2. Verify token order matches pool order
3. Remember: Price is always `Y per X`, not `X per Y`

## 📈 Best Practices

### For DeFi Protocols

✅ **DO:**
- Use TWAP for all price-sensitive operations
- Validate prices across multiple time windows
- Set minimum liquidity requirements before trusting oracle
- Monitor oracle health in your frontend
- Have circuit breakers for extreme price deviations

❌ **DON'T:**
- Use spot price for critical operations (manipulable!)
- Rely on oracles with <$10K liquidity
- Use same time window for all use cases
- Ignore price deviation checks
- Assume oracle is always up-to-date

### For Liquidity Providers

- Create oracles immediately after pool creation
- Share oracle ID with community
- Fund keeper bot for regular updates
- Monitor oracle events for unusual activity

### For Traders

- Check oracle health before large trades
- Use TWAP to detect price manipulation
- Compare oracle price vs your trade impact
- Monitor multiple time windows for trend

## 🎓 Advanced Topics

### Custom Observation Storage

For very active pools, consider:
- Storing observations off-chain (indexer)
- Only keeping critical checkpoints on-chain
- Implementing custom time-series compression

### Multi-Pool Price Aggregation

Aggregate prices from multiple pools:

```move
// Average price across multiple pools
let price_a = get_twap_price(oracle_a, 900, clock);
let price_b = get_twap_price(oracle_b, 900, clock);
let avg_price = (price_a + price_b) / 2;
```

### Weighted TWAP

Weight observations by liquidity depth:

```move
// More sophisticated: weight by liquidity
let (reserve_x, reserve_y) = DEX::get_reserves(pool);
let liquidity = sqrt(reserve_x * reserve_y);
let weighted_price = twap * liquidity / total_liquidity;
```

## 📚 Additional Resources

- [Oracle Guide](./ORACLE_GUIDE.md) - Detailed oracle documentation
- [DEX Guide](./README_DEX.md) - Complete DEX documentation
- [Lending Example](./examples/lending_example.move) - Integration example

---

**Need Help?** Open an issue on GitHub or join our Discord community.

**Built with ❤️ for IOTA DeFi**
