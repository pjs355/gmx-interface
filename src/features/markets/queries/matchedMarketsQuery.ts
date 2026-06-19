import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getMatchedMarketsUrl } from "@/config/oddsMonitorBase";
import type { MatchedMarketsDflowWire } from "@/types/matchedMarketsDflowWire";
import type { TeamMapping } from "@/features/markets/listing/matchProps";

/** Shared REST row shape from GET /matched-markets. */
export interface MatchedMarketsApiItem {
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
	exchangeMatching: {
		polymarket?: {
			conditionId: string;
			slug?: string;
			tokenIdA: string;
			tokenIdB: string;
			negRisk: boolean;
			tickSize: string;
		};
		dflow?: MatchedMarketsDflowWire;
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
		levelup?: unknown;
		matchedAt?: number;
		matchConfidence?: number;
		matchMethod?: string;
	};
}

export const MATCHED_MARKETS_QUERY_KEY = ["matched-markets"] as const;

export const MATCHED_MARKETS_STALE_MS = 5 * 60_000;
export const MATCHED_MARKETS_GC_MS = 30 * 60_000;

export async function fetchMatchedMarketsRaw(): Promise<MatchedMarketsApiItem[]> {
	const res = await fetch(getMatchedMarketsUrl());
	if (!res.ok) {
		throw new Error(`matched-markets ${res.status}`);
	}
	const items = (await res.json()) as MatchedMarketsApiItem[];
	if (!Array.isArray(items)) {
		throw new Error("matched-markets: invalid response");
	}
	return items;
}

export const matchedMarketsQueryOptions = {
	queryKey: MATCHED_MARKETS_QUERY_KEY,
	queryFn: fetchMatchedMarketsRaw,
	staleTime: MATCHED_MARKETS_STALE_MS,
	gcTime: MATCHED_MARKETS_GC_MS,
	placeholderData: keepPreviousData,
} as const;

export function useMatchedMarketsQuery(
	enabled = true,
): UseQueryResult<MatchedMarketsApiItem[], Error> {
	return useQuery({
		...matchedMarketsQueryOptions,
		enabled,
		refetchInterval: MATCHED_MARKETS_STALE_MS,
	});
}
