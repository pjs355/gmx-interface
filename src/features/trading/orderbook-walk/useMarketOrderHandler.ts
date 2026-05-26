import { useCallback } from "react";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import { calculateContractsForMarketOrder } from "./calculateContractsForMarketOrder";
import { getAvailableLiquidity } from "./getAvailableLiquidity";
import { getEffectivePrice } from "./getEffectivePrice";
import { hasSufficientLiquidity } from "./hasSufficientLiquidity";
import type { AvailableLiquidity, MarketOrderCalculation } from "./types";

export function useMarketOrderHandler(
	orderbook: OrderbookSnapshot | null,
	wholeSharesOnly: boolean = true,
) {
	const calculateContractsForMarketOrderBound = useCallback(
		(usdAmount: number, position: "yes" | "no", side: "buy" | "sell"): MarketOrderCalculation =>
			calculateContractsForMarketOrder(orderbook, usdAmount, position, side, wholeSharesOnly),
		[orderbook, wholeSharesOnly],
	);

	const getEffectivePriceBound = useCallback(
		(usdAmount: number, contracts: number, remainingUsd: number): number =>
			getEffectivePrice(usdAmount, contracts, remainingUsd),
		[],
	);

	const getAvailableLiquidityBound = useCallback(
		(position: "yes" | "no", side: "buy" | "sell"): AvailableLiquidity =>
			getAvailableLiquidity(orderbook, position, side, wholeSharesOnly),
		[orderbook, wholeSharesOnly],
	);

	const hasSufficientLiquidityBound = useCallback(
		(usdAmount: number, position: "yes" | "no", side: "buy" | "sell"): boolean =>
			hasSufficientLiquidity(orderbook, usdAmount, position, side, wholeSharesOnly),
		[orderbook, wholeSharesOnly],
	);

	return {
		calculateContractsForMarketOrder: calculateContractsForMarketOrderBound,
		getEffectivePrice: getEffectivePriceBound,
		hasSufficientLiquidity: hasSufficientLiquidityBound,
		getAvailableLiquidity: getAvailableLiquidityBound,
	};
}
