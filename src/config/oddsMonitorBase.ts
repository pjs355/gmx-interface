/**
 * Odds/trading monitor WebSocket (Amsterdam UI server / Railway).
 * Spec: ODDS_WS_BASE equivalent — use VITE_ODDS_WS_BASE in Vite.
 */

import { isLocalApi } from "./environment";

/** When unset in env, testnet / loopback dev uses this (Amsterdam monitor default port). */
const DEFAULT_TESTNET_ODDS_WS_BASE = "ws://localhost:3002";

/**
 * Default WS origin when VITE_ODDS_WS_BASE is unset.
 * - Vite dev at localhost → ws://localhost:3002
 * - Vite dev at LAN IP (e.g. phone on 192.168.x) → ws://<same-host>:3002 so it reaches the machine running the monitor
 * - Otherwise testnet (legacy) → ws://localhost:3002
 */
function getDefaultOddsWsBase(): string {
	if (typeof window === "undefined") {
		return isLocalApi() ? DEFAULT_TESTNET_ODDS_WS_BASE : "";
	}
	const host = window.location.hostname;
	if (import.meta.env.DEV) {
		if (host === "localhost" || host === "127.0.0.1") {
			return DEFAULT_TESTNET_ODDS_WS_BASE;
		}
		return `ws://${host}:3002`;
	}
	return isLocalApi() ? DEFAULT_TESTNET_ODDS_WS_BASE : "";
}

function isLocalhostWebSocketBase(base: string): boolean {
	const lower = base.trim().toLowerCase();
	return (
		lower.includes("localhost") ||
		lower.includes("127.0.0.1") ||
		lower.startsWith("ws://[::1]")
	);
}

/** Token optional only on loopback or, in Vite dev, default ws://<page-host>:3002 (auth-off monitor). */
function canOmitMonitorToken(base: string): boolean {
	if (isLocalhostWebSocketBase(base)) {
		return true;
	}
	if (import.meta.env.DEV && typeof window !== "undefined") {
		const h = window.location.hostname;
		if (h === "localhost" || h === "127.0.0.1") {
			return true;
		}
		return (
			base.trim().toLowerCase() === `ws://${h.toLowerCase()}:3002`
		);
	}
	return false;
}

/**
 * Full WebSocket URL including optional ?token= for MONITOR_TOKEN parity.
 * If token is empty: still connect when base is localhost (dev, auth off).
 * If token is empty and base is non-localhost, returns null — avoid open WS without auth in prod.
 */
export function getOddsWebSocketUrl(): string | null {
	const fromEnv =
		typeof import.meta.env.VITE_ODDS_WS_BASE === "string"
			? import.meta.env.VITE_ODDS_WS_BASE.trim()
			: "";
	const base = fromEnv || getDefaultOddsWsBase();

	if (!base) {
		return null;
	}

	/**
	 * Must match UIServer MONITOR_TOKEN. Prefer baked shell value first so `.env`
	 * cannot override a correct zshrc MONITOR_TOKEN with a stale VITE_* line.
	 */
	const fromShell = (import.meta.env.VITE_ODDS_MONITOR_FROM_SHELL ?? "").trim();
	const fromViteFile = (import.meta.env.VITE_ODDS_MONITOR_TOKEN ?? "").trim();
	const tokenRaw = fromShell || fromViteFile;

	if (tokenRaw) {
		const sep = base.includes("?") ? "&" : "?";
		return `${base}${sep}token=${encodeURIComponent(tokenRaw)}`;
	}

	if (!canOmitMonitorToken(base)) {
		return null;
	}

	return base;
}
