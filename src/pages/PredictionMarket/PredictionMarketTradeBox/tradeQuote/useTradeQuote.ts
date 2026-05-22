import { useMemo } from "react";
import type { RoutePlan } from "@/trading/sor";
import type { TradingVenue } from "../types";
import { buildTradePreview } from "./buildTradePreview";
import type { MarketOrderBookPreview, TradeQuote } from "./types";

export type UseTradeQuoteArgs = {
	tradingVenue: TradingVenue;
	side: "buy" | "sell";
	orderType: "market" | "limit";
	amount: string;
	executionRoute: RoutePlan | null;
	bookPreview: MarketOrderBookPreview;
	predictFunFeeRateBps: number | undefined;
};

/** Layer 2 — single preview model from book + SOR execution route. */
export function useTradeQuote(args: UseTradeQuoteArgs): TradeQuote {
	return useMemo(
		() =>
			buildTradePreview({
				tradingVenue: args.tradingVenue,
				side: args.side,
				orderType: args.orderType,
				amount: args.amount,
				executionRoute: args.executionRoute,
				bookPreview: args.bookPreview,
				predictFunFeeRateBps: args.predictFunFeeRateBps,
			}),
		[
			args.tradingVenue,
			args.side,
			args.orderType,
			args.amount,
			args.executionRoute,
			args.bookPreview,
			args.predictFunFeeRateBps,
		],
	);
}
