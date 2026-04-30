import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { orderbookFromYesNoBidDecimalMaps, extractBestPrices } from "./orderbook-helpers";
import type { VenueBook, VenueBestPrices } from "./types";

/**
 * DFlow display books (Basic tab / cross-venue strip / orderbooks panel):
 * - **WS:** browser → Metadata `VITE_DFLOW_WS_URL` (keyless), deltas keyed by `market_ticker`.
 * - **REST seed:** browser → **prediction API** `GET /api/public/dflow-orderbook?ticker=` (server adds
 *   `x-api-key` / relay) — not direct `dev-prediction-markets-api.dflow.net` (prod orderbooks return **403**
 *   without a key). Same `yes_bids` / `no_bids` JSON as Metadata.
 * Kalshi **trade** sizing in `PredictionMarketTradeBox` uses **venue-prices monitor** books only
 * (`dflowKalshiOrderbookForPosition`); executable quotes use private `/api/dflow/...` — this client does not change those paths.
 */
const DEFAULT_WS = "wss://dev-prediction-markets-api.dflow.net/api/v1/ws";

function readEnvTrim(key: string): string | null {
	if (typeof import.meta.env === "undefined") return null;
	const v = (import.meta.env as Record<string, unknown>)[key];
	return typeof v === "string" && v.trim() !== "" ? v.trim().replace(/\/$/, "") : null;
}

/** Must match catalog where Kalshi/DFlow tickers exist (wrong host → REST 404). */
const WS_URL = readEnvTrim("VITE_DFLOW_WS_URL") ?? DEFAULT_WS;
const RECONNECT_MAX = 25;
const PING_INTERVAL_MS = 15_000;
const STALE_THRESHOLD_MS = 5 * 60 * 1000;
const REST_SEED_CONCURRENCY = 5;

export interface DflowWsHandlers {
	onBook?: (ticker: string, book: VenueBook) => void;
	onBestPrices?: (ticker: string, prices: VenueBestPrices) => void;
	onConnect?: () => void;
	onDisconnect?: (reason: string) => void;
	onError?: (err: Error) => void;
}

export class DflowBookClient {
	private ws: WebSocket | null = null;
	private readonly handlers: DflowWsHandlers;
	private wanted = new Set<string>();
	private seededTickers = new Set<string>();
	/** Tickers whose REST seed returned 404 from upstream (via prediction proxy); skip repeat fetches until reconnect. */
	private restUnavailableTickers = new Set<string>();
	private rest404Logged = new Set<string>();
	private reconnectAttempt = 0;
	private closedByUser = false;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private connectTimeout: ReturnType<typeof setTimeout> | null = null;
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private lastMessageAt = 0;
	private messageCount = 0;
	private upSince: number | null = null;
	private dead = false;
	private connectionFailed = false;

	constructor(handlers: DflowWsHandlers = {}) {
		this.handlers = handlers;
	}

	isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	isDead(): boolean {
		return this.dead;
	}

	/** True if the initial keyless connection was rejected. */
	hasConnectionFailed(): boolean {
		return this.connectionFailed;
	}

	setSubscribedTickers(tickers: string[]): void {
		const next = new Set(tickers.filter(Boolean));
		const prev = this.wanted;
		this.wanted = next;

		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

		const removed = [...prev].filter((t) => !next.has(t));
		const added = [...next].filter((t) => !prev.has(t));

		if (removed.length > 0) {
			this.ws.send(JSON.stringify({ type: "unsubscribe", channel: "orderbook", tickers: removed }));
		}
		if (added.length > 0) {
			this.ws.send(JSON.stringify({ type: "subscribe", channel: "orderbook", tickers: added }));
		}

		const needSeed = added.filter(
			(t) => !this.seededTickers.has(t) && !this.restUnavailableTickers.has(t),
		);
		if (needSeed.length > 0) {
			void this.seedOrderbooks(needSeed);
		}
	}

	connect(): void {
		if (this.ws?.readyState === WebSocket.OPEN) return;
		this.closedByUser = false;
		this.dead = false;

		// Browser WebSocket cannot send custom headers (x-api-key).
		// We attempt keyless connection; if DFlow rejects it, we set connectionFailed.
		const ws = new WebSocket(WS_URL);
		this.ws = ws;

		this.connectTimeout = setTimeout(() => {
			if (ws.readyState !== WebSocket.OPEN) {
				this.connectionFailed = true;
				ws.close();
				this.handlers.onError?.(new Error("DFlow WS connect timeout (keyless)"));
			}
		}, 20_000);

		ws.onopen = () => {
			if (this.connectTimeout) {
				clearTimeout(this.connectTimeout);
				this.connectTimeout = null;
			}
			this.connectionFailed = false;
			this.reconnectAttempt = 0;
			this.lastMessageAt = Date.now();
			this.upSince = Date.now();
			this.startPing();
			if (this.wanted.size > 0) {
				ws.send(
					JSON.stringify({ type: "subscribe", channel: "orderbook", tickers: [...this.wanted] }),
				);
				this.seededTickers.clear();
				this.restUnavailableTickers.clear();
				this.rest404Logged.clear();
				void this.seedOrderbooks([...this.wanted]);
			}
			this.handlers.onConnect?.();
		};

		ws.onerror = () => {
			if (this.connectTimeout) {
				clearTimeout(this.connectTimeout);
				this.connectTimeout = null;
			}
			this.connectionFailed = true;
			this.handlers.onError?.(new Error("DFlow WS error (keyless)"));
		};

		ws.onmessage = (event) => {
			this.lastMessageAt = Date.now();
			this.messageCount++;
			const raw = typeof event.data === "string" ? event.data : String(event.data);
			this.onRawMessage(raw);
		};

		ws.onclose = (event) => {
			this.stopPing();
			this.upSince = null;
			const reason = event.reason || `code=${event.code}`;
			this.handlers.onDisconnect?.(reason);
			this.ws = null;
			if (!this.closedByUser && this.wanted.size > 0 && !this.connectionFailed) {
				this.scheduleReconnect();
			}
		};
	}

