/**
 * Centralized RPC Configuration for LevelUp Predictions
 *
 * Note: Both testnet and production use Base Mainnet RPCs
 * (testnet contracts are deployed on Base Mainnet, not a separate testnet)
 */

import { Connection } from "@solana/web3.js";

// =============================================================================
// RPC URLS (same for both environments - all on Base Mainnet)
// =============================================================================
export const RPC_URLS = {
	BASE_INFURA: "https://base-mainnet.infura.io/v3/5b51ad43553b44ffabc2980afa70f7ae",
	BASE_COINBASE: "https://api.developer.coinbase.com/rpc/v1/base/WMQ4Y6b5ZsqmO9MTCfyjZG2aQXG5T1Ih",
	BASE_PUBLIC: "https://mainnet.base.org",
	BASE_PUBLIC_NODE: "https://base-rpc.publicnode.com",
	/**
	 * Primary Polygon HTTP RPC when `VITE_POLYGON_RPC_URL` is unset.
	 * Avoid `polygon-rpc.com` here — it often returns **401** for browser `fetch` without API keys.
	 * PublicNode / others are listed in `POLYGON_PUBLIC_HTTP_FALLBACKS` for resilience under burst reads.
	 */
	POLYGON_READ_DEFAULT: "https://rpc.ankr.com/polygon",
	BSC_PUBLIC_NODE: "https://bsc-rpc.publicnode.com",
	/** PublicNode — browser-origin calls often get 403 from api.mainnet-beta.solana.com. */
	SOLANA_PUBLIC_NODE: "https://solana-rpc.publicnode.com",
} as const;

// Default RPC URL for Base mainnet (primary)
export const DEFAULT_RPC_URL = RPC_URLS.BASE_COINBASE;

// Fallback RPC URL
export const FALLBACK_RPC_URL = RPC_URLS.BASE_INFURA;

/**
 * Polygon mainnet RPC for wagmi `chain.rpcUrls.default` (`index.tsx`) — keep aligned with read client defaults when unset.
 * Prefer `VITE_POLYGON_RPC_URL` for production (Infura/Alchemy); bundled defaults must allow browser JSON-RPC without 401.
 */
const vitePolygonRpc =
	typeof import.meta.env !== "undefined" &&
	typeof import.meta.env.VITE_POLYGON_RPC_URL === "string" &&
	import.meta.env.VITE_POLYGON_RPC_URL.trim() !== ""
		? import.meta.env.VITE_POLYGON_RPC_URL.trim()
		: null;

export const POLYGON_RPC_URL = vitePolygonRpc ?? RPC_URLS.POLYGON_READ_DEFAULT;

/** When the primary Polygon RPC drops connections (common on free endpoints), try these next — no extra env required. */
const POLYGON_PUBLIC_HTTP_FALLBACKS: readonly string[] = [
	"https://polygon-bor-rpc.publicnode.com",
	"https://rpc.ankr.com/polygon",
	"https://1rpc.io/matic",
	"https://polygon.llamarpc.com",
];

/** Optional comma- or space-separated extra Polygon HTTP RPC URLs (tried after `POLYGON_RPC_URL`). */
function parsePolygonRpcFallbackUrlsFromEnv(): string[] {
	const raw =
		typeof import.meta.env !== "undefined" &&
		typeof import.meta.env.VITE_POLYGON_RPC_FALLBACK_URLS === "string"
			? import.meta.env.VITE_POLYGON_RPC_FALLBACK_URLS
			: "";
	return raw
		.split(/[\s,]+/)
		.map((s) => s.trim())
		.filter((s) => s.startsWith("http://") || s.startsWith("https://"));
}

/**
 * Ordered Polygon JSON-RPC URLs for viem reads (Polymarket approvals, bridge balances, LI.FI checks).
 * Deduped: primary from env or `POLYGON_READ_DEFAULT`, then optional env fallbacks, then public alternates.
 */
export function getPolygonHttpRpcEndpoints(): readonly string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	const push = (u: string) => {
		const t = u.trim();
		if (!t || seen.has(t)) return;
		seen.add(t);
		out.push(t);
	};
	push(POLYGON_RPC_URL);
	for (const u of parsePolygonRpcFallbackUrlsFromEnv()) push(u);
	for (const u of POLYGON_PUBLIC_HTTP_FALLBACKS) push(u);
	return out;
}

const viteBscRpc =
	typeof import.meta.env !== "undefined" &&
	typeof import.meta.env.VITE_BSC_RPC_URL === "string" &&
	import.meta.env.VITE_BSC_RPC_URL.trim() !== ""
		? import.meta.env.VITE_BSC_RPC_URL.trim()
		: null;

/** BNB Smart Chain — LI.FI allowance reads, bridge BNB balance */
export const BSC_RPC_URL = viteBscRpc ?? RPC_URLS.BSC_PUBLIC_NODE;

const viteSolanaRpc =
	typeof import.meta.env !== "undefined" &&
	typeof import.meta.env.VITE_SOLANA_RPC_URL === "string" &&
	import.meta.env.VITE_SOLANA_RPC_URL.trim() !== ""
		? import.meta.env.VITE_SOLANA_RPC_URL.trim()
		: null;

/**
 * Solana mainnet — USDC SPL balance reads, DFlow/Kalshi funding.
 * Set `VITE_SOLANA_RPC_URL` for dev and production; bundled public URLs are a last resort and often return 503 under load.
 * Optional `VITE_SOLANA_RPC_FALLBACK_URLS` adds extra HTTP endpoints after transient failures on the primary.
 */
