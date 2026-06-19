import { queryClient } from "@/services/wallets/WalletProvider";
import {
	fetchMatchedMarketsRaw,
	matchedMarketsQueryOptions,
	MATCHED_MARKETS_MATRIX_QUERY_KEY,
	type MatchedMarketsApiItem,
} from "@/features/markets/queries/matchedMarketsQuery";
import type { MatchedMarketsDflowWire } from "@/types/matchedMarketsDflowWire";

export interface MatchedMarketExchange {
	pandaMatchId: string;
	umbrellaId?: string;
	polyConditionId?: string;
	polySlug?: string;
	polyTokenIdA?: string;
	polyTokenIdB?: string;
	polyTickSize?: string;
	polyNegRisk?: boolean;
	pandaTeamA: string;
	pandaTeamB: string;
	game?: string;
	tournament?: string;
	startTime?: number;
	status?: string;
	dflow?: MatchedMarketsDflowWire;
	predictFun?: {
		marketIdA?: string;
		marketIdB?: string;
		decimalPrecision: 2 | 3;
		singleMarket?: boolean;
	};
	limitless?: {
		slug: string;
		tokenIdA: string;
		tokenIdB: string;
		orderbookSlugA?: string;
		orderbookSlugB?: string;
	};
}

interface RemoteMatchedMarket extends MatchedMarketsApiItem {
	umbrellaId: string;
}

function remoteToExchange(remote: RemoteMatchedMarket): MatchedMarketExchange | null {
	const em = remote.exchangeMatching;
	if (!em) return null;

	const hasAnyExchange = em.polymarket || em.dflow || em.predictFun || em.limitless;
	if (!hasAnyExchange) return null;

	const poly = em.polymarket;

	return {
		pandaMatchId: remote.pandaMatchId,
		umbrellaId: remote.umbrellaId,
		polyConditionId: poly?.conditionId,
		polySlug: poly?.slug,
		polyTokenIdA: poly?.tokenIdA,
		polyTokenIdB: poly?.tokenIdB,
		polyTickSize: poly?.tickSize,
		polyNegRisk: poly?.negRisk,
		pandaTeamA: remote.pandaTeamA ?? "Team A",
		pandaTeamB: remote.pandaTeamB ?? "Team B",
		game: remote.game,
		status: remote.status,
		startTime: remote.eventDate ? new Date(remote.eventDate).getTime() : undefined,
		dflow: em.dflow,
		predictFun: em.predictFun,
		limitless: em.limitless,
	};
}

let cachedMarkets: MatchedMarketExchange[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 30_000;

export async function fetchMatchedMarkets(): Promise<MatchedMarketExchange[]> {
	const now = Date.now();
	if (cachedMarkets && now - lastFetchTime < CACHE_TTL_MS) {
		return cachedMarkets;
	}

	const remoteData = await queryClient.fetchQuery(matchedMarketsQueryOptions);
	const data = remoteData
		.map((remote) => remoteToExchange(remote as RemoteMatchedMarket))
		.filter((m): m is MatchedMarketExchange => m !== null);
	cachedMarkets = data;
	lastFetchTime = now;
	return data;
}

export async function findMatchedMarketByConditionId(
	conditionId: string,
): Promise<MatchedMarketExchange | undefined> {
	const markets = await fetchMatchedMarkets();
	return markets.find((m) => m.polyConditionId === conditionId);
}

export async function findMatchedMarketByUmbrellaId(
	umbrellaId: string,
): Promise<MatchedMarketExchange | undefined> {
	const markets = await fetchMatchedMarkets();
	return markets.find((m) => m.umbrellaId === umbrellaId);
}

/**
 * Resolve a matched market by its PandaScore id. Used for aggregator sub-question
 * cards (Map N winner, totals), whose `/matched-markets` row is keyed by the
 * sub-question's own `pandascore_marketId` rather than the umbrella match id.
 */
export async function findMatchedMarketByPandaMatchId(
	pandaMatchId: string,
): Promise<MatchedMarketExchange | undefined> {
	const id = String(pandaMatchId ?? "").trim();
	if (!id) return undefined;
	const markets = await fetchMatchedMarkets();
	return markets.find((m) => String(m.pandaMatchId ?? "").trim() === id);
}

export function clearMatchDataCache(): void {
	cachedMarkets = null;
	lastFetchTime = 0;
	void queryClient.invalidateQueries({ queryKey: matchedMarketsQueryOptions.queryKey });
	void queryClient.invalidateQueries({ queryKey: MATCHED_MARKETS_MATRIX_QUERY_KEY });
}

export { fetchMatchedMarketsRaw };
