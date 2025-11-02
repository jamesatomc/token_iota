// Developer-focused end-to-end test template for DeepBook.
// This file is intended as a developer/devnet helper; it remains a template
// to avoid CI failures. To enable as a runnable test, fill the TODOs below
// and remove the 'template_' prefix and uncomment the #[test] attribute.


#[test_only]
#[allow(unused_use)]
module kanari_network::deepbook_e2e_dev_test;

use kanari_network::DeepBook;
use kanari_network::USDC;
use kanari_network::KANARI;
use iota::test_scenario;
use iota::coin;

// Developer workflow:
// 1) Run the local devnode or a testnet where you control an account that has
//    the TreasuryCap objects for USDC and KANARI (these are created during
//    module initialization and transferred to the deployer account).
// 2) Implement a small helper (in your local harness) to fetch the TreasuryCap
//    from the deployer account storage and return a &mut TreasuryCap<T> so the
//    test can call the public mint API defined in the token modules.
// 3) Enable this test by uncommenting the #[test] attribute and adjusting the
//    treasury-cap retrieval helpers to match your environment.

// Example developer test body (template). To enable, replace the TODOs and
// uncomment the #[test] above the function.
#[allow(unused_function, unused_use, unused_let_mut, unused_mut_ref, unused_variable)]
fun template_test_bid_ask_match_full_with_mint() {
    let owner = @0x1;
    let taker = @0x2;
    let mut scenario = test_scenario::begin(owner);

    // Create registry
    DeepBook::create_global_registry(test_scenario::ctx(&mut scenario));
    test_scenario::next_tx(&mut scenario, owner);
    let mut registry = test_scenario::take_shared<DeepBook::GlobalOrderBookRegistry>(&mut scenario);

    // Create book
    let book_addr = DeepBook::get_or_create_order_book_with_decimals<KANARI::KANARI, USDC::USDC>(
        &mut registry,
        30u64, // fee bps
        100u64, // max depth
        9u8, // base_decimals
        6u8, // quote_decimals
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::next_tx(&mut scenario, owner);
    let mut book = test_scenario::take_shared<DeepBook::OrderBook<KANARI::KANARI, USDC::USDC>>(&mut scenario);

    // ---------------------- TODO: Obtain TreasuryCaps ----------------------
    // You must obtain mutable references to the TreasuryCap objects for each
    // token so you can call the token module's `mint` API. How you obtain
    // them depends on your environment. Examples:
    //  - If module init transferred the TreasuryCap to `owner`, add a helper in
    //    your harness to borrow it from owner's storage and return `&mut TreasuryCap<T>`.
    //  - Alternatively, provision a known test account with the TreasuryCap and
    //    supply it to the test harness.
    //
    // Example placeholder (DO NOT UNCOMMENT unless you implement helpers):
    // let mut treasury_cap_usdc = test_harness::get_treasury_cap<USDC::USDC>(owner);
    // let mut treasury_cap_kanari = test_harness::get_treasury_cap<KANARI::KANARI>(owner);

    // ---------------------- Mint tokens ----------------------
    // Example (calls the token module's `mint` which requires &mut TreasuryCap<T>):
    // let quote_coin = USDC::mint(&mut treasury_cap_usdc, 500_000u64, taker, test_scenario::ctx(&mut scenario));
    // let base_coin = KANARI::mint(&mut treasury_cap_kanari, 100u64, owner, test_scenario::ctx(&mut scenario));

    // ---------------------- Place ask/bid ----------------------
    // Example price and quantity (price uses PRICE_SCALE = 1_000_000_000)
    // let price: u64 = 2_000_000_000u64; // 2.0
    // let quantity: u64 = 100u64;

    // DeepBook::place_ask(&mut book, price, quantity, base_coin, test_scenario::ctx(&mut scenario));
    // test_scenario::next_tx(&mut scenario, owner);

    // DeepBook::place_bid(&mut book, price, quantity, quote_coin, test_scenario::ctx(&mut scenario));
    // test_scenario::next_tx(&mut scenario, taker);

    // ---------------------- Assertions / checks ----------------------
    // After the matching txs, check balances or events if your harness provides helpers.
    // Example placeholders:
    // assert!(USDC::balance(&some_coin) == expected, 999);
    // assert!(KANARI::balance(&some_coin) == expected, 1000);

    test_scenario::return_shared(registry);
    test_scenario::return_shared(book);
    test_scenario::end(scenario);
}
