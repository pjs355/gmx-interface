import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	MatchedMarket,
	OddsMonitorAppState,
	OrderbookData,
	SnapshotStatus,
	VenueStatusInfo,
} from "@/types/odds-monitor";
import { getMatchedMarketsUrl } from "@/config/oddsMonitorBase";
import type { MatchedMarketsDflowWire } from "@/types/matchedMarketsDflowWire";
import {
	isLimitlessConsoleDebugEnabled,
	isLimitlessOrderbookVerboseDebug,
} from "@/trading/limitless/limitlessConsoleDebug";
import { isPredictionPricingDebugEnabled } from "@/utils/debugPredictionPricing";
import { disposeWebSocket } from "@/utils/disposeWebSocket";

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;
const MAPPING_REFRESH_MS = 5 * 60_000;
const MAX_RECONNECT_ATTEMPTS = 8;

/** Dedupe plan-verify logs: microscopic resting sizes on DFlow/Kalshi venue_prices. */
const dflowKalshiMicroSizeLogged = new Set<string>();

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
	const micro = levels.filter(
		(l) => Number(l.size) > 0 && Number(l.size) < 1e-6,
	);
	if (micro.length === 0) return;
	const key = `${pid}\0${venueWire}`;
	if (dflowKalshiMicroSizeLogged.has(key)) return;
	dflowKalshiMicroSizeLogged.add(key);
	console.debug(
		"[venue-monitor] Microscopic resting sizes on venue_prices (debug verify)",
		{
			pandaMatchId: pid,
			venue: venueWire,
			count: micro.length,
			sample: micro.slice(0, 8).map((l) => ({
				price: l.price,
				size: l.size,
			})),
		},
	);
}

function nextReconnectDelayMs(attempt: number): number {
	const exp = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * Math.pow(2, attempt));
	const jitter = Math.random() * exp * 0.25;
	return Math.min(MAX_BACKOFF_MS, Math.floor(exp + jitter));
}

export interface UseOddsMonitorWebSocketResult {
	connected: boolean;
	appState: OddsMonitorAppState | null;
	lastWsError: string | null;
	enabled: boolean;
	sendGetState: () => void;
}

// ── Matched-markets REST → MatchedMarket[] conversion ──────────────
// Portfolio Predict resolution (`buildPredictUmbrellaLookup`) needs `predictFun` ids to match
// Predict.fun REST: `marketIdA/B` as numeric strings and/or `tokenIdA/B` as outcome ERC1155 ids.

interface MatchedMarketsApiItem {
	pandaMatchId: string;
	umbrellaId: string;
	displayName: string;
	game?: string;
	status?: string;
	eventDate?: string;
	pandaTeamA?: string;
	pandaTeamB?: string;
	exchangeMatching: {
		polymarket?: {
			conditionId: string;
			slug?: string;
			tokenIdA: string;
			tokenIdB: string;
			negRisk: boolean;
			tickSize: string;
		};
		kalshi?: { tickerA: string; tickerB?: string; eventTicker: string };
		dflow?: MatchedMarketsDflowWire;
		/** When present, `tokenIdA/B` must match Predict outcome ERC1155 ids for portfolio lookup. */
		predictFun?: {
			marketIdA?: string;
			marketIdB?: string;
			tokenIdA?: string;
			tokenIdB?: string;
			decimalPrecision: number;
			singleMarket?: boolean;
		};
		limitless?: {
			slug: string;
			tokenIdA: string;
			tokenIdB: string;
			orderbookSlugA?: string;
			orderbookSlugB?: string;
		};
	};
}

/**
 * When a page subscribes to venue_prices for a Panda id that is not in GET /matched-markets,
 * we still need a map row so WS snapshots merge (otherwise they sit in pending forever).
 */
