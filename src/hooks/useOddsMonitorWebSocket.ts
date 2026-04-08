import { useCallback, useEffect, useRef, useState } from "react";
import type {
	MatchedMarket,
	OddsMonitorAppState,
} from "@/types/odds-monitor";
import { getMatchedMarketsUrl } from "@/config/oddsMonitorBase";

const MAPPING_REFRESH_MS = 5 * 60_000;

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

// ── Hook ────────────────────────────────────────────────────────────

/**
 * Fetches market mappings from the matched-markets REST endpoint.
 * No longer opens a WebSocket — venue prices are fetched directly
 * by useDirectVenueBooks on individual market pages.
 *
 * `enabled` param acts as a route-gate: when null/empty, no fetching occurs.
 */
export function useOddsMonitorWebSocket(
	enabled: string | null
): UseOddsMonitorWebSocketResult {
	const [appState, setAppState] = useState<OddsMonitorAppState | null>(null);
	const [hasFetched, setHasFetched] = useState(false);

	const marketsRef = useRef<Map<string, MatchedMarket>>(new Map());
	const mappingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const mappingFetchInflightRef = useRef<Promise<void> | null>(null);

	const publishState = useCallback(() => {
		const markets = Array.from(marketsRef.current.values());
		setAppState({ timestamp: Date.now(), markets });
	}, []);

	const fetchMappings = useCallback(async () => {
		if (mappingFetchInflightRef.current) {
			await mappingFetchInflightRef.current;
			return;
		}
		const run = (async () => {
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

				const next = new Map<string, MatchedMarket>();
				for (const item of items) {
					next.set(item.pandaMatchId, apiItemToMatchedMarket(item));
				}

				marketsRef.current = next;
				setHasFetched(true);
				publishState();
			} catch (err) {
				console.error("error", err);
			}
		})();
		mappingFetchInflightRef.current = run.finally(() => {
			mappingFetchInflightRef.current = null;
		});
		await run;
	}, [publishState]);

	const sendGetState = useCallback(() => {
		fetchMappings();
	}, [fetchMappings]);

	useEffect(() => {
		if (!enabled) {
			if (mappingTimerRef.current) {
				clearInterval(mappingTimerRef.current);
				mappingTimerRef.current = null;
			}
			setAppState(null);
			setHasFetched(false);
			return;
		}

		fetchMappings();
		mappingTimerRef.current = setInterval(fetchMappings, MAPPING_REFRESH_MS);

		return () => {
			if (mappingTimerRef.current) {
				clearInterval(mappingTimerRef.current);
				mappingTimerRef.current = null;
			}
		};
	}, [enabled, fetchMappings]);

	return {
		connected: hasFetched,
		appState,
		lastWsError: null,
		enabled: Boolean(enabled),
		sendGetState,
	};
}
