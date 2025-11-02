module kanari_network::DEX;

use iota::balance::{Self, Balance};
use iota::coin::{Self, Coin};
use iota::event;
use iota::table::{Self, Table};
use std::type_name;
use iota::hash;

// Error codes
// These error codes are used throughout the module. See usages below for context:
// 1 (E_INSUFFICIENT_LIQUIDITY): returned when a swap or withdrawal would result in zero/insufficient output
//    - Used in: `calculate_swap_output`, `swap_x_to_y`, `swap_y_to_x`, `remove_liquidity` checks
// 2 (E_INVALID_FEE): returned when create_pool receives an unsupported fee value
//    - Used in: `create_pool` (fee validation)
// 3 (E_ZERO_AMOUNT): returned when an input coin/amount is zero
//    - Used in: `add_liquidity`, `swap_x_to_y`, `swap_y_to_x`
// 4 (E_INSUFFICIENT_LP_TOKENS): returned when attempting to burn more LP than owned
//    - Used in: `remove_liquidity` (LP amount validations)
// 5 (E_SLIPPAGE_EXCEEDED): returned when required output or LP minting falls below user-specified minimums
//    - Used in: `add_liquidity`, `remove_liquidity`, swap functions (min amount out checks)
// 6 (E_INVALID_POOL_STATE): defensive check for unexpected pool state (e.g., non-zero reserves on initial mint)
//    - Used in: `add_liquidity` initial liquidity path
// 7 (E_MIN_LIQUIDITY): returned when initial liquidity does not exceed `MINIMUM_LIQUIDITY`
//    - Used in: `add_liquidity` initial LP calculation
// 8 (E_OVERFLOW): returned when intermediate u128 calculations exceed allowed u64 limits
//    - Used in: safe math helpers (`safe_mul`, `sqrt_u128`) and other arithmetic checks
// 9 (E_POOL_ALREADY_EXISTS): returned when trying to create a pool for a token pair that already exists
//    - Used in: `create_pool` registry check
const E_INSUFFICIENT_LIQUIDITY: u64 = 1;
const E_INVALID_FEE: u64 = 2;
const E_ZERO_AMOUNT: u64 = 3;
const E_INSUFFICIENT_LP_TOKENS: u64 = 4;
const E_SLIPPAGE_EXCEEDED: u64 = 5;
const E_INVALID_POOL_STATE: u64 = 6;
const E_MIN_LIQUIDITY: u64 = 7;
const E_OVERFLOW: u64 = 8;
const E_POOL_ALREADY_EXISTS: u64 = 9;
const E_SAME_TOKEN_PAIR: u64 = 10;

// Fee constants (basis points). We use BPS_DENOMINATOR to make the denominator explicit.
const FEE_LOW: u64 = 10; // 0.1%
const FEE_MED: u64 = 50; // 0.5%
const FEE_HIGH: u64 = 100; // 1.0%
// BPS_DENOMINATOR defines the basis points denominator (10000 == 100.00%)
const BPS_DENOMINATOR: u64 = 10000;

// Minimum liquidity locked forever (prevent division by zero attacks)
const MINIMUM_LIQUIDITY: u64 = 10;

// Maximum value for u64 (used in overflow checks)
const U64_MAX: u128 = 18446744073709551615u128;
// Maximum value for u128 (used to pre-check multiplications that would overflow u128)
const U128_MAX: u128 = 340282366920938463463374607431768211455u128;

/// LP Token receipt - proves liquidity ownership
public struct LPToken<phantom X, phantom Y> has key, store {
    id: UID,
    amount: u64,
}

/// Liquidity pool holding two tokens
public struct LiquidityPool<phantom X, phantom Y> has key {
    id: UID,
    balance_x: Balance<X>,
    balance_y: Balance<Y>,
    fee_bps: u64,
    lp_supply: u64,
    /// Address of the burn reserve object that holds the reserved LP amount.
    /// This is `option::none()` for uninitialized pools and `option::some(addr)`
    /// after initial liquidity is added. The burn object is a shared object so
    /// it can be inspected by frontends and auditors.
    burn_reserve: option::Option<address>,
}

/// Global pool registry to prevent duplicate pools
public struct GlobalPoolRegistry has key {
    id: UID,
    // Maps type-pair hash (blake2b256 of concatenated type names) to pool address
    pools: Table<vector<u8>, address>,
}

