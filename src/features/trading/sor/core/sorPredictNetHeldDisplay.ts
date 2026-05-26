import type { RouteLeg } from "./sor-types";
import { limitlessNetOutcomeSharesHeldAfterBuy } from "@/features/trading/fees/limitless";
import { predictFunNetOutcomeSharesHeldAfterBuy } from "@/features/trading/fees/predict";

/**
 * Buy leg: **net** outcome shares held after venue fee where the SOR leg is
 * gross contracts (Predict token-side bps; Limitless CLOB curve, outcome-side
 * buy fee); other venues return gross `leg.shares`. Used for SOR display totals.
 */
export function sorBuyPredictLegNetHeldShares(
	leg: Pick<RouteLeg, "venue" | "shares" | "avgPrice">,
	predictFunFeeRateBps: number | undefined,
): number {
	if (leg.venue === "limitless") {
		return limitlessNetOutcomeSharesHeldAfterBuy(leg.shares, leg.avgPrice);
	}
	if (leg.venue !== "predictfun") return leg.shares;
	if (
		predictFunFeeRateBps == null ||
		!Number.isFinite(predictFunFeeRateBps) ||
		predictFunFeeRateBps <= 0
	) {
		return leg.shares;
	}
	return predictFunNetOutcomeSharesHeldAfterBuy(leg.shares, leg.avgPrice, predictFunFeeRateBps);
}

/** Sum of per-leg net-held buy shares (Predict + Limitless CLOB netted; others gross). */
export function sorBuyNetHeldTotalSharesFromLegs(
	legs: RouteLeg[],
	predictFunFeeRateBps: number | undefined,
): number {
	let sum = 0;
	for (const leg of legs) {
		sum += sorBuyPredictLegNetHeldShares(leg, predictFunFeeRateBps);
	}
	return sum;
}
