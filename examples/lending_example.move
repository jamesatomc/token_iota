/// Example: Using TWAP Oracle in a Lending Protocol
/// This demonstrates how to use price oracle for safe collateral valuation
module kanari_network::LendingExample;

use iota::coin::{Self, Coin};
use iota::clock::Clock;
use kanari_network::PriceOracle;
use kanari_network::DEX::LiquidityPool;

// Error codes
const E_INSUFFICIENT_COLLATERAL: u64 = 1;
const E_PRICE_DEVIATION_TOO_HIGH: u64 = 2;

// Constants
const PRICE_PRECISION: u128 = 1_000_000_000; // 10^9
const COLLATERAL_RATIO: u64 = 150; // 150% collateralization required
const MAX_PRICE_DEVIATION: u64 = 10; // Max 10% deviation between time windows

/// Simple lending position
public struct LendingPosition<phantom Collateral, phantom Debt> has key {
    id: UID,
    collateral_amount: u64,
    debt_amount: u64,
    owner: address,
}

/// Deposit collateral and borrow against it using TWAP oracle
public fun borrow_with_collateral<Collateral, Debt>(
    oracle: &PriceOracle::PriceOracle<Collateral, Debt>,
    pool: &LiquidityPool<Collateral, Debt>,
    collateral: Coin<Collateral>,
    borrow_amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (LendingPosition<Collateral, Debt>, Coin<Debt>) {
    let collateral_amount = coin::value(&collateral);
    
    // Get TWAP prices with multiple time windows for safety
    let twap_5m = PriceOracle::get_twap_price(oracle, 300, clock);   // 5 minutes
    let twap_15m = PriceOracle::get_twap_price(oracle, 900, clock);  // 15 minutes
    
    // Validate price consistency (prevent manipulation)
    validate_price_deviation(twap_5m, twap_15m);
    
    // Use the more conservative (lower) price for collateral valuation
    let conservative_price = if (twap_5m < twap_15m) { twap_5m } else { twap_15m };
    
    // Calculate collateral value in Debt token terms
    let collateral_value = calculate_value(collateral_amount, conservative_price);
    
    // Check collateralization ratio (must be > 150%)
    let max_borrow = collateral_value * 100 / (COLLATERAL_RATIO as u128);
    assert!((borrow_amount as u128) <= max_borrow, E_INSUFFICIENT_COLLATERAL);
    
    // Create position (in real protocol, you'd mint debt tokens from treasury)
    let position = LendingPosition<Collateral, Debt> {
        id: object::new(ctx),
        collateral_amount,
        debt_amount: borrow_amount,
        owner: ctx.sender(),
    };
    
    // Destroy collateral coin (in real protocol, store in vault)
    transfer::public_transfer(collateral, @0x0); // Simplified - don't do this in production!
    
    // Return borrowed tokens (in real protocol, mint from treasury)
    let borrowed = coin::zero<Debt>(ctx); // Simplified placeholder
    
    (position, borrowed)
}

/// Check if position is healthy using TWAP oracle
public fun is_position_healthy<Collateral, Debt>(
    position: &LendingPosition<Collateral, Debt>,
    oracle: &PriceOracle::PriceOracle<Collateral, Debt>,
    clock: &Clock,
): bool {
    // Use 15-minute TWAP for liquidation checks
    let twap = PriceOracle::get_twap_price(oracle, 900, clock);
    
    let collateral_value = calculate_value(position.collateral_amount, twap);
    let required_collateral = (position.debt_amount as u128) * (COLLATERAL_RATIO as u128) / 100;
    
    collateral_value >= required_collateral
}

/// Calculate token value using price
fun calculate_value(amount: u64, price: u128): u128 {
    (amount as u128) * price / PRICE_PRECISION
}

/// Validate that prices from different time windows are consistent
fun validate_price_deviation(price1: u128, price2: u128) {
    let (higher, lower) = if (price1 > price2) {
        (price1, price2)
    } else {
        (price2, price1)
    };
    
    // Calculate percentage deviation
    let deviation = ((higher - lower) * 100) / lower;
    
    // Ensure deviation is within acceptable range
    assert!(deviation <= (MAX_PRICE_DEVIATION as u128), E_PRICE_DEVIATION_TOO_HIGH);
}

/// Get position collateral ratio (returns percentage, e.g., 150 = 150%)
public fun get_collateral_ratio<Collateral, Debt>(
    position: &LendingPosition<Collateral, Debt>,
    oracle: &PriceOracle::PriceOracle<Collateral, Debt>,
    clock: &Clock,
): u64 {
    let twap = PriceOracle::get_twap_price(oracle, 900, clock);
    let collateral_value = calculate_value(position.collateral_amount, twap);
    
    if (position.debt_amount == 0) {
        return 0
    };
    
    let ratio = collateral_value * 100 / (position.debt_amount as u128);
    (ratio as u64)
}
