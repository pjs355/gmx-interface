/**
 * Centralized API URL Configuration for LevelUp Predictions
 *
 * Environment-aware: Returns testnet (localhost) or production API URLs
 * based on environment.ts configuration.
 *
 * `local-production` (yarn dev → [3]): prediction API defaults to Railway so
 * esports / umbrellas match levelup.markets. Private routes use
 * `getPrivateApiBaseUrl()` → localhost by default (see `privateApiBase.ts`).
 *
 * Override: `VITE_PREDICTION_API_BASE_URL` (e.g. force `http://localhost:8080`).
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
 * Optional override for public prediction API (umbrellas, markets, tags, WS).
 * Does not affect `getPrivateApiBaseUrl` unless that also falls back to prediction base.
 */
function getPredictionApiBaseOverride(): string | null {
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
 * - local-production: production Railway (live catalogs; same as levelup.markets)
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
 * Get the orderbook API base URL
 * Note: This always uses production to avoid sync issues between local/prod orderbooks
 * If you need local orderbook for testing, set forceLocal to true
 */
export function getOrderbookApiBaseUrl(forceLocal: boolean = false): string {
	if (forceLocal && isLocalApi()) {
		return API_URLS.testnet.api;
	}
	// Always use production for orderbook data to avoid sync issues
	return API_URLS.production.api;
}

// =============================================================================
// DIRECT ACCESS (for debugging/special cases)
// =============================================================================
export const API_URL_CONFIG = API_URLS;
