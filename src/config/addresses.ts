// Centralized contract addresses for LevelUp Predictions app
// Source of truth: values originally defined in context/UserDataContext.tsx

export const CTF_ADDRESS = "0xd51B2c739eE5Fe24Bd7d958C1EaE65572183530f" as const;
export const USDC_ADDRESS = "0x333C89b2857FA0EE8d9Bcb7328C8672A45637C65" as const; // TestUSDC
export const EXCHANGE_ADDRESS = "0x40fdD2b575b3CF3dF64eA6B43C3C47E1eC2fbf03" as const; // Exchange

export const ADDRESSES = {
  CTF_ADDRESS,
  USDC_ADDRESS,
  EXCHANGE_ADDRESS,
} as const;

export type AddressKeys = keyof typeof ADDRESSES;