function createStubMatchedMarket(pandaMatchId: string): MatchedMarket {
	const pid = String(pandaMatchId ?? "").trim();
	return apiItemToMatchedMarket(
		{
			pandaMatchId: pid,
			umbrellaId: "",
			displayName: "",
			exchangeMatching: {},
		},
		pid,
	);
}

function apiItemToMatchedMarket(
	item: MatchedMarketsApiItem,
	normalizedPandaId: string,
): MatchedMarket {
	const em = item.exchangeMatching;
	return {
		pandaMatchId: normalizedPandaId,
		umbrellaId: item.umbrellaId ? String(item.umbrellaId).trim() : undefined,
		polyConditionId: em.polymarket?.conditionId ?? "",
		pandaTeamA: item.pandaTeamA ?? "",
		pandaTeamB: item.pandaTeamB ?? "",
		polyTokenIdA: em.polymarket?.tokenIdA ?? "",
		polyTokenIdB: em.polymarket?.tokenIdB ?? "",
		sidesSwapped: false,
		status: item.status,
		game: item.game,
		polyTickSize: (em.polymarket?.tickSize as any) ?? null,
		polyNegRisk: em.polymarket?.negRisk ?? null,
		dflow: em.dflow ?? undefined,
		kalshi: em.kalshi ?? undefined,
		predictFun: em.predictFun
			? {
					marketIdA: em.predictFun.marketIdA,
					marketIdB: em.predictFun.marketIdB,
					tokenIdA: em.predictFun.tokenIdA,
					tokenIdB: em.predictFun.tokenIdB,
					decimalPrecision: (em.predictFun.decimalPrecision ?? 2) as 2 | 3,
					singleMarket: em.predictFun.singleMarket,
				}
			: undefined,
		limitless: em.limitless ?? undefined,
		polyPriceA: null,
		polyPriceB: null,
		dflowPriceA: null,
		dflowPriceB: null,
		kalshiPriceA: null,
		kalshiPriceB: null,
		predictFunPriceA: null,
		predictFunPriceB: null,
		limitlessPriceA: null,
		limitlessPriceB: null,
		levelUpPriceA: null,
		levelUpPriceB: null,
	};
}

// ── Venue-prices WS → price merge ──────────────────────────────────

interface VenuePriceTeam {
	bestBid: number | null;
	bestAsk: number | null;
	bids?: { price: number; size: number }[];
	asks?: { price: number; size: number }[];
	bidLevels?: number;
	askLevels?: number;
	totalBidLiquidity?: number;
	totalAskLiquidity?: number;
}

interface VenuePriceSnapshot {
	pandaMatchId: string;
	venue: string;
	teamA: VenuePriceTeam;
	teamB: VenuePriceTeam;
	timestamp: number;
	status?: SnapshotStatus;
}

function teamToOrderbookData(team: VenuePriceTeam, snapshotStatus?: SnapshotStatus): OrderbookData {
	return {
		bestBid: team.bestBid,
		bestAsk: team.bestAsk,
		bids: team.bids,
		asks: team.asks,
		bidLevels: team.bidLevels,
		askLevels: team.askLevels,
		totalBidLiquidity: team.totalBidLiquidity,
		totalAskLiquidity: team.totalAskLiquidity,
		lastUpdated: Date.now(),
		snapshotStatus,
	};
}

type VenueKey = "polymarket" | "dflow" | "kalshi" | "predictfun" | "limitless" | "levelup";

const VENUE_PRICE_FIELDS: Record<VenueKey, [keyof MatchedMarket, keyof MatchedMarket][]> = {
	polymarket: [["polyPriceA", "polyPriceB"]],
	dflow: [["dflowPriceA", "dflowPriceB"], ["kalshiPriceA", "kalshiPriceB"]],
	kalshi: [["dflowPriceA", "dflowPriceB"], ["kalshiPriceA", "kalshiPriceB"]],
	predictfun: [["predictFunPriceA", "predictFunPriceB"]],
	limitless: [["limitlessPriceA", "limitlessPriceB"]],
	levelup: [["levelUpPriceA", "levelUpPriceB"]],
};

