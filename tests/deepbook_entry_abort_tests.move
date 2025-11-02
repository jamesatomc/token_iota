#[test_only]
module kanari_network::deepbook_entry_abort_tests;

use kanari_network::DeepBook;
// use iota::test_scenario;

// Expect placing a bid that would round the required quote to zero to abort with E_INSUFFICIENT_LIQUIDITY
#[allow(unused_mut_ref)]
#[test, expected_failure(abort_code = ::kanari_network::DeepBook::E_INSUFFICIENT_LIQUIDITY)]
fun test_place_bid_rounds_to_zero_aborts() {
    // Call the module's public arithmetic precheck directly. This avoids needing
    // to construct Coins or shared OrderBook objects in the harness.
    DeepBook::validate_quote_capacity(1u64, 1u64, 6u8, 6u8);
}

// Expect cancelling an artificially-inserted huge order to abort with E_OVERFLOW
#[allow(unused_mut_ref)]
#[test, expected_failure(abort_code = ::kanari_network::DeepBook::E_OVERFLOW)]
fun test_cancel_order_overflow_aborts() {
    // Use the module's arithmetic helper to provoke the same overflow check
    // used by eviction/cancel refund logic.
    let unmatched: u128 = 2_000_000u128;
    let price: u128 = 10_000_000_000_000u128;
    DeepBook::check_refund_overflow(unmatched, price, 0u8, 9u8);
}
