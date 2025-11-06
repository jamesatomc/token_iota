module 0x1::pow10_tests {
    use kanari_network::DeepBook;

    #[test]
    public fun test_pow10_small() {
        let a = DeepBook::pow10_u128(0u8);
        assert!(a == 1u128, 1);

        let b = DeepBook::pow10_u128(1u8);
        assert!(b == 10u128, 2);

        let c = DeepBook::pow10_u128(9u8);
        assert!(c == 1000000000u128, 3);
    }

    #[test]
    public fun test_pow10_medium() {
        let v = DeepBook::pow10_u128(18u8);
        // 10^18
        let expected = 1000000000000000000u128;
        assert!(v == expected, 4);
    }

    #[test]
    public fun test_pow10_overflow_guard() {
        // Ensure function still computes for larger exponents within u128 range
        let v = DeepBook::pow10_u128(38u8);
        // 10^38 fits in u128 (<= 10^38 < 2^128)
        // Basic sanity: value > 0
        assert!(v > 0u128, 5);
    }

    #[test]
    public fun test_pow10_max_exact() {
        // Verify the maximum exponent where 10^n < 2^128 (n = 38) matches the expected constant
        let max = DeepBook::pow10_u128(38u8);
        let expected = 100000000000000000000000000000000000000u128;
        assert!(max == expected, 6);
    }

    #[test]
    public fun test_pow10_property_range() {
        // Property: for 0 <= n < 38, pow10(n+1) == pow10(n) * 10
        let mut n = 0u8;
        while (n < 38u8) {
            let a = DeepBook::pow10_u128(n);
            let b = DeepBook::pow10_u128(n + 1u8);
            assert!(b == a * 10u128, 7);
            n = n + 1u8;
        };
    }
}
