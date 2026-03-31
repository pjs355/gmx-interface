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
	POLYGON_PUBLIC_NODE: "https://polygon-bor-rpc.publicnode.com",
	BSC_PUBLIC_NODE: "https://bsc-rpc.publicnode.com",
} as const;

// Default RPC URL for Base mainnet (primary)
export const DEFAULT_RPC_URL = RPC_URLS.BASE_COINBASE;

// Fallback RPC URL
export const FALLBACK_RPC_URL = RPC_URLS.BASE_INFURA;

/**
 * Polygon mainnet RPC (Polymarket Safe reads, bridge balances, LI.FI allowance checks on Polygon).
 * Set `VITE_POLYGON_RPC_URL` in `.env` to use Infura/Alchemy/etc.; otherwise uses the public node below.
 */
const vitePolygonRpc =
	typeof import.meta.env !== "undefined" &&
	typeof import.meta.env.VITE_POLYGON_RPC_URL === "string" &&
	import.meta.env.VITE_POLYGON_RPC_URL.trim() !== ""
		? import.meta.env.VITE_POLYGON_RPC_URL.trim()
		: null;

export const POLYGON_RPC_URL = vitePolygonRpc ?? RPC_URLS.POLYGON_PUBLIC_NODE;

const viteBscRpc =
	typeof import.meta.env !== "undefined" &&
	typeof import.meta.env.VITE_BSC_RPC_URL === "string" &&
	import.meta.env.VITE_BSC_RPC_URL.trim() !== ""
		? import.meta.env.VITE_BSC_RPC_URL.trim()
		: null;

/** BNB Smart Chain — LI.FI allowance reads, bridge BNB balance */
export const BSC_RPC_URL = viteBscRpc ?? RPC_URLS.BSC_PUBLIC_NODE;

// All available Base RPC URLs for round-robin/fallback
export const ALL_RPC_URLS = [
	RPC_URLS.BASE_COINBASE,
	RPC_URLS.BASE_INFURA,
	RPC_URLS.BASE_PUBLIC,
	RPC_URLS.BASE_PUBLIC_NODE,
] as const;
