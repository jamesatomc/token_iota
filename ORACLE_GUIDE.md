# 🔮 TWAP Price Oracle

Time-Weighted Average Price (TWAP) Oracle for Kanari Network DEX - provides manipulation-resistant price feeds for DeFi protocols.

## 📊 Overview

The TWAP Oracle tracks price changes over time and calculates time-weighted average prices, making it extremely difficult to manipulate prices through flash attacks or large single trades.

### Key Features

✅ **Manipulation Resistant** - Uses time-weighted averages instead of spot prices  
✅ **Gas Efficient** - No external oracle calls, uses existing DEX data  
✅ **Configurable History** - Adjustable observation window (e.g., 100 observations)  
✅ **Binary Search** - Efficient observation lookup O(log n)  
✅ **Multiple Time Windows** - Support for 1m, 5m, 15m, 1h, etc.  

## 🏗️ Architecture

```
PriceOracle<X, Y>
├── pool_id: address          // Reference to liquidity pool
├── observations: vector<Observation>  // Time-series data
├── max_observations: u64     // Circular buffer limit
└── last_price_cumulative: u128
```

### Observation Structure
```move
struct Observation {
    timestamp: u64,         // Unix time (seconds)
    price_cumulative: u128  // Σ(price × time_elapsed)
}
```

## 🚀 Usage

### 1. Create Oracle for a Pool

```bash
iota client call \
  --package $PACKAGE_ID \
  --module DEXFactory \
  --function create_oracle \
  --type-args $TOKEN_X $TOKEN_Y \
  --args $POOL_ID 100 0x6  # pool, max_obs, clock
```

**Parameters:**
- `pool`: Liquidity pool object ID
- `max_observations`: Number of price points to keep (e.g., 100)
- `clock`: System clock object (`0x6`)

### 2. Update Oracle (Permissionless)

Anyone can update the oracle to record current price:

```bash
iota client call \
  --package $PACKAGE_ID \
  --module DEXFactory \
  --function update_oracle \
  --type-args $TOKEN_X $TOKEN_Y \
  --args $ORACLE_ID $POOL_ID 0x6
```

**Best Practice:** Update oracle:
- Every swap/add/remove liquidity transaction
- Via automated keeper bot every N minutes
- Before reading TWAP in critical operations

### 3. Read TWAP Price

```move
use kanari_network::PriceOracle;

// Get 5-minute TWAP (300 seconds)
let twap_5m = PriceOracle::get_twap_price<IOTA, USDC>(
    oracle,
    300,  // time window in seconds
    clock
);

// Get 1-hour TWAP
let twap_1h = PriceOracle::get_twap_price<IOTA, USDC>(
    oracle,
    3600,
    clock
);
```

### 4. Read Spot Price (Reference Only)

```move
// Current spot price (not manipulation resistant!)
let spot = PriceOracle::get_spot_price<IOTA, USDC>(pool);
```

## 📈 Price Calculation

### Price Format
- Price = `(reserve_Y / reserve_X) × 10^9`
- **Example:** If pool has 1,000 IOTA and 50,000 USDC
  - Price = (50,000 / 1,000) × 10^9 = 50,000,000,000
  - Meaning: 1 IOTA = 50 USDC

### TWAP Formula
```
TWAP = (price_cumulative_end - price_cumulative_start) / time_elapsed
```

Where:
- `price_cumulative = Σ(price × Δt)` for all observations
- Time-weighted sum ensures longer periods have more weight

## 🎯 Use Cases

### 1. Lending Protocols
```move
public fun calculate_collateral_value<X, Y>(
    oracle: &PriceOracle<X, Y>,
    collateral_amount: u64,
    clock: &Clock
): u64 {
    // Use 15-minute TWAP for safety
    let twap = PriceOracle::get_twap_price(oracle, 900, clock);
    (collateral_amount as u128) * twap / PRICE_PRECISION
}
```

### 2. Automated Market Makers
```move
public fun rebalance_portfolio<X, Y>(
    oracle: &PriceOracle<X, Y>,
    clock: &Clock
) {
    let twap_1h = PriceOracle::get_twap_price(oracle, 3600, clock);
    // Use TWAP for rebalancing decisions
}
```

### 3. Options/Derivatives
```move
public fun check_strike_price<X, Y>(
    oracle: &PriceOracle<X, Y>,
    strike: u128,
    clock: &Clock
): bool {
    let twap = PriceOracle::get_twap_price(oracle, 300, clock);
    twap >= strike
}
```

## 🔐 Security Considerations

### ✅ Advantages
1. **Flash Loan Resistant** - Single-block attacks cannot manipulate TWAP
2. **No External Dependencies** - Uses on-chain DEX data only
3. **Deterministic** - Same inputs always produce same outputs
4. **Transparent** - All price data is publicly verifiable

