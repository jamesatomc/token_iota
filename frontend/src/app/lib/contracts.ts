// Contract addresses and configuration
export const CONTRACTS = {
  // Replace with your deployed package ID
  PACKAGE_ID: "0xe5699c0b8ba890ee2e4300e3ac9ca0bfe232c1faad0d3bf6d0043f980cafdcc6",
  
  // KANARI Token
  KANARI: {
    TREASURY_CAP: "0x49cc9e9f52c1184620785abe5eba1682c8bb17d8023a849fe39336cafe9b55c7",
    METADATA: "0x155d24533afc38ba42254ee9bc5cfc85fbebdd12a9376a5c789580e292aa4277",
    TYPE: "0xe5699c0b8ba890ee2e4300e3ac9ca0bfe232c1faad0d3bf6d0043f980cafdcc6::kanari::KANARI",
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
  KANARI: "kanari",
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

// Helper to format amounts
export const formatAmount = (amount: bigint | number, decimals: number = 9): string => {
  const value = typeof amount === 'bigint' ? Number(amount) : amount;
  return (value / Math.pow(10, decimals)).toFixed(decimals);
};

// Helper to parse amounts
export const parseAmount = (amount: string, decimals: number = 9): string => {
  return (parseFloat(amount) * Math.pow(10, decimals)).toFixed(0);
};
