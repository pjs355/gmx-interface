/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** Optional Polygon mainnet JSON-RPC URL (Infura, Alchemy, etc.); falls back to a public node */
	readonly VITE_POLYGON_RPC_URL?: string;
	/**
	 * Optional public prediction API base (umbrellas, markets, tags, order WS).
	 * Yarn dev [3] uses Railway for catalogs by default; private API defaults to localhost (see privateApiBase).
	 */
	readonly VITE_PREDICTION_API_BASE_URL?: string;
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
	/** "true" → request Privy gas sponsorship on BSC; omit or false → you pay BNB gas */
	readonly VITE_PRIVY_SPONSOR_BSC_GAS?: string;
	/** Optional Predict smart-wallet deposit address (maker/signer for orders) */
	readonly VITE_PREDICT_ACCOUNT_ADDRESS?: string;
	/**
	 * Override path for Predict match events proxy (default `/api/predict/orders/matches`).
	 * Set if your server mounts e.g. `/predict/orders/matches` without the `/api` prefix.
	 */
	readonly VITE_PREDICT_ORDER_MATCHES_PATH?: string;
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
