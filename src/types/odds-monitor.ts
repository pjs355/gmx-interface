/** Books-focused subset of Amsterdam monitor AppState (WebSocket). */

/** Polymarket CLOB tick size strings when the UIServer includes them on a row. */
export type PolymarketClobTickSize =
	| "0.1"
	| "0.01"
	| "0.001"
	| "0.0001";

export interface OrderbookLevel {
	price: number;
	size: number;
}

export interface OrderbookData {
	bestBid: number | null;
	bestAsk: number | null;
	bids?: OrderbookLevel[];
	asks?: OrderbookLevel[];
	bidLevels?: number;
	askLevels?: number;
	totalBidLiquidity?: number;
	totalAskLiquidity?: number;
	totalBidValue?: number;
	totalAskValue?: number;
	lastUpdated?: number;
	wsUpdateCount?: number;
	lastWsUpdate?: number;
}

export interface MatchedMarket {
	pandaMatchId: string;
	polyConditionId: string;
	pandaTeamA: string;
	pandaTeamB: string;
	polyTokenIdA: string;
	polyTokenIdB: string;
	sidesSwapped: boolean;
	startTime?: number;
	tournament?: string;
	tournamentTier?: string;
	format?: "bo1" | "bo3" | "bo5";
	status?: string;
	game?: string;
	videogameSlug?: string | null;
	pandaOddsA?: number | null;
	pandaOddsB?: number | null;
	pandaOddsTimestamp?: number | null;
	marketStatus?: "active" | "suspended" | "settled" | null;
	polyPriceA?: OrderbookData | null;
	polyPriceB?: OrderbookData | null;
	/** When set on the wire, used for `createAndPostOrder` options instead of a round-trip. */
	polyTickSize?: PolymarketClobTickSize | null;
	/** Neg-risk market flag from UIServer, if present. */
	polyNegRisk?: boolean | null;
	/**
	 * DFlow (tokenized Kalshi) — preferred monitor keys when aggregator sources DFlow.
	 * Same structure as legacy `kalshi` linkage below.
	 */
	dflow?: {
		tickerA: string;
		tickerB?: string;
		eventTicker: string;
		/** Solana SPL mint for the YES outcome of side A (from DFlow Metadata `accounts.*.yesMint`). */
		yesMintA?: string;
		noMintA?: string;
		yesMintB?: string;
		noMintB?: string;
	};
	dflowPriceA?: OrderbookData | null;
	dflowPriceB?: OrderbookData | null;
	/** @deprecated Prefer `dflow`; kept until all monitors emit DFlow keys only. */
	kalshi?: {
		tickerA: string;
		tickerB?: string;
		eventTicker: string;
		yesMintA?: string;
		noMintA?: string;
		yesMintB?: string;
		noMintB?: string;
	};
	/** @deprecated Prefer `dflowPriceA` / `dflowPriceB`. */
	kalshiPriceA?: OrderbookData | null;
	kalshiPriceB?: OrderbookData | null;
	limitless?: {
		slug: string;
		tokenIdA: string;
		tokenIdB: string;
		orderbookSlugA?: string;
		orderbookSlugB?: string;
	};
	limitlessPriceA?: OrderbookData | null;
	limitlessPriceB?: OrderbookData | null;
	jupiter?: {
		eventId?: string;
		marketIdA?: string;
		marketIdB?: string;
	};
	jupiterPriceA?: OrderbookData | null;
	jupiterPriceB?: OrderbookData | null;
	predictFun?: {
		marketIdA?: string;
		marketIdB?: string;
		/** Optional outcome ERC1155 ids when the monitor provides them (else resolved via Predict REST). */
		tokenIdA?: string;
		tokenIdB?: string;
		decimalPrecision: 2 | 3;
		singleMarket?: boolean;
	};
	predictFunPriceA?: OrderbookData | null;
	predictFunPriceB?: OrderbookData | null;
}

export interface OddsMonitorAppState {
	timestamp: number;
	mode?: "paper" | "live";
	markets: MatchedMarket[];
	pandaStats?: {
		messageCount: number;
		oddsCount: number;
		matchCount: number;
		isHealthy: boolean;
		connected?: boolean;
	};
	/** DFlow feed health (replaces Kalshi in the aggregator). */
	dflowHealth?: {
		connected: boolean;
		marketsWithDflow?: number;
		lastError?: string | null;
	};
	/** @deprecated Prefer `dflowHealth` when present. */
	kalshiHealth?: {
		connected: boolean;
		marketsWithKalshi: number;
		lastError?: string | null;
	};
	limitlessHealth?: {
		connected: boolean;
		marketsWithLimitless: number;
		lastError?: string | null;
	};
	jupiterHealth?: {
		enabled: boolean;
		marketsWithJupiter: number;
		lastPollAt: number;
		lastError?: string | null;
	};
	predictFunHealth?: {
		enabled: boolean;
		connected: boolean;
		subscribedMarketIds: number;
		marketsWithPredictFun: number;
		lastError?: string | null;
	};
	/** Full server payload may include many more fields. */
	[key: string]: unknown;
}

export interface OddsMonitorWsMessage {
	type: string;
	data?: unknown;
	connected?: boolean;
	silenceSeconds?: number;
}
