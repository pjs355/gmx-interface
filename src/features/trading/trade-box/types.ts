import type { ReactNode } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type {
	UmbrellaExchangeMatching,
	UmbrellaExchangeMatchingLimitless,
} from "@/services/api/umbrellaDataService";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type { OrderExecutionResult } from "@/services/api/predictionMarketService";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { VenueRowModel } from "@/features/markets/pricing/useTradingPagePrices";
import type { MarketOrderCalculation } from "@/features/trading/orderbook-walk/types";
import type { TradeQuote } from "@/features/trading/trade-preview/types";
import type {
	RoutePlan,
	RouteExecution,
	SorErrorCode,
	SorExecutionPhase,
	SorPrefundLegProgress,
	VenueRoutePreview,
} from "@/features/trading/sor";
import type { TradeBoxShareBalancesSnapshot } from "./hooks/useTradeBoxShareBalances";
import type { TradeBoxOutcomePricesSnapshot } from "./hooks/useTradeBoxOutcomePrices";
import type { TradeBoxTeamPresentationSnapshot } from "./hooks/useTradeBoxTeamPresentation";

export type TradingVenue = "all" | "levelup" | "polymarket" | "predictfun" | "dflow" | "limitless";

/** User input + trade lifecycle — does not include quote preview numbers. */
export interface TradeBoxCoreState {
	tradingVenue: TradingVenue;
	selectedPosition: "yes" | "no" | null;
	amount: string;
	price: string;
	orderType: "market" | "limit";
	side: "buy" | "sell";
	isLoading: boolean;
	orderResult: OrderExecutionResult | null;
}

/**
 * @deprecated Prefer `TradeBoxCoreState` + `TradeQuote.preview`. Kept for tests/tools
 * that still expect a single flat object.
 */
export interface TradeBoxState extends TradeBoxCoreState {
	calculatedContracts: number | null;
	remainingUsd: number | null;
	spent: number | null;
	tradingFee: number | null;
	estimatedCost: number | null;
	grossReceive: number | null;
	sellTradingFee: number | null;
	netReceive: number | null;
}

export interface TradeBoxProps {
	market: PredictionMarket;
	orderbook?: OrderbookSnapshot | null;
	/** PandaScore match id on the umbrella — required for Polymarket CLOB on esports. */
	pandascoreMatchId?: string;
	/** Resolves venue-prices row when panda id on umbrella ≠ monitor key */
	umbrellaId?: string;
	/** When GET /matched-markets omits limitless but umbrella has it (e.g. Railway vs local). */
	limitlessMappingFromUmbrella?: UmbrellaExchangeMatchingLimitless | null;
	/**
	 * Umbrella `exchangeMatching.predictFun` — used for post-trade share sync identity
	 * (`tokenIdA` / `tokenIdB`); not merged with odds-monitor rows.
	 */
	predictFunMappingFromUmbrella?: UmbrellaExchangeMatching["predictFun"] | null;
	/** Umbrella list title — used to derive "Team A vs Team B" when question is only "Match Winner". */
	umbrellaDisplayName?: string;
	initialPosition?: "yes" | "no";
	onPositionChange?: (position: "yes" | "no") => void;
	onSideChange?: (side: "buy" | "sell") => void;
	/** When set externally (e.g. from Orderbooks tab), syncs the trade box to this venue. */
	venueOverride?: TradingVenue;
	/** Cross-venue best YES price from unified trading page prices (WS-first). */
	crossBuyYes?: number | null;
	/** Cross-venue best NO price from unified trading page prices (WS-first). */
	crossBuyNo?: number | null;
	/**
	 * Per-venue ask/bid rows from `useTradingPagePrices` — used for All Markets sell
	 * tab position-button pricing (best bid among venues where the user holds shares).
	 */
	venueRowsForSellStrip?: VenueRowModel[] | null;
	/**
	 * LevelUp: per-outcome monitor books for YES/NO button BBO when venue-prices WS
	 * is active (avoids reusing the selected-outcome book for both labels).
	 */
	levelUpVenueBookHints?: {
		yes: OrderbookSnapshot | null;
		no: OrderbookSnapshot | null;
	} | null;
	/** Odds-monitor row for this match (Polymarket token mapping for balances). */
	matchedMonitor?: MatchedMarket | null;
	/** Home: hide fixed Yes/No peek until `openCurtain()` (e.g. from card price tap). */
	mobilePeekBar?: "default" | "hidden";
	/**
	 * When set (e.g. mobile/tablet trade dock ≤1100px), changing this key clears sticky
	 * venue/amount/order-type session state so venue tabs do not carry across markets.
	 */
	tradeRouteIsolationKey?: string;
}

export type { MarketOrderCalculation } from "@/features/trading/orderbook-walk/types";

