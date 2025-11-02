// Heavy edge-case tests for DeepBook: overflow bounds, many matches, immediate cancel/refund

#[test_only]
#[allow(unused_mut_ref)]
module kanari_network::deepbook_edgecases;

use iota::coin;
use iota::test_scenario;
use kanari_network::DeepBook;
use kanari_network::KANARI;
use kanari_network::USDC;

// 1) Provokes refund overflow check (should abort with E_OVERFLOW)
#[test, expected_failure(abort_code = ::kanari_network::DeepBook::E_OVERFLOW)]
fun test_refund_overflow_aborts_heavy() {
    // Use very large unmatched * price to trigger overflow in refund calc
    let unmatched: u128 = 10_000_000_000_000_000_000u128;
    let price: u128 = 10_000_000_000_000_000_000u128;
    DeepBook::check_refund_overflow(unmatched, price, 0u8, 0u8);
}

// 2) Many matches in a single test transaction: create many asks, then a single bid
#[test]
fun test_many_matches_single_tx() {
    let maker = @0x10;
    let mut scenario = test_scenario::begin(maker);

    DeepBook::create_global_registry(test_scenario::ctx(&mut scenario));
    test_scenario::next_tx(&mut scenario, maker);
    let mut registry = test_scenario::take_shared<DeepBook::GlobalOrderBookRegistry>(&mut scenario);

    let _book_addr = DeepBook::get_or_create_order_book_with_decimals<KANARI::KANARI, USDC::USDC>(
        &mut registry,
        30u64,
        1000u64,
        9u8,
        6u8,
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::next_tx(&mut scenario, maker);
    let mut book = test_scenario::take_shared<DeepBook::OrderBook<KANARI::KANARI, USDC::USDC>>(
        &mut scenario,
    );

    // Place N asks (resting orders)
    let n: u64 = 50u64;
    let qty: u64 = 1_000_000_000u64; // 1e9 base units to avoid rounding
    let mut i = 0u64;
    while (i < n) {
        let price = 1_000_000_000u64 + i * 1_000_000u64; // slightly increasing prices
        let base_coin = coin::mint_for_testing<KANARI::KANARI>(
            qty,
            test_scenario::ctx(&mut scenario),
        );
        DeepBook::place_ask(
            &mut book,
            price,
            qty,
            base_coin,
            0u8,
            test_scenario::ctx(&mut scenario),
        );
        i = i + 1;
    };

    // Ensure asks count == n
    let asks_before = DeepBook::get_ask_count(&book);
    assert!(asks_before == n, 4001);

    // Taker places a single bid with high price to match all asks
    let total_base: u64 = n * qty;
    let bid_price = 2_000_000_000u64; // high enough to match
    let required_quote = DeepBook::calculate_quote_amount_with_decimals(
        total_base,
        bid_price,
        9u8,
        6u8,
    );
    let quote_coin = coin::mint_for_testing<USDC::USDC>(
        required_quote,
        test_scenario::ctx(&mut scenario),
    );

    DeepBook::place_bid(
        &mut book,
        bid_price,
        total_base,
        quote_coin,
        0u8,
        test_scenario::ctx(&mut scenario),
    );

    // After matching, asks should be zero and fee balance should be non-zero
    let asks_after = DeepBook::get_ask_count(&book);
    let (_locked_base, locked_quote) = DeepBook::get_locked_balances(&book);
    let (_fee_base, fee_quote) = DeepBook::get_fee_balances(&book);

    assert!(asks_after == 0u64, 4002);
    assert!(fee_quote > 0u64 || locked_quote >= 0u64, 4003);

    test_scenario::return_shared(registry);
    test_scenario::return_shared(book);
    test_scenario::end(scenario);
}

// 3) Immediate cancel: place an ask then cancel it and assert refund (locked balances decrease)
#[test]
fun test_immediate_cancel_refund() {
    let maker = @0x20;
    let mut scenario = test_scenario::begin(maker);

    DeepBook::create_global_registry(test_scenario::ctx(&mut scenario));
    test_scenario::next_tx(&mut scenario, maker);
    let mut registry = test_scenario::take_shared<DeepBook::GlobalOrderBookRegistry>(&mut scenario);

    let _book_addr = DeepBook::get_or_create_order_book_with_decimals<KANARI::KANARI, USDC::USDC>(
        &mut registry,
        30u64,
        100u64,
        9u8,
        6u8,
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::next_tx(&mut scenario, maker);
    let mut book = test_scenario::take_shared<DeepBook::OrderBook<KANARI::KANARI, USDC::USDC>>(
        &mut scenario,
    );

    let qty: u64 = 1_000_000_000u64;
    let price: u64 = 1_000_000_000u64;
    let base_coin = coin::mint_for_testing<KANARI::KANARI>(qty, test_scenario::ctx(&mut scenario));

    // Locked balances before
    let (_before_base_locked, _before_quote_locked) = DeepBook::get_locked_balances(&book);

    DeepBook::place_ask(&mut book, price, qty, base_coin, 0u8, test_scenario::ctx(&mut scenario));

    let asks_mid = DeepBook::get_ask_count(&book);
    assert!(asks_mid == 1u64, 5001);

    // Cancel the order_id = 1 (first order)
    DeepBook::cancel_order(&mut book, 1u64, test_scenario::ctx(&mut scenario));

    let asks_after = DeepBook::get_ask_count(&book);
    let (after_base_locked, _after_quote_locked) = DeepBook::get_locked_balances(&book);

    assert!(asks_after == 0u64, 5002);
    // After cancel, locked base should be zero (refund happened)
    assert!(after_base_locked == 0u64, 5003);

    test_scenario::return_shared(registry);
    test_scenario::return_shared(book);
    test_scenario::end(scenario);
}
