#[test_only]
module kanari_network::dex_unit_tests;

use kanari_network::DEX;

#[test]
fun test_calculate_swap_output_basic() {
    // amount_in = 1000, balance_in = 10000, balance_out = 20000, fee_bps = 50 (0.5%)
    // expected calculation (using the same formula in the module):
    // amount_in_with_fee = 1000 * (10000 - 50) = 1000 * 9950 = 9_950_000
    // numerator = 9_950_000 * 20000 = 199_000_000_000
    // denominator = 10000 * 10000 + 9_950_000 = 100_000_000 + 9_950_000 = 109_950_000
    // result = floor(199_000_000_000 / 109_950_000) = 1809

    let out = DEX::calculate_swap_output(1000u64, 10000u64, 20000u64, 50u64);
    assert!(out == 1809u64, 1);
}

#[test]
fun test_calculate_swap_output_zero() {
    let out = DEX::calculate_swap_output(0u64, 10000u64, 20000u64, 50u64);
    assert!(out == 0u64, 2);
}

#[test]
fun test_compare_vectors_various() {
    // equal
    let v1 = vector::empty<u8>();
    let v2 = vector::empty<u8>();
    assert!(DEX::compare_vectors(&v1, &v2), 3);

    // prefix (shorter is less)
    let mut a = vector::empty<u8>();
    vector::push_back(&mut a, 1u8);
    let mut b = vector::empty<u8>();
    vector::push_back(&mut b, 1u8);
    vector::push_back(&mut b, 2u8);
    assert!(DEX::compare_vectors(&a, &b), 4);

    // differing bytes
    let mut c = vector::empty<u8>();
    vector::push_back(&mut c, 5u8);
    let mut d = vector::empty<u8>();
    vector::push_back(&mut d, 3u8);
    // c > d so compare_vectors(c,d) == false
    assert!(!DEX::compare_vectors(&c, &d), 5);
}

#[test]
fun test_calculate_swap_output_large_values() {
    // Test with large values to ensure u128 handling works
    let out = DEX::calculate_swap_output(
        1_000_000_000u64, // 1B input
        10_000_000_000u64, // 10B reserve_in
        5_000_000_000u64, // 5B reserve_out
        30u64, // 0.3% fee (30 bps)
    );
    // Verify it doesn't panic and returns a positive value
    assert!(out > 0u64, 6);
}
