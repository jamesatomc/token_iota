// Contract addresses and configuration
export const CONTRACTS = {
  // Replace with your deployed package ID
  PACKAGE_ID: "0x1b0fae0170d4d81cb152ad4984ef214293a37cc6fafbc519ec80dcab359c2e83",
  
  // Global Pool Registry ID (create once with create_registry function)
  REGISTRY_ID: "0x4c928d5517b756d211b8cfc000dc3dcff8c3023b925547122174f69b2b67ae3d", // Paste your GlobalPoolRegistry object ID here after calling create_registry
  
  // KANARI Token
  KANARI: {
    TREASURY_CAP: "0x595dcaa65c269e1103603823b1e6c47f5f6bae8d3ccdc759a08372eca1057121",
    METADATA: "0xfeeb38436caaa4256242d3da57d481971026cea68e3c8f04ff6d19ff945a256d",
    TYPE: "0x1b0fae0170d4d81cb152ad4984ef214293a37cc6fafbc519ec80dcab359c2e83::kanari::KANARI",
  },
  
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
  KANARI: "kanari",
  DEEPBOOK: "DeepBook",
};

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
  POOL_EXISTS: "pool_exists",
  GET_POOL_ADDRESS: "get_pool_address",
};

// Function names for DeepBook
export const DEEPBOOK_FUNCTIONS = {
  CREATE_ORDER_BOOK: "create_order_book",
  PLACE_BID: "place_bid",
  PLACE_ASK: "place_ask",
  CANCEL_ORDER: "cancel_order",
  GET_BEST_BID: "get_best_bid",
  GET_BEST_ASK: "get_best_ask",
  GET_BOOK_DEPTH: "get_book_depth",
  GET_SPREAD: "get_spread",
  GET_ALL_BIDS: "get_all_bids",
  GET_ALL_ASKS: "get_all_asks",
  GET_BID_COUNT: "get_bid_count",
  GET_ASK_COUNT: "get_ask_count",
  GET_BID_AT: "get_bid_at",
  GET_ASK_AT: "get_ask_at",
  CALCULATE_QUOTE_AMOUNT: "calculate_quote_amount",
  CALCULATE_BASE_AMOUNT: "calculate_base_amount",
};

// DeepBook constants
export const DEEPBOOK = {
  PRICE_SCALE: 1_000_000_000, // 9 decimals for price normalization
  DEFAULT_FEE_BPS: 30, // 0.3% default fee
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
