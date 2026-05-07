/// <reference types="vite/client" />

declare module "*.po" {
	export const messages: Record<string, string>;
}

interface ImportMetaEnv {
	/** Optional Polygon mainnet JSON-RPC URL (Infura, Alchemy, etc.); falls back to a public node */
	readonly VITE_POLYGON_RPC_URL?: string;
	/** Optional extra Polygon JSON-RPC URLs (comma/space separated); tried after `VITE_POLYGON_RPC_URL` / default. */
	readonly VITE_POLYGON_RPC_FALLBACK_URLS?: string;
	/**
	 * Optional public prediction API base (umbrellas, markets, tags, multiplex orderbook WS `/ws`).
	 * When set, orderbook REST (`getOrderbookApiBaseUrl`) and matched-markets / venue-prices URLs align to this host
	 * unless `VITE_ODDS_WS_BASE` overrides the venue WebSocket only. Example full local stack: `http://localhost:8080`.
	 */
	readonly VITE_PREDICTION_API_BASE_URL?: string;
	/** Optional: base for `POST /orders` only. If unset, dev [3] still posts signed orders to prod Railway. */
	readonly VITE_PREDICTION_ORDER_API_BASE_URL?: string;
	/** Override private API host (Polymarket, account-overview, funding). Dev [3] defaults to http://localhost:8080 */
	readonly VITE_PRIVATE_API_BASE?: string;
	/** Set to "true" to enable trading shell execution gate network calls */
	readonly VITE_TRADING_SHELL_ENABLED?: string;
	/** Override venue-prices WebSocket base URL (e.g. ws://localhost:8080). Path /ws/venue-prices is appended automatically. */
	readonly VITE_ODDS_WS_BASE?: string;
	/** "true" when CLOB proxy is active (set by yarn dev prompt) */
	readonly VITE_POLYMARKET_CLOB_PROXY?: string;
	/** Railway /proxy URL (server-side only, used by Vite plugin) */
	readonly VITE_POLY_PROXY_URL?: string;
	/** Bearer token for Railway /proxy (server-side only) */
	readonly VITE_POLY_PROXY_TOKEN?: string;
	/**
	 * Predict order tunnel upstream (vite + browser). LIVE: optional (defaults prod Railway in vite). TEST/DEV: if set, browser
	 * also tunnels order POST (EU egress); must be a URL your Railway /proxy can reach (not localhost).
	 */
	readonly VITE_AMSTERDAM_PROXY_LEVELUP_API_URL?: string;
	/** Optional Predict smart-wallet deposit address (maker/signer for orders) */
	readonly VITE_PREDICT_ACCOUNT_ADDRESS?: string;
	/**
	 * Override path for Predict match events proxy (default `/api/predict/orders/matches`).
	 * Set if your server mounts e.g. `/predict/orders/matches` without the `/api` prefix.
	 */
	readonly VITE_PREDICT_ORDER_MATCHES_PATH?: string;
	/** Reserved: enables `isPredictionPricingDebugEnabled()` (debug-only code paths; see debugPredictionPricing.ts) */
	readonly VITE_DEBUG_PREDICTION_PRICING?: string;
	/** "true" → verbose SOR / umbrella / balance logs (`isTradingDebugLoggingEnabled`) */
	readonly VITE_DEBUG_TRADING?: string;
	/** Solana mainnet JSON-RPC (Helius, Alchemy, QuickNode); avoids public 503s */
	readonly VITE_SOLANA_RPC_URL?: string;
	/** Extra Solana HTTP RPC URLs after transient failures on the primary */
	readonly VITE_SOLANA_RPC_FALLBACK_URLS?: string;
	/** Optional DFlow tooling / server URLs (not used by removed browser book clients). */
	readonly VITE_DFLOW_REST_BASE?: string;
	readonly VITE_DFLOW_WS_URL?: string;
	/**
	 * Optional override for LevelUp subgraph GraphQL HTTP endpoint (user token balances).
	 * When unset, defaults to The Graph Studio `levelup-subgraph`. Use this if your
	 * Goldsky or Studio deployment slug changes (fixes `deployment … does not exist`).
	 */
	readonly VITE_LEVELUP_SUBGRAPH_URL?: string;
}

// Image module declarations
declare module "*.png" {
  const value: string;
  export default value;
}

declare module "*.svg" {
  const value: string;
  export default value;
}

declare module "*.jpg" {
  const value: string;
  export default value;
}

declare module "*.jpeg" {
  const value: string;
  export default value;
}

declare module "*.webp" {
  const value: string;
  export default value;
}

// JSX module declarations
declare module "*.jsx" {
  const component: React.ComponentType<any>;
  export default component;
}

// JS module declarations
declare module "*.js" {
  const component: React.ComponentType<any>;
  export default component;
}

// Portal component declaration
declare module "../Common/Portal" {
  const Portal: React.ComponentType<any>;
  export default Portal;
}

declare module "components/Common/Portal" {
  const Portal: React.ComponentType<any>;
  export default Portal;
}

// React Helmet declaration
declare module "react-helmet" {
  export const Helmet: React.ComponentType<any>;
}
