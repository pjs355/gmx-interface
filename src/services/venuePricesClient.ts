import type {
	MatchedMarket,
	OddsMonitorAppState,
	OrderbookData,
	SnapshotStatus,
	VenueStatusInfo,
} from "@/types/odds-monitor";
import { getOddsWebSocketUrl } from "@/config/oddsMonitorBase";
import {
	isLimitlessConsoleDebugEnabled,
	isLimitlessOrderbookVerboseDebug,
} from "@/features/trading/venues/limitless/trade/limitlessConsoleDebug";
import { isPredictionPricingDebugEnabled } from "@/features/markets/odds-monitor/debugPredictionPricing";
import { disposeWebSocket } from "@/shared/async/disposeWebSocket";
import {
	teamToOrderbookData,
	type VenuePriceSnapshotWire,
} from "@/features/all-odds/venueSnapshotMerge";
import type { VenuePriceTeam } from "@/types/venue-prices";
import { mergeMatchedMarketsIntoStore } from "@/features/markets/odds-monitor/matchedMarketFromApi";
import { ensureMarketsFromUmbrella } from "@/features/markets/odds-monitor/matchedMarketFromUmbrella";
import type { MatchedMarketsApiItem } from "@/features/markets/queries/matchedMarketsQuery";
import type { Umbrella } from "@/services/api/umbrellaDataService";

const NOTIFY_COALESCE_MS = 150;

type VenuePriceSnapshot = VenuePriceSnapshotWire;

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_RECONNECT_ATTEMPTS = 8;

const dflowKalshiMicroSizeLogged = new Set<string>();

function nextReconnectDelayMs(attempt: number): number {
	const exp = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * Math.pow(2, attempt));
	const jitter = Math.random() * exp * 0.25;
	return Math.min(MAX_BACKOFF_MS, Math.floor(exp + jitter));
}

function logDflowKalshiMicroscopicRestingSizesIfDebug(
	pandaMatchId: string,
	venueWire: string,
	dataA: OrderbookData,
	dataB: OrderbookData,
): void {
	if (!isPredictionPricingDebugEnabled()) return;
	const pid = String(pandaMatchId ?? "").trim();
	if (!pid) return;
	const levels = [
		...(dataA.asks ?? []),
		...(dataA.bids ?? []),
		...(dataB.asks ?? []),
		...(dataB.bids ?? []),
	];
	const micro = levels.filter((l) => Number(l.size) > 0 && Number(l.size) < 1e-6);
	if (micro.length === 0) return;
	const key = `${pid}\0${venueWire}`;
	if (dflowKalshiMicroSizeLogged.has(key)) return;
	dflowKalshiMicroSizeLogged.add(key);
	console.debug("[venue-monitor] Microscopic resting sizes on venue_prices (debug verify)", {
		pandaMatchId: pid,
		venue: venueWire,
		count: micro.length,
		sample: micro.slice(0, 8).map((l) => ({
			price: l.price,
			size: l.size,
		})),
	});
}

export type VenuePricesSubscriptionMode =
	| { type: "selective"; pandaMatchIds: string[]; bboOnly?: boolean }
	| { type: "all_bbo" };

export interface VenuePricesClientSnapshot {
	connected: boolean;
	lastWsError: string | null;
	appState: OddsMonitorAppState | null;
}

type Listener = () => void;

type VenueKey = "polymarket" | "dflow" | "kalshi" | "predictfun" | "limitless" | "levelup";

const VENUE_PRICE_FIELDS: Record<VenueKey, [keyof MatchedMarket, keyof MatchedMarket][]> = {
	polymarket: [["polyPriceA", "polyPriceB"]],
	dflow: [["dflowPriceA", "dflowPriceB"]],
	kalshi: [["dflowPriceA", "dflowPriceB"]],
	predictfun: [["predictFunPriceA", "predictFunPriceB"]],
	limitless: [["limitlessPriceA", "limitlessPriceB"]],
	levelup: [["levelUpPriceA", "levelUpPriceB"]],
};

function venueWireNameToKey(venue: string): VenueKey | null {
	const v = venue.toLowerCase();
	if (v === "predictfun") return "predictfun";
	if (v === "polymarket") return "polymarket";
	if (v === "dflow") return "dflow";
	if (v === "kalshi") return "kalshi";
	if (v === "limitless") return "limitless";
	if (v === "levelup") return "levelup";
	return null;
}

