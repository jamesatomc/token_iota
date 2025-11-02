// Integration test for DEX: add liquidity -> swap -> remove liquidity
// Uses test-only coin minting helpers so no TreasuryCap is required.

#[test_only]
#[allow(unused_mut_ref, duplicate_alias)]
module kanari_network::dex_integration_tests;

use kanari_network::DEX;
use iota::test_scenario;
use iota::coin;
use iota::transfer;

// Two distinct test token types for the pool
public struct TOKEN_A has drop {}
public struct TOKEN_B has drop {}

#[test]
fun test_add_swap_remove_flow() {
    let owner = @0x1;
    let taker = @0x2;
    let mut scenario = test_scenario::begin(owner);

    // Create the global registry and pool
    DEX::create_global_registry(test_scenario::ctx(&mut scenario));
    test_scenario::next_tx(&mut scenario, owner);
    let mut registry = test_scenario::take_shared<DEX::GlobalPoolRegistry>(&mut scenario);

    // Create a pool with medium fee (50 bps == 0.5%)
    DEX::create_pool<TOKEN_A, TOKEN_B>(&mut registry, 50u64, test_scenario::ctx(&mut scenario));
    test_scenario::next_tx(&mut scenario, owner);

    let mut pool = test_scenario::take_shared<DEX::LiquidityPool<TOKEN_A, TOKEN_B>>(&mut scenario);

    // Mint test coins (test-only helper) and add liquidity
    let coin_x = coin::mint_for_testing<TOKEN_A>(1_000u64, test_scenario::ctx(&mut scenario));
    let coin_y = coin::mint_for_testing<TOKEN_B>(1_000u64, test_scenario::ctx(&mut scenario));

    let lp_token = DEX::add_liquidity(&mut pool, coin_x, coin_y, 0u64, test_scenario::ctx(&mut scenario));

    // Burn reserve should be present and equal to the module constant
    let burned = DEX::get_burned_minimum_liquidity(&pool);
    let min_liq = DEX::get_minimum_liquidity();
    assert!(burned == min_liq, 1001);

    // Reserve snapshot
    let (res_x_before, res_y_before) = DEX::get_reserves(&pool);

    // Taker swaps 100 TOKEN_A -> TOKEN_B
    let coin_in = coin::mint_for_testing<TOKEN_A>(100u64, test_scenario::ctx(&mut scenario));
    let expected_out = DEX::get_amount_out(&pool, 100u64, true);
    let coin_out = DEX::swap_x_to_y(&mut pool, coin_in, 0u64, test_scenario::ctx(&mut scenario));

    // Output matches view calculation
    assert!(coin::value(&coin_out) == expected_out, 1002);

    // Transfer output to taker so the Coin is consumed before function end
    transfer::public_transfer(coin_out, taker);

    // Pool reserves updated: X increased by input, Y decreased by output
    let (res_x_after, res_y_after) = DEX::get_reserves(&pool);
    assert!(res_x_after == res_x_before + 100u64, 1003);
    assert!(res_y_after == res_y_before - expected_out, 1004);

    // Remove liquidity (burn LP token) and ensure returned coins are non-zero
    let (ret_x, ret_y) = DEX::remove_liquidity(&mut pool, lp_token, 0u64, 0u64, test_scenario::ctx(&mut scenario));
    assert!(coin::value(&ret_x) > 0 && coin::value(&ret_y) > 0, 1005);

    // Transfer returned coins to owner (consume them)
    transfer::public_transfer(ret_x, owner);
    transfer::public_transfer(ret_y, owner);

    test_scenario::return_shared(registry);
    test_scenario::return_shared(pool);
    test_scenario::end(scenario);
}
