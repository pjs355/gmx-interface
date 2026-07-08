import type { TeamMapping } from "@/features/markets/listing/matchProps";
import type { OrderbookData, SnapshotStatus } from "@/types/odds-monitor";

export interface AllOddsExchangeMatching {
	polymarket?: {
		conditionId?: string;
		tokenIdA?: string;
		tokenIdB?: string;
	};
	dflow?: Record<string, unknown>;
	predictFun?: Record<string, unknown>;
	limitless?: Record<string, unknown>;
}

/** Page-local market row — not the global trading `MatchedMarket` type. */
export interface AllOddsMarket {
	pandaMatchId: string;
	umbrellaId?: string;
	displayName: string;
	game?: string;
	status?: string;
	/** ISO kickoff from matched-markets (umbrella eventDate). */
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
	polyPriceA?: OrderbookData | null;
	polyPriceB?: OrderbookData | null;
	predictFunPriceA?: OrderbookData | null;
	predictFunPriceB?: OrderbookData | null;
	limitlessPriceA?: OrderbookData | null;
	limitlessPriceB?: OrderbookData | null;
	kalshiPriceA?: OrderbookData | null;
	kalshiPriceB?: OrderbookData | null;
	myraidPriceA?: OrderbookData | null;
	myraidPriceB?: OrderbookData | null;
	betdexPriceA?: OrderbookData | null;
	betdexPriceB?: OrderbookData | null;
	forkastPriceA?: OrderbookData | null;
	forkastPriceB?: OrderbookData | null;
	sxbetPriceA?: OrderbookData | null;
	sxbetPriceB?: OrderbookData | null;
	hyperliquidPriceA?: OrderbookData | null;
	hyperliquidPriceB?: OrderbookData | null;
	prophetxPriceA?: OrderbookData | null;
	prophetxPriceB?: OrderbookData | null;
}

export interface AllOddsVenueColumn {
	id: string;
	label: string;
	sortOrder: number;
	tradable: boolean;
	priceFieldA: keyof AllOddsMarket;
	priceFieldB: keyof AllOddsMarket;
}

export interface AllOddsVenueCell {
	id: string;
	label: string;
	linked: boolean;
	ask: number | null;
	status?: SnapshotStatus;
}

export interface AllOddsOutcomeRow {
	label: string;
	market: AllOddsMarket;
	yesSide: "A" | "B";
	venueCells: AllOddsVenueCell[];
	logoUrl?: string;
}

export interface AllOddsMoreSection {
	sectionKey: string;
	title: string;
	outcomes: AllOddsOutcomeRow[];
}

export interface AllOddsGroup {
	groupKey: string;
	title: string;
	teamMappings: TeamMapping[];
	/** ISO start time — only set for head-to-head fixture groups with a known kickoff. */
	eventStartAt?: string;
	/** NegRisk futures / group winners / awards — top-N primary + expandable overflow. */
	kind?: "fixture" | "multileg" | "standalone";
	primaryOutcomes: AllOddsOutcomeRow[];
	moreSections: AllOddsMoreSection[];
}
