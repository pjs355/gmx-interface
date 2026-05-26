/**
 * Average fill price / odds display for the execution footer (buy and sell).
 *
 * Uses outcome BBO, SOR route trust rules, and market-order walk helpers when
 * the user has entered an amount. Consumed by `PredictionMarketTradeBoxUI` only.
 */
import { useMemo } from "react";
import { getVenueConfig, type TradingVenue } from "@/config/venueConfig";
import {
	executionRouteTrustedForSingleVenueMarketBuy,
	executionRouteTrustedForSingleVenueMarketSell,
	positionToSorOutcome,
	routeMatchesTradeContext,
	type RoutePlan,
	type SorSide,
	type SorTradeTrustContext,
} from "@/features/trading/sor";
import type { MarketOrderCalculation } from "../types";

export interface UseTradeBoxMarketAvgCentsParams {
	tradingVenue: TradingVenue;
	orderType: "market" | "limit";
	side: "buy" | "sell";
	amount: string;
	selectedPosition: "yes" | "no" | null;
	bestAsk: number | null;
	bestBid: number | null;
	predictHints: { yes: unknown; no: unknown } | null | undefined;
	yesHintPrices: { bestAsk: number | null; bestBid: number | null } | null;
	noHintPrices: { bestAsk: number | null; bestBid: number | null } | null;
	sorRoute: {
		executionRoute: RoutePlan | null;
		executionLoading: boolean;
		executionStale: boolean;
	};
	calculateContractsForMarketOrder: (
		usdAmount: number,
		position: "yes" | "no",
		side: "buy" | "sell",
	) => MarketOrderCalculation;
	getEffectivePrice: (usdAmount: number, contracts: number, remainingUsd: number) => number;
}

