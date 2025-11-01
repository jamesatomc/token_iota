// Contract addresses and configuration
export const CONTRACTS = {
  // Replace with your deployed package ID
  PACKAGE_ID: "0xc9ed1ab4cae1be9e2757be80ee515cd3d885fd2c1410e3e80dc9bf0d9bcc8c21",
  
  // Global Pool Registry ID (create once with create_registry function in DEX)
  REGISTRY_DEX_ID: "0xa9cda4d05adcf0ce8a4b133d358d1dfca515e05f0fe3db9f540e9b48aa798ca7", // Paste your GlobalPoolRegistry object ID here after calling create_registry

  // Global OrderBook Registry ID (create once with create_global_registry function in DeepBook)
  REGISTRY_BOOK_ID: "0x9ad85e1f9194bced48b562e1b3fd975a2d6fbdc293780a707aae7b902988196d", // Paste your GlobalOrderBookRegistry object ID here after calling create_global_registry

  // KANARI Token
  KANARI: {
    TREASURY_CAP: "0xfc9ad054815c1a1390535308ce5fcbc8300cd9588f3b8d1863732110e8c3f5d0",
    METADATA: "0x77e68e023ba7faa7bc49a8e494bb549b004fd1b9f8677966b2ebf71b4ee77558",
    TYPE: "0xc9ed1ab4cae1be9e2757be80ee515cd3d885fd2c1410e3e80dc9bf0d9bcc8c21::KANARI::KANARI",
  },

    // KANARI Token
  USDC: {
    TREASURY_CAP: "0x3a3fcde956f957c3f8eb4faf6ed78db2718e4794e04bff3346cbef5d0534c7f3",
    METADATA: "0x510bb006b8244d25d0404b24dd09c9a76dae97117712a77b74ea95950ac158ef",
    TYPE: "0xc9ed1ab4cae1be9e2757be80ee515cd3d885fd2c1410e3e80dc9bf0d9bcc8c21::USDC::USDC",
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
  // Example: KANARI uses a path relative to `public/`
  { type: CONTRACTS.KANARI.TYPE, symbol: "KANARI", name: "Kanari Token", decimals: 9, logo: "https://avatars.githubusercontent.com/u/127471673?s=400&u=28db99d5575a4824ce011a32a8dacf729b64ba57&v=4", verified: true },

  // Example: USDC uses a path relative to `public/`
  { type: CONTRACTS.USDC.TYPE, symbol: "USDC", name: "USD Coin", decimals: 6, logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png", verified: true },
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
  
  // Order book creation (with explicit decimals - REQUIRED)
  CREATE_ORDER_BOOK_WITH_DECIMALS: "create_order_book_with_decimals",
  CREATE_ORDER_BOOK_WITH_REGISTRY_WITH_DECIMALS: "create_order_book_with_registry_with_decimals",
  GET_OR_CREATE_WITH_DECIMALS: "get_or_create_order_book_with_decimals",
  
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
