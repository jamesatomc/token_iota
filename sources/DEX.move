module kanari_network::DEX;

use iota::balance::{Self, Balance};
use iota::coin::{Self, Coin};
use iota::event;


// Error codes
const E_INSUFFICIENT_LIQUIDITY: u64 = 1;
const E_INVALID_FEE: u64 = 2;
const E_ZERO_AMOUNT: u64 = 3;
const E_INSUFFICIENT_LP_TOKENS: u64 = 4;
const E_SLIPPAGE_EXCEEDED: u64 = 5;
const E_INVALID_POOL_STATE: u64 = 6;
const E_MIN_LIQUIDITY: u64 = 7;
const E_OVERFLOW: u64 = 8;

// Fee constants (basis points)
const FEE_LOW: u64 = 10; // 0.1%
const FEE_MED: u64 = 50; // 0.5%
const FEE_HIGH: u64 = 100; // 1.0%
const BASIS_POINTS: u64 = 10000;

// Minimum liquidity locked forever (prevent division by zero attacks)
const MINIMUM_LIQUIDITY: u64 = 1000;

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
}

/// Pool registry
public struct PoolRegistry<phantom X, phantom Y> has key {
    id: UID,
}

// Events
public struct PoolCreated has copy, drop {
    pool_id: address,
    fee_bps: u64,
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

// Create a new liquidity pool
public fun create_pool<X, Y>(fee_bps: u64, ctx: &mut TxContext) {
    assert!(fee_bps == FEE_LOW || fee_bps == FEE_MED || fee_bps == FEE_HIGH, E_INVALID_FEE);

    let pool = LiquidityPool<X, Y> {
        id: object::new(ctx),
        balance_x: balance::zero(),
        balance_y: balance::zero(),
        fee_bps,
        lp_supply: 0,
    };

    let pool_id = object::uid_to_address(&pool.id);

    // Create registry (simplified, no treasury cap)
    let registry = PoolRegistry<X, Y> {
        id: object::new(ctx),
    };

    event::emit(PoolCreated {
        pool_id,
        fee_bps,
    });

    transfer::share_object(pool);
    transfer::share_object(registry);
}

// Safe multiplication with overflow check
fun safe_mul(a: u64, b: u64): u64 {
    if (a == 0 || b == 0) {
        0
    } else {
        assert!(a <= (18446744073709551615 / b), E_OVERFLOW); // u64::MAX
        a * b
    }
}

// Helper function to calculate square root (for initial liquidity)
fun sqrt(y: u64): u64 {
    if (y < 4) {
        if (y == 0) {
            0
        } else {
            1
        }
    } else {
        let mut z = y;
        let mut x = y / 2 + 1;
        while (x < z) {
            z = x;
            x = (y / x + x) / 2;
        };
        z
    }
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
        // Use safe_mul to prevent overflow
        let product = safe_mul(amount_x, amount_y);
        let initial_lp = sqrt(product);
        assert!(initial_lp > MINIMUM_LIQUIDITY, E_MIN_LIQUIDITY);

        // Update total supply to include minimum liquidity
        pool.lp_supply = initial_lp;

        // Return only the user's share (excluding burned portion)
        initial_lp - MINIMUM_LIQUIDITY
    } else {
        // Subsequent liquidity: proportional to existing reserves
        assert!(old_x > 0 && old_y > 0, E_INSUFFICIENT_LIQUIDITY);

        // Calculate LP based on both tokens — with overflow protection
        let lp_from_x = safe_mul(amount_x, pool.lp_supply) / old_x;
        let lp_from_y = safe_mul(amount_y, pool.lp_supply) / old_y;

        // Take minimum to prevent over-minting (user gets less LP if ratio is off)
        let lp = if (lp_from_x < lp_from_y) {
            lp_from_x
        } else {
            lp_from_y
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

    // Calculate token amounts based on LP share
    let total_x = balance::value(&pool.balance_x);
    let total_y = balance::value(&pool.balance_y);

    let amount_x = (total_x * lp_amount) / pool.lp_supply;
    let amount_y = (total_y * lp_amount) / pool.lp_supply;

    assert!(amount_x > 0 && amount_y > 0, E_INSUFFICIENT_LP_TOKENS);

    // Check slippage protection
    assert!(amount_x >= min_amount_x, E_SLIPPAGE_EXCEEDED);
    assert!(amount_y >= min_amount_y, E_SLIPPAGE_EXCEEDED);

    // Update pool state
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

// Helper function for swap calculations with overflow protection
fun calculate_swap_output(amount_in: u64, balance_in: u64, balance_out: u64, fee_bps: u64): u64 {
    // Apply fee to input amount
    let amount_in_with_fee = amount_in * (BASIS_POINTS - fee_bps);
    
    // Use safe_mul to prevent overflow in numerator calculation
    // This protects against extreme swap amounts in large pools
    let numerator = safe_mul(amount_in_with_fee, balance_out);
    
    // Denominator: (balance_in * BASIS_POINTS) + amount_in_with_fee
    // Protect the first multiplication as well
    let denominator = safe_mul(balance_in, BASIS_POINTS) + amount_in_with_fee;
    
    numerator / denominator
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

// ========== View Functions ==========

/// Get pool reserves
public fun get_reserves<X, Y>(pool: &LiquidityPool<X, Y>): (u64, u64) {
    (balance::value(&pool.balance_x), balance::value(&pool.balance_y))
}

/// Get LP supply
public fun get_lp_supply<X, Y>(pool: &LiquidityPool<X, Y>): u64 {
    pool.lp_supply
}

/// Get pool fee
public fun get_fee<X, Y>(pool: &LiquidityPool<X, Y>): u64 {
    pool.fee_bps
}

/// Calculate swap output (view function)
public fun get_amount_out<X, Y>(
    pool: &LiquidityPool<X, Y>,
    amount_in: u64,
    is_x_to_y: bool,
): u64 {
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