// Events
public struct PoolCreated has copy, drop {
    pool_id: address,
    fee_bps: u64,
    type_x: vector<u8>,
    type_y: vector<u8>,
}

/// Burn reserve object created on initial liquidity to hold MINIMUM_LIQUIDITY.
/// This object is created during the initial liquidity mint and stores the
/// reserved amount of LP tokens (MINIMUM_LIQUIDITY) that are intentionally
/// excluded from user LP receipts. The burn reserve is a shared object:
/// it is transferred with `transfer::share_object` so frontends, auditors,
/// and anyone can query it on-chain to verify the locked/burned minimum LP.
public struct BurnReserve has key, store {
    id: UID,
    // Amount of LP tokens reserved (should equal MINIMUM_LIQUIDITY for initialized pools)
    amount: u64,
}

public struct RegistryCreated has copy, drop {
    registry_id: address,
}

public struct LiquidityAdded has copy, drop {
    pool_id: address,
    amount_x: u64,
    amount_y: u64,
    lp_minted: u64,
}

public struct LiquidityRemoved has copy, drop {
    pool_id: address,
    amount_x: u64,
    amount_y: u64,
    lp_burned: u64,
}

public struct Swap has copy, drop {
    pool_id: address,
    amount_in: u64,
    amount_out: u64,
    is_x_to_y: bool,
}

// Create global pool registry (call once during deployment)
public fun create_global_registry(ctx: &mut TxContext) {
    let registry = GlobalPoolRegistry {
        id: object::new(ctx),
        pools: table::new(ctx),
    };
    
    let registry_id = object::uid_to_address(&registry.id);
    
    event::emit(RegistryCreated {
        registry_id,
    });
    
    transfer::share_object(registry);
}

// Create a new liquidity pool
public fun create_pool<X, Y>(
    registry: &mut GlobalPoolRegistry,
    fee_bps: u64,
    ctx: &mut TxContext
) {
    assert!(fee_bps == FEE_LOW || fee_bps == FEE_MED || fee_bps == FEE_HIGH, E_INVALID_FEE);

    // Compute deterministic hash for this type pair (sorted to prevent duplicates)
    let ty_x = type_name::get_with_original_ids<X>().into_string().into_bytes();
    let ty_y = type_name::get_with_original_ids<Y>().into_string().into_bytes();

    // Prevent creating pool with same token types
    assert!(ty_x != ty_y, E_SAME_TOKEN_PAIR);
    
    // Sort type names to ensure IOTA/KANARI and KANARI/IOTA get same hash
    let (first, second) = if (compare_vectors(&ty_x, &ty_y)) {
        (ty_x, ty_y)
    } else {
        (ty_y, ty_x)
    };
    
    let mut concat = first;
    std::vector::append(&mut concat, second);
    let pair_hash = hash::blake2b256(&concat);

    // Check if pool already exists for this pair (in any order)
    assert!(!table::contains(&registry.pools, pair_hash), E_POOL_ALREADY_EXISTS);

    let pool = LiquidityPool<X, Y> {
        id: object::new(ctx),
        balance_x: balance::zero(),
        balance_y: balance::zero(),
        fee_bps,
        lp_supply: 0,
        burn_reserve: option::none(),
    };

    let pool_id = object::uid_to_address(&pool.id);

    // Register this pool in the global registry
    table::add(&mut registry.pools, pair_hash, pool_id);

    event::emit(PoolCreated {
        pool_id,
        fee_bps,
        type_x: type_name::get_with_original_ids<X>().into_string().into_bytes(),
        type_y: type_name::get_with_original_ids<Y>().into_string().into_bytes(),
    });

    transfer::share_object(pool);
}

// Safe multiplication with overflow check using u128
#[allow(unused_function)]
fun safe_mul(a: u64, b: u64): u64 {
    if (a == 0 || b == 0) {
        0
    } else {
        // Use u128 to prevent overflow during multiplication
        let a_128 = (a as u128);
        let b_128 = (b as u128);
        let result_128 = a_128 * b_128;

        // Check if result fits in u64
        let max_u64 = U64_MAX;
        assert!(result_128 <= max_u64, E_OVERFLOW);

        (result_128 as u64)
    }
}

