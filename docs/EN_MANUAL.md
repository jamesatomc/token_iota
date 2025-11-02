# Kanari Network — Developer & User Manual (English)

This manual documents the on-chain modules in this repository: `DeepBook`, `DEX`, `DEXFactory`, and `PriceOracle`. It describes the design, public APIs (entry functions and useful views), events, error codes, and quick steps to run tests and interact with the modules. Use this as a reference for frontend integration, tests, and audits.

---

## 1. Project overview

- Language / Platform: Move (IOTA / Kanari Network modules).
- Purpose: Provides two major trading primitives:
  - `DEX`: Automated Market Maker (AMM) style liquidity pools with LP tokens and swaps.
  - `DeepBook`: Central Limit Order Book implementation with limit/IOC/FOK/PostOnly orders and per-book fee handling.
  - `PriceOracle`: TWAP (time-weighted average price) oracle built from pool reserves (used by DEXFactory to maintain oracles).
  - `DEXFactory`: Convenience entrypoints for creating pools, adding/removing liquidity, swapping and creating/updating oracles.

Repository layout (relevant files):

- `sources/DeepBook.move` — limit order book module.
- `sources/DEX.move` — AMM DEX module.
- `sources/DEXFactory.move` — factory wrappers for easier entrypoints and oracle wiring.
- `sources/PriceOracle.move` — TWAP price oracle module.

---

## 2. Design summary & data shapes

### DeepBook

- Central OrderBook keyed by a `UID` and generic over `Base` and `Quote` token types.
- `OrderBook<Base, Quote>` holds vectors of `LimitOrder` for bids & asks, balances (locked/fee balances), next_order_id, fee_bps, and max_depth.
- `LimitOrder` fields: id, maker (address), is_bid (bool), price (u64 scaled by PRICE_SCALE), quantity (u64 base units), filled, locked_amount.
- Fees collected separately in base/quote balances for book.
- Order types supported: Limit (0), IOC (1), FOK (2), PostOnly (3).

### DEX (AMM)

- `LiquidityPool<X, Y>` holds balances for token X and Y, fee_bps, lp_supply and an optional burn reserve object address created on first liquidity add.
- `LPToken<X, Y>` is a key+store object representing minted LP receipt.
- Global registry prevents duplicate pools (pair hashing via sorted concatenated type names + blake2b256).
- Fees are specified in basis points (BPS). Supported fees: 0.1% (10), 0.5% (50), 1.0% (100).
- Initial liquidity mints LP tokens and locks a `MINIMUM_LIQUIDITY` amount in a `BurnReserve` (shared object) to avoid zero-supply edge cases.

### PriceOracle

- Maintains a list of `Observation { timestamp, price_cumulative }` limited by `max_observations`.
- Observations store cumulative price*time so TWAPs are computed via differences over time windows.
- Oracle uses pool reserves as u128 and multiplies by `PRICE_PRECISION` for consistent precision.
- Has protections: minimum observation interval, overflow checks.

---

## 3. Important constants & conventions

- PRICE_SCALE and PRICE_PRECISION use 9 decimals (1_000_000_000) for price normalization.
- Fees are in basis points (bps). 10000 == 100%. Example: 30 bps == 0.3%.
- U64_MAX and U128_MAX guards used to ensure arithmetic fits into u64/u128 before casting.
- Max depth constraints and checks to avoid abusive books.

---

## 4. Errors & Events (quick reference)

### DeepBook errors (examples from module)

- `E_INSUFFICIENT_LIQUIDITY` = 1
- `E_INVALID_PRICE` = 2
- `E_INVALID_QUANTITY` = 3
- `E_ORDER_NOT_FOUND` = 4
- `E_UNAUTHORIZED` = 5
- `E_INVALID_FEE` = 6
- `E_INVALID_DEPTH` = 7
- `E_ORDERBOOK_ALREADY_EXISTS` = 8
- `E_SAME_TOKEN_PAIR` = 9
- `E_OVERFLOW` = 10
- `E_POST_ONLY_VIOLATION` = 11

### DEX errors (examples)

- `E_INSUFFICIENT_LIQUIDITY` = 1
- `E_INVALID_FEE` = 2
- `E_ZERO_AMOUNT` = 3
- `E_INSUFFICIENT_LP_TOKENS` = 4
- `E_SLIPPAGE_EXCEEDED` = 5
- `E_INVALID_POOL_STATE` = 6
- `E_MIN_LIQUIDITY` = 7
- `E_OVERFLOW` = 8
- `E_POOL_ALREADY_EXISTS` = 9
- `E_SAME_TOKEN_PAIR` = 10

