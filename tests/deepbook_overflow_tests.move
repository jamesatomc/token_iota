#[test_only]
module kanari_network::deepbook_overflow_tests;

use kanari_network::DeepBook;

/// Pure arithmetic checks to demonstrate edge cases that the matching logic now defends against.
#[test]
fun test_trade_value_can_round_to_zero() {
    // Choose parameters that produce a zero trade value due to integer division.
    let matched: u64 = 1u64;
    let price: u64 = 1u64; // very small normalized price
    let base_decimals: u8 = 18u8;
    let quote_decimals: u8 = 6u8;

    let matched_u128 = matched as u128;
    let price_u128 = price as u128;
    let trade_value_u128 = (matched_u128 * price_u128 * DeepBook::pow10_u128(quote_decimals)) / (1000000000u128 * DeepBook::pow10_u128(base_decimals));

    // Expect zero due to scaling mismatch
    assert!(trade_value_u128 == 0u128, 1);
}

#[test]
fun test_refund_quote_overflow_detected() {
    // Choose values that cause the refund calculation to exceed U64_MAX
    let unmatched: u128 = 2_000_000u128; // large unmatched quantity
    let price: u128 = 10_000_000_000_000u128; // large price
    let quote_decimals: u8 = 9u8;
    let base_decimals: u8 = 0u8;

    let refund_quote_u128 = (unmatched * price * DeepBook::pow10_u128(quote_decimals)) / (1000000000u128 * DeepBook::pow10_u128(base_decimals));

    // This should be greater than U64_MAX for the chosen parameters
    assert!(refund_quote_u128 > 18446744073709551615u128, 2);
}
