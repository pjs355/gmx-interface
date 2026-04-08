import { parseObjectBook, extractBestPrices } from "./orderbook-helpers";
import type { VenueBook, VenueBestPrices } from "./types";

const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
const RECONNECT_MAX = 25;
const PING_INTERVAL_MS = 5_000;
const STALE_THRESHOLD_MS = 15_000;

export interface PolymarketWsHandlers {
	onBook?: (tokenId: string, book: VenueBook) => void;
	onBestPrices?: (tokenId: string, prices: VenueBestPrices) => void;
	onConnect?: () => void;
	onDisconnect?: (reason: string) => void;
	onError?: (err: Error) => void;
}

export class PolymarketBookClient {
	private ws: WebSocket | null = null;
	private readonly handlers: PolymarketWsHandlers;
	private wanted = new Set<string>();
	private reconnectAttempt = 0;
	private closedByUser = false;
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private connectTimeout: ReturnType<typeof setTimeout> | null = null;
	private lastMessageAt = 0;
	private messageCount = 0;
	private upSince: number | null = null;
	private dead = false;
	private connectionFailed = false;

	constructor(handlers: PolymarketWsHandlers = {}) {
		this.handlers = handlers;
	}

	isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	isDead(): boolean {
		return this.dead;
	}

	hasConnectionFailed(): boolean {
		return this.connectionFailed;
	}

	setSubscribedTokenIds(tokenIds: string[]): void {
		const next = new Set(tokenIds.filter(Boolean));
		const prev = this.wanted;
		this.wanted = next;

		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

		const removed = [...prev].filter((t) => !next.has(t));
		const added = [...next].filter((t) => !prev.has(t));

		if (removed.length > 0) {
			this.ws.send(JSON.stringify({ assets_ids: removed, operation: "unsubscribe" }));
		}
		if (added.length > 0) {
			this.ws.send(JSON.stringify({ assets_ids: added, operation: "subscribe" }));
		}
	}

	connect(): void {
		if (this.ws?.readyState === WebSocket.OPEN) return;
		this.closedByUser = false;
		this.dead = false;

		const ws = new WebSocket(WS_URL);
		this.ws = ws;

		this.connectTimeout = setTimeout(() => {
			if (ws.readyState !== WebSocket.OPEN) {
				this.connectionFailed = true;
				ws.close();
				this.handlers.onError?.(new Error("Polymarket WS connect timeout"));
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
				ws.send(JSON.stringify({ assets_ids: [...this.wanted], operation: "subscribe" }));
			}
			this.handlers.onConnect?.();
		};

		ws.onerror = () => {
			if (this.connectTimeout) {
				clearTimeout(this.connectTimeout);
				this.connectTimeout = null;
			}
			this.connectionFailed = true;
			this.handlers.onError?.(new Error("Polymarket WS error"));
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
			if (!this.closedByUser && this.wanted.size > 0) {
				this.scheduleReconnect();
			}
		};
	}

	disconnect(): void {
		this.closedByUser = true;
		this.wanted.clear();
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
			this.ws.send(JSON.stringify({ type: "pong" }));

			if (Date.now() - this.lastMessageAt > STALE_THRESHOLD_MS) {
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

	private scheduleReconnect(): void {
		if (this.closedByUser) return;
		const attempt = this.reconnectAttempt++;
		if (attempt >= RECONNECT_MAX) {
			this.dead = true;
			this.handlers.onError?.(new Error("Polymarket WS max reconnect attempts"));
			return;
		}
		const delay = Math.min(10_000, 100 * 2 ** Math.min(attempt, 10));
		this.reconnectTimer = setTimeout(() => {
			this.connect();
		}, delay);
	}

	private onRawMessage(raw: string): void {
		let msg: unknown;
		try {
			msg = JSON.parse(raw);
		} catch {
			return;
		}

		if (msg && typeof msg === "object" && "type" in msg && (msg as { type: string }).type === "ping") {
			this.ws?.send(JSON.stringify({ type: "pong" }));
			return;
		}

		if (Array.isArray(msg)) {
			for (const entry of msg) {
				if (!entry || typeof entry !== "object") continue;
				const assetId = entry.asset_id as string | undefined;
				if (!assetId) continue;
				const book = parseObjectBook(entry.bids, entry.asks);
				if (this.handlers.onBook) {
					this.handlers.onBook(assetId, book);
				} else {
					this.handlers.onBestPrices?.(assetId, extractBestPrices(book));
				}
			}
			return;
		}

		if (!msg || typeof msg !== "object") return;
		const obj = msg as Record<string, unknown>;

		if (obj.event_type === "book" || (obj.bids && obj.asks && !obj.price_changes)) {
			const assetId = (obj.asset_id ?? obj.market) as string | undefined;
			if (!assetId) return;
			const book = parseObjectBook(
				obj.bids as Array<{ price: string; size: string }>,
				obj.asks as Array<{ price: string; size: string }>,
			);
			if (this.handlers.onBook) {
				this.handlers.onBook(assetId, book);
			} else {
				this.handlers.onBestPrices?.(assetId, extractBestPrices(book));
			}
			return;
		}

		if (Array.isArray(obj.price_changes)) {
			for (const change of obj.price_changes as Array<Record<string, unknown>>) {
				const assetId = change.asset_id as string | undefined;
				if (!assetId) continue;
				const bestBid = typeof change.best_bid === "string" ? parseFloat(change.best_bid) : null;
				const bestAsk = typeof change.best_ask === "string" ? parseFloat(change.best_ask) : null;
				if (bestBid !== null || bestAsk !== null) {
					this.handlers.onBestPrices?.(assetId, { bestBid, bestAsk });
				}
			}
		}
	}
}
