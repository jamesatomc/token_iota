#[test_only]
module kanari_network::dex_same_token_tests;

use iota::test_scenario;
use kanari_network::DEX;

// We expect creating a pool with identical token types to abort with E_SAME_TOKEN_PAIR
#[allow(unused_mut_ref)]
#[test, expected_failure(abort_code = ::kanari_network::DEX::E_SAME_TOKEN_PAIR)]
fun test_create_same_token_pair_aborts() {
    let owner = @0x1;
    let mut scenario = test_scenario::begin(owner);

    // Initialize global registry
    DEX::create_global_registry(test_scenario::ctx(&mut scenario));
    test_scenario::next_tx(&mut scenario, owner);

    // Take the shared registry so we can call create_pool
    let mut registry = test_scenario::take_shared<DEX::GlobalPoolRegistry>(&mut scenario);

    // Attempt to create a pool where X == Y (u64,u64) and expect abort with E_SAME_TOKEN_PAIR
    DEX::create_pool<u64, u64>(&mut registry, 50u64, test_scenario::ctx(&mut scenario));

    // If it didn't abort, return and end scenario (test framework will mark this as failure)
    test_scenario::return_shared(registry);
    test_scenario::end(scenario);
}