### Events (not exhaustive)

- `OrderPlaced`, `OrderMatched`, `OrderCancelled`, `OrderBookCreated` (DeepBook)
- `OrderBookRegistryCreated`, `FeesWithdrawn`, `BookAdminChanged` (DeepBook registry/admin operations)
- `PoolCreated`, `RegistryCreated`, `LiquidityAdded`, `LiquidityRemoved`, `Swap` (DEX)
- `OracleCreated`, `OracleUpdated`, `TWAPCalculated` (PriceOracle)

---

## 5. Public API / Entry functions (summary)

Note: function signatures below are paraphrased; check source for exact types and generic parameters.

### DeepBook (common entry points)

- `create_order_book_with_decimals<Base, Quote>(fee_bps, max_depth, base_decimals, quote_decimals, ctx)`
  - Create an order book (without registry). Emits `OrderBookCreated` and returns/creates shared object.
- `create_global_registry(ctx)`
  - Create `GlobalOrderBookRegistry` (call once during deployment).
- `create_order_book_with_registry_with_decimals<Base, Quote>(registry, fee_bps, max_depth, base_decimals, quote_decimals, ctx)`
  - Creates book and registers it in registry; prevents duplicates for token pair.
- `get_or_create_order_book_with_decimals<Base, Quote>(registry, fee_bps, max_depth, base_decimals, quote_decimals, ctx)`
  - Factory style: returns existing book address or creates and registers a new one.
- `place_bid<Base, Quote>(book, price, quantity, payment: Coin<Quote>, order_type, ctx)` — entry
- `place_ask<Base, Quote>(book, price, quantity, base_coin: Coin<Base>, order_type, ctx)` — entry
- `cancel_order<Base, Quote>(book, order_id, ctx)` — entry
- `withdraw_fees<Base, Quote>(registry, book_addr, to: address, ctx)` — entry (admin-only)
- View helpers: `get_best_bid`, `get_best_ask`, `get_spread`, `get_book_depth`, `get_fee_balances`, `get_all_bids`, `get_all_asks`, `get_bid_at`, `get_ask_at`, etc.

Important notes: Decimals are tracked per book and used when converting quantity and payments to ensure correct rounding and preventing effective-zero orders.

### DEX (common entry points)

- `create_global_registry(ctx)` — create `GlobalPoolRegistry`.
- `create_pool<X, Y>(registry, fee_bps, ctx)` — create a liquidity pool for the X/Y pair (fee must be among allowed constants).
- `add_liquidity<X, Y>(pool, coin_x, coin_y, min_lp_amount, ctx)` — add tokens, with slippage protection.
- `remove_liquidity<X, Y>(pool, lp_token, min_x_out, min_y_out, ctx)` — burn LP receipt and receive coins.
- `swap_x_to_y<X, Y>(pool, coin_x, min_y_out, ctx)` — swap with slippage protection.
- `swap_y_to_x<X, Y>(pool, coin_y, min_x_out, ctx)` — reverse swap.
- View helpers: `get_reserves`, `get_amount_out` (view), `get_lp_supply`, `get_fee`, `get_pool_address`, etc.

### DEXFactory

- Thin wrappers over `DEX` that expose entry functions suitable for frontends and create/update oracles.
- `create_registry`, `create_pool`, `add_liquidity`, `remove_liquidity`, `swap_x_to_y`, `swap_y_to_x`, `create_oracle`, `update_oracle`.

### PriceOracle

- `create_oracle<X, Y>(pool, max_observations, clock, ctx)` — create oracle object.
- `create_and_share_oracle` — convenience entry that shares the oracle.
- `update_oracle(oracle, pool, clock)` — updates cumulative price by sampling pool reserves with protection checks.
- `get_twap_price(oracle, time_window, clock)` — compute TWAP over a given time window.
- View helpers: `get_spot_price`, `get_observation_count`, `get_observation_at_index`, etc.

---

## 6. Quickstart — deployment & common flows (developer perspective)

Prerequisites:

- IOTA Move toolchain installed and configured (use the same commands your project uses). This repo already contains tests and build artifacts in `build/`.

1) Run the Move tests locally (project root). In PowerShell:

```powershell
# from repository root (where Move.toml sits)
iota move test --skip-fetch-latest-git-deps
```

2) Create registries (call once in deployment script / genesis transaction):

