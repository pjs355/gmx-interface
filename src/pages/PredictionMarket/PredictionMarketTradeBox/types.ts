import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type { OrderExecutionResult } from "@/services/api/predictionMarketService";

export type TradingVenue = "all" | "levelup" | "polymarket" | "predictfun" | "dflow";

export interface TradeBoxState {
	tradingVenue: TradingVenue;
	selectedPosition: "yes" | "no" | null;
	amount: string;
	price: string;
	orderType: "market" | "limit";
	side: "buy" | "sell";
	isLoading: boolean;
	orderResult: OrderExecutionResult | null;
	calculatedContracts: number | null;
	remainingUsd: number | null;
	// Trading fee fields for market BUY orders
	spent: number | null;
	tradingFee: number | null;
	estimatedCost: number | null;
	// Trading fee fields for market SELL orders
	grossReceive: number | null;
	sellTradingFee: number | null;
	netReceive: number | null;
}

export interface TradeBoxProps {
	market: PredictionMarket;
	orderbook?: OrderbookSnapshot | null;
	/** PandaScore match id on the umbrella — required for Polymarket CLOB on esports. */
	pandascoreMatchId?: string;
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
}

export interface MarketOrderCalculation {
	contracts: number;
	remainingUsd: number;
	maxPrice?: number;
	minPrice?: number;
}

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