// Helper function to calculate square root using u128 (for large products)
fun sqrt_u128(y: u128): u128 {
    if (y < 4) {
        if (y == 0) {
            0
        } else {
            1
        }
    } else {
        // Newton's method with u128
        let mut z = y;
        let mut x = y / 2 + 1;

        // Iterate until convergence (max 50 iterations for safety with u128)
        let mut iterations = 0;
        while (x < z && iterations < 50) {
            z = x;
            x = (y / x + x) / 2;
            iterations = iterations + 1;
        };

        z
    }
}

// Helper function to calculate square root (for u64 values)
#[allow(unused_function)]
fun sqrt(y: u64): u64 {
    (sqrt_u128((y as u128)) as u64)
}

// Add liquidity to pool with slippage protection
public fun add_liquidity<X, Y>(
    pool: &mut LiquidityPool<X, Y>,
    coin_x: Coin<X>,
    coin_y: Coin<Y>,
    min_lp_amount: u64, // Slippage protection
    ctx: &mut TxContext,
): LPToken<X, Y> {
    let amount_x = coin::value(&coin_x);
    let amount_y = coin::value(&coin_y);

    assert!(amount_x > 0 && amount_y > 0, E_ZERO_AMOUNT);

    // Get current reserves BEFORE adding new liquidity
    let old_x = balance::value(&pool.balance_x);
    let old_y = balance::value(&pool.balance_y);

    // Calculate LP tokens to mint
    let lp_amount = if (pool.lp_supply == 0) {
        // Initial liquidity: use geometric mean
        assert!(old_x == 0 && old_y == 0, E_INVALID_POOL_STATE);

        // LP = sqrt(x * y) - MINIMUM_LIQUIDITY
        // Use u128 for the entire calculation to prevent overflow
        let amount_x_128 = (amount_x as u128);
        let amount_y_128 = (amount_y as u128);
        let product = amount_x_128 * amount_y_128;

        // Calculate sqrt using u128
        let initial_lp_128 = sqrt_u128(product);

        // Ensure result fits in u64
        assert!(initial_lp_128 <= U64_MAX, E_OVERFLOW);

        let initial_lp = (initial_lp_128 as u64);
        assert!(initial_lp > MINIMUM_LIQUIDITY, E_MIN_LIQUIDITY);

        // Update total supply to include minimum liquidity
        pool.lp_supply = initial_lp;
        // Mint a BurnReserve object to hold the reserved MINIMUM_LIQUIDITY.
        // This creates an on-chain shared object that serves as an auditable
        // record of the burned LP.
        let burn = BurnReserve {
            id: object::new(ctx),
            amount: MINIMUM_LIQUIDITY,
        };
        let burn_addr = object::uid_to_address(&burn.id);
        // Share the burn object so it is queryable on-chain
        transfer::share_object(burn);
        pool.burn_reserve = option::some(burn_addr);

        // Return only the user's share (excluding burned portion)
        initial_lp - MINIMUM_LIQUIDITY
    } else {
        // Subsequent liquidity: proportional to existing reserves
        assert!(old_x > 0 && old_y > 0, E_INSUFFICIENT_LIQUIDITY);

        // Calculate LP based on both tokens — with u128 for overflow protection
        let amount_x_128 = (amount_x as u128);
        let amount_y_128 = (amount_y as u128);
        let lp_supply_128 = (pool.lp_supply as u128);
        let old_x_128 = (old_x as u128);
        let old_y_128 = (old_y as u128);

        let lp_from_x_128 = (amount_x_128 * lp_supply_128) / old_x_128;
        let lp_from_y_128 = (amount_y_128 * lp_supply_128) / old_y_128;

        // Ensure results fit in u64
        assert!(lp_from_x_128 <= U64_MAX && lp_from_y_128 <= U64_MAX, E_OVERFLOW);

        // Take minimum to prevent over-minting (user gets less LP if ratio is off)
        let lp = if (lp_from_x_128 < lp_from_y_128) {
            (lp_from_x_128 as u64)
        } else {
            (lp_from_y_128 as u64)
        };

        // Update LP supply here (more explicit and robust)
        pool.lp_supply = pool.lp_supply + lp;

        lp
    };

    // Check slippage protection
    assert!(lp_amount >= min_lp_amount, E_SLIPPAGE_EXCEEDED);

    // NOW add tokens to pool (after LP calculation)
    balance::join(&mut pool.balance_x, coin::into_balance(coin_x));
    balance::join(&mut pool.balance_y, coin::into_balance(coin_y));

    // Emit event
    event::emit(LiquidityAdded {
        pool_id: object::uid_to_address(&pool.id),
        amount_x,
        amount_y,
        lp_minted: lp_amount,
    });

    // Return LP token receipt
    LPToken<X, Y> {
        id: object::new(ctx),
        amount: lp_amount,
    }
}