const limitlessWsOrderbookLogLast = new Map<string, string>();

function limitlessChartDisplayPct(book: OrderbookData): number | null {
	if (book.bestAsk == null) return null;
	const x = Number(book.bestAsk);
	if (!Number.isFinite(x) || x < 0.005 || x > 0.995) return null;
	return Math.round(x * 100);
}

function summarizeBookLevels(book: OrderbookData, max: number) {
	const asks = (book.asks ?? []).slice(0, max).map((l) => ({ price: l.price, size: l.size }));
	const bids = (book.bids ?? []).slice(0, max).map((l) => ({ price: l.price, size: l.size }));
	return { asks, bids };
}

function logLimitlessWsOrderbookIfChanged(
	pandaId: string,
	snap: VenuePriceSnapshot,
	dataA: ReturnType<typeof teamToOrderbookData>,
	dataB: ReturnType<typeof teamToOrderbookData>,
	market: MatchedMarket,
): void {
	if (!isLimitlessConsoleDebugEnabled()) return;
	const sig = [
		snap.status ?? "",
		dataA.bestAsk,
		dataA.bestBid,
		dataA.snapshotStatus ?? "",
		dataB.bestAsk,
		dataB.bestBid,
		dataB.snapshotStatus ?? "",
		dataA.asks?.length ?? 0,
		dataB.asks?.length ?? 0,
	].join("|");
	if (limitlessWsOrderbookLogLast.get(pandaId) === sig) return;
	limitlessWsOrderbookLogLast.set(pandaId, sig);
	const lx = market.limitless;
	const payload: Record<string, unknown> = {
		pandaMatchId: pandaId,
		venue: "limitless",
		snapshotStatus: snap.status,
		mapping: lx
			? {
					slug: lx.slug,
					orderbookSlugA: lx.orderbookSlugA ?? null,
					orderbookSlugB: lx.orderbookSlugB ?? null,
				}
			: null,
		chartDisplayPctA: limitlessChartDisplayPct(dataA),
		chartDisplayPctB: limitlessChartDisplayPct(dataB),
		bookA: {
			bestAsk: dataA.bestAsk,
			bestBid: dataA.bestBid,
			snapshotStatus: dataA.snapshotStatus,
			askLevels: dataA.asks?.length ?? 0,
			bidLevels: dataA.bids?.length ?? 0,
		},
		bookB: {
			bestAsk: dataB.bestAsk,
			bestBid: dataB.bestBid,
			snapshotStatus: dataB.snapshotStatus,
			askLevels: dataB.asks?.length ?? 0,
			bidLevels: dataB.bids?.length ?? 0,
		},
	};
	if (isLimitlessOrderbookVerboseDebug()) {
		payload.topOfBookVerbose = {
			bookA: summarizeBookLevels(dataA, 5),
			bookB: summarizeBookLevels(dataB, 5),
		};
	}
	console.info("[limitless/ws-orderbook]", payload);
}

function bookHasQuotableLiquidity(book: OrderbookData | null | undefined): boolean {
	if (!book) return false;
	if (book.bestAsk != null && Number.isFinite(Number(book.bestAsk))) return true;
	if (book.bestBid != null && Number.isFinite(Number(book.bestBid))) return true;
	if (book.asks?.some((a) => (a.size ?? 0) > 0)) return true;
	if (book.bids?.some((b) => (b.size ?? 0) > 0)) return true;
	return false;
}

