// Contract addresses and configuration
export const CONTRACTS = {
  // Replace with your deployed package ID
  PACKAGE_ID: "0xc167714bed231fd49d8cc7538b90e325d7b8d264985f67d7a2ee9080dad637c9",
  
  // Global Pool Registry ID (create once with create_registry function in DEX)
  REGISTRY_DEX_ID: "0x53086b67c1f56dd20313cdbf40068bc9b098cec3dc614a0f04fa266657998a37", // Paste your GlobalPoolRegistry object ID here after calling create_registry

  // Global OrderBook Registry ID (create once with create_global_registry function in DeepBook)
  REGISTRY_BOOK_ID: "0x1f68de7a3fe6deb5a0da34f16f7dd5058bc43a1a5b8c62373318ffaa17fb1f46", // Paste your GlobalOrderBookRegistry object ID here after calling create_global_registry

  // // KANARI Token
  // KANARI: {
  //   TREASURY_CAP: "0xade03531fb4f969da74f6ed3d2008d4db6f1e1677930f066abcaf4d5a4d3d28c",
  //   METADATA: "0x9ff3d7efc1ad6b5d5f622e43dc5111bc8458e11af23d963f01a05438e3ab84d8",
  //   TYPE: "0x56a20683946c17b80a5260ea8b5eac74c595e0615fe249364f1480dff04cb74f::KANARI::KANARI",
  // },

  //   // KANARI Token
  // USDC: {
  //   TREASURY_CAP: "0xf32c14f7ab0a55c4ae5a11c084aa74dcb78d20a2d58c8b833ac2e74162201c6a",
  //   METADATA: "0xb160c595c672a5e00ad5451b66e02485a4e1f31a2ee1f0477192c83bfdf6484a",
  //   TYPE: "0x56a20683946c17b80a5260ea8b5eac74c595e0615fe249364f1480dff04cb74f::USDC::USDC",
  // },
  
  
  // IOTA Token
  IOTA: {
    TYPE: "0x2::iota::IOTA",
  },
  
  // Fee tiers
  FEE_LOW: 10,    // 0.1%
  FEE_MED: 50,    // 0.5%
  FEE_HIGH: 100,  // 1.0%
  BASIS_POINTS: 10000,
};

// Module names
export const MODULES = {
  DEX: "DEX",
  DEX_FACTORY: "DEXFactory",
  USDC: "USDC",
  KANARI: "KANARI",
  DEEPBOOK: "DeepBook",
  PRICE_ORACLE: "PriceOracle",
};

// Shared TokenItem type and default token list used across the UI
export type TokenItem = {
  type: string;
  symbol: string;
  name?: string;
  decimals?: number;
  // Optional path or URL to logo. Can be a path relative to public/ (e.g. '/logos/kanari.svg')
  // or an absolute URL (e.g. 'https://example.com/logo.png').
  logo?: string;
  // Optional verified flag shown in UI
  verified?: boolean;
};

