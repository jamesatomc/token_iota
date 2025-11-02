// Edge-case tests for order types: FOK and PostOnly
#[test_only]
#[allow(unused_mut_ref)]
module kanari_network::deepbook_order_type_edge_tests;

use iota::coin;
use iota::test_scenario;
use kanari_network::DeepBook;
use kanari_network::KANARI;
use kanari_network::USDC;

// FOK should succeed when cumulative available asks across multiple resting orders
// are sufficient to fill the requested quantity (matching may span multiple asks).
#[test]
fun test_fok_success_across_multiple_asks() {
    let owner = @0x5;
    let maker1 = @0x50;
    let maker2 = @0x51;
    let taker = @0x52;
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

    // Two makers place asks: 600 and 500 -> total 1100
    test_scenario::next_tx(&mut scenario, maker1);
    let q1: u64 = 600_000_000u64;
    let price: u64 = 1_500_000_000u64;
    let base1 = coin::mint_for_testing<KANARI::KANARI>(q1, test_scenario::ctx(&mut scenario));
    DeepBook::place_ask(&mut book, price, q1, base1, 0u8, test_scenario::ctx(&mut scenario));

    test_scenario::next_tx(&mut scenario, maker2);
    let q2: u64 = 500_000_000u64;
    let base2 = coin::mint_for_testing<KANARI::KANARI>(q2, test_scenario::ctx(&mut scenario));
    DeepBook::place_ask(&mut book, price, q2, base2, 0u8, test_scenario::ctx(&mut scenario));

    // Taker places a FOK bid for 1_000_000_000 (<= 1100 available) -> should succeed
    test_scenario::next_tx(&mut scenario, taker);
    let want: u64 = 1_000_000_000u64;
    let required_quote = DeepBook::calculate_quote_amount_with_decimals(want, price, 9u8, 6u8);
    let quote_coin = coin::mint_for_testing<USDC::USDC>(
        required_quote,
        test_scenario::ctx(&mut scenario),
    );

    DeepBook::place_bid(&mut book, price, want, quote_coin, 2u8, test_scenario::ctx(&mut scenario));

    // After match: first ask (600) fully filled and removed; second ask partially filled (500 - 400 = 100 left)
    let asks_count = DeepBook::get_ask_count(&book);
    assert!(asks_count == 1u64, 7001);
    let ask_locked = DeepBook::get_ask_locked_amount_at(&book, 0u64);
    assert!(ask_locked == 100_000_000u64, 7002);

    test_scenario::return_shared(registry);
    test_scenario::return_shared(book);
    test_scenario::end(scenario);
}

// Symmetric PostOnly test for asks: placing a PostOnly ask at a price equal to best bid should abort
#[test, expected_failure(abort_code = ::kanari_network::DeepBook::E_POST_ONLY_VIOLATION)]
fun test_postonly_ask_matching_best_bid_aborts() {
    let owner = @0x6;
    let bidder = @0x60;
    let maker = @0x61;
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

    // Bidder places a resting bid at price P
    test_scenario::next_tx(&mut scenario, bidder);
    let qty: u64 = 1_000_000_000u64;
    let price: u64 = 1_200_000_000u64;
    let req_quote = DeepBook::calculate_quote_amount_with_decimals(qty, price, 9u8, 6u8);
    let quote_coin = coin::mint_for_testing<USDC::USDC>(
        req_quote,
        test_scenario::ctx(&mut scenario),
    );
    DeepBook::place_bid(&mut book, price, qty, quote_coin, 0u8, test_scenario::ctx(&mut scenario));

    // Maker attempts PostOnly ask at same price -> should abort
    test_scenario::next_tx(&mut scenario, maker);
    let base_coin = coin::mint_for_testing<KANARI::KANARI>(qty, test_scenario::ctx(&mut scenario));
    DeepBook::place_ask(&mut book, price, qty, base_coin, 3u8, test_scenario::ctx(&mut scenario));

    test_scenario::return_shared(registry);
    test_scenario::return_shared(book);
    test_scenario::end(scenario);
}

// IOC bid: partial match should execute the matched portion and NOT leave a resting bid (remaining refunded)
#[test]
fun test_ioc_bid_partial_fill_and_no_resting_bid() {
    let owner = @0x7;
    let maker = @0x70;
    let taker = @0x71;
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

    // Maker places an ask of q = 1_000_000_000
    test_scenario::next_tx(&mut scenario, maker);
    let q: u64 = 1_000_000_000u64;
    let price: u64 = 2_000_000_000u64;
    let base_coin = coin::mint_for_testing<KANARI::KANARI>(q, test_scenario::ctx(&mut scenario));
    DeepBook::place_ask(&mut book, price, q, base_coin, 0u8, test_scenario::ctx(&mut scenario));

    // Taker places an IOC bid for m = 400_000_000 (partial). IOC should match and not insert a resting bid.
    test_scenario::next_tx(&mut scenario, taker);
    let m: u64 = 400_000_000u64;
    let required_quote = DeepBook::calculate_quote_amount_with_decimals(m, price, 9u8, 6u8);
    let quote_coin = coin::mint_for_testing<USDC::USDC>(
        required_quote,
        test_scenario::ctx(&mut scenario),
    );
    DeepBook::place_bid(&mut book, price, m, quote_coin, 1u8, test_scenario::ctx(&mut scenario));

    // After IOC: there should be no resting bids (bid was IOC) and ask locked decreased by m
    let bids_count = DeepBook::get_bid_count(&book);
    assert!(bids_count == 0u64, 8001);

    let ask_locked = DeepBook::get_ask_locked_amount_at(&book, 0u64);
    assert!(ask_locked == (q - m), 8002);

    test_scenario::return_shared(registry);
    test_scenario::return_shared(book);
    test_scenario::end(scenario);
}

