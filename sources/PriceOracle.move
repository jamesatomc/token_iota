/// TWAP Price Oracle for DEX
/// Provides time-weighted average prices to prevent manipulation
module kanari_network::PriceOracle;

use iota::clock::Clock;
use iota::event;
use kanari_network::DEX::LiquidityPool;

// Error codes
const E_INVALID_OBSERVATION: u64 = 1;
const E_NO_OBSERVATIONS: u64 = 2;
const E_INSUFFICIENT_LIQUIDITY: u64 = 3;

// Price precision (9 decimals for accurate calculations)
const PRICE_PRECISION: u128 = 1_000_000_000;

// Max value for u128 (used to guard multiplications)
const U128_MAX: u128 = 340282366920938463463374607431768211455u128;

// Minimum time interval between observations (prevents spam)
const MIN_OBSERVATION_INTERVAL: u64 = 10; // 10 seconds

/// Single price observation at a specific time
public struct Observation has copy, drop, store {
    timestamp: u64,         // Unix timestamp in seconds
    price_cumulative: u128, // Cumulative price (price * time elapsed)
}

/// TWAP Price Oracle for a token pair
public struct PriceOracle<phantom X, phantom Y> has key {
    id: UID,
    pool_id: address,                   // Reference to liquidity pool
    observations: vector<Observation>,  // Sorted by timestamp
    max_observations: u64,              // Limit to save gas
    last_price_cumulative: u128,
}

// Events
public struct OracleCreated has copy, drop {
    oracle_id: address,
    pool_id: address,
    max_observations: u64,
}

public struct OracleUpdated has copy, drop {
    oracle_id: address,
    pool_id: address,
    timestamp: u64,
    price_cumulative: u128,
    current_price: u128,
}

public struct TWAPCalculated has copy, drop {
    oracle_id: address,
    twap_price: u128,
    time_window: u64,
    observations_used: u64,
}

/// Create a new Price Oracle for a pool
public fun create_oracle<X, Y>(
    pool: &LiquidityPool<X, Y>,
    max_observations: u64,
    clock: &Clock,
    ctx: &mut TxContext
): PriceOracle<X, Y> {
    assert!(max_observations > 0, E_INVALID_OBSERVATION);

    let pool_id = kanari_network::DEX::get_pool_id(pool);
    let current_time = iota::clock::timestamp_ms(clock) / 1000; // Convert to seconds

    // Create initial observation
    let mut observations = vector::empty<Observation>();
    vector::push_back(&mut observations, Observation {
        timestamp: current_time,
        price_cumulative: 0,
    });

    let oracle = PriceOracle<X, Y> {
        id: object::new(ctx),
        pool_id,
        observations,
        max_observations,
        last_price_cumulative: 0,
    };

    let oracle_id = object::uid_to_address(&oracle.id);

    event::emit(OracleCreated {
        oracle_id,
        pool_id,
        max_observations,
    });

    oracle
}

/// Create and share oracle (for entry function convenience)
public fun create_and_share_oracle<X, Y>(
    pool: &LiquidityPool<X, Y>,
    max_observations: u64,
    clock: &Clock,
    ctx: &mut TxContext
) {
    let oracle = create_oracle<X, Y>(pool, max_observations, clock, ctx);
    transfer::share_object(oracle);
}

