import { getMatchDataBaseUrl } from "@/config/predictionApiBase";

export interface MatchedMarketExchange {
	pandaMatchId: string;
	polyConditionId: string;
	polySlug?: string;
	polyTokenIdA: string;
	polyTokenIdB: string;
	pandaTeamA: string;
	pandaTeamB: string;
	game?: string;
	tournament?: string;
	startTime?: number;
	status?: string;
	kalshi?: {
		tickerA: string;
		tickerB?: string;
		eventTicker: string;
	};
	predictFun?: {
		marketIdA?: string;
		marketIdB?: string;
		decimalPrecision: 2 | 3;
		singleMarket?: boolean;
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

	const baseUrl = getMatchDataBaseUrl();
	const res = await fetch(`${baseUrl}/api/markets`);
	if (!res.ok) {
		throw new Error(`matchDataService: GET /api/markets returned ${res.status}`);
	}

	const data: MatchedMarketExchange[] = await res.json();
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

export function clearMatchDataCache(): void {
	cachedMarkets = null;
	lastFetchTime = 0;
}
