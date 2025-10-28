// Contract addresses and configuration
export const CONTRACTS = {
  // Replace with your deployed package ID
  PACKAGE_ID: "0xaedb81c889c55fdc1279979838cd80917e5d4579148e4844dbc04215bf01bdfb",
  
  // KANARI Token
  KANARI: {
    TREASURY_CAP: "0x9ac8e54cd1f3cbe6310b9f5eff20a5ce08d261f232c08e62f83755134dde1ea4",
    METADATA: "0xad79e99b4e294f202b8977aa9b300075405d3648cfde87f1b69f250e83f35efb",
    TYPE: "0xaedb81c889c55fdc1279979838cd80917e5d4579148e4844dbc04215bf01bdfb::kanari::KANARI",
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
  CREATE_POOL: "create_pool",
  ADD_LIQUIDITY: "add_liquidity",
  REMOVE_LIQUIDITY: "remove_liquidity",
  SWAP_X_TO_Y: "swap_x_to_y",
  SWAP_Y_TO_X: "swap_y_to_x",
  GET_RESERVES: "get_reserves",
  GET_LP_SUPPLY: "get_lp_supply",
  GET_FEE: "get_fee",
  GET_AMOUNT_OUT: "get_amount_out",
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
