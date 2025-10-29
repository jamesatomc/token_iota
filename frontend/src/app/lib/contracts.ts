// Contract addresses and configuration
export const CONTRACTS = {
  // Replace with your deployed package ID
  PACKAGE_ID: "0xbe8689e72a8634bef82a833d327938e04c47816a818b0c1ec1a6e46a81c6e13b",
  
  // Global Pool Registry ID (create once with create_registry function)
  REGISTRY_ID: "0xc402659c50b4c88e33a936660150f0eebf37824ff1d8eadf9437199e24bb1aaf", // Paste your GlobalPoolRegistry object ID here after calling create_registry
  
  // KANARI Token
  KANARI: {
    TREASURY_CAP: "0x0cd14c63bf8ff03154bb35d87c791ffec34d4d9b12e059c70003e368891441a9",
    METADATA: "0x342c27da6354885413c946a07a24c93e90494f51587ff5e74ffc1b9aeca3d92d",
    TYPE: "0xbe8689e72a8634bef82a833d327938e04c47816a818b0c1ec1a6e46a81c6e13b::kanari::KANARI",
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
  // Optional UI page password (leave empty to disable)
  POOL_INFO_PASSWORD: "123456",
};

// Module names
export const MODULES = {
  DEX: "DEX",
  DEX_FACTORY: "DEXFactory",
  KANARI: "kanari",
  DEEPBOOK: "DeepBook",
  PRICE_ORACLE: "PriceOracle",
};

// Shared TokenItem type and default token list used across the UI
export type TokenItem = {
  type: string;
  symbol: string;
  name?: string;
};

// Default tokens shown in selectors (can be extended by TokenManager/custom tokens)
export const DEFAULT_TOKENS: TokenItem[] = [
  { type: CONTRACTS.KANARI.TYPE, symbol: "KANARI", name: "Kanari Token" },
  { type: CONTRACTS.IOTA.TYPE, symbol: "IOTA", name: "IOTA" },
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
  POOL_EXISTS: "pool_exists",
  GET_POOL_ADDRESS: "get_pool_address",
  // Oracle-related (PriceOracle module exposes these via DEXFactory entry wrappers)
  CREATE_ORACLE: "create_oracle",
  UPDATE_ORACLE: "update_oracle",
  GET_TWAP: "get_twap_price",
};

// PriceOracle helper names
export const ORACLE_FUNCTIONS = {
  CREATE_ORACLE: "create_oracle",
  UPDATE_ORACLE: "update_oracle",
  GET_TWAP: "get_twap_price",
  GET_TWAP_AT_TIME: "get_twap_price_at_time",
  GET_OBSERVATION_COUNT: "get_observation_count",
};

// Function names for DeepBook
export const DEEPBOOK_FUNCTIONS = {
  CREATE_ORDER_BOOK: "create_order_book",
  PLACE_BID: "place_bid",
  PLACE_ASK: "place_ask",
  CANCEL_ORDER: "cancel_order",
  GET_BEST_BID: "get_best_bid",
  GET_BEST_ASK: "get_best_ask",
  GET_MAX_DEPTH: "get_max_depth",
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