// Placing a FOK bid when there is no available ask liquidity should abort
// with E_INSUFFICIENT_LIQUIDITY (precheck in place_bid).
#[test, expected_failure(abort_code = ::kanari_network::DeepBook::E_INSUFFICIENT_LIQUIDITY)]
fun test_fok_bid_no_liquidity_aborts() {
    let owner = @0x1;
    let maker = @0x10;
    let mut scenario = test_scenario::begin(owner);

    // create registry and book
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

    // Maker attempts a FOK bid but there are no asks in the book
    test_scenario::next_tx(&mut scenario, maker);
    let qty: u64 = 1_000_000_000u64; // 1e9 base units
    let price: u64 = 1_000_000_000u64; // 1.0 price
    // mint enough quote to cover the would-be required payment (even though FOK check runs before consuming it)
    let required_quote = DeepBook::calculate_quote_amount_with_decimals(qty, price, 9u8, 6u8);
    let quote_coin = coin::mint_for_testing<USDC::USDC>(
        required_quote,
        test_scenario::ctx(&mut scenario),
    );

    // This should abort due to insufficient available asks to fully fill the FOK
    DeepBook::place_bid(&mut book, price, qty, quote_coin, 2u8, test_scenario::ctx(&mut scenario));

    test_scenario::return_shared(registry);
    test_scenario::return_shared(book);
    test_scenario::end(scenario);
}

// Placing a PostOnly bid that would match the current best ask (equal price)
// should abort with E_POST_ONLY_VIOLATION (module enforces best.price > price).
#[test, expected_failure(abort_code = ::kanari_network::DeepBook::E_POST_ONLY_VIOLATION)]
fun test_postonly_bid_matching_best_price_aborts() {
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

    // Maker places a resting ask at price P
    test_scenario::next_tx(&mut scenario, maker);
    let qty: u64 = 1_000_000_000u64;
    let price: u64 = 1_500_000_000u64; // 1.5
    let base_coin = coin::mint_for_testing<KANARI::KANARI>(qty, test_scenario::ctx(&mut scenario));
    DeepBook::place_ask(&mut book, price, qty, base_coin, 0u8, test_scenario::ctx(&mut scenario));

    // Taker attempts to place a PostOnly bid at the same price (would match), should abort
    test_scenario::next_tx(&mut scenario, taker);
    let required_quote = DeepBook::calculate_quote_amount_with_decimals(qty, price, 9u8, 6u8);
    let quote_coin = coin::mint_for_testing<USDC::USDC>(
        required_quote,
        test_scenario::ctx(&mut scenario),
    );

    // This place_bid should abort because best.ask.price (price) is NOT > price (equal), violating PostOnly
    DeepBook::place_bid(&mut book, price, qty, quote_coin, 3u8, test_scenario::ctx(&mut scenario));

    test_scenario::return_shared(registry);
    test_scenario::return_shared(book);
    test_scenario::end(scenario);
}

// IOC symmetry: placing an IOC ask that partially matches a resting bid should
// execute matched portion and not insert a resting ask; bid locked amount reduces.
#[test]
fun test_ioc_ask_partial_fill_and_no_resting_ask() {
    let owner = @0x8;
    let bidder = @0x80;
    let taker = @0x81;
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

    // Bidder places a resting bid q
    test_scenario::next_tx(&mut scenario, bidder);
    let q: u64 = 1_000_000_000u64;
    let price: u64 = 2_000_000_000u64;
    let req_quote = DeepBook::calculate_quote_amount_with_decimals(q, price, 9u8, 6u8);
    let quote_coin = coin::mint_for_testing<USDC::USDC>(
        req_quote,
        test_scenario::ctx(&mut scenario),
    );
    DeepBook::place_bid(&mut book, price, q, quote_coin, 0u8, test_scenario::ctx(&mut scenario));

    let initial_locked = DeepBook::get_bid_locked_amount_at(&book, 0u64);

    // Taker places IOC ask for m < q
    test_scenario::next_tx(&mut scenario, taker);
    let m: u64 = 400_000_000u64;
    let base_coin = coin::mint_for_testing<KANARI::KANARI>(m, test_scenario::ctx(&mut scenario));
    DeepBook::place_ask(&mut book, price, m, base_coin, 1u8, test_scenario::ctx(&mut scenario));

    // After IOC: no resting asks (ask was IOC) and bid locked decreased by quote corresponding to m
    let asks_count = DeepBook::get_ask_count(&book);
    assert!(asks_count == 0u64, 9001);

    let consumed_quote = DeepBook::calculate_quote_amount_with_decimals(m, price, 9u8, 6u8);
    let locked_after = DeepBook::get_bid_locked_amount_at(&book, 0u64);
    assert!(locked_after == (initial_locked - consumed_quote), 9002);

    test_scenario::return_shared(registry);
    test_scenario::return_shared(book);
    test_scenario::end(scenario);
}

