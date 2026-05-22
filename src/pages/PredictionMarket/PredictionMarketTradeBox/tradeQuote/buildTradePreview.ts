import { getVenueConfig } from "@/config/venueConfig";
import {
	sorBuyNetHeldTotalSharesFromLegs,
	shareAmountMatchesRoute,
	usdAmountMatchesRoute,
	type RoutePlan,
} from "@/trading/sor";
import type { TradingVenue } from "../types";
import {
	EMPTY_TRADE_PREVIEW,
	type MarketOrderBookPreview,
	type TradePreviewFields,
	type TradeQuote,
	type TradeQuoteSource,
} from "./types";

export type BuildTradePreviewInput = {
	tradingVenue: TradingVenue;
	side: "buy" | "sell";
	orderType: "market" | "limit";
	amount: string;
	executionRoute: RoutePlan | null;
	bookPreview: MarketOrderBookPreview;
	predictFunFeeRateBps: number | undefined;
};

function resolveSource(hasSorOverlay: boolean, bookHasData: boolean): TradeQuoteSource {
	if (hasSorOverlay) return "sor";
	return bookHasData ? "book" : "idle";
}

/**
 * Merges local book walk and SOR execution route into one preview.
 * DFlow Pond economics are folded into `executionRoute` on the server.
 */
export function buildTradePreview(input: BuildTradePreviewInput): TradeQuote {
	const {
		tradingVenue,
		side,
		orderType,
		amount,
		executionRoute: sr,
		bookPreview: bookData,
		predictFunFeeRateBps,
	} = input;

	const inputAmount = Number.parseFloat(amount) || 0;
	const sorMatchesInput =
		sr &&
		sr.legs.length > 0 &&
		inputAmount > 0 &&
		(side === "buy"
			? usdAmountMatchesRoute(sr.requestedAmount, inputAmount)
			: shareAmountMatchesRoute(sr.requestedAmount, inputAmount));
	const dflowSorSingleLegMarketBuy = Boolean(
		sr &&
			sr.legs.length === 1 &&
			sr.legs[0].venue === "dflow" &&
			side === "buy",
	);
	const hasSorData =
		Boolean(sorMatchesInput) &&
		(tradingVenue !== "all" ||
			(tradingVenue === "all" && dflowSorSingleLegMarketBuy));

	if (hasSorData && orderType === "market" && sr) {
		const leg = sr.legs[0];
		const shareVenueCfg = getVenueConfig(tradingVenue);
		const netBuyShares =
			side === "buy"
				? sorBuyNetHeldTotalSharesFromLegs(sr.legs, predictFunFeeRateBps)
				: null;
		const sorContractsRaw =
			side === "buy" && netBuyShares != null
				? shareVenueCfg.requiresWholeShares
					? Math.floor(netBuyShares)
					: netBuyShares
				: shareVenueCfg.requiresWholeShares
					? Math.floor(sr.totalShares)
					: sr.totalShares;
		const sorContracts = Number.isFinite(sorContractsRaw)
			? sorContractsRaw
			: undefined;
		const sorCost = Number.isFinite(sr.totalCost) ? sr.totalCost : undefined;
		const sorFee = Number.isFinite(sr.totalFees) ? sr.totalFees : undefined;

		if (side === "buy") {
			const preview: TradePreviewFields = {
				calculatedContracts: sorContracts ?? bookData.calculatedContracts,
				remainingUsd: bookData.remainingUsd,
				spent:
					sorCost !== undefined && sorFee !== undefined
						? sorCost - sorFee
						: bookData.spent,
				tradingFee: sorFee ?? bookData.tradingFee,
				estimatedCost: sorCost ?? bookData.estimatedCost,
				grossReceive: null,
				sellTradingFee: null,
				netReceive: null,
			};
			return {
				preview,
				source: resolveSource(true, false),
				route: sr,
			};
		}

		const legProceedsUsd =
			typeof leg.executionAmountUsd === "number" &&
			Number.isFinite(leg.executionAmountUsd) &&
			leg.executionAmountUsd > 0
				? leg.executionAmountUsd
				: null;
		const preview: TradePreviewFields = {
			calculatedContracts: sorContracts ?? bookData.calculatedContracts,
			remainingUsd: bookData.remainingUsd,
			spent: null,
			tradingFee: null,
			estimatedCost: null,
			grossReceive: legProceedsUsd ?? bookData.grossReceive,
			sellTradingFee: sorFee ?? bookData.sellTradingFee,
			netReceive: legProceedsUsd ?? bookData.netReceive,
		};
		return { preview, source: "sor", route: sr };
	}

	return {
		preview: { ...bookData },
		source: resolveSource(false, bookData.calculatedContracts != null),
		route: null,
	};
}

/** Merge core trade state with preview fields for UI + button gating. */
export function mergeStateWithTradePreview<T extends object>(
	core: T,
	tradeQuote: TradeQuote,
): T & TradePreviewFields {
	return { ...core, ...tradeQuote.preview };
}

export { EMPTY_TRADE_PREVIEW };