/** Wire venue id from venue-prices snapshots (matches server `VenueConnectionManager`). */
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

/** Dedupe Limitless venue-prices logs (same book signature → one line). */
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

/**
 * Limitless upstream (Socket.IO → BFF) can emit transient empty teams on reconnect/throttle.
 * Without this, we overwrite good `limitlessPriceA/B` with empty books while chart history still looks fine.
 */
function bookHasQuotableLiquidity(book: OrderbookData | null | undefined): boolean {
	if (!book) return false;
	if (book.bestAsk != null && Number.isFinite(Number(book.bestAsk))) return true;
	if (book.bestBid != null && Number.isFinite(Number(book.bestBid))) return true;
	if (book.asks?.some((a) => (a.size ?? 0) > 0)) return true;
	if (book.bids?.some((b) => (b.size ?? 0) > 0)) return true;
	return false;
}

function applyPriceUpdates(
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
			/** Server says book is empty on purpose — allow UI to clear instead of freezing stale. */
			const allowClear = snap.status === "no_liquidity";
			if (
				!allowClear &&
				!bookHasQuotableLiquidity(dataA) &&
				bookHasQuotableLiquidity(prevA)
			) {
				assignA = prevA as OrderbookData;
			}
			if (
				!allowClear &&
				!bookHasQuotableLiquidity(dataB) &&
				bookHasQuotableLiquidity(prevB)
			) {
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

function bufferOrApplyVenueSnapshots(
	markets: Map<string, MatchedMarket>,
	pending: Map<string, VenuePriceSnapshot[]>,
	snapshots: VenuePriceSnapshot[],
	subscribedPandaIds: Set<string>,
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
		if (!markets.has(pid) && subscribedPandaIds.has(pid)) {
			markets.set(pid, createStubMatchedMarket(pid));
			changed = true;
		}
		if (markets.has(pid)) {
			if (applyPriceUpdates(markets, snaps)) changed = true;
		} else {
			const prev = pending.get(pid) ?? [];
			pending.set(pid, prev.concat(snaps));
		}
	}
	return changed;
}

function venueSnapshotsFromMessage(message: {
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

// ── Hook ────────────────────────────────────────────────────────────

/**
 * Connects to the predictions server venue-prices WebSocket and
 * fetches market mappings from the matched-markets REST endpoint.
 * Merges both into OddsMonitorAppState.markets (MatchedMarket[])
 * so all downstream consumers work unchanged.
 */
export function useOddsMonitorWebSocket(
	wsUrl: string | null,
	activePandaMatchIds: string[] = [],
): UseOddsMonitorWebSocketResult {
	const [connected, setConnected] = useState(false);
	const [appState, setAppState] = useState<OddsMonitorAppState | null>(null);
	const [lastWsError, setLastWsError] = useState<string | null>(null);

	const wsRef = useRef<WebSocket | null>(null);
	const reconnectAttemptRef = useRef(0);
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const shouldConnectRef = useRef(true);
	const marketsRef = useRef<Map<string, MatchedMarket>>(new Map());
	const venueStatusRef = useRef<Map<string, VenueStatusInfo[]>>(new Map());
	const mappingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const mappingFetchInflightRef = useRef<Promise<void> | null>(null);
	const pendingVenueSnapsRef = useRef<Map<string, VenuePriceSnapshot[]>>(new Map());
	const prevSentPandaSubsRef = useRef<Set<string>>(new Set());
	/** Latest Panda ids for subscribe — updated every render so ws.onopen can send before React flushes the subscribe effect. */
	const activePandaMatchIdsRef = useRef<string[]>(activePandaMatchIds);
	activePandaMatchIdsRef.current = activePandaMatchIds;

	const clearReconnectTimer = () => {
		if (reconnectTimerRef.current !== null) {
			clearTimeout(reconnectTimerRef.current);
			reconnectTimerRef.current = null;
		}
	};

	const publishState = useCallback(() => {
		const markets = Array.from(marketsRef.current.values());
		const statuses = venueStatusRef.current;
		if (statuses.size) {
			for (const m of markets) {
				const vs = statuses.get(m.pandaMatchId);
				if (vs) m.venueStatuses = vs;
			}
		}
		setAppState({ timestamp: Date.now(), markets });
	}, []);

	const verboseVenueMappings =
		import.meta.env.DEV && import.meta.env.VITE_VERBOSE_VENUE_MONITOR === "true";

	const fetchMappings = useCallback(async () => {
		if (mappingFetchInflightRef.current) {
			await mappingFetchInflightRef.current;
			return;
		}
		const run = (async () => {
			try {
			const url = getMatchedMarketsUrl();
			const res = await fetch(url);
			if (!res.ok) {
				return;
			}
			const items: MatchedMarketsApiItem[] = await res.json();
			if (!Array.isArray(items)) {
				return;
			}

			// Heavy: per-item groups + console.table. Opt-in via VITE_VERBOSE_VENUE_MONITOR=true
			if (verboseVenueMappings) {
				console.group(`[venue-monitor] 🔍 Umbrella Matched-Markets Breakdown (${items.length} items)`);
				for (const item of items) {
					const em = item.exchangeMatching;
					const hasPoly = Boolean(em.polymarket);
					const hasDflow = Boolean(em.dflow);
					const hasKalshi = Boolean(em.kalshi);
					const hasLimitless = Boolean(em.limitless);
					const hasPredictFun = Boolean(em.predictFun);

					const venues = [
						hasPoly ? "✅ Polymarket" : "❌ Polymarket",
						hasDflow ? "✅ DFlow" : "❌ DFlow",
						hasKalshi ? "⚠️ Kalshi(legacy)" : null,
						hasLimitless ? "✅ Limitless" : "❌ Limitless",
						hasPredictFun ? "✅ Predict.fun" : "❌ Predict.fun",
					].filter(Boolean).join(" | ");

					console.groupCollapsed(
						`[${item.pandaMatchId}] ${item.displayName ?? "??"}  —  ${venues}`
					);
					console.log("  pandaMatchId:", item.pandaMatchId);
					console.log("  umbrellaId:", item.umbrellaId);
					console.log("  displayName:", item.displayName);
					console.log("  game:", item.game ?? "(none)");
					console.log("  status:", item.status ?? "(none)");
					console.log("  eventDate:", item.eventDate ?? "(none)");
					console.log("  pandaTeamA:", item.pandaTeamA ?? "(none)");
					console.log("  pandaTeamB:", item.pandaTeamB ?? "(none)");

					if (em.polymarket) {
						console.log("  📊 Polymarket:", {
							conditionId: em.polymarket.conditionId,
							slug: em.polymarket.slug ?? "(none)",
							tokenIdA: em.polymarket.tokenIdA || "⚠️ MISSING",
							tokenIdB: em.polymarket.tokenIdB || "⚠️ MISSING",
							negRisk: em.polymarket.negRisk,
							tickSize: em.polymarket.tickSize,
						});
					} else {
						console.log("  📊 Polymarket: NOT MATCHED");
					}

					if (em.dflow) {
						console.log("  🔷 DFlow:", {
							tickerA: em.dflow.tickerA || "⚠️ MISSING",
							tickerB: em.dflow.tickerB ?? "(none)",
							eventTicker: em.dflow.eventTicker || "⚠️ MISSING",
							yesMintA: em.dflow.yesMintA ?? "(none)",
							yesMintB: em.dflow.yesMintB ?? "(none)",
						});
					} else {
						console.log("  🔷 DFlow: NOT MATCHED");
					}

					if (em.kalshi) {
						console.log("  ⚠️ Kalshi (legacy):", em.kalshi);
					}

					if (em.limitless) {
						console.log("  🟢 Limitless:", {
							slug: em.limitless.slug || "⚠️ MISSING",
							tokenIdA: em.limitless.tokenIdA || "⚠️ MISSING",
							tokenIdB: em.limitless.tokenIdB || "⚠️ MISSING",
							orderbookSlugA: em.limitless.orderbookSlugA ?? "(none)",
							orderbookSlugB: em.limitless.orderbookSlugB ?? "(none)",
						});
					} else {
						console.log("  🟢 Limitless: NOT MATCHED");
					}

					if (em.predictFun) {
						console.log("  🟣 Predict.fun:", {
							marketIdA: em.predictFun.marketIdA ?? "⚠️ MISSING",
							marketIdB: em.predictFun.marketIdB ?? "⚠️ MISSING",
							decimalPrecision: em.predictFun.decimalPrecision,
							singleMarket: em.predictFun.singleMarket ?? false,
						});
					} else {
						console.log("  🟣 Predict.fun: NOT MATCHED");
					}

					console.log("  Raw exchangeMatching:", JSON.parse(JSON.stringify(em)));
					console.groupEnd();
				}

				// Summary table
				const summary = items.map((item) => ({
					match: `${item.displayName ?? item.pandaMatchId}`,
					pandaId: item.pandaMatchId,
					umbrellaId: item.umbrellaId,
					poly: item.exchangeMatching.polymarket
						? `tokenA:${item.exchangeMatching.polymarket.tokenIdA ? "✅" : "❌"} tokenB:${item.exchangeMatching.polymarket.tokenIdB ? "✅" : "❌"}`
						: "—",
					dflow: item.exchangeMatching.dflow
						? `tickerA:${item.exchangeMatching.dflow.tickerA ? "✅" : "❌"} mintA:${item.exchangeMatching.dflow.yesMintA ? "✅" : "❌"}`
						: "—",
					limitless: item.exchangeMatching.limitless
						? `tokenA:${item.exchangeMatching.limitless.tokenIdA ? "✅" : "❌"} tokenB:${item.exchangeMatching.limitless.tokenIdB ? "✅" : "❌"}`
						: "—",
					predictFun: item.exchangeMatching.predictFun
						? `idA:${item.exchangeMatching.predictFun.marketIdA ? "✅" : "❌"} idB:${item.exchangeMatching.predictFun.marketIdB ? "✅" : "❌"}`
						: "—",
				}));
				console.table(summary);
				console.groupEnd();
			}

			const existing = marketsRef.current;
			const next = new Map<string, MatchedMarket>();

			for (const item of items) {
				const pid = String(item.pandaMatchId ?? "").trim();
				if (!pid) continue;
				const prev = existing.get(pid);
				const base = apiItemToMatchedMarket(item, pid);
				if (prev) {
					base.polyPriceA = prev.polyPriceA;
					base.polyPriceB = prev.polyPriceB;
					base.dflowPriceA = prev.dflowPriceA;
					base.dflowPriceB = prev.dflowPriceB;
					base.kalshiPriceA = prev.kalshiPriceA;
					base.kalshiPriceB = prev.kalshiPriceB;
					base.predictFunPriceA = prev.predictFunPriceA;
					base.predictFunPriceB = prev.predictFunPriceB;
					base.limitlessPriceA = prev.limitlessPriceA;
					base.limitlessPriceB = prev.limitlessPriceB;
					base.levelUpPriceA = prev.levelUpPriceA;
					base.levelUpPriceB = prev.levelUpPriceB;
				}
				/**
				 * GET /matched-markets can briefly omit `limitless` on a row that still has live books.
				 * Without this, `base.limitless` becomes undefined → Basic tab drops the Limitless row entirely.
				 */
				if (
					prev &&
					!base.limitless &&
					prev.limitless &&
					(bookHasQuotableLiquidity(prev.limitlessPriceA) ||
						bookHasQuotableLiquidity(prev.limitlessPriceB))
				) {
					base.limitless = prev.limitless;
				}
				next.set(pid, base);
			}

			/* Rows the UI subscribed to but missing from /matched-markets (e.g. local DB skew). */
			for (const raw of activePandaMatchIdsRef.current) {
				const key = String(raw ?? "").trim();
				if (!key || next.has(key)) continue;
				const prev = existing.get(key);
				next.set(key, prev ?? createStubMatchedMarket(key));
			}

			marketsRef.current = next;

			const pend = pendingVenueSnapsRef.current;
			for (const [pid, snaps] of Array.from(pend.entries())) {
				if (next.has(pid) && snaps.length) {
					if (applyPriceUpdates(marketsRef.current, snaps)) {
						/* merged buffered BBO into new row */
					}
					pend.delete(pid);
				}
			}

			publishState();
			} catch {
				/* mapping fetch failed — state unchanged */
			}
		})();
		mappingFetchInflightRef.current = run.finally(() => {
			mappingFetchInflightRef.current = null;
		});
		await run;
	}, [publishState, verboseVenueMappings]);

	const sendGetState = useCallback(() => {
		// Legacy compatibility; triggers a fresh mapping fetch
		fetchMappings();
	}, [fetchMappings]);

	useEffect(() => {
		shouldConnectRef.current = true;

		if (!wsUrl) {
			clearReconnectTimer();
			if (mappingTimerRef.current) {
				clearInterval(mappingTimerRef.current);
				mappingTimerRef.current = null;
			}
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}
			setConnected(false);
			setAppState(null);
			setLastWsError(null);
			prevSentPandaSubsRef.current = new Set();
			pendingVenueSnapsRef.current = new Map();
			return;
		}

		fetchMappings();
		mappingTimerRef.current = setInterval(fetchMappings, MAPPING_REFRESH_MS);

		const connect = () => {
			clearReconnectTimer();
			if (!shouldConnectRef.current || !wsUrl) return;

			try {
				const ws = new WebSocket(wsUrl);
				wsRef.current = ws;

				ws.onopen = () => {
					if (wsRef.current !== ws) return;
					const want = new Set(
						activePandaMatchIdsRef.current
							.map((id) => String(id).trim())
							.filter(Boolean),
					);
					prevSentPandaSubsRef.current = new Set();
					for (const id of want) {
						try {
							ws.send(JSON.stringify({ type: "subscribe", pandaMatchId: id }));
						} catch {
							/* ignore */
						}
					}
					prevSentPandaSubsRef.current = new Set(want);
					setConnected(true);
					setLastWsError(null);
					reconnectAttemptRef.current = 0;
				};

				ws.onmessage = (event) => {
					if (wsRef.current !== ws) return;
					try {
						const message = JSON.parse(event.data as string);
						if (
							message.type === "venue_prices_connected" ||
							message.type === "subscribed" ||
							message.type === "unsubscribed"
						) {
							return;
						}
						if (message.type === "venue_prices" || message.type === "venue_bbo") {
							const snaps = venueSnapshotsFromMessage(message);
							if (snaps.length) {
								const subscribed = new Set(
									activePandaMatchIdsRef.current
										.map((id) => String(id).trim())
										.filter(Boolean),
								);
								const changed = bufferOrApplyVenueSnapshots(
									marketsRef.current,
									pendingVenueSnapsRef.current,
									snaps,
									subscribed,
								);
								if (changed) publishState();
							}
							return;
						}
						if (
							message.type === "venue_status" &&
							message.pandaMatchId &&
							Array.isArray(message.venues)
						) {
							const mid = String(message.pandaMatchId ?? "").trim();
							venueStatusRef.current.set(
								mid,
								message.venues as VenueStatusInfo[],
							);
							const market = mid ? marketsRef.current.get(mid) : undefined;
							if (market) {
								market.venueStatuses = message.venues as VenueStatusInfo[];
								publishState();
							}
						}
					} catch {
						setLastWsError("Failed to parse WebSocket message");
					}
				};

				ws.onerror = () => {
					setLastWsError("WebSocket error");
				};

				ws.onclose = (ev) => {
					if (wsRef.current === ws) wsRef.current = null;
					setConnected(false);

					if (ev.reason) setLastWsError(ev.reason);

					if (!shouldConnectRef.current) return;

					const attempt = reconnectAttemptRef.current;
					reconnectAttemptRef.current = attempt + 1;

					if (attempt >= MAX_RECONNECT_ATTEMPTS) {
						setLastWsError("Venue prices WebSocket unavailable");
						return;
					}

					reconnectTimerRef.current = setTimeout(connect, nextReconnectDelayMs(attempt));
				};
			} catch {
				setLastWsError("Failed to create WebSocket");
				if (shouldConnectRef.current && wsUrl) {
					const attempt = reconnectAttemptRef.current;
					reconnectAttemptRef.current = attempt + 1;

					if (attempt >= MAX_RECONNECT_ATTEMPTS) {
						setLastWsError("Venue prices WebSocket unavailable");
						return;
					}

					reconnectTimerRef.current = setTimeout(connect, nextReconnectDelayMs(attempt));
				}
			}
		};

		connect();

		return () => {
			shouldConnectRef.current = false;
			clearReconnectTimer();
			if (mappingTimerRef.current) {
				clearInterval(mappingTimerRef.current);
				mappingTimerRef.current = null;
			}
			const w = wsRef.current;
			wsRef.current = null;
			if (w) disposeWebSocket(w);
		};
	}, [wsUrl, fetchMappings, publishState]);

	const pandaSubsKey = useMemo(
		() =>
			[...activePandaMatchIds]
				.map((id) => String(id).trim())
				.filter(Boolean)
				.sort()
				.join("\0"),
		[activePandaMatchIds],
	);

	useEffect(() => {
		const socket = wsRef.current;
		if (!socket || socket.readyState !== WebSocket.OPEN) return;

		const want = new Set(
			activePandaMatchIds.map((id) => String(id).trim()).filter(Boolean),
		);
		const prev = prevSentPandaSubsRef.current;

		for (const id of prev) {
			if (!want.has(id)) {
				try {
					socket.send(JSON.stringify({ type: "unsubscribe", pandaMatchId: id }));
				} catch {
					/* ignore */
				}
			}
		}
		for (const id of want) {
			if (!prev.has(id)) {
				try {
					socket.send(JSON.stringify({ type: "subscribe", pandaMatchId: id }));
				} catch {
					/* ignore */
				}
			}
		}
		prevSentPandaSubsRef.current = new Set(want);
	}, [connected, pandaSubsKey, activePandaMatchIds]);

	/** Ensure subscribed ids have a monitor row immediately (not only after first WS tick or mapping poll). */
	useEffect(() => {
		if (!connected) return;
		const want = new Set(
			activePandaMatchIds.map((id) => String(id).trim()).filter(Boolean),
		);
		let changed = false;
		for (const id of want) {
			if (!marketsRef.current.has(id)) {
				marketsRef.current.set(id, createStubMatchedMarket(id));
				changed = true;
			}
			const buffered = pendingVenueSnapsRef.current.get(id);
			if (buffered?.length) {
				if (applyPriceUpdates(marketsRef.current, buffered)) changed = true;
				pendingVenueSnapsRef.current.delete(id);
			}
		}
		if (changed) publishState();
	}, [connected, pandaSubsKey, activePandaMatchIds, publishState]);

	return {
		connected,
		appState,
		lastWsError,
		enabled: Boolean(wsUrl),
		sendGetState,
	};
}