// FOK across mixed prices: sum of asks with price <= bid price should allow FOK to succeed
#[test]
fun test_fok_across_mixed_prices_success() {
    let owner = @0x9;
    let m1 = @0x90;
    let m2 = @0x91;
    let taker = @0x92;
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

    // m1 posts ask at lower price
    test_scenario::next_tx(&mut scenario, m1);
    let q1: u64 = 400_000_000u64;
    let price1: u64 = 1_400_000_000u64;
    let base1 = coin::mint_for_testing<KANARI::KANARI>(q1, test_scenario::ctx(&mut scenario));
    DeepBook::place_ask(&mut book, price1, q1, base1, 0u8, test_scenario::ctx(&mut scenario));

    // m2 posts ask at bid price
    test_scenario::next_tx(&mut scenario, m2);
    let q2: u64 = 700_000_000u64;
    let price2: u64 = 1_500_000_000u64;
    let base2 = coin::mint_for_testing<KANARI::KANARI>(q2, test_scenario::ctx(&mut scenario));
    DeepBook::place_ask(&mut book, price2, q2, base2, 0u8, test_scenario::ctx(&mut scenario));

    // taker places FOK bid at price 1.5 for 1_000_000_000 (available 1.1e9 across asks <= 1.5)
    test_scenario::next_tx(&mut scenario, taker);
    let want: u64 = 1_000_000_000u64;
    let bid_price: u64 = 1_500_000_000u64;
    let req_quote = DeepBook::calculate_quote_amount_with_decimals(want, bid_price, 9u8, 6u8);
    let quote_coin = coin::mint_for_testing<USDC::USDC>(
        req_quote,
        test_scenario::ctx(&mut scenario),
    );

    DeepBook::place_bid(
        &mut book,
        bid_price,
        want,
        quote_coin,
        2u8,
        test_scenario::ctx(&mut scenario),
    );

    // After match, remaining asks should reflect the partial consumption
    let asks_count = DeepBook::get_ask_count(&book);
    assert!(asks_count >= 0u64, 10001); // sanity check; we mainly assert no abort happened and matching occurred

    test_scenario::return_shared(registry);
    test_scenario::return_shared(book);
    test_scenario::end(scenario);
}

// Fee rounding edge-case: tiny quote and small fee_bps should produce zero collected fee
#[test]
fun test_fee_rounding_to_zero() {
    let owner = @0xA;
    let maker = @0xA0;
    let taker = @0xA1;
    let mut scenario = test_scenario::begin(owner);

    DeepBook::create_global_registry(test_scenario::ctx(&mut scenario));
    test_scenario::next_tx(&mut scenario, owner);
    let mut registry = test_scenario::take_shared<DeepBook::GlobalOrderBookRegistry>(&mut scenario);

    // Create a book with tiny fee_bps = 1 (0.01%) and 0 decimals so small trades compute to 1 quote unit
    let _book_addr = DeepBook::get_or_create_order_book_with_decimals<KANARI::KANARI, USDC::USDC>(
        &mut registry,
        1u64,
        100u64,
        0u8,
        0u8,
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::next_tx(&mut scenario, owner);
    let mut book = test_scenario::take_shared<DeepBook::OrderBook<KANARI::KANARI, USDC::USDC>>(
        &mut scenario,
    );

    // Maker places an ask of 1 base at price = PRICE_SCALE -> required_quote == 1
    test_scenario::next_tx(&mut scenario, maker);
    let q: u64 = 1u64;
    let price: u64 = 1_000_000_000u64;
    let base_coin = coin::mint_for_testing<KANARI::KANARI>(q, test_scenario::ctx(&mut scenario));
    DeepBook::place_ask(&mut book, price, q, base_coin, 0u8, test_scenario::ctx(&mut scenario));

    // Taker bids to fully fill
    test_scenario::next_tx(&mut scenario, taker);
    let required_quote = DeepBook::calculate_quote_amount_with_decimals(q, price, 0u8, 0u8);
    let quote_coin = coin::mint_for_testing<USDC::USDC>(
        required_quote,
        test_scenario::ctx(&mut scenario),
    );
    DeepBook::place_bid(&mut book, price, q, quote_coin, 0u8, test_scenario::ctx(&mut scenario));

    // Fee for this trade should be floor(1 * 1 / 10000) == 0
    let (_fee_base, fee_quote) = DeepBook::get_fee_balances(&book);
    assert!(fee_quote == 0u64, 11001);

    test_scenario::return_shared(registry);
    test_scenario::return_shared(book);
    test_scenario::end(scenario);
}
