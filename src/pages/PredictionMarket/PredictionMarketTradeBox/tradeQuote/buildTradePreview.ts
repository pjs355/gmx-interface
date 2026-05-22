import { getVenueConfig } from "@/config/venueConfig";
import type { DflowOrderQuoteResult } from "@/trading/dflow/dflowOrderQuoteTypes";
import {
	sorBuyNetHeldTotalSharesFromLegs,
	shareAmountMatchesRoute,
	usdAmountMatchesRoute,
	type RoutePlan,
} from "@/trading/sor";
import type { TradingVenue } from "../types";
import { dflowTypedUsdMatchesDebouncedQuote } from "./dflowQuoteAlignment";
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
	dflowQuote: DflowOrderQuoteResult | null | undefined;
	debouncedQuoteAmount: string;
	predictFunFeeRateBps: number | undefined;
};

function resolveSource(
	usePondBuy: boolean,
	hasSorOverlay: boolean,
	pondOnly: boolean,
): TradeQuoteSource {
	if (usePondBuy && hasSorOverlay) return "sor+pond";
	if (usePondBuy || pondOnly) return "pond";
	if (hasSorOverlay) return "sor";
	return "book";
}

/**
 * Merges local book walk, SOR execution route, and optional DFlow Pond quote into
 * one preview — same rules as the former TradeBox `state` IIFE.
 */
export function buildTradePreview(input: BuildTradePreviewInput): TradeQuote {
	const {
		tradingVenue,
		side,
		orderType,
		amount,
		executionRoute: sr,
		bookPreview: bookData,
		dflowQuote: rawQ,
		debouncedQuoteAmount,
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
	const dflowPondQuoteSurface =
		tradingVenue === "dflow" ||
		(tradingVenue === "all" && dflowSorSingleLegMarketBuy);

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
			const sorNumForCmp =
				typeof sorContracts === "number" && Number.isFinite(sorContracts)
					? sorContracts
					: typeof bookData.calculatedContracts === "number" &&
							Number.isFinite(bookData.calculatedContracts)
						? bookData.calculatedContracts
						: Number.NaN;
			let pondPick: DflowOrderQuoteResult | null = null;
			if (
				dflowPondQuoteSurface &&
				rawQ != null &&
				Number.isFinite(rawQ.contracts) &&
				rawQ.contracts > 0 &&
				Number.isFinite(rawQ.usd) &&
				rawQ.usd > 0
			) {
				const debounceAligned = dflowTypedUsdMatchesDebouncedQuote(
					amount,
					debouncedQuoteAmount,
				);
				const budgetUsd = Number.isFinite(sr.requestedAmount)
					? sr.requestedAmount
					: inputAmount;
				const spendSlopUsd = Math.max(0.05, 0.02 * Math.abs(budgetUsd));
				const quoteSpendMatchesBudget =
					usdAmountMatchesRoute(rawQ.usd, inputAmount) ||
					usdAmountMatchesRoute(rawQ.usd, budgetUsd) ||
					Math.abs(rawQ.usd - budgetUsd) <= spendSlopUsd;
				const pondTighterThanSor =
					Number.isFinite(sorNumForCmp) &&
					sorNumForCmp > 0 &&
					rawQ.contracts + 1e-9 < sorNumForCmp;
				if (debounceAligned || (quoteSpendMatchesBudget && pondTighterThanSor)) {
					pondPick = rawQ;
				}
			}
			const q = pondPick;
			const usePondBuyQuote = q != null;
			const preview: TradePreviewFields = {
				calculatedContracts: usePondBuyQuote
					? q.contracts
					: (sorContracts ?? bookData.calculatedContracts),
				remainingUsd: bookData.remainingUsd,
				spent: usePondBuyQuote
					? q.usd
					: sorCost !== undefined && sorFee !== undefined
						? sorCost - sorFee
						: bookData.spent,
				tradingFee: usePondBuyQuote ? 0 : (sorFee ?? bookData.tradingFee),
				estimatedCost: usePondBuyQuote
					? q.usd
					: (sorCost ?? bookData.estimatedCost),
				grossReceive: null,
				sellTradingFee: null,
				netReceive: null,
			};
			return {
				preview,
				source: resolveSource(usePondBuyQuote, true, false),
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

	const dflowQuoteData = rawQ;
	if (
		dflowPondQuoteSurface &&
		orderType === "market" &&
		dflowQuoteData &&
		Number.isFinite(dflowQuoteData.contracts) &&
		dflowQuoteData.contracts > 0
	) {
		if (side === "buy") {
			const preview: TradePreviewFields = {
				calculatedContracts: dflowQuoteData.contracts,
				remainingUsd: bookData.remainingUsd,
				spent: dflowQuoteData.usd,
				tradingFee: 0,
				estimatedCost: dflowQuoteData.usd,
				grossReceive: null,
				sellTradingFee: null,
				netReceive: null,
			};
			return { preview, source: "pond", route: null };
		}
		const preview: TradePreviewFields = {
			calculatedContracts: dflowQuoteData.contracts,
			remainingUsd: bookData.remainingUsd,
			spent: null,
			tradingFee: null,
			estimatedCost: null,
			grossReceive: dflowQuoteData.usd,
			sellTradingFee: 0,
			netReceive: dflowQuoteData.usd,
		};
		return { preview, source: "pond", route: null };
	}

	return {
		preview: { ...bookData },
		source: bookData.calculatedContracts != null ? "book" : "idle",
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
