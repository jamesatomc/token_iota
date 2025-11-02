// Integration tests for DeepBook: full match -> withdraw fees, and eviction/refund behavior

#[test_only]
#[allow(unused_mut_ref)]
module kanari_network::deepbook_integration_tests;

use kanari_network::DeepBook;
use kanari_network::KANARI;
use kanari_network::USDC;
use iota::test_scenario;
use iota::coin;

#[test]
fun test_full_match_and_withdraw_fees() {
    let owner = @0x1;
    let taker = @0x2;
    let mut scenario = test_scenario::begin(owner);

    // Create registry
    DeepBook::create_global_registry(test_scenario::ctx(&mut scenario));
    test_scenario::next_tx(&mut scenario, owner);
    let mut registry = test_scenario::take_shared<DeepBook::GlobalOrderBookRegistry>(&mut scenario);

    // Create/get order book for KANARI (base) / USDC (quote)
    let _book_addr = DeepBook::get_or_create_order_book_with_decimals<KANARI::KANARI, USDC::USDC>(
        &mut registry,
        30u64, // fee bps = 0.3%
        100u64, // max_depth
        9u8, // base_decimals
        6u8, // quote_decimals
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::next_tx(&mut scenario, owner);

    let mut book = test_scenario::take_shared<DeepBook::OrderBook<KANARI::KANARI, USDC::USDC>>(&mut scenario);

    // Maker places an ask: sell 100 base at price = 2.0 (2 quote per base)
    // Use larger quantities to avoid decimal rounding-to-zero when base/quote decimals differ
    let quantity: u64 = 1000000000u64; // 1e9
    let price: u64 = 2_000_000_000u64; // PRICE_SCALE == 1e9 -> 2.0

    let base_coin = coin::mint_for_testing<KANARI::KANARI>(quantity, test_scenario::ctx(&mut scenario));
    DeepBook::place_ask(&mut book, price, quantity, base_coin, test_scenario::ctx(&mut scenario));

    // Taker prepares exact quote payment and places a bid that fully fills the ask
    let required_quote = DeepBook::calculate_quote_amount_with_decimals(quantity, price, 9u8, 6u8);
    let quote_coin = coin::mint_for_testing<USDC::USDC>(required_quote, test_scenario::ctx(&mut scenario));

    DeepBook::place_bid(&mut book, price, quantity, quote_coin, test_scenario::ctx(&mut scenario));

    // After matching, fees should have been collected in quote balance
    let (fee_base, fee_quote) = DeepBook::get_fee_balances(&book);
    // For this trade, fee = required_quote * fee_bps / 10000
    let expected_fee = ((required_quote as u128) * (30u128)) / 10000u128;
    assert!(fee_quote == (expected_fee as u64) && fee_base == 0u64, 2001);

    // Withdraw fees as admin to taker
    // withdraw_fees requires caller to be admin; the creator is admin by default
    DeepBook::withdraw_fees(&mut registry, &mut book, taker, 0u64, fee_quote, test_scenario::ctx(&mut scenario));

    // After withdraw, fee balance should be zero for quote
    let (_fee_base_after, fee_quote_after) = DeepBook::get_fee_balances(&book);
    assert!(fee_quote_after == 0u64, 2002);

    test_scenario::return_shared(registry);
    test_scenario::return_shared(book);
    test_scenario::end(scenario);
}

#[test]
fun test_eviction_and_depth_limits() {
    let owner = @0x3;
    let mut scenario = test_scenario::begin(owner);

    DeepBook::create_global_registry(test_scenario::ctx(&mut scenario));
    test_scenario::next_tx(&mut scenario, owner);
    let mut registry = test_scenario::take_shared<DeepBook::GlobalOrderBookRegistry>(&mut scenario);

    // Create book with small max_depth to trigger eviction
    let _book_addr = DeepBook::get_or_create_order_book_with_decimals<KANARI::KANARI, USDC::USDC>(
        &mut registry,
        30u64,
        3u64, // small depth
        9u8,
        6u8,
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::next_tx(&mut scenario, owner);
    let mut book = test_scenario::take_shared<DeepBook::OrderBook<KANARI::KANARI, USDC::USDC>>(&mut scenario);

    // Place 3 bids to fill depth (resting orders)
    let price1 = 1_500_000_000u64; // 1.5
    let price2 = 1_400_000_000u64; // 1.4
    let price3 = 1_300_000_000u64; // 1.3
    // use larger qty to avoid rounding-to-zero with 9 vs 6 decimals
    let qty = 1000000000u64; // 1e9

    let q1 = DeepBook::calculate_quote_amount_with_decimals(qty, price1, 9u8, 6u8);
    let q2 = DeepBook::calculate_quote_amount_with_decimals(qty, price2, 9u8, 6u8);
    let q3 = DeepBook::calculate_quote_amount_with_decimals(qty, price3, 9u8, 6u8);

    let coin_q1 = coin::mint_for_testing<USDC::USDC>(q1, test_scenario::ctx(&mut scenario));
    DeepBook::place_bid(&mut book, price1, qty, coin_q1, test_scenario::ctx(&mut scenario));

    let coin_q2 = coin::mint_for_testing<USDC::USDC>(q2, test_scenario::ctx(&mut scenario));
    DeepBook::place_bid(&mut book, price2, qty, coin_q2, test_scenario::ctx(&mut scenario));

    let coin_q3 = coin::mint_for_testing<USDC::USDC>(q3, test_scenario::ctx(&mut scenario));
    DeepBook::place_bid(&mut book, price3, qty, coin_q3, test_scenario::ctx(&mut scenario));

    // Now place a new lower-priority bid that should cause eviction of the worst (lowest) bid
    let price_new = 1_450_000_000u64; // sits between price1 and price2
    let q_new = DeepBook::calculate_quote_amount_with_decimals(qty, price_new, 9u8, 6u8);
    let coin_qnew = coin::mint_for_testing<USDC::USDC>(q_new, test_scenario::ctx(&mut scenario));
    DeepBook::place_bid(&mut book, price_new, qty, coin_qnew, test_scenario::ctx(&mut scenario));

    // After insertion, number of bids should remain equal to max_depth (3)
    let bids_count = DeepBook::get_bid_count(&book);
    assert!(bids_count == 3u64, 3001);

    test_scenario::return_shared(registry);
    test_scenario::return_shared(book);
    test_scenario::end(scenario);
}
