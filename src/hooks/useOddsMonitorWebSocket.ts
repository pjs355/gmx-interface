import { useCallback, useEffect, useRef, useState } from "react";
import type {
	MatchedMarket,
	OddsMonitorAppState,
	OrderbookData,
	SnapshotStatus,
	VenueStatusInfo,
} from "@/types/odds-monitor";
import { getMatchedMarketsUrl } from "@/config/oddsMonitorBase";

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;
const MAPPING_REFRESH_MS = 5 * 60_000;

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
		dflow?: {
			tickerA: string;
			tickerB?: string;
			eventTicker: string;
			yesMintA?: string;
			yesMintB?: string;
		};
		predictFun?: {
			marketIdA?: string;
			marketIdB?: string;
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

function apiItemToMatchedMarket(item: MatchedMarketsApiItem): MatchedMarket {
	const em = item.exchangeMatching;
	return {
		pandaMatchId: item.pandaMatchId,
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

type VenueKey = "polymarket" | "dflow" | "kalshi" | "predictfun" | "limitless";

const VENUE_PRICE_FIELDS: Record<VenueKey, [keyof MatchedMarket, keyof MatchedMarket][]> = {
	polymarket: [["polyPriceA", "polyPriceB"]],
	dflow: [["dflowPriceA", "dflowPriceB"], ["kalshiPriceA", "kalshiPriceB"]],
	kalshi: [["dflowPriceA", "dflowPriceB"], ["kalshiPriceA", "kalshiPriceB"]],
	predictfun: [["predictFunPriceA", "predictFunPriceB"]],
	limitless: [["limitlessPriceA", "limitlessPriceB"]],
};

/** Wire venue id from venue-prices snapshots (matches server `VenueConnectionManager`). */
function venueWireNameToKey(venue: string): VenueKey | null {
	const v = venue.toLowerCase();
	if (v === "predictfun") return "predictfun";
	if (v === "polymarket") return "polymarket";
	if (v === "dflow") return "dflow";
	if (v === "kalshi") return "kalshi";
	if (v === "limitless") return "limitless";
	return null;
}

function applyPriceUpdates(
	markets: Map<string, MatchedMarket>,
	snapshots: VenuePriceSnapshot[],
): boolean {
	let changed = false;
	for (const snap of snapshots) {
		const market = markets.get(snap.pandaMatchId);
		if (!market) continue;

		const venue = venueWireNameToKey(snap.venue);
		const fieldPairs = venue ? VENUE_PRICE_FIELDS[venue] : undefined;
		if (!fieldPairs) continue;

		const dataA = teamToOrderbookData(snap.teamA, snap.status);
		const dataB = teamToOrderbookData(snap.teamB, snap.status);
		for (const [fieldA, fieldB] of fieldPairs) {
			(market as any)[fieldA] = dataA;
			(market as any)[fieldB] = dataB;
		}
		changed = true;
	}
	return changed;
}

// ── Hook ────────────────────────────────────────────────────────────

/**
 * Connects to the predictions server venue-prices WebSocket and
 * fetches market mappings from the matched-markets REST endpoint.
 * Merges both into OddsMonitorAppState.markets (MatchedMarket[])
 * so all downstream consumers work unchanged.
 */
export function useOddsMonitorWebSocket(
	wsUrl: string | null
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

	const fetchMappings = useCallback(async () => {
		try {
			const url = getMatchedMarketsUrl();
			if (import.meta.env.DEV) console.log("[venue-monitor] Fetching mappings from", url);
			const res = await fetch(url);
			if (!res.ok) {
				if (import.meta.env.DEV) console.warn("[venue-monitor] Mappings fetch failed:", res.status, res.statusText);
				return;
			}
			const items: MatchedMarketsApiItem[] = await res.json();
			if (!Array.isArray(items)) {
				if (import.meta.env.DEV) console.warn("[venue-monitor] Mappings response is not an array");
				return;
			}
			if (import.meta.env.DEV) console.log("[venue-monitor] Loaded", items.length, "matched markets");

			// ── Debug: dump each umbrella's venue mapping detail ──
			if (import.meta.env.DEV) {
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
				const prev = existing.get(item.pandaMatchId);
				const base = apiItemToMatchedMarket(item);
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
				}
				next.set(item.pandaMatchId, base);
			}

			marketsRef.current = next;
			publishState();
		} catch (err) {
			if (import.meta.env.DEV) console.error("[venue-monitor] Mappings fetch error:", err);
		}
	}, [publishState]);

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
			return;
		}

		if (import.meta.env.DEV) console.log("[venue-monitor] Connecting to", wsUrl);
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
					if (import.meta.env.DEV) console.log("[venue-monitor] WebSocket connected");
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
							if (import.meta.env.DEV) console.log("[venue-monitor] WS:", message.type);
							return;
						}
						if (message.type === "venue_prices" && Array.isArray(message.data)) {
							const changed = applyPriceUpdates(
								marketsRef.current,
								message.data as VenuePriceSnapshot[],
							);
							if (changed) publishState();
							return;
						}
						if (
							message.type === "venue_status" &&
							message.pandaMatchId &&
							Array.isArray(message.venues)
						) {
							if (import.meta.env.DEV)
								console.log("[venue-monitor] venue_status for", message.pandaMatchId, message.venues);
							venueStatusRef.current.set(
								message.pandaMatchId as string,
								message.venues as VenueStatusInfo[],
							);
							const market = marketsRef.current.get(message.pandaMatchId as string);
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
					if (import.meta.env.DEV) console.error("[venue-monitor] WebSocket error");
					setLastWsError("WebSocket error");
				};

				ws.onclose = (ev) => {
					if (wsRef.current === ws) wsRef.current = null;
					setConnected(false);

					if (ev.reason) setLastWsError(ev.reason);

					if (!shouldConnectRef.current) return;

					const attempt = reconnectAttemptRef.current;
					reconnectAttemptRef.current = attempt + 1;
					reconnectTimerRef.current = setTimeout(connect, nextReconnectDelayMs(attempt));
				};
			} catch {
				setLastWsError("Failed to create WebSocket");
				if (shouldConnectRef.current && wsUrl) {
					const attempt = reconnectAttemptRef.current;
					reconnectAttemptRef.current = attempt + 1;
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
			if (w) w.close();
		};
	}, [wsUrl, fetchMappings, publishState]);

	return {
		connected,
		appState,
		lastWsError,
		enabled: Boolean(wsUrl),
		sendGetState,
	};
}
