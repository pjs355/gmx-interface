// Centralized contract addresses for LevelUp Predictions app
// Source of truth: values originally defined in context/UserDataContext.tsx

export const CTF_ADDRESS = "0x60Fb7481137012eA9001812f29BB4C269d8912ec" as const;
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const; // TestUSDC
export const EXCHANGE_ADDRESS = "0x3450441E32bE06b89A6177a71514897193a4592e" as const; // Exchange

// Fee system contracts (Base Mainnet)
// BUY orders: FeeWrapper pulls USDC from wallet before trade (user signs feeRateBps: 0)
// SELL orders: FeeModule deducts from USDC proceeds after trade (user signs feeRateBps: 200)
export const FEE_WRAPPER_ADDRESS = "0x5B4D8130ec877595Dc4dFF043feEe1031Ede60c4" as const;
export const FEE_MODULE_ADDRESS = "0x93F750BEf2a0Bf8512c6618a6dc59110B541dBB9" as const;

// Fee rate constants
export const FEE_RATE_BPS = 200; // 2% = 200 basis points (for SELL orders)
export const FEE_RATE_DECIMAL = 0.02; // 2% as decimal

export const ADDRESSES = {
  CTF_ADDRESS,
  USDC_ADDRESS,
  EXCHANGE_ADDRESS,
  FEE_WRAPPER_ADDRESS,
  FEE_MODULE_ADDRESS,
} as const;

export type AddressKeys = keyof typeof ADDRESSES;

