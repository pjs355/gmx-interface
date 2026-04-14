/**
 * Centralized API URL Configuration for LevelUp Predictions
 *
 * Environment-aware: Returns testnet (localhost) or production API URLs
 * based on environment.ts configuration.
 *
 * `local-production` (yarn dev → [3]): `scripts/dev-prompt.js` sets
 * `VITE_PREDICTION_API_BASE_URL=http://localhost:8080` so prediction + multiplex + orderbook + venue
 * share one local API. Without that (e.g. `npx vite` + `VITE_ENVIRONMENT_MODE=local-production` only),
 * prediction API defaults to Railway. Private routes: `privateApiBase.ts`.
 *
 * Override: `VITE_PREDICTION_API_BASE_URL` (e.g. `http://localhost:8080` for full local API:
 * multiplex `/ws`, orderbook REST, umbrellas, tags — same host as venue-prices when odds URLs derive from it).
 */

import { getEnvironment, isLocalApi } from "./environment";

// =============================================================================
// API URLS BY ENVIRONMENT
// =============================================================================
const API_URLS = {
	testnet: {
		api: "http://localhost:8080",
		websocket: "ws://localhost:8080",
	},
	production: {
		api: "https://prediction-api-production.up.railway.app",
		websocket: "wss://prediction-api-production.up.railway.app",
	},
} as const;

function normalizeApiBase(url: string): string {
	return url.trim().replace(/\/$/, "");
}

function websocketUrlForHttpBase(base: string): string {
	const b = normalizeApiBase(base);
	if (b.startsWith("https://")) return `wss://${b.slice("https://".length)}`;
	if (b.startsWith("http://")) return `ws://${b.slice("http://".length)}`;
	return b;
}

/**
 * Optional override for public prediction API (umbrellas, markets, tags, multiplex WS).
 * When set, `getOrderbookApiBaseUrl()` and odds helpers use the same host unless `VITE_ODDS_WS_BASE` overrides venue WS.
 */
export function getPredictionApiBaseOverride(): string | null {
	const raw = import.meta.env.VITE_PREDICTION_API_BASE_URL;
	if (typeof raw !== "string" || raw.trim() === "") return null;
	return normalizeApiBase(raw);
}

// =============================================================================
// ENVIRONMENT-AWARE EXPORTS
// =============================================================================

/**
 * Get the base URL for the Prediction API
 * - testnet: http://localhost:8080
 * - local-production: Railway unless `VITE_PREDICTION_API_BASE_URL` is set (yarn dev [3] sets localhost:8080)
 * - production: production Railway
 * - If `VITE_PREDICTION_API_BASE_URL` is set → always that host
 */
export function getPredictionApiBaseUrl(): string {
	const override = getPredictionApiBaseOverride();
	if (override) return override;
	if (getEnvironment() === "local-production") {
		return API_URLS.production.api;
	}
	return isLocalApi() ? API_URLS.testnet.api : API_URLS.production.api;
}

/**
 * Get the WebSocket URL for real-time updates (matches prediction API host).
 */
export function getPredictionWebSocketUrl(): string {
	const override = getPredictionApiBaseOverride();
	if (override) return websocketUrlForHttpBase(override);
	if (getEnvironment() === "local-production") {
		return API_URLS.production.websocket;
	}
	return isLocalApi() ? API_URLS.testnet.websocket : API_URLS.production.websocket;
}

/**
 * Get the orderbook API base URL (REST snapshots used by OrderbookService / chart bootstrap).
 * - If `VITE_PREDICTION_API_BASE_URL` is set → same host as prediction API (full local stack).
 * - Else if `forceLocal` and local API mode → localhost.
 * - Else → production Railway (default; avoids local/prod book mismatch when catalogs come from Railway).
 */
export function getOrderbookApiBaseUrl(forceLocal: boolean = false): string {
	if (getPredictionApiBaseOverride() != null) {
		return getPredictionApiBaseUrl();
	}
	if (forceLocal && isLocalApi()) {
		return API_URLS.testnet.api;
	}
	return API_URLS.production.api;
}

// =============================================================================
// DIRECT ACCESS (for debugging/special cases)
// =============================================================================
export const API_URL_CONFIG = API_URLS;
