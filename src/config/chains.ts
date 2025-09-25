import sample from "lodash/sample";

// Base chain only - prediction markets
export const BASE = 8453;
export const SUPPORTED_CHAIN_IDS = [BASE];

export function getChainName(_chainId?: number): string {
  return "Base"; // Only Base supported
}

export const CHAIN_NAMES_MAP: Record<number, string> = {
  [BASE]: "Base",
};

// Removed parseEther - not used

// Removed ENV_BASE_RPC_URLS - using hardcoded RPC providers

// Default chain for prediction markets
export const DEFAULT_CHAIN_ID = BASE;
export const CHAIN_ID = DEFAULT_CHAIN_ID;

export const IS_NETWORK_DISABLED: Record<number, boolean> = {
  [BASE]: false,
};

// Base chain constants only
const constants = {
  nativeTokenSymbol: "ETH",
  wrappedTokenSymbol: "WETH", 
  defaultCollateralSymbol: "USDC",
};

// Simplified RPC providers for Base chain
export const RPC_PROVIDERS: Record<number, string[]> = {
  [BASE]: [
    "https://mainnet.base.org",
    "https://base-rpc.publicnode.com",
  ],
};

export const FALLBACK_PROVIDERS: Record<number, string[]> = {
  [BASE]: ["https://mainnet.base.org"],
};

export const getConstant = (_chainId: number, key: string) => {
  // Only Base supported, ignore chainId
  if (!(key in constants)) {
    throw new Error(`Key ${key} does not exist`);
  }
  return constants[key as keyof typeof constants];
};

export function getFallbackRpcUrl(_chainId: number): string {
  return sample(FALLBACK_PROVIDERS[BASE])!; // Only Base supported
}

export function getExplorerUrl(_chainId: number): string {
  return "https://basescan.org/"; // Only Base supported
}

export function getTokenExplorerUrl(chainId: number, tokenAddress: string) {
  return `${getExplorerUrl(chainId)}token/${tokenAddress}`;
}
