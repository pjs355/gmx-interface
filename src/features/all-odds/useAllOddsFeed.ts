import { useCallback, useEffect, useRef, useState } from "react";
import type { TeamMapping } from "@/features/markets/listing/matchProps";
import { getMatchedMarketsUrl, getOddsWebSocketUrl } from "@/config/oddsMonitorBase";
import { disposeWebSocket } from "@/shared/async/disposeWebSocket";
import { allOddsVenueFieldPairs } from "./adapters";
import type { AllOddsExchangeMatching, AllOddsMarket } from "./types";
import {
	applyVenueSnapshotsToMarkets,
	venueSnapshotsFromMessage,
} from "./venueSnapshotMerge";
import { isActiveAllOddsMarket } from "./allOddsFreshness";
import { isMlbGameSlug } from "@/pages/Predictions/utils/gameLinkFilters";

function pickPriceFields(m: AllOddsMarket): Partial<AllOddsMarket> {
	return {
		polyPriceA: m.polyPriceA,
		polyPriceB: m.polyPriceB,
		predictFunPriceA: m.predictFunPriceA,
		predictFunPriceB: m.predictFunPriceB,
		limitlessPriceA: m.limitlessPriceA,
		limitlessPriceB: m.limitlessPriceB,
		kalshiPriceA: m.kalshiPriceA,
		kalshiPriceB: m.kalshiPriceB,
		myraidPriceA: m.myraidPriceA,
		myraidPriceB: m.myraidPriceB,
		betdexPriceA: m.betdexPriceA,
		betdexPriceB: m.betdexPriceB,
		forkastPriceA: m.forkastPriceA,
		forkastPriceB: m.forkastPriceB,
		sxbetPriceA: m.sxbetPriceA,
		sxbetPriceB: m.sxbetPriceB,
		hyperliquidPriceA: m.hyperliquidPriceA,
		hyperliquidPriceB: m.hyperliquidPriceB,
	};
}

interface MatchedMarketsApiItem {
	pandaMatchId: string;
	umbrellaId?: string;
	displayName: string;
	game?: string;
	status?: string;
	eventDate?: string;
	pandaTeamA?: string;
	pandaTeamB?: string;
	homeTeamName?: string;
	awayTeamName?: string;
	moneylineLeg?: "home" | "draw" | "away";
	marketType?: string;
	segment?: string;
	sortOrder?: number;
	teamMappings?: TeamMapping[];
	exchangeMatching?: AllOddsExchangeMatching;
}

function apiItemToAllOddsMarket(item: MatchedMarketsApiItem): AllOddsMarket {
	const umbrellaId = item.umbrellaId ? String(item.umbrellaId).trim() : undefined;
	return {
		pandaMatchId: item.pandaMatchId,
		umbrellaId: umbrellaId || undefined,
		displayName: item.displayName,
		game: item.game,
		status: item.status,
		eventDate:
			typeof item.eventDate === "string" && item.eventDate.trim().length > 0
				? item.eventDate.trim()
				: undefined,
		pandaTeamA: item.pandaTeamA,
		pandaTeamB: item.pandaTeamB,
		homeTeamName: item.homeTeamName,
		awayTeamName: item.awayTeamName,
		moneylineLeg: item.moneylineLeg,
		marketType: item.marketType,
		segment: typeof item.segment === "string" ? item.segment.trim() || undefined : undefined,
		sortOrder: typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder) ? item.sortOrder : undefined,
		teamMappings: item.teamMappings,
		exchangeMatching: item.exchangeMatching,
		polyPriceA: null,
		polyPriceB: null,
		predictFunPriceA: null,
		predictFunPriceB: null,
		limitlessPriceA: null,
		limitlessPriceB: null,
		kalshiPriceA: null,
		kalshiPriceB: null,
		myraidPriceA: null,
		myraidPriceB: null,
		betdexPriceA: null,
		betdexPriceB: null,
		forkastPriceA: null,
		forkastPriceB: null,
		sxbetPriceA: null,
		sxbetPriceB: null,
		hyperliquidPriceA: null,
		hyperliquidPriceB: null,
	};
}

