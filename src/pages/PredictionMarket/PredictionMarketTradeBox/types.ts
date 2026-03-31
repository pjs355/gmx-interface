import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { OrderbookSnapshot } from "lib/orderbookService";
import type { OrderExecutionResult } from "lib/predictionMarketService";

export type TradingVenue = "levelup" | "polymarket" | "predictfun";

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
	initialPosition?: "yes" | "no";
	onPositionChange?: (position: "yes" | "no") => void;
	onSideChange?: (side: "buy" | "sell") => void;
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