/// Update oracle with current pool state
public fun update_oracle<X, Y>(
    oracle: &mut PriceOracle<X, Y>,
    pool: &LiquidityPool<X, Y>,
    clock: &Clock,
) {
    let current_time = iota::clock::timestamp_ms(clock) / 1000;
    let (reserve_x, reserve_y) = get_pool_reserves(pool);

    // Skip if no liquidity (reserves are u128)
    assert!(reserve_x > 0u128 && reserve_y > 0u128, E_INSUFFICIENT_LIQUIDITY);

    // Get last observation
    let last_obs = vector::borrow(&oracle.observations, vector::length(&oracle.observations) - 1);
    
    // Skip if no time has passed
    if (current_time <= last_obs.timestamp) {
        return
    };

    // Skip if minimum interval hasn't passed (prevents spam)
    if (current_time - last_obs.timestamp < MIN_OBSERVATION_INTERVAL) {
        return
    };

    // Calculate current price: price = reserve_y / reserve_x (Y per unit of X)
    // Multiply by PRICE_PRECISION for accuracy. Reserves are already u128.
    // Guard multiplication to prevent overflow: ensure reserve_y * PRICE_PRECISION
    // fits into u128 before performing the multiply.
    assert!(reserve_y <= U128_MAX / PRICE_PRECISION, E_INVALID_OBSERVATION);
    let current_price = reserve_y * PRICE_PRECISION / reserve_x;

    // Calculate time-weighted price accumulation
    let time_delta = current_time - last_obs.timestamp;
    // Guard multiplication current_price * time_delta to avoid u128 overflow
    let time_delta_128 = (time_delta as u128);
    assert!(current_price <= U128_MAX / time_delta_128, E_INVALID_OBSERVATION);
    let price_delta = current_price * time_delta_128;
    // Guard addition oracle.last_price_cumulative + price_delta
    assert!(oracle.last_price_cumulative <= U128_MAX - price_delta, E_INVALID_OBSERVATION);
    let new_cumulative = oracle.last_price_cumulative + price_delta;

    // Create new observation
    let new_obs = Observation {
        timestamp: current_time,
        price_cumulative: new_cumulative,
    };

    // Remove oldest observation if limit reached
    if (vector::length(&oracle.observations) >= oracle.max_observations) {
        vector::remove(&mut oracle.observations, 0);
    };

    vector::push_back(&mut oracle.observations, new_obs);
    oracle.last_price_cumulative = new_cumulative;

    event::emit(OracleUpdated {
        oracle_id: object::uid_to_address(&oracle.id),
        pool_id: oracle.pool_id,
        timestamp: current_time,
        price_cumulative: new_cumulative,
        current_price,
    });
}

/// Calculate TWAP for a given time window (in seconds)
public fun get_twap_price<X, Y>(
    oracle: &PriceOracle<X, Y>,
    time_window: u64,
    clock: &Clock,
): u128 {
    assert!(time_window > 0, E_INVALID_OBSERVATION);
    
    let obs_count = vector::length(&oracle.observations);
    assert!(obs_count > 1, E_NO_OBSERVATIONS);

    let current_time = iota::clock::timestamp_ms(clock) / 1000;
    let target_start_time = if (current_time > time_window) {
        current_time - time_window
    } else {
        0
    };

    // Find observations for TWAP calculation
    let start_idx = find_observation_index(&oracle.observations, target_start_time);
    let end_idx = obs_count - 1;

    assert!(end_idx > start_idx, E_NO_OBSERVATIONS);

    let start_obs = vector::borrow(&oracle.observations, start_idx);
    let end_obs = vector::borrow(&oracle.observations, end_idx);

    // Calculate TWAP
    let price_delta = end_obs.price_cumulative - start_obs.price_cumulative;
    let time_delta = end_obs.timestamp - start_obs.timestamp;

    assert!(time_delta > 0, E_INVALID_OBSERVATION);

    let twap_price = price_delta / (time_delta as u128);

    event::emit(TWAPCalculated {
        oracle_id: object::uid_to_address(&oracle.id),
        twap_price,
        time_window,
        observations_used: end_idx - start_idx + 1,
    });

    twap_price
}

/// Get current spot price (not TWAP, for reference only)
public fun get_spot_price<X, Y>(
    pool: &LiquidityPool<X, Y>,
): u128 {
    let (reserve_x, reserve_y) = get_pool_reserves(pool);
    // reserves are u128
    assert!(reserve_x > 0u128 && reserve_y > 0u128, E_INSUFFICIENT_LIQUIDITY);

    // Guard multiplication to prevent overflow in reserve_y * PRICE_PRECISION
    assert!(reserve_y <= U128_MAX / PRICE_PRECISION, E_INVALID_OBSERVATION);

    reserve_y * PRICE_PRECISION / reserve_x
}