export function useTradeBoxMarketAvgCents({
	tradingVenue,
	orderType,
	side,
	amount,
	selectedPosition,
	bestAsk,
	bestBid,
	predictHints,
	yesHintPrices,
	noHintPrices,
	sorRoute,
	calculateContractsForMarketOrder,
	getEffectivePrice,
}: UseTradeBoxMarketAvgCentsParams) {
	const venueConfig = getVenueConfig(tradingVenue);

	const sorTrustCtxMarket = useMemo((): SorTradeTrustContext | null => {
		if (!amount || !selectedPosition) return null;
		const n = Number(amount);
		if (!Number.isFinite(n) || n <= 0) return null;
		return {
			side: side as SorSide,
			outcome: positionToSorOutcome(selectedPosition),
			amountNumber: n,
		};
	}, [amount, selectedPosition, side]);

	// Compute Odds % for market BUY orders using weighted average fill price.
	// Prefers SOR route data (server-side book walk) when available; falls back to local book walk.
	const oddsData = useMemo(() => {
		if (tradingVenue === "all") return null;
		if (orderType !== "market" || side !== "buy") return null;
		if (!amount || !selectedPosition) return null;
		const usdAmount = Number(amount);
		if (!Number.isFinite(usdAmount) || usdAmount <= 0) return null;

		if (!sorTrustCtxMarket) return null;

		const sorTrustedBuy = executionRouteTrustedForSingleVenueMarketBuy(
			sorRoute.executionRoute,
			sorTrustCtxMarket,
			sorRoute.executionLoading,
			sorRoute.executionStale,
		);

		if (sorTrustedBuy) {
			const leg = sorRoute.executionRoute!.legs[0];
			const avgPrice = leg.avgPrice;
			if (!Number.isFinite(avgPrice) || avgPrice <= 0) return null;
			const referencePrice = bestAsk ?? null;
			const pct = Math.round(avgPrice * 100);
			if (!Number.isFinite(pct) || pct < 0) return null;
			const isUpdated =
				referencePrice !== null && referencePrice !== undefined && isFinite(referencePrice)
					? avgPrice > referencePrice * 1.1
					: false;
			const fromPct =
				referencePrice !== null && referencePrice !== undefined && isFinite(referencePrice)
					? Math.round(referencePrice * 100)
					: null;
			return { pct, avgPrice, isUpdated, fromPct };
		}

		// Avoid local book walk while SOR is in flight or returned a non-matching plan for this tab/outcome.
		if (sorRoute.executionLoading) return null;
		if (
			sorRoute.executionRoute &&
			!routeMatchesTradeContext(sorRoute.executionRoute, sorTrustCtxMarket)
		) {
			return null;
		}

		// Local book walk when SOR has no executable targeted quote for this context.
		const walkUsd = venueConfig.effectiveBuyBudget(usdAmount, {
			approxPrice: bestAsk ?? undefined,
		});
		const { contracts, remainingUsd } = calculateContractsForMarketOrder(
			walkUsd,
			selectedPosition,
			"buy",
		);
		if (!contracts || contracts <= 0) return null;
		const avgPrice = getEffectivePrice(walkUsd, contracts, remainingUsd);
		if (!Number.isFinite(avgPrice) || avgPrice <= 0) return null;
		const referencePrice = (() => {
			if (tradingVenue === "predictfun" && predictHints) {
				const hp = selectedPosition === "yes" ? yesHintPrices : noHintPrices;
				if (!hp) return null;
				return hp.bestAsk ?? null;
			}
			if (
				tradingVenue === "polymarket" ||
				tradingVenue === "dflow" ||
				tradingVenue === "limitless"
			) {
				return bestAsk ?? null;
			}
			return selectedPosition === "yes"
				? (bestAsk ?? null)
				: bestBid === null || bestBid === undefined
					? null
					: 1 - bestBid;
		})();
		const pct = Math.round(avgPrice * 100);
		if (!Number.isFinite(pct) || pct < 0) return null;
		const isUpdated =
			referencePrice !== null && referencePrice !== undefined && isFinite(referencePrice)
				? avgPrice > referencePrice * 1.1
				: false;
		const fromPct =
			referencePrice !== null && referencePrice !== undefined && isFinite(referencePrice)
				? Math.round(referencePrice * 100)
				: null;
		return { pct, avgPrice, isUpdated, fromPct };
	}, [
		orderType,
		side,
		amount,
		selectedPosition,
		tradingVenue,
		calculateContractsForMarketOrder,
		getEffectivePrice,
		bestAsk,
		bestBid,
		predictHints,
		yesHintPrices,
		noHintPrices,
		sorRoute.executionRoute,
		sorRoute.executionStale,
		sorRoute.executionLoading,
		sorTrustCtxMarket,
	]);

	// Compute Avg Price (¢) for market SELL orders using weighted average sale price.
	// Prefers the SOR execution channel (single-venue) when fresh.
	const sellAvgCents = useMemo(() => {
		if (orderType !== "market" || side !== "sell") return null;
		if (!amount || !selectedPosition) return null;
		const shares = Number(amount);
		if (!Number.isFinite(shares) || shares <= 0) return null;

		if (!sorTrustCtxMarket) return null;

		const sorTrustedSell = executionRouteTrustedForSingleVenueMarketSell(
			sorRoute.executionRoute,
			sorTrustCtxMarket,
			sorRoute.executionLoading,
			sorRoute.executionStale,
		);

		if (sorTrustedSell) {
			const leg = sorRoute.executionRoute!.legs[0];
			const avgPrice = leg.avgPrice;
			if (!Number.isFinite(avgPrice) || avgPrice <= 0) return null;
			return Math.round(avgPrice * 100);
		}

		if (sorRoute.executionLoading) return null;
		if (
			sorRoute.executionRoute &&
			!routeMatchesTradeContext(sorRoute.executionRoute, sorTrustCtxMarket)
		) {
			return null;
		}

		const { contracts, remainingUsd } = calculateContractsForMarketOrder(
			shares,
			selectedPosition,
			"sell",
		);
		if (!contracts || contracts <= 0) return null;
		const avgPrice = remainingUsd / contracts;
		if (!Number.isFinite(avgPrice) || avgPrice <= 0) return null;
		const cents = Math.round(avgPrice * 100);
		return cents;
	}, [
		orderType,
		side,
		amount,
		selectedPosition,
		calculateContractsForMarketOrder,
		sorRoute.executionRoute,
		sorRoute.executionStale,
		sorRoute.executionLoading,
		sorTrustCtxMarket,
	]);

	return { sorTrustCtxMarket, oddsData, sellAvgCents };
}
