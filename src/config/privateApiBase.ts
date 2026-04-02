/**
 * Base URL for authenticated “private” trading / account routes.
 * Override when the API host differs from the public prediction API.
 *
 * `local-production` (yarn dev → [3]): public market catalog uses Railway via
 * `getPredictionApiBaseUrl()`, but this defaults to **localhost** so Polymarket /
 * account-overview / builder / funding routes hit your laptop (prod Railway often
 * omits those mounts). Set `VITE_PRIVATE_API_BASE` to override the host or port.
 *
 * **Predict 403 (geo)**: Predict.fun sees the **egress of whoever calls their API** — usually your
 * `localhost:8080` process (US). That is a **backend/network** concern (EU-hosted API, or outbound HTTP
 * proxy / VPN on the predictions service). The frontend can only send the order to a **different host**
 * (Amsterdam `/proxy` → `VITE_AMSTERDAM_PROXY_LEVELUP_API_URL`) so the **server at that URL** runs in NL/EU.
 * Tunneling to ngrok→laptop still calls Predict from your IP unless the backend uses its own EU proxy.
 *
 * Amsterdam + CLOB flag: **LIVE** always tunnels order POST via `/private-api-proxy`. **TEST/DEV** tunnel
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
 * Same dev flag as Polymarket CLOB Amsterdam tunnel (`yarn dev` prompt sets it).
 */
export function isAmsterdamPrivateApiProxyEnabled(): boolean {
	const v = import.meta.env.VITE_POLYMARKET_CLOB_PROXY;
	return String(v ?? "").trim() === "true";
}

/** Predict.fun: only order POST may use the Amsterdam tunnel. */
function isPredictOrdersTunnelPath(path: string): boolean {
	const pathname = (path.split("?")[0] ?? "").split("#")[0] ?? "";
	return pathname === "/api/predict/orders";
}

function hasExplicitAmsterdamPredictApiTarget(): boolean {
	const u = import.meta.env.VITE_AMSTERDAM_PROXY_LEVELUP_API_URL;
	return typeof u === "string" && u.trim().length > 0;
}

/**
 * Order POST uses `/private-api-proxy` when CLOB proxy is on and: **LIVE**, or **TEST/DEV** with
 * `VITE_AMSTERDAM_PROXY_LEVELUP_API_URL` set (EU-reachable API the /proxy fetches).
 */
export function shouldTunnelPredictOrdersThroughAmsterdam(): boolean {
	if (!isAmsterdamPrivateApiProxyEnabled()) return false;
	if (getEnvironment() === "production") return true;
	return hasExplicitAmsterdamPredictApiTarget();
}

/**
 * Path or absolute URL for `fetch` to the LevelUp private API.
 * See `shouldTunnelPredictOrdersThroughAmsterdam` for when `/api/predict/orders` is tunneled.
 */
export function getPrivateApiRequestUrl(path: string): string {
	const p = path.startsWith("/") ? path : `/${path}`;
	if (
		shouldTunnelPredictOrdersThroughAmsterdam() &&
		isPredictOrdersTunnelPath(p)
	) {
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
	if (!isAmsterdamPrivateApiProxyEnabled()) return base;
	const origin =
		typeof window !== "undefined"
			? window.location.origin
			: "http://localhost:3010";
	if (shouldTunnelPredictOrdersThroughAmsterdam()) {
		return `Predict POST /api/predict/orders → ${origin}/private-api-proxy; other → ${base}`;
	}
	return `Amsterdam CLOB on; Predict orders → ${base} (set VITE_AMSTERDAM_PROXY_LEVELUP_API_URL to tunnel from TEST/DEV)`;
}

export function getPrivateApiBaseUrl(): string {
	const env = import.meta.env.VITE_PRIVATE_API_BASE;
	if (typeof env === "string" && env.trim().length > 0) {
		return env.replace(/\/$/, "");
	}
	if (getEnvironment() === "local-production") {
		return API_URL_CONFIG.testnet.api;
	}
	return getPredictionApiBaseUrl();
}
