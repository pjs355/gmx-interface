import { useMemo } from "react";
import { getVenueConfig, type TradingVenue } from "@/config/venueConfig";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import { LIMITLESS_DEFAULT_FEE_RATE_BPS } from "@/features/trading/fees/limitless";
import { calculateContractsForMarketOrder } from "@/features/trading/orderbook-walk/calculateContractsForMarketOrder";
import { EMPTY_TRADE_PREVIEW, type MarketOrderBookPreview } from "./types";

export type UseCalculatedMarketOrderDataArgs = {
	orderType: "market" | "limit";
	amount: string;
	selectedPosition: "yes" | "no" | null;
	side: "buy" | "sell";
	tradingVenue: TradingVenue;
	effectiveOrderbook: OrderbookSnapshot | null;
	orderbookWalkPosition: "yes" | "no";
	predictFunFeeRateBps: number | undefined;
};

/** Local orderbook walk — fallback when SOR preview is unavailable. */
export function useCalculatedMarketOrderData(
	args: UseCalculatedMarketOrderDataArgs,
): MarketOrderBookPreview {
	const {
		orderType,
		amount,
		selectedPosition,
		side,
		tradingVenue,
		effectiveOrderbook,
		orderbookWalkPosition,
		predictFunFeeRateBps,
	} = args;

	return useMemo(() => {
		if (orderType === "market" && amount && selectedPosition && effectiveOrderbook) {
			const usdAmount = Number.parseFloat(amount);
			if (!Number.isNaN(usdAmount) && usdAmount > 0) {
				const venueConfig = getVenueConfig(tradingVenue);
				const sizingFeeBps =
					tradingVenue === "limitless" ? LIMITLESS_DEFAULT_FEE_RATE_BPS : predictFunFeeRateBps;
				const bestAskPrice = effectiveOrderbook.asks?.[0]?.price;
				const effectiveBudget =
					side === "buy"
						? venueConfig.effectiveBuyBudget(usdAmount, {
								feeRateBps: sizingFeeBps,
								approxPrice: bestAskPrice,
							})
						: usdAmount;

				const result = calculateContractsForMarketOrder(
					effectiveOrderbook,
					effectiveBudget,
					orderbookWalkPosition,
					side,
					venueConfig.requiresWholeShares,
				);
				const contracts = venueConfig.requiresWholeShares
					? Math.floor(result.contracts)
					: result.contracts;

				if (side === "buy") {
					const spent = effectiveBudget - result.remainingUsd;
					const avgPrice = contracts > 0 ? spent / contracts : 0;
					const tradingFee = venueConfig.estimateFee({
						contracts,
						price: avgPrice,
						side: "buy",
						feeRateBps: sizingFeeBps,
					});
					const estimatedCost = spent + tradingFee;

					return {
						calculatedContracts: contracts,
						remainingUsd: result.remainingUsd,
						spent,
						tradingFee,
						estimatedCost,
						grossReceive: null,
						sellTradingFee: null,
						netReceive: null,
					};
				}

				const grossReceive = result.remainingUsd;
				const avgSellPrice = contracts > 0 ? grossReceive / contracts : 0;
				const sellTradingFee = venueConfig.estimateFee({
					contracts,
					price: avgSellPrice,
					side: "sell",
					feeRateBps: sizingFeeBps,
				});
				const netReceive = grossReceive - sellTradingFee;

				return {
					calculatedContracts: contracts,
					remainingUsd: result.remainingUsd,
					spent: null,
					tradingFee: null,
					estimatedCost: null,
					grossReceive,
					sellTradingFee,
					netReceive,
				};
			}
		}
		return { ...EMPTY_TRADE_PREVIEW };
	}, [
		orderType,
		amount,
		selectedPosition,
		side,
		tradingVenue,
		effectiveOrderbook,
		orderbookWalkPosition,
		predictFunFeeRateBps,
	]);
}
