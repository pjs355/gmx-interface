import { describe, expect, it } from "vitest";
import {
	routeMatchesTradeContext,
	usdAmountMatchesRoute,
	shareAmountMatchesRoute,
	isOmnibusDisplayMetricsTrusted,
	positionToSorOutcome,
} from "./sorQuoteTrust";
import type { RoutePlan, RouteLeg } from "./sor-types";

function minimalRoute(partial: Partial<RoutePlan> & Pick<RoutePlan, "side" | "outcome" | "requestedAmount">): RoutePlan {
	const stubLeg = {
		venue: "levelup",
		chain: "base",
		outcome: partial.outcome ?? "A",
		shares: 1,
		avgPrice: 0.5,
		executionAmountUsd: 1,
		fee: 0,
		priceImpact: 0,
		estimatedTimeSeconds: 0,
		bridge: null,
		minSharesAtSlippage: 0,
		venueMarketIds: { venue: "levelup" },
		orderType: "market" as const,
	} as RouteLeg;
	return {
		routeId: "t",
		pandaMatchId: "t",
		legs: [stubLeg],
		totalShares: 1,
		totalCost: 1,
		totalFees: 0,
		totalBridgeCost: 0,
		remainder: 0,
		singleVenueBest: {
			venue: "levelup",
			shares: 1,
			totalCost: 1,
			effectivePrice: 1,
		},
		savingsVsSingleVenue: { extraShares: 0, percentImprovement: 0 },
		estimatedExecutionTimeSeconds: 0,
		degraded: false,
		insufficientLiquidity: false,
		venuesConsidered: [],
		venuesExcluded: [],
		venueRequirements: {},
		hmac: "",
		expiresAt: Date.now() + 60_000,
		computedInMs: 0,
		...partial,
	};
}

describe("sorQuoteTrust", () => {
	it("usdAmountMatchesRoute rounds to cents", () => {
		expect(usdAmountMatchesRoute(10.001, 10.002)).toBe(true);
		expect(usdAmountMatchesRoute(10.02, 10.01)).toBe(false);
	});

	it("shareAmountMatchesRoute uses SHARE_SELL_COMPARE_EPS tolerance", () => {
		expect(shareAmountMatchesRoute(100, 100.005)).toBe(true);
		expect(shareAmountMatchesRoute(100, 100.02)).toBe(false);
	});

	it("routeMatchesTradeContext checks outcome and side", () => {
		const ctx = {
			side: "buy" as const,
			outcome: positionToSorOutcome("yes"),
			amountNumber: 50,
		};
		const ok = minimalRoute({
			side: "buy",
			outcome: "A",
			requestedAmount: 50,
		});
		expect(routeMatchesTradeContext(ok, ctx)).toBe(true);
		expect(routeMatchesTradeContext(minimalRoute({ ...ok, outcome: "B" }), ctx)).toBe(false);
		expect(routeMatchesTradeContext(minimalRoute({ ...ok, side: "sell" }), ctx)).toBe(false);
	});

	it("isOmnibusDisplayMetricsTrusted rejects sticky snapshot while loading without live match", () => {
		const ctx = {
			side: "buy" as const,
			outcome: "A" as const,
			amountNumber: 25,
		};
		const stale = minimalRoute({
			side: "buy",
			outcome: "A",
			requestedAmount: 10,
		});
		const live = minimalRoute({
			side: "buy",
			outcome: "A",
			requestedAmount: 25,
		});
		expect(isOmnibusDisplayMetricsTrusted(null, stale, ctx, true)).toBe(false);
		expect(isOmnibusDisplayMetricsTrusted(live, live, ctx, true)).toBe(true);
		expect(isOmnibusDisplayMetricsTrusted(null, stale, ctx, false)).toBe(false);
	});
});