### ⚠️ Limitations
1. **Requires Regular Updates** - Stale oracles may not reflect market
2. **Low Liquidity Risk** - Small pools easier to manipulate over time
3. **Time Window Trade-off** - Longer windows = more resistant but less responsive

### 🛡️ Best Practices

**For DeFi Protocol Developers:**
```move
// ❌ BAD: Using spot price
let price = PriceOracle::get_spot_price(pool); // Manipulable!

// ✅ GOOD: Using TWAP with appropriate window
let price = PriceOracle::get_twap_price(oracle, 900, clock); // 15 min TWAP

// ✅ BETTER: Multiple time windows + validation
let twap_5m = PriceOracle::get_twap_price(oracle, 300, clock);
let twap_15m = PriceOracle::get_twap_price(oracle, 900, clock);
assert!(twap_5m <= twap_15m * 110 / 100, E_PRICE_DEVIATION); // Max 10% deviation
```

**For Oracle Operators:**
- Update oracle every 5-15 minutes minimum
- Monitor observation count (`get_observation_count`)
- Set `max_observations` based on update frequency:
  - Update every 5 min → 100 obs = 8.3 hours history
  - Update every 15 min → 100 obs = 25 hours history

## 📊 View Functions

```move
// Get number of stored observations
PriceOracle::get_observation_count<X, Y>(oracle): u64

// Get oldest observation timestamp
PriceOracle::get_oldest_observation_time<X, Y>(oracle): u64

// Get latest observation timestamp
PriceOracle::get_latest_observation_time<X, Y>(oracle): u64

// Get oracle's pool ID
PriceOracle::get_pool_id<X, Y>(oracle): address

// Get max observations limit
PriceOracle::get_max_observations<X, Y>(oracle): u64
```

## 🎪 Events

### OracleCreated
```move
{
    oracle_id: address,
    pool_id: address,
    max_observations: u64
}
```

### OracleUpdated
```move
{
    oracle_id: address,
    pool_id: address,
    timestamp: u64,
    price_cumulative: u128,
    current_price: u128
}
```

### TWAPCalculated
```move
{
    oracle_id: address,
    twap_price: u128,
    time_window: u64,
    observations_used: u64
}
```

## 🔧 Integration Examples

### JavaScript/TypeScript (Frontend)

```typescript
import { Transaction } from '@iota/iota-sdk/transactions';

// Create oracle
const createOracleTx = new Transaction();
createOracleTx.moveCall({
  target: `${PACKAGE_ID}::DEXFactory::create_oracle`,
  arguments: [
    createOracleTx.object(poolId),
    createOracleTx.pure.u64(100), // max observations
    createOracleTx.object('0x6'),  // clock
  ],
  typeArguments: [TOKEN_X, TOKEN_Y],
});

// Update oracle
const updateTx = new Transaction();
updateTx.moveCall({
  target: `${PACKAGE_ID}::DEXFactory::update_oracle`,
  arguments: [
    updateTx.object(oracleId),
    updateTx.object(poolId),
    updateTx.object('0x6'),
  ],
  typeArguments: [TOKEN_X, TOKEN_Y],
});
```

### Automated Keeper Bot

```typescript
// Update oracle every 5 minutes
setInterval(async () => {
  try {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::DEXFactory::update_oracle`,
      arguments: [
        tx.object(ORACLE_ID),
        tx.object(POOL_ID),
        tx.object('0x6'),
      ],
      typeArguments: [TOKEN_X, TOKEN_Y],
    });
    
    await signAndExecute({ transaction: tx });
    console.log('Oracle updated successfully');
  } catch (error) {
    console.error('Oracle update failed:', error);
  }
}, 5 * 60 * 1000); // 5 minutes
```

## 📝 Error Codes

| Code | Constant | Description |
|------|----------|-------------|
| 1 | `E_INVALID_OBSERVATION` | Invalid observation parameters |
| 2 | `E_NO_OBSERVATIONS` | Not enough observations for TWAP |
| 3 | `E_INSUFFICIENT_LIQUIDITY` | Pool has no liquidity |

## 🎓 Learning Resources

### Understanding TWAP
- [Uniswap V2 Oracle Documentation](https://docs.uniswap.org/contracts/v2/concepts/core-concepts/oracles)
- [Time-Weighted Average Price Explained](https://academy.binance.com/en/articles/what-is-twap-and-vwap)

### Price Oracle Best Practices
- Always use appropriate time windows for your use case
- Combine multiple time windows for validation
- Consider liquidity depth when trusting prices
- Update oracles regularly for accuracy

## 🏁 Conclusion

The TWAP Oracle provides a robust, manipulation-resistant price feed that's essential for secure DeFi protocols on IOTA. By leveraging time-weighted averages and on-chain liquidity data, it offers a trustworthy alternative to centralized oracles.

**Ready to integrate?** Start by creating an oracle for your pool and setting up regular updates!

---

**Built with ❤️ for IOTA DeFi Ecosystem**
