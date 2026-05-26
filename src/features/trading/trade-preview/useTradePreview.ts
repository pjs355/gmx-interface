import { useMemo } from "react";
import type { RoutePlan } from "@/features/trading/sor";
import type { TradingVenue } from "@/config/venueConfig";
import { buildTradePreview } from "./buildTradePreview";
import type { MarketOrderBookPreview, TradeQuote } from "./types";

export type UseTradePreviewArgs = {
	tradingVenue: TradingVenue;
	side: "buy" | "sell";
	orderType: "market" | "limit";
	amount: string;
	executionRoute: RoutePlan | null;
	bookPreview: MarketOrderBookPreview;
	predictFunFeeRateBps: number | undefined;
};

/** Merges book preview + SOR execution route into one display model. */
export function useTradePreview(args: UseTradePreviewArgs): TradeQuote {
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