export const SOLANA_RPC_URL = viteSolanaRpc ?? RPC_URLS.SOLANA_PUBLIC_NODE;

const viteSolanaWsRpc =
	typeof import.meta.env !== "undefined" &&
	typeof import.meta.env.VITE_SOLANA_WS_RPC_URL === "string" &&
	import.meta.env.VITE_SOLANA_WS_RPC_URL.trim() !== ""
		? import.meta.env.VITE_SOLANA_WS_RPC_URL.trim()
		: null;

/** Derive a WebSocket endpoint from `SOLANA_RPC_URL` when one isn't provided explicitly. */
function deriveSolanaWsUrl(httpUrl: string): string {
	if (httpUrl.startsWith("https://")) return "wss://" + httpUrl.slice("https://".length);
	if (httpUrl.startsWith("http://")) return "ws://" + httpUrl.slice("http://".length);
	return httpUrl;
}

/**
 * Solana mainnet WebSocket endpoint — used by Privy embedded-wallet UIs for
 * signature subscriptions during sponsored `signAndSendTransaction`.
 * Set `VITE_SOLANA_WS_RPC_URL` to override; otherwise derived from `SOLANA_RPC_URL`.
 */
export const SOLANA_WS_URL = viteSolanaWsRpc ?? deriveSolanaWsUrl(SOLANA_RPC_URL);

/** Optional comma- or space-separated extra Solana HTTP RPC URLs (tried after `SOLANA_RPC_URL`). */
function parseSolanaRpcFallbackUrlsFromEnv(): string[] {
	const raw =
		typeof import.meta.env !== "undefined" &&
		typeof import.meta.env.VITE_SOLANA_RPC_FALLBACK_URLS === "string"
			? import.meta.env.VITE_SOLANA_RPC_FALLBACK_URLS
			: "";
	return raw
		.split(/[\s,]+/)
		.map((s) => s.trim())
		.filter((s) => s.startsWith("http://") || s.startsWith("https://"));
}

/**
 * Public Solana mainnet HTTP endpoints used only when the primary returns 502/503/504/429 or throws.
 * PublicNode is high-volume ([publicnode](https://solana-rpc.publicnode.com)); keep alternates.
 */
const SOLANA_PUBLIC_HTTP_FALLBACKS: readonly string[] = [
	"https://rpc.ankr.com/solana",
	"https://api.mainnet-beta.solana.com",
];

/** Ordered list of Solana JSON-RPC HTTP URLs for wallet flows (deduped). */
export function getSolanaHttpRpcEndpoints(): readonly string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	const push = (u: string) => {
		const t = u.trim();
		if (!t || seen.has(t)) return;
		seen.add(t);
		out.push(t);
	};
	push(SOLANA_RPC_URL);
	for (const u of parseSolanaRpcFallbackUrlsFromEnv()) push(u);
	for (const u of SOLANA_PUBLIC_HTTP_FALLBACKS) push(u);
	return out;
}

const SOLANA_HTTP_RPC_ENDPOINTS = getSolanaHttpRpcEndpoints();

function createSolanaRpcFetchWithFallback(endpoints: readonly string[]): typeof globalThis.fetch {
	return async (_input, init) => {
		let lastNonOk: Response | undefined;
		let lastErr: unknown;
		for (const endpoint of endpoints) {
			try {
				const res = await globalThis.fetch(endpoint, init);
				if (res.ok) return res;
				lastNonOk = res;
				if (![502, 503, 504, 429].includes(res.status)) {
					return res;
				}
			} catch (e) {
				lastErr = e;
			}
		}
		if (lastNonOk) return lastNonOk;
		if (lastErr instanceof Error) throw lastErr;
		throw new Error("Solana RPC: all configured endpoints failed");
	};
}

/**
 * Privy-sponsored sends call `connection.confirmTransaction` after broadcast. Default
 * web3 timeout (often 60s) is tight on congested or public RPCs — extend for wallet flows.
 */
const SOLANA_WALLET_SEND_CONFIRM_TIMEOUT_MS = 120_000;

/**
 * `Connection` for Privy `sendTransaction` / LI.FI Solana legs / direct SPL withdraw.
 * Uses a custom `fetch` that retries on 502/503/504/429 against `getSolanaHttpRpcEndpoints()`.
 */
export function createSolanaConnectionForWalletSend(): Connection {
	return new Connection(SOLANA_HTTP_RPC_ENDPOINTS[0]!, {
		commitment: "confirmed",
		confirmTransactionInitialTimeout: SOLANA_WALLET_SEND_CONFIRM_TIMEOUT_MS,
		fetch: createSolanaRpcFetchWithFallback(SOLANA_HTTP_RPC_ENDPOINTS),
	});
}

/**
 * Same JSON-RPC client as {@link createSolanaConnectionForWalletSend} (HTTP 429/502/503/504 fallbacks).
 * Use for read-only scans (DFlow Token-2022 accounts, SPL balances) — not only sponsored sends.
 */
export function createSolanaConnectionForJsonRpcReads(): Connection {
	return createSolanaConnectionForWalletSend();
}

// All available Base RPC URLs for round-robin/fallback
export const ALL_RPC_URLS = [
	RPC_URLS.BASE_COINBASE,
	RPC_URLS.BASE_INFURA,
	RPC_URLS.BASE_PUBLIC,
	RPC_URLS.BASE_PUBLIC_NODE,
] as const;
