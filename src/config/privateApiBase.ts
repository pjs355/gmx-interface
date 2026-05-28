/**
 * Base URL for authenticated "private" trading / account routes.
 * Override when the API host differs from the public prediction API.
 *
 * **local** (yarn dev → [2] or localhost): private + chain routes default to localhost:8080.
 *
 * **Predict 403 (geo)**: Predict.fun sees the **egress of whoever calls their API** — usually your
 * `localhost:8080` process (US). That is a **backend/network** concern (EU-hosted API, or outbound HTTP
 * proxy / VPN on the predictions service). The frontend can only send the order to a **different host**
 * (Railway `/proxy` → `VITE_AMSTERDAM_PROXY_LEVELUP_API_URL`) so the **server at that URL** runs in NL/EU.
 * Tunneling to ngrok→laptop still calls Predict from your IP unless the backend uses its own EU proxy.
 *
 * Railway CLOB flag: **LIVE** always tunnels order POST via `/private-api-proxy`. **LOCAL** tunnels
 * orders only if you set **`VITE_AMSTERDAM_PROXY_LEVELUP_API_URL`** (EU/API base the Railway proxy can reach).
 * Otherwise orders go to `getPrivateApiBaseUrl()` (local). Umbrella/catalog URLs unchanged (`predictionApiBase.ts`).
 *
 * Optional path tweaks:
 * - `VITE_ACCOUNT_OVERVIEW_PATH` — default `me` (`/profiles/me/account-overview`); see `accountOverviewApi.ts`
 * - `VITE_POLYMARKET_ACCOUNT_PATH` — default `/polymarket/account`; use `/api/polymarket/account` if needed
 */
import { getEnvironment } from "@/config/environment";
import { API_URL_CONFIG, getPredictionApiBaseUrl } from "@/config/predictionApiBase";

/**
 * Dev flag for the Polymarket CLOB Railway tunnel (`yarn dev` prompt sets it).
 */
export function isClobProxyEnabled(): boolean {
	const v = import.meta.env.VITE_POLYMARKET_CLOB_PROXY;
	return String(v ?? "").trim() === "true";
}

/** Predict.fun: only order POST may use the Railway tunnel. */
function isPredictOrdersTunnelPath(path: string): boolean {
	const pathname = (path.split("?")[0] ?? "").split("#")[0] ?? "";
	return pathname === "/api/predict/orders";
}

function hasExplicitPredictProxyTarget(): boolean {
	const u = import.meta.env.VITE_AMSTERDAM_PROXY_LEVELUP_API_URL;
	return typeof u === "string" && u.trim().length > 0;
}

/**
 * Order POST uses `/private-api-proxy` when CLOB proxy is on and: **LIVE**, or **LOCAL** with
 * `VITE_AMSTERDAM_PROXY_LEVELUP_API_URL` set (EU-reachable API the /proxy fetches).
 */
export function shouldTunnelPredictOrders(): boolean {
	if (!isClobProxyEnabled()) return false;
	if (getEnvironment() === "production") return true;
	return hasExplicitPredictProxyTarget();
}

/**
 * Path or absolute URL for `fetch` to the LevelUp private API.
 * See `shouldTunnelPredictOrders` for when `/api/predict/orders` is tunneled.
 */
export function getPrivateApiRequestUrl(path: string): string {
	const p = path.startsWith("/") ? path : `/${path}`;
	if (shouldTunnelPredictOrders() && isPredictOrdersTunnelPath(p)) {
		return `/private-api-proxy${p}`;
	}
	return `${getPrivateApiBaseUrl()}${p}`;
}

/**
 * Absolute URL for SDKs that require a full URL (e.g. Polymarket builder remote).
 */
export function getPrivateApiAbsoluteUrl(path: string): string {
	const u = getPrivateApiRequestUrl(path);
	if (u.startsWith("http")) return u;
	if (typeof window !== "undefined") return `${window.location.origin}${u}`;
	return `http://localhost:3010${u}`;
}

/** Dev logging: where private API traffic is going. */
export function getPrivateApiRoutingDescription(): string {
	const base = getPrivateApiBaseUrl();
	if (!isClobProxyEnabled()) return base;
	const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3010";
	if (shouldTunnelPredictOrders()) {
		return `Predict POST /api/predict/orders → ${origin}/private-api-proxy; other → ${base}`;
	}
	return `CLOB proxy on; Predict orders → ${base} (set VITE_AMSTERDAM_PROXY_LEVELUP_API_URL to tunnel from LOCAL)`;
}

export function getPrivateApiBaseUrl(): string {
	const env = import.meta.env.VITE_PRIVATE_API_BASE;
	if (typeof env === "string" && env.trim().length > 0) {
		return env.replace(/\/$/, "");
	}
	if (getEnvironment() === "local-production") {
		return API_URL_CONFIG.local.api;
	}
	return getPredictionApiBaseUrl();
}