// Remove liquidity from pool with slippage protection
public fun remove_liquidity<X, Y>(
    pool: &mut LiquidityPool<X, Y>,
    lp_token: LPToken<X, Y>,
    min_amount_x: u64, // Slippage protection
    min_amount_y: u64, // Slippage protection
    ctx: &mut TxContext,
): (Coin<X>, Coin<Y>) {
    let LPToken { id, amount: lp_amount } = lp_token;
    object::delete(id);

    assert!(lp_amount > 0, E_ZERO_AMOUNT);

    // Defensive: ensure pool has LP supply (prevents division by zero)
    assert!(pool.lp_supply > 0, E_INVALID_POOL_STATE);

    // Ensure LP amount doesn't exceed total supply
    assert!(lp_amount <= pool.lp_supply, E_INSUFFICIENT_LP_TOKENS);

    // Calculate token amounts based on LP share
    let total_x = balance::value(&pool.balance_x);
    let total_y = balance::value(&pool.balance_y);

    // Ensure pool has liquidity
    assert!(total_x > 0 && total_y > 0, E_INSUFFICIENT_LIQUIDITY);

    // Use u128 for safe calculations
    let total_x_128 = (total_x as u128);
    let total_y_128 = (total_y as u128);
    let lp_amount_128 = (lp_amount as u128);
    let lp_supply_128 = (pool.lp_supply as u128);

    let amount_x_128 = (total_x_128 * lp_amount_128) / lp_supply_128;
    let amount_y_128 = (total_y_128 * lp_amount_128) / lp_supply_128;

    // Ensure results fit in u64
    assert!(amount_x_128 <= U64_MAX && amount_y_128 <= U64_MAX, E_OVERFLOW);

    let amount_x = (amount_x_128 as u64);
    let amount_y = (amount_y_128 as u64);

    assert!(amount_x > 0 && amount_y > 0, E_INSUFFICIENT_LP_TOKENS);

    // Ensure we don't try to withdraw more than available
    assert!(amount_x <= total_x, E_INSUFFICIENT_LIQUIDITY);
    assert!(amount_y <= total_y, E_INSUFFICIENT_LIQUIDITY);

    // Check slippage protection
    assert!(amount_x >= min_amount_x, E_SLIPPAGE_EXCEEDED);
    assert!(amount_y >= min_amount_y, E_SLIPPAGE_EXCEEDED);

    // Update pool state BEFORE withdrawing
    pool.lp_supply = pool.lp_supply - lp_amount;

    // Withdraw tokens
    let coin_x = coin::from_balance(
        balance::split(&mut pool.balance_x, amount_x),
        ctx,
    );
    let coin_y = coin::from_balance(
        balance::split(&mut pool.balance_y, amount_y),
        ctx,
    );

    // Emit event
    event::emit(LiquidityRemoved {
        pool_id: object::uid_to_address(&pool.id),
        amount_x,
        amount_y,
        lp_burned: lp_amount,
    });

    (coin_x, coin_y)
}

// Helper function for swap calculations with u128 to prevent overflow
public fun calculate_swap_output(amount_in: u64, balance_in: u64, balance_out: u64, fee_bps: u64): u64 {
    // Quick return for zero input
    if (amount_in == 0) {
        0
    } else {
        // Apply fee to input amount (as u128)
        let amount_in_with_fee = (amount_in as u128) * ((BPS_DENOMINATOR - fee_bps) as u128);

        // Prepare operands in u128
        let balance_out_128 = (balance_out as u128);
        let balance_in_128 = (balance_in as u128);
        let bps_denominator_128 = (BPS_DENOMINATOR as u128);

        // Pre-checks to avoid u128 overflow on multiplies/adds
        // Check numerator multiplication: amount_in_with_fee * balance_out_128 <= U128_MAX
        if (amount_in_with_fee != 0 && balance_out_128 > (U128_MAX / amount_in_with_fee)) {
            // Overflow would occur computing numerator
            assert!(false, E_OVERFLOW);
        };

        let numerator = amount_in_with_fee * balance_out_128;

        // Check denominator multiplication: balance_in_128 * bps_denominator_128 <= U128_MAX
        if (balance_in_128 != 0 && bps_denominator_128 > (U128_MAX / balance_in_128)) {
            assert!(false, E_OVERFLOW);
        };

        let denom_prod = balance_in_128 * bps_denominator_128;
        // Check addition won't overflow u128
        if (denom_prod > (U128_MAX - amount_in_with_fee)) {
            assert!(false, E_OVERFLOW);
        };

        let denominator = denom_prod + amount_in_with_fee;

        // Perform division and ensure result fits into u64
        let result_128 = numerator / denominator;
        assert!(result_128 <= U64_MAX, E_OVERFLOW);

        (result_128 as u64)
    }
}

