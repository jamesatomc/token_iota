// Contract addresses and configuration
export const CONTRACTS = {
  // Replace with your deployed package ID
  PACKAGE_ID: "0xea1dd0a8298453ebabf41c8812528d196d7de8e814771ed999ae5de8f617f6a8",
  
  // KANARI Token
  KANARI: {
    TREASURY_CAP: "0x54863fa8d09a9c99182794854ef9afc2ad283f866459152e800826bf3cc1d255",
    METADATA: "0x9c3bb41bdb28d2622c1ca21db766961205d25557eb45427556dd7ad6d48dd41b",
    TYPE: "0xea1dd0a8298453ebabf41c8812528d196d7de8e814771ed999ae5de8f617f6a8::kanari::KANARI",
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