const MAPPING_REFRESH_MS = 5 * 60_000;

export interface UseAllOddsFeedResult {
	markets: AllOddsMarket[];
	connected: boolean;
	error: string | null;
	loading: boolean;
}

export function useAllOddsFeed(): UseAllOddsFeedResult {
	const [markets, setMarkets] = useState<AllOddsMarket[]>([]);
	const [connected, setConnected] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const marketsRef = useRef(new Map<string, AllOddsMarket>());
	const wsRef = useRef<WebSocket | null>(null);

	const subscribeAllBbo = useCallback(() => {
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN) return;
		ws.send(JSON.stringify({ type: "subscribe_all_bbo" }));
	}, []);

	const syncMarketsState = useCallback(() => {
		setMarkets(Array.from(marketsRef.current.values()));
	}, []);

	const loadMatchedMarkets = useCallback(async () => {
		const url = getMatchedMarketsUrl();
		const res = await fetch(url);
		if (!res.ok) {
			throw new Error(`matched-markets ${res.status}`);
		}
		const items = (await res.json()) as MatchedMarketsApiItem[];
		const next = new Map<string, AllOddsMarket>();
		for (const item of items) {
			const pid = String(item.pandaMatchId ?? "").trim();
			if (!pid) continue;
			if (isMlbGameSlug(item.game)) continue;
			const prev = marketsRef.current.get(pid);
			const fresh = apiItemToAllOddsMarket(item);
			if (!isActiveAllOddsMarket(fresh)) continue;
			if (prev) {
				next.set(pid, { ...fresh, ...pickPriceFields(prev) });
			} else {
				next.set(pid, fresh);
			}
		}
		marketsRef.current = next;
		syncMarketsState();
		subscribeAllBbo();
	}, [syncMarketsState, subscribeAllBbo]);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		loadMatchedMarkets()
			.catch((err) => {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : String(err));
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		const refreshTimer = window.setInterval(() => {
			loadMatchedMarkets().catch(() => {});
		}, MAPPING_REFRESH_MS);

		return () => {
			cancelled = true;
			window.clearInterval(refreshTimer);
		};
	}, [loadMatchedMarkets]);

	useEffect(() => {
		const wsUrl = getOddsWebSocketUrl();
		if (!wsUrl) {
			setError("Venue prices WebSocket URL not configured");
			return;
		}

		const ws = new WebSocket(wsUrl);
		wsRef.current = ws;

		ws.onopen = () => {
			setConnected(true);
			setError(null);
			subscribeAllBbo();
		};

		ws.onmessage = (ev) => {
			try {
				const msg = JSON.parse(String(ev.data));
				if (
					msg?.type === "venue_prices_connected" ||
					msg?.type === "subscribed" ||
					msg?.type === "unsubscribed" ||
					msg?.type === "subscribed_all_bbo" ||
					msg?.type === "subscribed_all"
				) {
					return;
				}
				const snapshots = venueSnapshotsFromMessage(msg);
				if (snapshots.length === 0) return;
				const changed = applyVenueSnapshotsToMarkets(
					marketsRef.current,
					snapshots.filter((snap) => marketsRef.current.has(snap.pandaMatchId)),
					(venue) => allOddsVenueFieldPairs(venue),
				);
				if (changed) syncMarketsState();
			} catch {
				/* ignore malformed frames */
			}
		};

		ws.onerror = () => {
			setError("WebSocket connection error");
		};

		ws.onclose = () => {
			setConnected(false);
		};

		return () => {
			wsRef.current = null;
			disposeWebSocket(ws);
		};
	}, [syncMarketsState, subscribeAllBbo]);

	return { markets, connected, error, loading };
}
