// End-to-end integration test template for DeepBook.
// This file is intentionally a non-executing template to avoid runtime
// dependencies in CI. To enable these scenarios as runnable tests:
//  - Implement a safe test-only minting API in your token modules, or
//  - Add a treasury-cap provisioning step to the test harness so tests can
//    obtain a &mut TreasuryCap<T> to call mint on.
//
// To run the scenarios interactively, copy the relevant test body into a
// test module after provisioning minting capabilities.

module kanari_network::deepbook_e2e_tests;

use iota::test_scenario;
use kanari_network::DeepBook;
use kanari_network::KANARI;
use kanari_network::USDC;

// End-to-end integration test template for DeepBook.
// - Uses the repo's `test_scenario` harness (begin/next_tx/take_shared/return_shared/end)
// - Demonstrates: full bid/ask match, decimals extremes, and book-full eviction/refund behaviour
// IMPORTANT: this file is a template that contains clear TODOs where your test environment
// must provide TreasuryCap or module initialization for token minting. Adapt the mint/split
// parts to how your environment provisions TreasuryCaps (some repos run module init that
// stores TreasuryCap in owner's storage; other setups require you to call the token `init`).

// 1) Simple full match: maker places an ask, taker places a bid that fully fills it.
// This scenario is intentionally left as a template (non-running). To enable it,
// implement a minting helper in your token modules or provide a TreasuryCap to the
// test harness so coins can be created and split for `place_ask`/`place_bid`.

#[allow(unused_function, unused_let_mut, unused_mut_ref)]
fun template_bid_ask_match_full() {
    let owner = @0x1;
    let mut scenario = test_scenario::begin(owner);

    // Create the global registry (shared object)
    DeepBook::create_global_registry(test_scenario::ctx(&mut scenario));
    test_scenario::next_tx(&mut scenario, owner);

    // Take the shared registry so we can create/get order book
    let mut registry = test_scenario::take_shared<DeepBook::GlobalOrderBookRegistry>(&mut scenario);

    // Create/get an order book for (KANARI base, USDC quote)
    let _book_addr = DeepBook::get_or_create_order_book_with_decimals<KANARI::KANARI, USDC::USDC>(
        &mut registry,
        30u64, // fee bps
        100u64, // max depth
        9u8, // base_decimals
        6u8, // quote_decimals
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::next_tx(&mut scenario, owner);

    // Bring the book into the scenario for mutation/entry calls
    let mut book = test_scenario::take_shared<DeepBook::OrderBook<KANARI::KANARI, USDC::USDC>>(
        &mut scenario,
    );

    // ---------------------- Prepare tokens / coins ----------------------
    // TODO: mint coins using your token module's test/mint helper and split them
    // to obtain a `Coin<KANARI::KANARI>` for the ask and `Coin<USDC::USDC>` for the bid.

    // Place ask/bid steps would go here once minting is available.

    test_scenario::return_shared(registry);
    test_scenario::return_shared(book);
    test_scenario::end(scenario);
}

// 2) Decimals extremes: ensure arithmetic prechecks avoid zero rounding and overflows
#[allow(unused_function, unused_mut_ref)]
fun template_decimals_extremes() {
    // Use a realistic price (PRICE_SCALE) so the computed quote is non-zero
    let price = 1_000_000_000u64; // PRICE_SCALE

    // Case A: base_decimals = 0, quote_decimals = 18
    DeepBook::validate_quote_capacity(price, 1u64, 0u8, 18u8);

    // Case B: base_decimals = 18, quote_decimals = 0
    // Use a large base quantity (1e18) so the computed quote is non-zero after scaling
    let large_qty: u64 = 1000000000000000000u64; // 1e18
    DeepBook::validate_quote_capacity(price, large_qty, 18u8, 0u8);
}

// 3) Fill the book and observe eviction/refund behavior (and measure gas externally)
#[allow(unused_function, unused_mut_ref)]
fun template_book_full_eviction_and_refund() {
    let owner = @0x1;
    let mut scenario = test_scenario::begin(owner);

    DeepBook::create_global_registry(test_scenario::ctx(&mut scenario));
    test_scenario::next_tx(&mut scenario, owner);
    let mut registry = test_scenario::take_shared<DeepBook::GlobalOrderBookRegistry>(&mut scenario);

    // Use a small max_depth to keep operations cheap for the test
    let _book_addr = DeepBook::get_or_create_order_book_with_decimals<u128, u64>(
        &mut registry,
        30u64,
        3u64,
        6u8,
        6u8,
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::next_tx(&mut scenario, owner);
    let book = test_scenario::take_shared<DeepBook::OrderBook<u128, u64>>(&mut scenario);

    // TODO: Mint tokens and create real coins for place_bid; here we assume you will
    // place 3 bids that rest in the book (no matching), then place a 4th bid that
    // triggers eviction of the worst bid (pop_back) and causes a refund. After the
    // 4th tx you can inspect balances or events to confirm refund.

    // NOTE on gas measurement:
    // - To measure gas for the eviction transaction, run the 4th place_bid as a single
    //   RPC/CLI call (not within `iota move test`) against a local devnode or testnet and
    //   inspect the returned gas/fee. Example approach:
    //     1) Re-create the sequence of txs via `iota client call` (create registry, create book, place 3 bids),
    //     2) Submit the 4th place_bid via `iota client call` and read the gas_used field in the response.
    // - `vector::insert` shifts elements and is O(n) gas; keeping `max_depth` small reduces worst-case cost.

    test_scenario::return_shared(registry);
    test_scenario::return_shared(book);
    test_scenario::end(scenario);
}
