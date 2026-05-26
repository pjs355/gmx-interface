import type { RoutePlan } from "@/features/trading/sor";

/** Market-order pricing fields shown in the trade box (To Win, fees, receive). */
export type TradePreviewFields = {
	calculatedContracts: number | null;
	remainingUsd: number | null;
	spent: number | null;
	tradingFee: number | null;
	estimatedCost: number | null;
	grossReceive: number | null;
	sellTradingFee: number | null;
	netReceive: number | null;
};

export const EMPTY_TRADE_PREVIEW: TradePreviewFields = {
	calculatedContracts: null,
	remainingUsd: null,
	spent: null,
	tradingFee: null,
	estimatedCost: null,
	grossReceive: null,
	sellTradingFee: null,
	netReceive: null,
};

/** Where the visible preview numbers came from (debug / analytics). */
export type TradeQuoteSource = "idle" | "book" | "sor";

/**
 * Single preview model for the trade box UI: preview numbers + optional route used
 * to derive them.
 */
export type TradeQuote = {
	preview: TradePreviewFields;
	source: TradeQuoteSource;
	/** Execution-channel route when preview used SOR (null for book-only). */
	route: RoutePlan | null;
};

export type MarketOrderBookPreview = TradePreviewFields;