export function applyVenuePriceUpdates(
	markets: Map<string, MatchedMarket>,
	snapshots: VenuePriceSnapshot[],
): boolean {
	let changed = false;
	for (const snap of snapshots) {
		const market = markets.get(String(snap.pandaMatchId ?? "").trim());
		if (!market) continue;

		const venue = venueWireNameToKey(snap.venue);
		const fieldPairs = venue ? VENUE_PRICE_FIELDS[venue] : undefined;
		if (!fieldPairs) continue;

		const dataA = teamToOrderbookData(snap.teamA, snap.status);
		const dataB = teamToOrderbookData(snap.teamB, snap.status);
		if (venue === "dflow" || venue === "kalshi") {
			logDflowKalshiMicroscopicRestingSizesIfDebug(
				String(snap.pandaMatchId ?? "").trim(),
				snap.venue,
				dataA,
				dataB,
			);
		}
		let assignA = dataA;
		let assignB = dataB;
		if (venue === "limitless") {
			const prevA = market.limitlessPriceA;
			const prevB = market.limitlessPriceB;
			const allowClear = snap.status === "no_liquidity";
			if (!allowClear && !bookHasQuotableLiquidity(dataA) && bookHasQuotableLiquidity(prevA)) {
				assignA = prevA as OrderbookData;
			}
			if (!allowClear && !bookHasQuotableLiquidity(dataB) && bookHasQuotableLiquidity(prevB)) {
				assignB = prevB as OrderbookData;
			}
			const pid = String(snap.pandaMatchId ?? "").trim();
			if (pid) logLimitlessWsOrderbookIfChanged(pid, snap, assignA, assignB, market);
		}
		for (const [fieldA, fieldB] of fieldPairs) {
			const a = venue === "limitless" ? assignA : dataA;
			const b = venue === "limitless" ? assignB : dataB;
			(market as unknown as Record<string, unknown>)[fieldA] = a;
			(market as unknown as Record<string, unknown>)[fieldB] = b;
		}
		changed = true;
	}
	return changed;
}

export function venueSnapshotsFromWsMessage(message: {
	type?: string;
	data?: unknown;
	pandaMatchId?: string;
	venue?: string;
	teamA?: VenuePriceTeam;
	teamB?: VenuePriceTeam;
	timestamp?: number;
	status?: SnapshotStatus;
}): VenuePriceSnapshot[] {
	if (message.type === "venue_prices" && Array.isArray(message.data)) {
		return message.data as VenuePriceSnapshot[];
	}
	if (message.type === "venue_bbo") {
		if (Array.isArray(message.data)) return message.data as VenuePriceSnapshot[];
		if (
			typeof message.pandaMatchId === "string" &&
			message.pandaMatchId &&
			typeof message.venue === "string" &&
			message.teamA &&
			message.teamB
		) {
			return [
				{
					pandaMatchId: message.pandaMatchId,
					venue: message.venue,
					teamA: message.teamA,
					teamB: message.teamB,
					timestamp: typeof message.timestamp === "number" ? message.timestamp : Date.now(),
					status: message.status,
				},
			];
		}
	}
	return [];
}

function createStubMatchedMarket(pandaMatchId: string): MatchedMarket {
	const pid = String(pandaMatchId ?? "").trim();
	return {
		pandaMatchId: pid,
		umbrellaId: undefined,
		polyConditionId: "",
		pandaTeamA: "",
		pandaTeamB: "",
		polyTokenIdA: "",
		polyTokenIdB: "",
		sidesSwapped: false,
		polyPriceA: null,
		polyPriceB: null,
		dflowPriceA: null,
		dflowPriceB: null,
		predictFunPriceA: null,
		predictFunPriceB: null,
		limitlessPriceA: null,
		limitlessPriceB: null,
		levelUpPriceA: null,
		levelUpPriceB: null,
	};
}

function bufferOrApplyVenueSnapshots(
	markets: Map<string, MatchedMarket>,
	pending: Map<string, VenuePriceSnapshot[]>,
	snapshots: VenuePriceSnapshot[],
	subscribedPandaIds: Set<string>,
	allBboMode: boolean,
): boolean {
	let changed = false;
	const byId = new Map<string, VenuePriceSnapshot[]>();
	for (const s of snapshots) {
		const pid = String(s.pandaMatchId ?? "").trim();
		if (!pid) continue;
		const list = byId.get(pid) ?? [];
		list.push(s);
		byId.set(pid, list);
	}
	for (const [pid, snaps] of byId) {
		const shouldTrack = allBboMode || subscribedPandaIds.has(pid);
		if (!markets.has(pid) && shouldTrack) {
			markets.set(pid, createStubMatchedMarket(pid));
			changed = true;
		}
		if (markets.has(pid)) {
			if (applyVenuePriceUpdates(markets, snaps)) changed = true;
		} else if (shouldTrack) {
			const prev = pending.get(pid) ?? [];
			pending.set(pid, prev.concat(snaps));
		}
	}
	return changed;
}

