import type { RouteLeg } from "./sor-types";
import { predictFunNetOutcomeSharesHeldAfterBuy } from "@/features/trading/fees/predict";

/**
 * Buy leg: net outcome shares for display ("to win").
 *
 * - Limitless CLOB: SOR `walkBook` already applies fee-in-contracts via
 *   `buyReceiveFactor`, so `leg.shares` are **net received** — do not net again.
 * - Predict.fun: legs are gross; apply token-side bps net-held.
 * - Other venues: gross `leg.shares`.
 */
export function sorBuyPredictLegNetHeldShares(
	leg: Pick<RouteLeg, "venue" | "shares" | "avgPrice">,
	predictFunFeeRateBps: number | undefined,
): number {
	if (leg.venue === "limitless") {
		return leg.shares;
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
