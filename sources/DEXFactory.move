/// DEX Factory for creating and managing liquidity pools
module kanari_network::DEXFactory;

use iota::coin;
use kanari_network::DEX::{Self, LiquidityPool, LPToken, GlobalPoolRegistry};

/// Create global pool registry (must be called once before creating any pools)
public entry fun create_registry(ctx: &mut TxContext) {
    DEX::create_global_registry(ctx);
}

/// Create a new liquidity pool with specified fee
/// This is the main entry point from UI
public entry fun create_pool<X, Y>(
    registry: &mut GlobalPoolRegistry,
    fee_bps: u64,
    ctx: &mut TxContext
) {
    DEX::create_pool<X, Y>(registry, fee_bps, ctx);
}

/// Add liquidity to an existing pool
public entry fun add_liquidity<X, Y>(
    pool: &mut LiquidityPool<X, Y>,
    coin_x: coin::Coin<X>,
    coin_y: coin::Coin<Y>,
    min_lp_out: u64,
    ctx: &mut TxContext,
) {
    let lp_token = DEX::add_liquidity(
        pool,
        coin_x,
        coin_y,
        min_lp_out,
        ctx,
    );
    transfer::public_transfer(lp_token, ctx.sender());
}

/// Remove liquidity from pool
public entry fun remove_liquidity<X, Y>(
    pool: &mut LiquidityPool<X, Y>,
    lp_token: LPToken<X, Y>,
    min_x_out: u64,
    min_y_out: u64,
    ctx: &mut TxContext,
) {
    let (coin_x, coin_y) = DEX::remove_liquidity(
        pool,
        lp_token,
        min_x_out,
        min_y_out,
        ctx,
    );
    transfer::public_transfer(coin_x, ctx.sender());
    transfer::public_transfer(coin_y, ctx.sender());
}

/// Swap token X for token Y
public entry fun swap_x_to_y<X, Y>(
    pool: &mut LiquidityPool<X, Y>,
    coin_x: coin::Coin<X>,
    min_y_out: u64,
    ctx: &mut TxContext,
) {
    let coin_y = DEX::swap_x_to_y(pool, coin_x, min_y_out, ctx);
    transfer::public_transfer(coin_y, ctx.sender());
}

/// Swap token Y for token X
public entry fun swap_y_to_x<X, Y>(
    pool: &mut LiquidityPool<X, Y>,
    coin_y: coin::Coin<Y>,
    min_x_out: u64,
    ctx: &mut TxContext,
) {
    let coin_x = DEX::swap_y_to_x(pool, coin_y, min_x_out, ctx);
    transfer::public_transfer(coin_x, ctx.sender());
}