export interface TradeExecutionParams {
	marketId: string;
	position: "yes" | "no";
	amount: number;
	price: number;
	orderType: "market" | "limit";
	side: "buy" | "sell";
	userAddress: string;
	market: PredictionMarket;
}

export interface WalletState {
	account: string | undefined;
	privyWallet: any;
	isConnected: boolean;
}

export interface ApprovalState {
	isApproved: boolean;
	isChecking: boolean;
	isApproving: boolean;
}

/** Exposed methods for testing via ref on `PredictionMarketTradeBox`. */
export interface PredictionMarketTradeBoxHandle {
	setPosition: (position: "yes" | "no") => void;
	setAmount: (amount: string) => void;
	setPrice: (price: string) => void;
	setOrderType: (orderType: "market" | "limit") => void;
	setSide: (side: "buy" | "sell") => void;
	executeTrade: () => Promise<void>;
	getState: () => TradeBoxCoreState;
}

/** SOR route preview + execution state surfaced in the trade box UI. */
export interface TradeBoxSorRouteUi {
	displayRoute: RoutePlan | null;
	executionRoute: RoutePlan | null;
	venuePreviews: VenueRoutePreview[] | null;
	displayRouteSourceQuestionId: string | null;
	executionRouteSourceQuestionId: string | null;
	displayLoading: boolean;
	displayStale: boolean;
	executionLoading: boolean;
	executionStale: boolean;
	displayError: string | null;
	displayErrorCode: SorErrorCode | null;
	executionError: string | null;
	executionErrorCode: SorErrorCode | null;
}

export interface TradeBoxSorExecutionUi {
	execution: RouteExecution | null;
	isExecuting: boolean;
	executionPhase?: SorExecutionPhase;
	prefundLegProgress?: SorPrefundLegProgress | null;
	remainingBudget: number | null;
	requestReroute: () => Promise<number | null>;
	acceptResult: () => Promise<void>;
	resetExecution: () => void;
}

/** User input handlers, button state, and share balances for the trade box UI. */
export interface TradeBoxRuntimeProps {
	state: TradeBoxCoreState;
	tradeQuote: TradeQuote;
	onPositionChange: (position: "yes" | "no") => void;
	onAmountChange: (amount: string) => void;
	onTradingVenueChange: (venue: TradingVenue) => void;
	onSideChange: (side: "buy" | "sell") => void;
	buttonState: {
		text: string;
		disabled: boolean;
		onClick: () => void;
		depositShortfallUsd?: number;
		isSweepingBook?: boolean;
		availableShares?: number;
	};
	calculateContractsForMarketOrder: (
		usdAmount: number,
		position: "yes" | "no",
		side: "buy" | "sell",
	) => MarketOrderCalculation;
	getEffectivePrice: (usdAmount: number, contracts: number, remainingUsd: number) => number;
	maxScopedSellShares: number;
	sharesLoadingForActiveTab?: boolean;
	shareBalances: TradeBoxShareBalancesSnapshot;
	dflowUninitAtSubmit?: boolean;
	predictFunFeeRateBps?: number;
}

/** SOR routing display + venue book hints for outcome pricing. */
export interface TradeBoxSorUiProps {
	sorRoute: TradeBoxSorRouteUi;
	sorExecution: TradeBoxSorExecutionUi;
	routePreviewAllowed: boolean;
	smartRoutingMarketKey: string;
	matchedVenues?: Set<string>;
	predictVenueBookHints?: {
		yes: OrderbookSnapshot | null;
		no: OrderbookSnapshot | null;
	} | null;
	levelUpVenueBookHints?: {
		yes: OrderbookSnapshot | null;
		no: OrderbookSnapshot | null;
	} | null;
	matchedMonitor?: MatchedMarket | null;
	allMarketsSellYesBid?: number | null;
	allMarketsSellNoBid?: number | null;
}

export interface TradeBoxPresentationProps extends Pick<
	TradeBoxProps,
	| "market"
	| "pandascoreMatchId"
	| "umbrellaId"
	| "umbrellaDisplayName"
	| "crossBuyYes"
	| "crossBuyNo"
> {
	orderbook?: OrderbookSnapshot | null;
}

export interface PredictionMarketTradeBoxUIProps extends TradeBoxPresentationProps {
	team: TradeBoxTeamPresentationSnapshot;
	outcomePrices: TradeBoxOutcomePricesSnapshot;
	runtime: TradeBoxRuntimeProps;
	sorUi: TradeBoxSorUiProps;
}

export interface PredictionMarketTradeBoxResponsiveContainerProps extends TradeBoxPresentationProps {
	runtime: TradeBoxRuntimeProps;
	sorUi: TradeBoxSorUiProps;
	mobilePeekBar?: "default" | "hidden";
	executionGateBanner?: ReactNode;
}
