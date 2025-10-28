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
const MINIMUM_LIQUIDITY: u64 = 10;

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

// Safe multiplication with overflow check using u128
fun safe_mul(a: u64, b: u64): u64 {
    if (a == 0 || b == 0) {
        0
    } else {
        // Use u128 to prevent overflow during multiplication
        let a_128 = (a as u128);
        let b_128 = (b as u128);
        let result_128 = a_128 * b_128;
        
        // Check if result fits in u64
        let max_u64 = 18446744073709551615u128;
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
        let max_u64 = 18446744073709551615u128;
        assert!(initial_lp_128 <= max_u64, E_OVERFLOW);
        
        let initial_lp = (initial_lp_128 as u64);
        assert!(initial_lp > MINIMUM_LIQUIDITY, E_MIN_LIQUIDITY);

        // Update total supply to include minimum liquidity
        pool.lp_supply = initial_lp;

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
        let max_u64 = 18446744073709551615u128;
        assert!(lp_from_x_128 <= max_u64 && lp_from_y_128 <= max_u64, E_OVERFLOW);

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
    let max_u64 = 18446744073709551615u128;
    assert!(amount_x_128 <= max_u64 && amount_y_128 <= max_u64, E_OVERFLOW);
    
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
fun calculate_swap_output(amount_in: u64, balance_in: u64, balance_out: u64, fee_bps: u64): u64 {
    // Apply fee to input amount
    let amount_in_with_fee = (amount_in as u128) * ((BASIS_POINTS - fee_bps) as u128);
    
    // Use u128 to prevent overflow
    let balance_out_128 = (balance_out as u128);
    let numerator = amount_in_with_fee * balance_out_128;
    
    // Denominator: (balance_in * BASIS_POINTS) + amount_in_with_fee
    let balance_in_128 = (balance_in as u128);
    let basis_points_128 = (BASIS_POINTS as u128);
    let denominator = balance_in_128 * basis_points_128 + amount_in_with_fee;
    
    // Ensure result fits in u64
    let result_128 = numerator / denominator;
    let max_u64 = 18446744073709551615u128;
    assert!(result_128 <= max_u64, E_OVERFLOW);
    
    (result_128 as u64)
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

/// Get LP token amount from LP token object
public fun get_lp_token_amount<X, Y>(lp_token: &LPToken<X, Y>): u64 {
    lp_token.amount
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