class VenuePricesClient {
	private ws: WebSocket | null = null;
	private wsUrl: string | null = null;
	private shouldConnect = false;
	private reconnectAttempt = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly markets = new Map<string, MatchedMarket>();
	private readonly venueStatus = new Map<string, VenueStatusInfo[]>();
	private readonly pendingSnaps = new Map<string, VenuePriceSnapshot[]>();
	private readonly listeners = new Set<Listener>();
	private readonly rawSnapshotListeners = new Set<(snapshots: VenuePriceSnapshot[]) => void>();
	private connected = false;
	private lastWsError: string | null = null;
	private subscriptionMode: VenuePricesSubscriptionMode = { type: "selective", pandaMatchIds: [] };
	private prevSentPandaSubs = new Map<string, boolean | undefined>();
	private allBboActive = false;
	private appStateTimestamp = 0;
	private notifyTimer: ReturnType<typeof setTimeout> | null = null;
	private cachedSnapshot: VenuePricesClientSnapshot = {
		connected: false,
		lastWsError: null,
		appState: null,
	};

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	subscribeRawSnapshots(listener: (snapshots: VenuePriceSnapshot[]) => void): () => void {
		this.rawSnapshotListeners.add(listener);
		return () => this.rawSnapshotListeners.delete(listener);
	}

	private emitRawSnapshots(snapshots: VenuePriceSnapshot[]): void {
		if (snapshots.length === 0) return;
		for (const listener of this.rawSnapshotListeners) listener(snapshots);
	}

	getSnapshot(): VenuePricesClientSnapshot {
		return this.cachedSnapshot;
	}

	getMarketsMap(): ReadonlyMap<string, MatchedMarket> {
		return this.markets;
	}

	getMarket(pandaMatchId: string): MatchedMarket | undefined {
		return this.markets.get(String(pandaMatchId ?? "").trim());
	}

	findMarketByUmbrellaId(umbrellaId: string): MatchedMarket | null {
		const uid = String(umbrellaId ?? "").trim();
		if (!uid) return null;
		for (const m of this.markets.values()) {
			if (String(m.umbrellaId ?? "").trim() === uid) return m;
		}
		return null;
	}

	findMarketByConditionId(conditionId: string): MatchedMarket | null {
		const cid = String(conditionId ?? "").trim();
		if (!cid) return null;
		for (const m of this.markets.values()) {
			if (String(m.polyConditionId ?? "").trim() === cid) return m;
		}
		return null;
	}

	ensureMarketsFromUmbrella(umbrella: Umbrella, pandaMatchIds: string[]): void {
		if (ensureMarketsFromUmbrella(this.markets, umbrella, pandaMatchIds)) {
			this.notify();
		}
	}

	mergeMarketsFromMetadataBatch(items: MatchedMarketsApiItem[]): void {
		if (!items.length) return;
		const { next, changed } = mergeMatchedMarketsIntoStore(this.markets, items, []);
		let added = false;
		for (const [k, v] of next) {
			if (!this.markets.has(k)) {
				this.markets.set(k, v);
				added = true;
			}
		}
		if (!changed && !added) return;
		for (const [pid, snaps] of this.pendingSnaps.entries()) {
			if (this.markets.has(pid) && snaps.length) {
				if (applyVenuePriceUpdates(this.markets, snaps)) {
					this.pendingSnaps.delete(pid);
				}
			}
		}
		this.notify();
	}

	ensureStubMarkets(pandaMatchIds: string[]): void {
		let changed = false;
		for (const raw of pandaMatchIds) {
			const id = String(raw ?? "").trim();
			if (!id || this.markets.has(id)) continue;
			this.markets.set(id, createStubMatchedMarket(id));
			changed = true;
		}
		if (changed) this.notify();
	}

	mergePendingForIds(pandaMatchIds: string[]): void {
		let changed = false;
		for (const raw of pandaMatchIds) {
			const id = String(raw ?? "").trim();
			if (!id) continue;
			const buffered = this.pendingSnaps.get(id);
			if (buffered?.length) {
				if (applyVenuePriceUpdates(this.markets, buffered)) changed = true;
				this.pendingSnaps.delete(id);
			}
		}
		if (changed) this.notify();
	}