	disconnect(): void {
		this.closedByUser = true;
		this.wanted.clear();
		this.seededTickers.clear();
		this.restUnavailableTickers.clear();
		this.rest404Logged.clear();
		this.stopPing();
		this.upSince = null;
		if (this.connectTimeout) {
			clearTimeout(this.connectTimeout);
			this.connectTimeout = null;
		}
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}

	private startPing(): void {
		this.stopPing();
		this.pingTimer = setInterval(() => {
			if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

			// Browser WebSocket doesn't have a native ping method, send a text keep-alive
			try {
				this.ws.send(JSON.stringify({ type: "ping" }));
			} catch {
				// ignore send errors
			}

			if (this.wanted.size > 0 && this.lastMessageAt > 0 && Date.now() - this.lastMessageAt > STALE_THRESHOLD_MS) {
				console.log(`[DFlowBookClient] Stale: no message for ${Math.round((Date.now() - this.lastMessageAt) / 1000)}s, reconnecting`);
				this.ws.close();
			}
		}, PING_INTERVAL_MS);
	}

	private stopPing(): void {
		if (this.pingTimer) {
			clearInterval(this.pingTimer);
			this.pingTimer = null;
		}
	}

	private orderbookSeedRequestUrl(ticker: string): string {
		const base = getPredictionApiBaseUrl().replace(/\/$/, "");
		return `${base}/api/public/dflow-orderbook?ticker=${encodeURIComponent(ticker)}`;
	}

	private scheduleReconnect(): void {
		if (this.closedByUser) return;
		const attempt = this.reconnectAttempt++;
		if (attempt >= RECONNECT_MAX) {
			this.dead = true;
			this.handlers.onError?.(new Error("DFlow WS max reconnect attempts"));
			return;
		}
		const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 10));
		this.reconnectTimer = setTimeout(() => {
			this.connect();
		}, delay);
	}

	private onRawMessage(raw: string): void {
		let msg: Record<string, unknown>;
		try {
			msg = JSON.parse(raw) as Record<string, unknown>;
		} catch {
			return;
		}
		if (msg.channel !== "orderbook") return;

		const ticker = msg.market_ticker;
		if (typeof ticker !== "string" || !ticker) return;

		const yesBids = msg.yes_bids && typeof msg.yes_bids === "object"
			? (msg.yes_bids as Record<string, number>)
			: {};
		const noBids = msg.no_bids && typeof msg.no_bids === "object"
			? (msg.no_bids as Record<string, number>)
			: {};

		const book = orderbookFromYesNoBidDecimalMaps(yesBids, noBids);
		if (this.handlers.onBook) {
			this.handlers.onBook(ticker, book);
		} else {
			this.handlers.onBestPrices?.(ticker, extractBestPrices(book));
		}
	}

	/**
	 * Fetch current orderbook state via REST for tickers that haven't been seeded.
	 * DFlow WS only streams deltas, not initial state.
	 */
	private async seedOrderbooks(tickers: string[]): Promise<void> {
		const pending = tickers.filter((t) => !this.restUnavailableTickers.has(t));
		if (pending.length === 0) return;

		let seeded = 0;
		let failed = 0;

		for (let i = 0; i < pending.length; i += REST_SEED_CONCURRENCY) {
			const batch = pending.slice(i, i + REST_SEED_CONCURRENCY);
			const results = await Promise.allSettled(
				batch.map(async (ticker) => {
					const url = this.orderbookSeedRequestUrl(ticker);
					const res = await fetch(url, {
						signal: AbortSignal.timeout(10_000),
					});
					if (!res.ok) {
						if (res.status === 404) {
							this.restUnavailableTickers.add(ticker);
							if (!this.rest404Logged.has(ticker)) {
								this.rest404Logged.add(ticker);
								console.warn(
									`[DFlowBookClient] Orderbook REST 404 for "${ticker}" (prediction API dflow-orderbook proxy) — upstream Metadata not found for this ticker; skipping further REST seed until reconnect.`,
								);
							}
						}
						throw new Error(`${res.status}`);
					}
					const data = await res.json() as Record<string, unknown>;
					return { ticker, data };
				}),
			);
			for (const result of results) {
				if (result.status === "rejected") {
					failed++;
					continue;
				}
				const { ticker, data } = result.value;
				this.seededTickers.add(ticker);

				const yesBids = data.yes_bids && typeof data.yes_bids === "object"
					? (data.yes_bids as Record<string, number>)
					: {};
				const noBids = data.no_bids && typeof data.no_bids === "object"
					? (data.no_bids as Record<string, number>)
					: {};

				if (Object.keys(yesBids).length === 0 && Object.keys(noBids).length === 0) continue;

				const book = orderbookFromYesNoBidDecimalMaps(yesBids, noBids);
				if (this.handlers.onBook) {
					this.handlers.onBook(ticker, book);
				} else {
					this.handlers.onBestPrices?.(ticker, extractBestPrices(book));
				}
				seeded++;
			}
		}

		if (import.meta.env.DEV && (seeded > 0 || failed > 0)) {
			console.log(
				`[DFlowBookClient] REST seed: ${seeded} books loaded, ${failed} failed, ${pending.length} tickers attempted`,
			);
		}
	}
}
