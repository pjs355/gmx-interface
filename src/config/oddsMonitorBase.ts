/**
 * Venue-prices WebSocket URL for the predictions server.
 * Replaces the old Amsterdam odds monitor. No token required.
 */

import { isLocalApi } from "./environment";
import { getPrivateApiBaseUrl } from "./privateApiBase";
import { getPredictionApiBaseUrl } from "./predictionApiBase";

const WS_PATH = "/ws/venue-prices";

/**
 * Build the venue-prices WebSocket URL.
 *
 * Priority:
 * 1. `VITE_ODDS_WS_BASE` env var (explicit override, path appended)
 * 2. Dev on localhost → ws://localhost:8080
 * 3. Dev on LAN IP → ws://<page-host>:8080
 * 4. Production → derive from prediction API base URL
 * 5. null if nothing resolved (disables connection)
 */
export function getOddsWebSocketUrl(): string | null {
	const fromEnv =
		typeof import.meta.env.VITE_ODDS_WS_BASE === "string"
			? import.meta.env.VITE_ODDS_WS_BASE.trim()
			: "";

	if (fromEnv) {
		return `${fromEnv.replace(/\/$/, "")}${WS_PATH}`;
	}

	if (import.meta.env.DEV && typeof window !== "undefined") {
		const host = window.location.hostname;
		if (host === "localhost" || host === "127.0.0.1") {
			return `ws://localhost:8080${WS_PATH}`;
		}
		return `ws://${host}:8080${WS_PATH}`;
	}

	if (isLocalApi()) {
		return `ws://localhost:8080${WS_PATH}`;
	}

	const apiBase = getPredictionApiBaseUrl();
	if (apiBase) {
		const wsBase = apiBase.replace(/^http/, "ws").replace(/\/$/, "");
		return `${wsBase}${WS_PATH}`;
	}

	return null;
}

/**
 * HTTP base URL for the matched-markets REST endpoint.
 * Uses the same origin as the prediction API.
 */
export function getMatchedMarketsUrl(): string {
	if (import.meta.env.DEV && typeof window !== "undefined") {
		const host = window.location.hostname;
		if (host === "localhost" || host === "127.0.0.1") {
			return "http://localhost:8080/matched-markets";
		}
		return `http://${host}:8080/matched-markets`;
	}
	if (isLocalApi()) {
		return "http://localhost:8080/matched-markets";
	}
	const apiBase = getPredictionApiBaseUrl().replace(/\/$/, "");
	return `${apiBase}/matched-markets`;
}

/**
 * Base URL for Predict.fun proxy routes (`/api/predict/...`), including timeseries.
 *
 * In Vite dev + browser: return "" so requests use same origin as the app (e.g. :3010) and
 * `vite.config` `server.proxy` forwards `/api/predict` to :8080 — avoids cross-origin/CORS
 * when the UI and API are on different ports.
 *
 * Non-browser / prod: full host from private API (or localhost for local API mode).
 */
export function getPredictTimeseriesApiBaseUrl(): string {
	if (import.meta.env.DEV && typeof window !== "undefined") {
		return "";
	}
	if (isLocalApi()) {
		return "http://localhost:8080";
	}
	return getPrivateApiBaseUrl();
}