	replaceMarketsFromMetadata(
		items: MatchedMarketsApiItem[],
		activePandaMatchIds: string[],
	): void {
		const { next, changed: mergedChanged } = mergeMatchedMarketsIntoStore(
			this.markets,
			items,
			activePandaMatchIds,
		);
		let changed = mergedChanged;
		for (const [pid, snaps] of this.pendingSnaps.entries()) {
			if (next.has(pid) && snaps.length) {
				if (applyVenuePriceUpdates(next, snaps)) {
					changed = true;
				}
				this.pendingSnaps.delete(pid);
			}
		}
		if (!changed) return;
		this.markets.clear();
		for (const [k, v] of next) this.markets.set(k, v);
		this.notify();
	}

	start(wsUrl: string | null): void {
		if (this.wsUrl === wsUrl && this.shouldConnect) return;
		this.wsUrl = wsUrl;
		this.shouldConnect = Boolean(wsUrl);
		if (!wsUrl) {
			this.teardownConnection();
			this.notify();
			return;
		}
		this.connect();
	}

	setSubscription(mode: VenuePricesSubscriptionMode): void {
		this.subscriptionMode = mode;
		this.applySubscriptionOnOpen();
	}

	private buildAppState(): OddsMonitorAppState | null {
		if (this.markets.size === 0 && !this.appStateTimestamp) return null;
		const markets = Array.from(this.markets.values());
		for (const m of markets) {
			const vs = this.venueStatus.get(m.pandaMatchId);
			if (vs) m.venueStatuses = vs;
		}
		return { timestamp: this.appStateTimestamp || Date.now(), markets };
	}

	private notify(): void {
		if (this.notifyTimer !== null) return;
		this.notifyTimer = setTimeout(() => {
			this.notifyTimer = null;
			this.appStateTimestamp = Date.now();
			this.cachedSnapshot = {
				connected: this.connected,
				lastWsError: this.lastWsError,
				appState: this.buildAppState(),
			};
			for (const listener of this.listeners) listener();
		}, NOTIFY_COALESCE_MS);
	}

