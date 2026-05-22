import { formatUnknownSorVenue, userMessage, SOR_MISSING_LIMIT_PRICE, SOR_REFUSE_BRIDGE_ON_SELL } from "@/errors";
import type { RouteLeg, SorVenue } from "@/trading/sor/core/sor-types";
import type { SorLegResult } from "@/trading/sor/execute/types";
import type { VenueLegDispatchInput } from "@/trading/sor/execute/venueLegContext";
import { executeLeg as executeDflowLeg } from "@/trading/venues/dflow/execute/executeLeg";
import { executeLeg as executeLevelUpLeg } from "@/trading/venues/levelup/execute/executeLeg";
import { executeLeg as executeLimitlessLeg } from "@/trading/venues/limitless/execute/executeLeg";
import { executeLeg as executePolymarketLeg } from "@/trading/venues/polymarket/execute/executeLeg";
import { executeLeg as executePredictLeg } from "@/trading/venues/predict/execute/executeLeg";

export async function dispatchSorLeg(
	input: Omit<VenueLegDispatchInput, "isLimit" | "limitPrice"> & {
		leg: RouteLeg;
		side: "buy" | "sell";
	},
): Promise<SorLegResult> {
	const { leg, side } = input;

	if (side === "sell" && leg.bridge !== null) {
		return {
			filled: false,
			filledShares: 0,
			error: userMessage(SOR_REFUSE_BRIDGE_ON_SELL),
		};
	}

	const isLimit = leg.orderType === "limit";
	const limitPrice =
		isLimit && typeof leg.limitPriceCents === "number"
			? leg.limitPriceCents / 100
			: undefined;

	if (isLimit && (limitPrice == null || limitPrice <= 0 || limitPrice >= 1)) {
		return {
			filled: false,
			filledShares: 0,
			error: userMessage(SOR_MISSING_LIMIT_PRICE),
		};
	}

	const ctx: VenueLegDispatchInput = {
		...input,
		isLimit,
		limitPrice,
	};

	const venue: SorVenue = leg.venue;
	switch (venue) {
		case "levelup":
			return executeLevelUpLeg(ctx);
		case "polymarket":
			return executePolymarketLeg(ctx);
		case "dflow":
			return executeDflowLeg(ctx);
		case "limitless":
			return executeLimitlessLeg(ctx);
		case "predictfun":
			return executePredictLeg(ctx);
		default:
			return {
				filled: false,
				filledShares: 0,
				error: formatUnknownSorVenue(String(venue)),
			};
	}
}
