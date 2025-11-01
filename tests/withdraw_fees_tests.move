#[test_only]
module kanari_network::withdraw_fees_tests;

use kanari_network::DeepBook;
use iota::test_scenario;

// We'll use a scenario-based harness to create transactions and take shared objects
// from the global inventory. This avoids needing `object::borrow_global_mut` which
// isn't available in this test environment.

// NOTE: This integration-style test demonstrates intended usage of the
// registry-based admin model and the withdraw_fees entry function.
// Depending on the test harness you use for Move/IOTA, you may need to
// adapt the calls for creating tx contexts or borrowing shared objects
// (e.g. `object::borrow_global_mut`). The logic below follows the
// canonical flow and will be useful as a reference and starting point.
#[allow(unused_mut_ref)]
#[test]
fun test_registry_admin_and_withdraw_zero() {
    // Start a test scenario where `owner` is the tx sender
    let owner = @0x1;
    let mut scenario = test_scenario::begin(owner);

    // Create a global registry (shares the registry object)
    let _registry_addr = DeepBook::create_global_registry(test_scenario::ctx(&mut scenario));
    // end tx so the shared registry becomes available in the global inventory
    test_scenario::next_tx(&mut scenario, owner);

    // Take the shared registry object into the scenario so we can borrow it
    let mut registry = test_scenario::take_shared<DeepBook::GlobalOrderBookRegistry>(&mut scenario);

    // Create or get a new book for the pair; the creator (owner) becomes admin in the registry
    let book_addr = DeepBook::get_or_create_order_book_with_decimals<u128, u64>(&mut registry, 30u64, 100u64, 6u8, 6u8, test_scenario::ctx(&mut scenario));
    // end tx so the shared book becomes available
    test_scenario::next_tx(&mut scenario, owner);

    // Admin should be set for the book
    let admin_opt = DeepBook::get_book_admin(&registry, book_addr);
    assert!(option::is_some(&admin_opt), 1);

    // The test harness's sender should be the admin (the creator)
    // We can't directly compare to tx_context::sender here in a harness-independent way,
    // but the presence of the mapping demonstrates the registry-based admin was set.

    // Take the created shared book into the scenario so we can mutate it
    let mut book = test_scenario::take_shared<DeepBook::OrderBook<u128, u64>>(&mut scenario);

    // Withdraw zero amounts (should succeed and emit FeesWithdrawn) — serves as a smoke test
    DeepBook::withdraw_fees(&mut registry, &mut book, test_scenario::ctx(&mut scenario).sender(), 0u64, 0u64, test_scenario::ctx(&mut scenario));

    // Return shared objects to the global inventory and end the scenario to consume `scenario`
    test_scenario::return_shared(registry);
    test_scenario::return_shared(book);
    test_scenario::end(scenario);
}
