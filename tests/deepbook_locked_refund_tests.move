// Tests for locked_amount accounting and refunds

#[test_only]
#[allow(unused_mut_ref)]
module kanari_network::deepbook_locked_refund_tests;

use iota::coin;
use iota::test_scenario;
use kanari_network::DeepBook;
use kanari_network::KANARI;
use kanari_network::USDC;

#[test]
fun test_cancel_refund_matches_locked() {
    let owner = @0x1;
    let maker = @0x10;
    let mut scenario = test_scenario::begin(owner);

    DeepBook::create_global_registry(test_scenario::ctx(&mut scenario));
    test_scenario::next_tx(&mut scenario, owner);
    let mut registry = test_scenario::take_shared<DeepBook::GlobalOrderBookRegistry>(&mut scenario);

    let _book_addr = DeepBook::get_or_create_order_book_with_decimals<KANARI::KANARI, USDC::USDC>(
        &mut registry,
        30u64,
        100u64,
        9u8,
        6u8,
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::next_tx(&mut scenario, owner);
    let mut book = test_scenario::take_shared<DeepBook::OrderBook<KANARI::KANARI, USDC::USDC>>(
        &mut scenario,
    );

    // Maker places a bid
    test_scenario::next_tx(&mut scenario, maker);
    let qty: u64 = 1_000_000_000u64;
    let price: u64 = 1_500_000_000u64;
    let required_quote = DeepBook::calculate_quote_amount_with_decimals(qty, price, 9u8, 6u8);
    let quote_coin = coin::mint_for_testing<USDC::USDC>(
        required_quote,
        test_scenario::ctx(&mut scenario),
    );

    DeepBook::place_bid(&mut book, price, qty, quote_coin, 0u8, test_scenario::ctx(&mut scenario));

    // locked amount stored on order should equal required_quote
    let locked = DeepBook::get_bid_locked_amount_at(&book, 0u64);
    assert!(locked == required_quote, 6001);

    // Cancel the order as maker and ensure locked balances reset
    let order_id = DeepBook::get_bid_id_at(&book, 0u64);
    DeepBook::cancel_order(&mut book, order_id, test_scenario::ctx(&mut scenario));

    let (_base_locked, quote_locked_after) = DeepBook::get_locked_balances(&book);
    assert!(quote_locked_after == 0u64, 6002);

    test_scenario::return_shared(registry);
    test_scenario::return_shared(book);
    test_scenario::end(scenario);
}

#[test]
fun test_remaining_locked_decrements_on_match() {
    let owner = @0x2;
    let maker = @0x20;
    let taker = @0x21;
    let mut scenario = test_scenario::begin(owner);

    DeepBook::create_global_registry(test_scenario::ctx(&mut scenario));
    test_scenario::next_tx(&mut scenario, owner);
    let mut registry = test_scenario::take_shared<DeepBook::GlobalOrderBookRegistry>(&mut scenario);

    let _book_addr = DeepBook::get_or_create_order_book_with_decimals<KANARI::KANARI, USDC::USDC>(
        &mut registry,
        30u64,
        100u64,
        9u8,
        6u8,
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::next_tx(&mut scenario, owner);
    let mut book = test_scenario::take_shared<DeepBook::OrderBook<KANARI::KANARI, USDC::USDC>>(
        &mut scenario,
    );

    // Maker places an ask of quantity q
    test_scenario::next_tx(&mut scenario, maker);
    let q: u64 = 1_000_000_000u64;
    let price: u64 = 2_000_000_000u64;
    let base_coin = coin::mint_for_testing<KANARI::KANARI>(q, test_scenario::ctx(&mut scenario));
    DeepBook::place_ask(&mut book, price, q, base_coin, 0u8, test_scenario::ctx(&mut scenario));

    // Taker matches partially amount m
    test_scenario::next_tx(&mut scenario, taker);
    let m: u64 = 400_000_000u64; // partial match
    let required_quote = DeepBook::calculate_quote_amount_with_decimals(m, price, 9u8, 6u8);
    let quote_coin = coin::mint_for_testing<USDC::USDC>(
        required_quote,
        test_scenario::ctx(&mut scenario),
    );
    DeepBook::place_bid(&mut book, price, m, quote_coin, 0u8, test_scenario::ctx(&mut scenario));

    // After partial match, ask.locked_amount should be q - m
    let ask_locked = DeepBook::get_ask_locked_amount_at(&book, 0u64);
    assert!(ask_locked == (q - m), 6003);

    test_scenario::return_shared(registry);
    test_scenario::return_shared(book);
    test_scenario::end(scenario);
}
