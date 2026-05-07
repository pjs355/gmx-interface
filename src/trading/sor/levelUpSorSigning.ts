import type { RouteLeg } from "./sor-types";
import { formatUnits } from "viem";
import { predictionBuyMakerMicroUsdc } from "./predictionBuyCollateralMicro";

/**
 * Single signing price (2dp) for LevelUp prediction `POST /orders`, aligned with SOR route legs.
 *
 * Market BUY requires `maxPrice`; market SELL requires `minPrice`. No heuristic fallback —
 * a missing book bound is a routing bug Stale routes must be refreshed.
 */
export function resolveLevelUpSigningPrice(args: {
	leg: RouteLeg;
	side: "buy" | "sell";
	isLimit: boolean;
	limitPrice?: number;
}): number {
	const { leg, side, isLimit, limitPrice } = args;
	if (isLimit) {
		if (limitPrice == null || !(limitPrice > 0) || !(limitPrice < 1)) {
			throw new Error("LevelUp limit order missing valid limit price");
		}
		return Math.round(limitPrice * 100) / 100;
	}
	if (side === "buy") {
		const maxPx = leg.maxPrice;
		if (maxPx != null && Number.isFinite(maxPx) && maxPx > 0 && maxPx < 1) {
			return Math.round(maxPx * 100) / 100;
		}
		throw new Error(
			"LevelUp SOR market buy missing valid maxPrice — refresh the route and try again.",
		);
	}
	const minPx = leg.minPrice;
	if (minPx != null && Number.isFinite(minPx) && minPx > 0 && minPx < 1) {
		return Math.round(minPx * 100) / 100;
	}
	throw new Error(
		"LevelUp SOR market sell missing valid minPrice — refresh the route and try again.",
	);
}

/** Human USDC (6dp) the signed **buy** order locks as `makerAmount` — prefund must cover this on Base. */
export function levelUpBuySignedPremiumUsdHuman(leg: RouteLeg): number {
	const shares = Math.max(0, Math.round(leg.shares));
	const isLimit = leg.orderType === "limit";
	const limitPrice =
		isLimit && typeof leg.limitPriceCents === "number"
			? leg.limitPriceCents / 100
			: undefined;
	const price = resolveLevelUpSigningPrice({
		leg,
		side: "buy",
		isLimit,
		limitPrice,
	});
	const micro = predictionBuyMakerMicroUsdc(shares, price);
	return Number(formatUnits(micro, 6));
}