	private flushNotifyNow(): void {
		if (this.notifyTimer !== null) {
			clearTimeout(this.notifyTimer);
			this.notifyTimer = null;
		}
		this.appStateTimestamp = Date.now();
		this.cachedSnapshot = {
			connected: this.connected,
			lastWsError: this.lastWsError,
			appState: this.buildAppState(),
		};
		for (const listener of this.listeners) listener();
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	private teardownConnection(): void {
		this.clearReconnectTimer();
		this.shouldConnect = false;
		const w = this.ws;
		this.ws = null;
		if (w) disposeWebSocket(w);
		this.connected = false;
		this.prevSentPandaSubs = new Map();
		this.allBboActive = false;
	}

	private getSubscribedPandaIds(): Set<string> {
		if (this.subscriptionMode.type === "all_bbo") return new Set();
		return new Set(
			this.subscriptionMode.pandaMatchIds.map((id) => String(id).trim()).filter(Boolean),
		);
	}

	private applySubscriptionOnOpen(): void {
		const socket = this.ws;
		if (!socket || socket.readyState !== WebSocket.OPEN) return;

		if (this.subscriptionMode.type === "all_bbo") {
			if (!this.allBboActive) {
				try {
					socket.send(JSON.stringify({ type: "subscribe_all_bbo" }));
				} catch {
					/* ignore */
				}
				this.allBboActive = true;
				this.prevSentPandaSubs = new Map();
			}
			return;
		}

		if (this.allBboActive) {
			this.allBboActive = false;
		}

		const bboOnly =
			this.subscriptionMode.type === "selective" ? this.subscriptionMode.bboOnly : undefined;
		const want = this.getSubscribedPandaIds();
		const prev = this.prevSentPandaSubs;
		for (const id of prev.keys()) {
			if (!want.has(id)) {
				try {
					socket.send(JSON.stringify({ type: "unsubscribe", pandaMatchId: id }));
				} catch {
					/* ignore */
				}
			}
		}
		const nextSent = new Map<string, boolean | undefined>();
		for (const id of want) {
			const prevBbo = prev.get(id);
			if (prev.has(id) && prevBbo === bboOnly) {
				nextSent.set(id, bboOnly);
				continue;
			}
			if (prev.has(id)) {
				try {
					socket.send(JSON.stringify({ type: "unsubscribe", pandaMatchId: id }));
				} catch {
					/* ignore */
				}
			}
			try {
				socket.send(
					JSON.stringify({
						type: "subscribe",
						pandaMatchId: id,
						...(bboOnly ? { bboOnly: true } : {}),
					}),
				);
			} catch {
				/* ignore */
			}
			nextSent.set(id, bboOnly);
		}
		this.prevSentPandaSubs = nextSent;
	}

	private connect(): void {
		this.clearReconnectTimer();
		if (!this.shouldConnect || !this.wsUrl) return;

		try {
			const ws = new WebSocket(this.wsUrl);
			this.ws = ws;

			ws.onopen = () => {
				if (this.ws !== ws) return;
				this.connected = true;
				this.lastWsError = null;
				this.reconnectAttempt = 0;
				this.allBboActive = false;
				this.prevSentPandaSubs = new Map();
				this.applySubscriptionOnOpen();
				this.flushNotifyNow();
			};

			ws.onmessage = (event) => {
				if (this.ws !== ws) return;
				try {
					const message = JSON.parse(event.data as string);
					if (
						message.type === "venue_prices_connected" ||
						message.type === "subscribed" ||
						message.type === "unsubscribed" ||
						message.type === "subscribed_all_bbo" ||
						message.type === "subscribed_all"
					) {
						return;
					}
					if (message.type === "venue_prices" || message.type === "venue_bbo") {
						const snaps = venueSnapshotsFromWsMessage(message);
						if (snaps.length) {
							this.emitRawSnapshots(snaps);
							const allBbo = this.subscriptionMode.type === "all_bbo";
							const subscribed = this.getSubscribedPandaIds();
							const changed = bufferOrApplyVenueSnapshots(
								this.markets,
								this.pendingSnaps,
								snaps,
								subscribed,
								allBbo,
							);
							if (changed) this.notify();
						}
						return;
					}
					if (
						message.type === "venue_status" &&
						message.pandaMatchId &&
						Array.isArray(message.venues)
					) {
						const mid = String(message.pandaMatchId ?? "").trim();
						this.venueStatus.set(mid, message.venues as VenueStatusInfo[]);
						const market = mid ? this.markets.get(mid) : undefined;
						if (market) {
							market.venueStatuses = message.venues as VenueStatusInfo[];
							this.notify();
						}
					}
				} catch {
					this.lastWsError = "Failed to parse WebSocket message";
					this.notify();
				}
			};

			ws.onerror = () => {
				this.lastWsError = "WebSocket error";
				this.notify();
			};

			ws.onclose = (ev) => {
				if (this.ws === ws) this.ws = null;
				this.connected = false;
				this.allBboActive = false;
				this.prevSentPandaSubs = new Map();
				if (ev.reason) this.lastWsError = ev.reason;
				this.notify();

				if (!this.shouldConnect) return;

				const attempt = this.reconnectAttempt;
				this.reconnectAttempt = attempt + 1;
				if (attempt >= MAX_RECONNECT_ATTEMPTS) {
					this.lastWsError = "Venue prices WebSocket unavailable";
					this.notify();
					return;
				}
				this.reconnectTimer = setTimeout(() => this.connect(), nextReconnectDelayMs(attempt));
			};
		} catch {
			this.lastWsError = "Failed to create WebSocket";
			this.notify();
			if (this.shouldConnect && this.wsUrl) {
				const attempt = this.reconnectAttempt;
				this.reconnectAttempt = attempt + 1;
				if (attempt >= MAX_RECONNECT_ATTEMPTS) {
					this.lastWsError = "Venue prices WebSocket unavailable";
					this.notify();
					return;
				}
				this.reconnectTimer = setTimeout(() => this.connect(), nextReconnectDelayMs(attempt));
			}
		}
	}
}

let clientInstance: VenuePricesClient | null = null;

export function getVenuePricesClient(): VenuePricesClient {
	if (!clientInstance) clientInstance = new VenuePricesClient();
	return clientInstance;
}

export function getDefaultVenuePricesWsUrl(): string | null {
	return getOddsWebSocketUrl();
}

export function subscribeVenuePricesClient(onStoreChange: () => void): () => void {
	return getVenuePricesClient().subscribe(onStoreChange);
}

export function getVenuePricesConnectedSnapshot(): boolean {
	return getVenuePricesClient().getSnapshot().connected;
}

export function getVenuePricesLastErrorSnapshot(): string | null {
	return getVenuePricesClient().getSnapshot().lastWsError;
}

export function getVenuePricesClientSnapshot() {
	return getVenuePricesClient().getSnapshot();
}
