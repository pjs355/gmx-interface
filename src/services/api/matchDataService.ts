import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";

export interface MatchedMarketExchange {
	pandaMatchId: string;
	polyConditionId: string;
	polySlug?: string;
	polyTokenIdA: string;
	polyTokenIdB: string;
	polyTickSize?: string;
	polyNegRisk?: boolean;
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
	dflow?: {
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

interface RemoteMatchedMarket {
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
		kalshi?: {
			tickerA: string;
			tickerB?: string;
			eventTicker: string;
		};
		dflow?: {
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
	};
}

function remoteToExchange(remote: RemoteMatchedMarket): MatchedMarketExchange | null {
	const poly = remote.exchangeMatching?.polymarket;
	if (!poly) return null;

	return {
		pandaMatchId: remote.pandaMatchId,
		polyConditionId: poly.conditionId,
		polySlug: poly.slug,
		polyTokenIdA: poly.tokenIdA,
		polyTokenIdB: poly.tokenIdB,
		polyTickSize: poly.tickSize,
		polyNegRisk: poly.negRisk,
		pandaTeamA: remote.pandaTeamA ?? "Team A",
		pandaTeamB: remote.pandaTeamB ?? "Team B",
		game: remote.game,
		status: remote.status,
		startTime: remote.eventDate ? new Date(remote.eventDate).getTime() : undefined,
		kalshi: remote.exchangeMatching.kalshi,
		dflow: remote.exchangeMatching.dflow,
		predictFun: remote.exchangeMatching.predictFun,
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

	const baseUrl = getPredictionApiBaseUrl();
	const res = await fetch(`${baseUrl}/matched-markets`);
	if (!res.ok) {
		throw new Error(`matchDataService: GET /matched-markets returned ${res.status}`);
	}

	const remoteData: RemoteMatchedMarket[] = await res.json();
	const data = remoteData.map(remoteToExchange).filter((m): m is MatchedMarketExchange => m !== null);
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
