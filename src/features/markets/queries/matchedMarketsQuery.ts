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
export const MATCHED_MARKETS_MATRIX_QUERY_KEY = ["matched-markets", "matrix"] as const;
export const MATCHED_MARKETS_BATCH_QUERY_KEY = ["matched-markets", "batch"] as const;
export const ALL_ODDS_PAGE_QUERY_KEY = ["matched-markets", "all-odds-page"] as const;

export type AllOddsSportFilter = "all" | "esports" | "soccer";

export interface AllOddsPageResponse {
	page: number;
	limit: number;
	totalGroups: number;
	totalPages: number;
	pandaMatchIds: string[];
	rows: MatchedMarketsApiItem[];
}

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

export async function fetchMatchedMarketsMatrixRaw(): Promise<MatchedMarketsApiItem[]> {
	const res = await fetch(`${getMatchedMarketsUrl()}?view=matrix`);
	if (!res.ok) {
		throw new Error(`matched-markets?view=matrix ${res.status}`);
	}
	const items = (await res.json()) as MatchedMarketsApiItem[];
	if (!Array.isArray(items)) {
		throw new Error("matched-markets matrix: invalid response");
	}
	return items;
}

export async function fetchAllOddsPageRaw(opts: {
	page: number;
	limit?: number;
	sport?: AllOddsSportFilter;
	q?: string;
}): Promise<AllOddsPageResponse> {
	const params = new URLSearchParams();
	params.set("page", String(Math.max(0, opts.page)));
	params.set("limit", String(opts.limit ?? 25));
	if (opts.sport && opts.sport !== "all") params.set("sport", opts.sport);
	const q = (opts.q ?? "").trim();
	if (q) params.set("q", q);

	const res = await fetch(`${getMatchedMarketsUrl()}/all-odds-page?${params.toString()}`);
	if (!res.ok) {
		throw new Error(`matched-markets/all-odds-page ${res.status}`);
	}
	const body = (await res.json()) as AllOddsPageResponse;
	if (!body || !Array.isArray(body.rows) || !Array.isArray(body.pandaMatchIds)) {
		throw new Error("matched-markets/all-odds-page: invalid response");
	}
	return body;
}

export async function fetchMatchedMarketsBatchRaw(
	pandaMatchIds: string[],
): Promise<MatchedMarketsApiItem[]> {
	const ids = [...new Set(pandaMatchIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
	if (ids.length === 0) return [];
	const res = await fetch(`${getMatchedMarketsUrl()}/batch`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ pandaMatchIds: ids.slice(0, 50) }),
	});
	if (!res.ok) {
		throw new Error(`matched-markets/batch ${res.status}`);
	}
	const items = (await res.json()) as MatchedMarketsApiItem[];
	if (!Array.isArray(items)) {
		throw new Error("matched-markets/batch: invalid response");
	}
	return items;
}

export async function fetchMatchedMarketByPandaIdRaw(
	pandaMatchId: string,
): Promise<MatchedMarketsApiItem | null> {
	const id = String(pandaMatchId ?? "").trim();
	if (!id) return null;
	const res = await fetch(`${getMatchedMarketsUrl()}/${encodeURIComponent(id)}`);
	if (res.status === 404) return null;
	if (!res.ok) {
		throw new Error(`matched-markets/${id} ${res.status}`);
	}
	return (await res.json()) as MatchedMarketsApiItem;
}

export const matchedMarketsQueryOptions = {
	queryKey: MATCHED_MARKETS_QUERY_KEY,
	queryFn: fetchMatchedMarketsRaw,
	staleTime: MATCHED_MARKETS_STALE_MS,
	gcTime: MATCHED_MARKETS_GC_MS,
	placeholderData: keepPreviousData,
} as const;

export const matchedMarketsMatrixQueryOptions = {
	queryKey: MATCHED_MARKETS_MATRIX_QUERY_KEY,
	queryFn: fetchMatchedMarketsMatrixRaw,
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
		refetchInterval: enabled ? MATCHED_MARKETS_STALE_MS : false,
	});
}

export function useMatchedMarketsMatrixQuery(
	enabled = true,
): UseQueryResult<MatchedMarketsApiItem[], Error> {
	return useQuery({
		...matchedMarketsMatrixQueryOptions,
		enabled,
		refetchInterval: enabled ? MATCHED_MARKETS_STALE_MS : false,
	});
}

export function useAllOddsPageQuery(
	page: number,
	sport: AllOddsSportFilter,
	q: string,
	enabled = true,
): UseQueryResult<AllOddsPageResponse, Error> {
	return useQuery({
		queryKey: [...ALL_ODDS_PAGE_QUERY_KEY, page, sport, q.trim()],
		queryFn: () => fetchAllOddsPageRaw({ page, sport, q }),
		enabled,
		staleTime: MATCHED_MARKETS_STALE_MS,
		gcTime: MATCHED_MARKETS_GC_MS,
		placeholderData: keepPreviousData,
		refetchInterval: enabled ? MATCHED_MARKETS_STALE_MS : false,
	});
}

export function useMatchedMarketsBatchQuery(
	pandaMatchIds: string[],
	enabled: boolean,
): UseQueryResult<MatchedMarketsApiItem[], Error> {
	const key = [...pandaMatchIds].sort().join("\0");
	return useQuery({
		queryKey: [...MATCHED_MARKETS_BATCH_QUERY_KEY, key],
		queryFn: () => fetchMatchedMarketsBatchRaw(pandaMatchIds),
		enabled: enabled && pandaMatchIds.length > 0,
		staleTime: MATCHED_MARKETS_STALE_MS,
		gcTime: MATCHED_MARKETS_GC_MS,
	});
}
