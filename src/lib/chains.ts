// Base chain configuration for prediction markets
export const BASE_CHAIN_ID = 8453;

export function useChainId() {
  return BASE_CHAIN_ID;
}

export function getChainName(chainId: number) {
  return chainId === BASE_CHAIN_ID ? 'Base' : 'Unknown';
}

export const SUPPORTED_CHAINS = [BASE_CHAIN_ID];
