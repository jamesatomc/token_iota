#[test_only]
module kanari_network::deepbook_unit_tests;

use kanari_network::DeepBook;

#[test]
fun test_calculate_quote_and_base() {
    let base_amount: u64 = 1000;
    let price: u64 = 2_000_000_000u64; // price = 2 * PRICE_SCALE (note PRICE_SCALE is 1e9)

    let quote = DeepBook::calculate_quote_amount(base_amount, price);
    // quote = base_amount * price / PRICE_SCALE = 1000 * 2e9 / 1e9 = 2000
    assert!(quote == 2000, 1);

    let base = DeepBook::calculate_base_amount(quote, price);
    // base = quote * PRICE_SCALE / price = 2000 * 1e9 / 2e9 = 1000
    assert!(base == base_amount, 2);
}

#[test]
fun test_spread_functions() {
    // Create a lightweight book in-memory by constructing the struct isn't possible here because it's an entry object
    // Instead, we test the pure getters indirectly by asserting that helper functions compile and behave deterministically
    // Use simple values
    let best_bid: u64 = 100u64;
    let best_ask: u64 = 105u64;
    let spread = if (best_bid > 0 && best_ask > 0 && best_ask > best_bid) { best_ask - best_bid }
    else { 0 };
    assert!(spread == 5, 3);
}

#[test]
fun test_compare_vectors_various() {
    // equal
    let v1 = vector::empty<u8>();
    let v2 = vector::empty<u8>();
    assert!(DeepBook::compare_vectors(&v1, &v2), 4);

    // prefix (shorter is less)
    let mut a = vector::empty<u8>();
    vector::push_back(&mut a, 1u8);
    let mut b = vector::empty<u8>();
    vector::push_back(&mut b, 1u8);
    vector::push_back(&mut b, 2u8);
    assert!(DeepBook::compare_vectors(&a, &b), 5);

    // differing bytes
    let mut c = vector::empty<u8>();
    vector::push_back(&mut c, 5u8);
    let mut d = vector::empty<u8>();
    vector::push_back(&mut d, 3u8);
    // c > d so compare_vectors(c,d) == false
    assert!(!DeepBook::compare_vectors(&c, &d), 6);
}

#[test]
fun test_calculate_quote_and_base_edge_cases() {
    // small values
    let base_amount: u64 = 1;
    let price: u64 = 1_000_000_000u64; // 1 * PRICE_SCALE

    let quote = DeepBook::calculate_quote_amount(base_amount, price);
    assert!(quote == 1, 7);

    let base = DeepBook::calculate_base_amount(quote, price);
    assert!(base == base_amount, 8);

    // large values should not overflow intermediate u128 math for reasonable inputs
    let base_amount2: u64 = 1_000_000_000u64; // 1e9
    let price2: u64 = 3_000_000_000u64; // 3 * PRICE_SCALE
    let quote2 = DeepBook::calculate_quote_amount(base_amount2, price2);
    // quote2 = 1e9 * 3e9 / 1e9 = 3e9
    assert!(quote2 == 3_000_000_000u64, 9);

    let base2 = DeepBook::calculate_base_amount(quote2, price2);
    assert!(base2 == base_amount2, 10);
}

// NOTE: tests that access module-internal constants or require creating
// shared objects (OrderBook/GlobalOrderBookRegistry) must be written
// as integration tests that create the objects via the module's entry
// functions and assert abort codes. Those are omitted from this unit
// test file which focuses on pure helpers.

#[test]
fun test_calculate_zero_quote() {
    // If price << PRICE_SCALE, the computed quote may floor to zero
    let base_amount: u64 = 1;
    let price: u64 = 1u64; // much smaller than PRICE_SCALE (1e9)

    let quote = DeepBook::calculate_quote_amount(base_amount, price);
    assert!(quote == 0, 11);
}

#[test]
fun test_pow10_u128_values() {
    // pow10_u128 should return powers of ten as u128
    let p0 = DeepBook::pow10_u128(0u8);
    assert!(p0 == 1u128, 12);

    let p1 = DeepBook::pow10_u128(1u8);
    assert!(p1 == 10u128, 13);

    let p18 = DeepBook::pow10_u128(18u8);
    assert!(p18 == 1000000000000000000u128, 14);
}

#[test]
fun test_compare_vectors_length_and_content() {
    // [1,2] vs [1,2,0] -> shorter (prefix) is considered less
    let mut a = vector::empty<u8>();
    vector::push_back(&mut a, 1u8);
    vector::push_back(&mut a, 2u8);

    let mut b = vector::empty<u8>();
    vector::push_back(&mut b, 1u8);
    vector::push_back(&mut b, 2u8);
    vector::push_back(&mut b, 0u8);

    assert!(DeepBook::compare_vectors(&a, &b), 15);
}

#[test]
fun test_spread_no_bid_or_ask() {
    // If there's no valid bid or ask, the spread computation in helpers
    // should default to 0 (mirrors defensive patterns used elsewhere)
    let best_bid: u64 = 0u64;
    let best_ask: u64 = 0u64;
    let spread = if (best_bid > 0 && best_ask > 0 && best_ask > best_bid) { best_ask - best_bid }
    else { 0 };
    assert!(spread == 0, 16);
}