// Swap X for Y with slippage protection
public fun swap_x_to_y<X, Y>(
    pool: &mut LiquidityPool<X, Y>,
    coin_in: Coin<X>,
    min_amount_out: u64, // Slippage protection
    ctx: &mut TxContext,
): Coin<Y> {
    let amount_in = coin::value(&coin_in);
    assert!(amount_in > 0, E_ZERO_AMOUNT);

    let amount_out = calculate_swap_output(
        amount_in,
        balance::value(&pool.balance_x),
        balance::value(&pool.balance_y),
        pool.fee_bps,
    );

    assert!(amount_out > 0, E_INSUFFICIENT_LIQUIDITY);
    assert!(amount_out >= min_amount_out, E_SLIPPAGE_EXCEEDED);

    balance::join(&mut pool.balance_x, coin::into_balance(coin_in));

    let coin_out = coin::from_balance(balance::split(&mut pool.balance_y, amount_out), ctx);

    // Emit event
    event::emit(Swap {
        pool_id: object::uid_to_address(&pool.id),
        amount_in,
        amount_out,
        is_x_to_y: true,
    });

    coin_out
}

// Swap Y for X with slippage protection
public fun swap_y_to_x<X, Y>(
    pool: &mut LiquidityPool<X, Y>,
    coin_in: Coin<Y>,
    min_amount_out: u64, // Slippage protection
    ctx: &mut TxContext,
): Coin<X> {
    let amount_in = coin::value(&coin_in);
    assert!(amount_in > 0, E_ZERO_AMOUNT);

    let amount_out = calculate_swap_output(
        amount_in,
        balance::value(&pool.balance_y),
        balance::value(&pool.balance_x),
        pool.fee_bps,
    );

    assert!(amount_out > 0, E_INSUFFICIENT_LIQUIDITY);
    assert!(amount_out >= min_amount_out, E_SLIPPAGE_EXCEEDED);

    balance::join(&mut pool.balance_y, coin::into_balance(coin_in));

    let coin_out = coin::from_balance(balance::split(&mut pool.balance_x, amount_out), ctx);

    // Emit event
    event::emit(Swap {
        pool_id: object::uid_to_address(&pool.id),
        amount_in,
        amount_out,
        is_x_to_y: false,
    });

    coin_out
}

// ========== Helper Functions ==========

// Helper function to compare two vectors lexicographically
// Returns true if v1 <= v2
public fun compare_vectors(v1: &vector<u8>, v2: &vector<u8>): bool {
    let len1 = std::vector::length(v1);
    let len2 = std::vector::length(v2);
    let min_len = if (len1 < len2) { len1 } else { len2 };
    
    let mut i = 0;
    while (i < min_len) {
        let b1 = *std::vector::borrow(v1, i);
        let b2 = *std::vector::borrow(v2, i);
        if (b1 < b2) {
            return true
        } else if (b1 > b2) {
            return false
        };
        i = i + 1;
    };
    
    // If all bytes equal up to min_len, shorter vector is "less"
    len1 <= len2
}

// ========== View Functions ==========

/// Check if a pool exists for the given type pair (in any order)
public fun pool_exists<X, Y>(registry: &GlobalPoolRegistry): bool {
    let ty_x = type_name::get_with_original_ids<X>().into_string().into_bytes();
    let ty_y = type_name::get_with_original_ids<Y>().into_string().into_bytes();
    
    // Sort type names to match create_pool logic
    let (first, second) = if (compare_vectors(&ty_x, &ty_y)) {
        (ty_x, ty_y)
    } else {
        (ty_y, ty_x)
    };
    
    let mut concat = first;
    std::vector::append(&mut concat, second);
    let pair_hash = hash::blake2b256(&concat);
    
    table::contains(&registry.pools, pair_hash)
}

