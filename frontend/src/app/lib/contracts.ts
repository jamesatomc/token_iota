// Contract addresses and configuration
export const CONTRACTS = {
  // Replace with your deployed package ID
  PACKAGE_ID: "0x365d048bce7d1984f5877632fe63695d44cf5eb56cf3e4085d9c6b20c9270b97",
  
  // Global Pool Registry ID (create once with create_registry function in DEX)
  REGISTRY_ID: "0x1f5d768ea83a87167057720503758676e48d5208596aab69af0fbb2113b6ef24", // Paste your GlobalPoolRegistry object ID here after calling create_registry

  // Global OrderBook Registry ID (create once with create_global_registry function in DeepBook)
  REGISTRY_BOOK_ID: "0x0daedd92736893213e895d660dc1300ec85ab35557f09e4a6764430f80c51fe0", // Paste your GlobalOrderBookRegistry object ID here after calling create_global_registry

  // KANARI Token
  KANARI: {
    TREASURY_CAP: "0xb5ab540ee10d7fb67a41b242effc6090d8b5d5d6349f8241a216acfd686d070b",
    METADATA: "0x724695595eafbb4a8afb81af6c99b677179288d64298ed417b9acdbd51ec942e",
    TYPE: "0x365d048bce7d1984f5877632fe63695d44cf5eb56cf3e4085d9c6b20c9270b97::kanari::KANARI",
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
  PRICE_ORACLE: "PriceOracle",
};

// Shared TokenItem type and default token list used across the UI
export type TokenItem = {
  type: string;
  symbol: string;
  name?: string;
  decimals?: number;
};

// Default tokens shown in selectors (can be extended by TokenManager/custom tokens)
export const DEFAULT_TOKENS: TokenItem[] = [
  { type: CONTRACTS.KANARI.TYPE, symbol: "KANARI", name: "Kanari Token", decimals: 9 },
  { type: CONTRACTS.IOTA.TYPE, symbol: "IOTA", name: "IOTA", decimals: 9 },
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
  // Registry management
  CREATE_GLOBAL_REGISTRY: "create_global_registry",
  
  // Order book creation
  CREATE_ORDER_BOOK: "create_order_book",
  CREATE_ORDER_BOOK_WITH_REGISTRY: "create_order_book_with_registry",
  GET_OR_CREATE: "get_or_create_order_book",
  
  // Order book queries
  BOOK_EXISTS: "book_exists",
  GET_BOOK_ADDRESS: "get_book_address",
  
  // Order placement
  PLACE_BID: "place_bid",
  PLACE_ASK: "place_ask",
  CANCEL_ORDER: "cancel_order",
  
  // Market data
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
  
  // Calculations
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
