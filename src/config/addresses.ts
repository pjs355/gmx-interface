// Centralized contract addresses for LevelUp Predictions app
// Source of truth: values originally defined in context/UserDataContext.tsx

export const CTF_ADDRESS = "0xd51B2c739eE5Fe24Bd7d958C1EaE65572183530f" as const;
export const USDC_ADDRESS = "0x333C89b2857FA0EE8d9Bcb7328C8672A45637C65" as const; // TestUSDC
export const EXCHANGE_ADDRESS = "0xe29808927bF592e5B3F2068c5D7496C1dfA7dA11" as const; // Exchange

// Fee system contracts (Base Mainnet)
// BUY orders: FeeWrapper pulls USDC from wallet before trade (user signs feeRateBps: 0)
// SELL orders: FeeModule deducts from USDC proceeds after trade (user signs feeRateBps: 200)
export const FEE_WRAPPER_ADDRESS = "0xf4cb13220544e1f151bCb5367Fb0A87e185f78Df" as const;
export const FEE_MODULE_ADDRESS = "0x06d9BF59Bf94Ea43385C7CCAa44F2462649A3983" as const;

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

