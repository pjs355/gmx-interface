/**
 * Centralized RPC Configuration for LevelUp Predictions
 * 
 * Note: Both testnet and production use Base Mainnet RPCs
 * (testnet contracts are deployed on Base Mainnet, not a separate testnet)
 */

// =============================================================================
// RPC URLS (same for both environments - all on Base Mainnet)
// =============================================================================
export const RPC_URLS = {
	BASE_INFURA: "https://base-mainnet.infura.io/v3/5b51ad43553b44ffabc2980afa70f7ae",
	BASE_COINBASE: "https://api.developer.coinbase.com/rpc/v1/base/WMQ4Y6b5ZsqmO9MTCfyjZG2aQXG5T1Ih",
	BASE_PUBLIC: "https://mainnet.base.org",
	BASE_PUBLIC_NODE: "https://base-rpc.publicnode.com",
} as const;

// Default RPC URL for Base mainnet (primary)
export const DEFAULT_RPC_URL = RPC_URLS.BASE_COINBASE;

// Fallback RPC URL
export const FALLBACK_RPC_URL = RPC_URLS.BASE_INFURA;

// All available RPC URLs for round-robin/fallback
export const ALL_RPC_URLS = [
	RPC_URLS.BASE_COINBASE,
	RPC_URLS.BASE_INFURA,
	RPC_URLS.BASE_PUBLIC,
	RPC_URLS.BASE_PUBLIC_NODE,
] as const;
