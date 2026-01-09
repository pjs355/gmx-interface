/**
 * Centralized API URL Configuration for LevelUp Predictions
 * 
 * Environment-aware: Returns testnet (localhost) or production API URLs
 * based on environment.ts configuration.
 */

import { isTestnet } from "./environment";

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

// =============================================================================
// ENVIRONMENT-AWARE EXPORTS
// =============================================================================

/**
 * Get the base URL for the Prediction API
 * - Testnet: http://localhost:8080
 * - Production: https://prediction-api-production.up.railway.app
 */
export function getPredictionApiBaseUrl(): string {
	return isTestnet() ? API_URLS.testnet.api : API_URLS.production.api;
}

/**
 * Get the WebSocket URL for real-time updates
 * - Testnet: ws://localhost:8080
 * - Production: wss://prediction-api-production.up.railway.app
 */
export function getPredictionWebSocketUrl(): string {
	return isTestnet() ? API_URLS.testnet.websocket : API_URLS.production.websocket;
}

/**
 * Get the orderbook API base URL
 * Note: This always uses production to avoid sync issues between local/prod orderbooks
 * If you need local orderbook for testing, set forceLocal to true
 */
export function getOrderbookApiBaseUrl(forceLocal: boolean = false): string {
	if (forceLocal && isTestnet()) {
		return API_URLS.testnet.api;
	}
	// Always use production for orderbook data to avoid sync issues
	return API_URLS.production.api;
}

// =============================================================================
// DIRECT ACCESS (for debugging/special cases)
// =============================================================================
export const API_URL_CONFIG = API_URLS;
