/**
 * Centralized API URL Configuration for LevelUp Predictions
 *
 * Environment-aware API URLs (see environment.ts). Contract addresses are always
 * production Base mainnet regardless of mode.
 */

import { getEnvironment, isLocalApi } from "./environment";

const API_URLS = {
	local: {
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

export function getPredictionApiBaseOverride(): string | null {
	const raw = import.meta.env.VITE_PREDICTION_API_BASE_URL;
	if (typeof raw !== "string" || raw.trim() === "") return null;
	return normalizeApiBase(raw);
}

export function getPredictionOrderApiBaseOverride(): string | null {
	const raw = import.meta.env.VITE_PREDICTION_ORDER_API_BASE_URL;
	if (typeof raw !== "string" || raw.trim() === "") return null;
	return normalizeApiBase(raw);
}

function isLoopbackHttpPredictionHost(url: string): boolean {
	try {
		const u = new URL(normalizeApiBase(url));
		if (u.protocol !== "http:") return false;
		const h = u.hostname.toLowerCase();
		return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
	} catch {
		return false;
	}
}

export function getPredictionOrderApiBaseUrl(): string {
	const orderOverride = getPredictionOrderApiBaseOverride();
	if (orderOverride) return orderOverride;
	if (getEnvironment() === "local") {
		return getPredictionApiBaseUrl();
	}
	const predOverride = getPredictionApiBaseOverride();
	if (
		getEnvironment() === "local-production" &&
		predOverride &&
		isLoopbackHttpPredictionHost(predOverride)
	) {
		return API_URLS.production.api;
	}
	return getPredictionApiBaseUrl();
}

export function getPredictionApiBaseUrl(): string {
	const override = getPredictionApiBaseOverride();
	if (override) return override;
	if (getEnvironment() === "local-production") {
		return API_URLS.production.api;
	}
	return isLocalApi() ? API_URLS.local.api : API_URLS.production.api;
}

export function getPredictionWebSocketUrl(): string {
	const override = getPredictionApiBaseOverride();
	if (override) return websocketUrlForHttpBase(override);
	if (getEnvironment() === "local-production") {
		return API_URLS.production.websocket;
	}
	return isLocalApi() ? API_URLS.local.websocket : API_URLS.production.websocket;
}

export function getOrderbookApiBaseUrl(forceLocal: boolean = false): string {
	if (getPredictionApiBaseOverride() != null) {
		return getPredictionApiBaseUrl();
	}
	if (forceLocal && isLocalApi()) {
		return API_URLS.local.api;
	}
	return API_URLS.production.api;
}

export const API_URL_CONFIG = {
	local: API_URLS.local,
	production: API_URLS.production,
} as const;