// Default tokens shown in selectors (can be extended by TokenManager/custom tokens)
export const DEFAULT_TOKENS: TokenItem[] = [
  // // Example: KANARI uses a path relative to `public/`
  // { type: CONTRACTS.KANARI.TYPE, symbol: "KANARI", name: "Kanari Token", decimals: 9, logo: "https://avatars.githubusercontent.com/u/127471673?s=400&u=28db99d5575a4824ce011a32a8dacf729b64ba57&v=4", verified: true },

  // // Example: USDC uses a path relative to `public/`
  // { type: CONTRACTS.USDC.TYPE, symbol: "USDC", name: "USD Coin", decimals: 6, logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png", verified: true },
  // Example: IOTA uses an absolute URL to demonstrate external logo hosting
  { type: CONTRACTS.IOTA.TYPE, symbol: "IOTA", name: "IOTA", decimals: 9, logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/1720.png", verified: true },
];

// Function names for DEX
export const DEX_FUNCTIONS = {
  CREATE_REGISTRY: "create_registry",
  CREATE_POOL: "create_pool",
  ADD_LIQUIDITY: "add_liquidity",
  REMOVE_LIQUIDITY: "remove_liquidity",
  SWAP_X_TO_Y: "swap_x_to_y",
  SWAP_Y_TO_X: "swap_y_to_x",
  GET_RESERVES: "get_reserves",
  GET_LP_SUPPLY: "get_lp_supply",
  GET_FEE: "get_fee",
  GET_AMOUNT_OUT: "get_amount_out",
  GET_MINIMUM_LIQUIDITY: "get_minimum_liquidity",
  GET_BURNED_MINIMUM_LIQUIDITY: "get_burned_minimum_liquidity",
  GET_BURN_RESERVE_ADDRESS: "get_burn_reserve_address",
  GET_BURN_RESERVE: "get_burn_reserve",
  GET_RESERVES_U128: "get_reserves_u128",
  POOL_EXISTS: "pool_exists",
  GET_POOL_ADDRESS: "get_pool_address",
};

// PriceOracle helper names
export const ORACLE_FUNCTIONS = {
  CREATE_ORACLE: "create_oracle",
  UPDATE_ORACLE: "update_oracle",
  GET_TWAP_PRICE_AT_TIME: "get_twap_price_at_time",
};

// Function names for DeepBook
export const DEEPBOOK_FUNCTIONS = {
  // // Registry creation
  // CREATE_GLOBAL_REGISTRY: "create_global_registry",
  
  // Order book creation (with explicit decimals - REQUIRED)
  CREATE_ORDER_BOOK_WITH_DECIMALS: "create_order_book_with_decimals",
  CREATE_ORDER_BOOK_WITH_REGISTRY_WITH_DECIMALS: "create_order_book_with_registry_with_decimals",
  GET_OR_CREATE_WITH_DECIMALS: "get_or_create_order_book_with_decimals",
  
  // Order placement and management
  PLACE_BID: "place_bid",
  PLACE_ASK: "place_ask",
  CANCEL_ORDER: "cancel_order",
  
  // Registry queries
  BOOK_EXISTS: "book_exists",
  GET_BOOK_ADDRESS: "get_book_address",
  
  // Order book view functions
  // GET_BEST_BID: "get_best_bid",
  // GET_BEST_ASK: "get_best_ask",
  // GET_SPREAD: "get_spread",
  // GET_BID_COUNT: "get_bid_count",
  // GET_ASK_COUNT: "get_ask_count",
  // GET_MAX_DEPTH: "get_max_depth",
  // GET_BOOK_DEPTH: "get_book_depth",
  // GET_FEE_BALANCES: "get_fee_balances",
  // GET_LOCKED_BALANCES: "get_locked_balances",
  // GET_ALL_BIDS: "get_all_bids",
  // GET_ALL_ASKS: "get_all_asks",
  // GET_BID_AT: "get_bid_at",
  // GET_ASK_AT: "get_ask_at",
  // GET_BID_LOCKED_AMOUNT_AT: "get_bid_locked_amount_at",
  // GET_ASK_LOCKED_AMOUNT_AT: "get_ask_locked_amount_at",
  // GET_BID_ID_AT: "get_bid_id_at",
  // GET_ASK_ID_AT: "get_ask_id_at",
  
  // // Calculation helpers
  // CALCULATE_QUOTE_AMOUNT: "calculate_quote_amount",
  // CALCULATE_BASE_AMOUNT: "calculate_base_amount",
  // CALCULATE_QUOTE_AMOUNT_WITH_DECIMALS: "calculate_quote_amount_with_decimals",
  // CALCULATE_BASE_AMOUNT_WITH_DECIMALS: "calculate_base_amount_with_decimals",
  
  // // Test helpers
  // VALIDATE_QUOTE_CAPACITY: "validate_quote_capacity",
  // CHECK_REFUND_OVERFLOW: "check_refund_overflow",
  
  // Admin functions (registry-based)
  GET_BOOK_ADMIN: "get_book_admin",
  SET_BOOK_ADMIN: "set_book_admin",
  WITHDRAW_FEES: "withdraw_fees",
  
  // // Helper functions
  // COMPARE_VECTORS: "compare_vectors",
  // POW10_U128: "pow10_u128",
};

// DeepBook constants
export const DEEPBOOK = {
  PRICE_SCALE: 1_000_000_000, // 9 decimals for price normalization
  DEFAULT_FEE_BPS: 10, // 0.1% default fee
  MAX_DEPTH: 1000, // Maximum order book depth
  // IMPORTANT: All order book creation functions now REQUIRE explicit decimals!
  // Use token-specific decimals (e.g., KANARI=9, USDC=6, IOTA=9)
  // NO default decimals - prevents mismatched decimal bugs
};

// Helper to format amounts
export const formatAmount = (amount: bigint | number, decimals: number = 9): string => {
  const value = typeof amount === 'bigint' ? Number(amount) : amount;
  return (value / Math.pow(10, decimals)).toFixed(decimals);
};

// Helper to parse amounts
export const parseAmount = (amount: string, decimals: number = 9): string => {
  return (parseFloat(amount) * Math.pow(10, decimals)).toFixed(0);
};

// Frontend utility: compute active LP supply (total supply minus reserved MINIMUM_LIQUIDITY)
export const computeActiveLpSupply = (totalLp: bigint | number, reserved: bigint | number): bigint => {
  const total = typeof totalLp === 'bigint' ? totalLp : BigInt(Math.floor(Number(totalLp)));
  const res = typeof reserved === 'bigint' ? reserved : BigInt(Math.floor(Number(reserved)));
  if (total <= res) return BigInt(0);
  return total - res;
};

// Compute user share of active supply as a floating percentage (0-100)
export const computeUserSharePercent = (userLp: bigint | number, totalLp: bigint | number, reserved: bigint | number): number => {
  const active = computeActiveLpSupply(totalLp, reserved);
  const user = typeof userLp === 'bigint' ? userLp : BigInt(Math.floor(Number(userLp)));
  if (active === BigInt(0)) return 0;
  // convert to number safely for percentage; this may lose precision for extremely large values
  const userNum = Number(user);
  const activeNum = Number(active);
  return (userNum / activeNum) * 100;
};