/// Get pool address for a given type pair (returns None if not exists, works with any order)
public fun get_pool_address<X, Y>(registry: &GlobalPoolRegistry): Option<address> {
    let ty_x = type_name::get_with_original_ids<X>().into_string().into_bytes();
    let ty_y = type_name::get_with_original_ids<Y>().into_string().into_bytes();
    
    // Sort type names to match create_pool logic
    let (first, second) = if (compare_vectors(&ty_x, &ty_y)) {
        (ty_x, ty_y)
    } else {
        (ty_y, ty_x)
    };
    
    let mut concat = first;
    std::vector::append(&mut concat, second);
    let pair_hash = hash::blake2b256(&concat);
    
    if (table::contains(&registry.pools, pair_hash)) {
        option::some(*table::borrow(&registry.pools, pair_hash))
    } else {
        option::none()
    }
}

/// Get pool reserves
public fun get_reserves<X, Y>(pool: &LiquidityPool<X, Y>): (u64, u64) {
    (balance::value(&pool.balance_x), balance::value(&pool.balance_y))
}

/// Get pool reserves as u128 for oracle calculations (avoids casting in oracle module)
/// Returns (reserve_x_u128, reserve_y_u128)
public fun get_reserves_u128<X, Y>(pool: &LiquidityPool<X, Y>): (u128, u128) {
    ((balance::value(&pool.balance_x) as u128), (balance::value(&pool.balance_y) as u128))
}

/// Get LP supply
public fun get_lp_supply<X, Y>(pool: &LiquidityPool<X, Y>): u64 {
    pool.lp_supply
}

/// Get pool fee
public fun get_fee<X, Y>(pool: &LiquidityPool<X, Y>): u64 {
    pool.fee_bps
}

/// Returns the module-wide minimum liquidity constant that is reserved (burned)
/// during the initial LP mint. This helps frontends and users show the locked
/// amount that was intentionally excluded from initial LP receipts.
public fun get_minimum_liquidity(): u64 {
    MINIMUM_LIQUIDITY
}

/// Returns the effective amount of LP that was reserved/burned for the given
/// pool. For pools that have been initialized with liquidity, this will return
/// `MINIMUM_LIQUIDITY`. If the pool hasn't been initialized (lp_supply == 0),
/// it returns 0.
public fun get_burned_minimum_liquidity<X, Y>(pool: &LiquidityPool<X, Y>): u64 {
    // If we have a burn reserve object recorded, return MINIMUM_LIQUIDITY.
    // Otherwise return 0.
    if (option::is_some(&pool.burn_reserve)) {
        MINIMUM_LIQUIDITY
    } else {
        0
    }
}

/// Get LP token amount from LP token object
public fun get_lp_token_amount<X, Y>(lp_token: &LPToken<X, Y>): u64 {
    lp_token.amount
}

/// Get the address of the burn reserve object for the pool, if any.
/// This object holds the reserved MINIMUM_LIQUIDITY and is shareable for
/// frontends and auditors to inspect.
public fun get_burn_reserve_address<X, Y>(pool: &LiquidityPool<X, Y>): Option<address> {
    pool.burn_reserve
}

/// Get pool ID (address)
public fun get_pool_id<X, Y>(pool: &LiquidityPool<X, Y>): address {
    object::uid_to_address(&pool.id)
}

/// Calculate swap output (view function)
public fun get_amount_out<X, Y>(pool: &LiquidityPool<X, Y>, amount_in: u64, is_x_to_y: bool): u64 {
    if (is_x_to_y) {
        calculate_swap_output(
            amount_in,
            balance::value(&pool.balance_x),
            balance::value(&pool.balance_y),
            pool.fee_bps,
        )
    } else {
        calculate_swap_output(
            amount_in,
            balance::value(&pool.balance_y),
            balance::value(&pool.balance_x),
            pool.fee_bps,
        )
    }
}

/// Returns the BurnReserve object (read-only)
/// Required to inspect the contents of the minimum locked liquidity object.
public fun get_burn_reserve(burn_reserve: &BurnReserve): u64 {
    burn_reserve.amount
}
