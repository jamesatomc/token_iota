// Contract addresses and configuration
export const CONTRACTS = {
  // Replace with your deployed package ID
  PACKAGE_ID: "0x98ba38ead506c776cd365a70491152d6e4d3f2a5f23275562fc6b05f1e3d0737",
  
  // Global Pool Registry ID (create once with create_registry function in DEX)
  REGISTRY_ID: "0x6cc8edadf3d2156f8560d89b09ecf31d1d13f98daf7179e5ed58efa1f4e68b7a", // Paste your GlobalPoolRegistry object ID here after calling create_registry

  // Global OrderBook Registry ID (create once with create_global_registry function in DeepBook)
  REGISTRY_BOOK_ID: "0xff0483c83be0371db3f0ed3e5634262262e51ee5ee81410a2eb819cf660b4af4", // Paste your GlobalOrderBookRegistry object ID here after calling create_global_registry

  // KANARI Token
  KANARI: {
    TREASURY_CAP: "0xd990397ac5d9119a6bd96e2793f4864efb6050042ef9e25f4ba1c42c5a2a26e1",
    METADATA: "0x96443fd852318f87150e4d20d5d3c1f542ad58662d251a2c4e7f1f7878a75ca2",
    TYPE: "0x98ba38ead506c776cd365a70491152d6e4d3f2a5f23275562fc6b05f1e3d0737::KANARI::KANARI",
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
  GET_MINIMUM_LIQUIDITY: "get_minimum_liquidity",
  GET_BURNED_MINIMUM_LIQUIDITY: "get_burned_minimum_liquidity",
  GET_BURN_RESERVE_ADDRESS: "get_burn_reserve_address",
  GET_RESERVES_U128: "get_reserves_u128",
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