// ========== Helper Functions ==========

/// Binary search to find observation index closest to target time
fun find_observation_index(obs_list: &vector<Observation>, target_time: u64): u64 {
    let len = vector::length(obs_list);
    assert!(len > 0, E_NO_OBSERVATIONS);

    let mut left = 0u64;
    let mut right = len - 1;

    while (left < right) {
        let mid = left + (right - left + 1) / 2;
        let mid_obs = vector::borrow(obs_list, mid);

        if (mid_obs.timestamp <= target_time) {
            left = mid;
        } else {
            if (mid == 0) {
                break
            };
            right = mid - 1;
        };
    };

    left
}

/// Get pool reserves (wrapper for DEX module)
fun get_pool_reserves<X, Y>(pool: &LiquidityPool<X, Y>): (u128, u128) {
    // Use the DEX-provided helper that returns reserves as u128 to avoid
    // repeated casting and keep arithmetic in 128-bit space.
    kanari_network::DEX::get_reserves_u128(pool)
}

// ========== View Functions ==========

/// Get number of observations stored
public fun get_observation_count<X, Y>(oracle: &PriceOracle<X, Y>): u64 {
    vector::length(&oracle.observations)
}

/// Get oldest observation timestamp
public fun get_oldest_observation_time<X, Y>(oracle: &PriceOracle<X, Y>): u64 {
    assert!(vector::length(&oracle.observations) > 0, E_NO_OBSERVATIONS);
    vector::borrow(&oracle.observations, 0).timestamp
}

/// Get latest observation timestamp
public fun get_latest_observation_time<X, Y>(oracle: &PriceOracle<X, Y>): u64 {
    let len = vector::length(&oracle.observations);
    assert!(len > 0, E_NO_OBSERVATIONS);
    vector::borrow(&oracle.observations, len - 1).timestamp
}

/// Get oracle pool ID
public fun get_pool_id<X, Y>(oracle: &PriceOracle<X, Y>): address {
    oracle.pool_id
}

/// Get max observations limit
public fun get_max_observations<X, Y>(oracle: &PriceOracle<X, Y>): u64 {
    oracle.max_observations
}

/// Get current price cumulative value
public fun get_last_price_cumulative<X, Y>(oracle: &PriceOracle<X, Y>): u128 {
    oracle.last_price_cumulative
}

// ========== View Functions Without Clock Dependency ==========

/// Calculate TWAP using explicit current timestamp (for off-chain queries)
public fun get_twap_price_at_time<X, Y>(
    oracle: &PriceOracle<X, Y>,
    time_window: u64,
    current_timestamp_ms: u64,
): u128 {
    assert!(time_window > 0, E_INVALID_OBSERVATION);
    
    let obs_count = vector::length(&oracle.observations);
    assert!(obs_count > 1, E_NO_OBSERVATIONS);

    let current_time = current_timestamp_ms / 1000; // Convert to seconds
    let target_start_time = if (current_time > time_window) {
        current_time - time_window
    } else {
        0
    };

    // Find observations for TWAP calculation
    let start_idx = find_observation_index(&oracle.observations, target_start_time);
    let end_idx = obs_count - 1;

    assert!(end_idx > start_idx, E_NO_OBSERVATIONS);

    let start_obs = vector::borrow(&oracle.observations, start_idx);
    let end_obs = vector::borrow(&oracle.observations, end_idx);

    // Calculate TWAP
    let price_delta = end_obs.price_cumulative - start_obs.price_cumulative;
    let time_delta = end_obs.timestamp - start_obs.timestamp;

    assert!(time_delta > 0, E_INVALID_OBSERVATION);

    price_delta / (time_delta as u128)
}

/// Get observation at specific index (for debugging/monitoring)
public fun get_observation_at_index<X, Y>(
    oracle: &PriceOracle<X, Y>,
    index: u64
): (u64, u128) {
    assert!(index < vector::length(&oracle.observations), E_INVALID_OBSERVATION);
    let obs = vector::borrow(&oracle.observations, index);
    (obs.timestamp, obs.price_cumulative)
}