- DEX: call `kanari_network::DEX::create_global_registry(ctx)` (via factory `DEXFactory.create_registry`).
- DeepBook: call `kanari_network::DeepBook::create_global_registry(ctx)`.

3) Create a pool or order book for a token pair:

- DEX: `DEXFactory.create_pool<X, Y>(registry, fee_bps, ctx)`
- DeepBook: `DeepBook::create_order_book_with_registry_with_decimals<Base, Quote>(registry, fee_bps, max_depth, base_decimals, quote_decimals, ctx)`

4) Add liquidity / place orders / swap:

- DEX: `add_liquidity`, `swap_x_to_y`, `remove_liquidity` via `DEXFactory` (entry functions).
- DeepBook: `place_bid` / `place_ask`, ensure payment coins are supplied for bids (quote coin) and base coins for asks.

5) Oracles:

- Use `DEXFactory.create_oracle` to create and share an oracle for a pool.
- Call `DEXFactory.update_oracle` (or `PriceOracle.update_oracle`) regularly (e.g., off-chain caller / keeper) to append observations.
- Query `PriceOracle.get_twap_price` to compute TWAP from observations.

---

## 7. Safety & edge cases to watch for

- Overflow checks: The modules include many u128 checks and guard conditions; follow the same patterns when writing new helpers.
- Decimal scaling: For cross-token calculations, ensure decimals of base/quote are applied when computing required payment amounts.
- Non-zero checks: Swaps and liquidity operations require non-zero amounts to avoid wasted operations.
- Initial liquidity: DEX locks `MINIMUM_LIQUIDITY` to avoid LP division-by-zero. Frontends should reflect this locked amount.
- Registry hashing: The token pair registry uses sorted type names and blake2b256 of the concatenation. Always use the same ordering to avoid duplicate pools/books.
- Access control: Admins (book admins or registry owner) control fee withdrawals and admin changes; verify sender/address checks when scripting.

---

## 8. Tests & verification

- Tests are provided in `tests/` for both AMM and orderbook flows (e.g., `dex_unit_tests.move`, `deepbook_unit_tests.move`, integration tests).
- Run tests with the Move toolchain command (from repo root):

```powershell
# run all tests
iota move test --skip-fetch-latest-git-deps
```

- Unit test highlights to check when modifying code:
  - Swaps: ensure `get_amount_out` matches `calculate_swap_output` behavior and that fees/slippage are enforced.
  - Liquidity: initial mint math, LP accounting, and burn reserve creation.
  - Orderbook: matching logic, order types (IOC/FOK/PostOnly), refunds and fee accounting.
  - Oracle: time progression, observation add/remove logic and TWAP computation for sample windows.

---

## 9. Frontend integration notes

- The `frontend/` folder contains a Next.js UI with typical config files. Use `DEXFactory` for convenient entry points.
- For watchers/keepers (e.g., to update oracles), call `PriceOracle.update_oracle` periodically and include a `Clock` object from the runtime (or pass clock arg in entry calls).

---

## 10. Examples & workflows (short)

- Create DEX pool & add initial liquidity (pseudocode flow):
  1. Ensure `GlobalPoolRegistry` exists (create if not).
  2. Call `DEXFactory.create_pool<X, Y>(registry, fee_bps, ctx)`.
  3. Call `DEXFactory.add_liquidity(pool, coin_x, coin_y, min_lp_out, ctx)`.

- Create Order Book & place a bid:
  1. Ensure `GlobalOrderBookRegistry` exists (create if not).
  2. Call `DeepBook.create_order_book_with_registry_with_decimals<Base, Quote>(registry, fee_bps, max_depth, base_decimals, quote_decimals, ctx)`.
  3. From user account: call `DeepBook.place_bid(book, price, quantity, payment_coin, order_type, ctx)`.

---

## 11. Next steps & suggestions

- Add short, concrete example scripts (Move transaction wrappers) demonstrating creating a pool/book and performing a full cycle (create, add liquidity, swap, remove liquidity; or create book, place orders, match, withdraw fees).
- Add monitoring tooling to expose `get_fee_balances`, `get_book_depth`, `get_reserves`, and `get_observation_count` for health dashboards.
- Document typical frontend UX flows (e.g., how to construct `Coin` inputs with proper decimals and how to parse order prices with `PRICE_SCALE`).

---

## 12. Contact & contribution

Follow existing repository contribution patterns. When in doubt, add unit tests for your change and run the code tests before pushing.

---

File created: `docs/EN_MANUAL.md` — edit this file as needed to expand examples, add screen captures, or map frontend endpoints to contract addresses in your deployment.
