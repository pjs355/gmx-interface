import { describe, expect, it } from "vitest";
import type { RouteLeg, RoutePlan } from "@/trading/sor";
import { buildTradePreview, mergeStateWithTradePreview } from "./buildTradePreview";
import { EMPTY_TRADE_PREVIEW } from "./types";

function stubLeg(partial: Partial<RouteLeg> & Pick<RouteLeg, "venue">): RouteLeg {
	return {
		chain: "base",
		outcome: "A",
		shares: 10,
		avgPrice: 0.5,
		executionAmountUsd: 5,
		fee: 0.5,
		priceImpact: 0,
		estimatedTimeSeconds: 0,
		bridge: null,
		minSharesAtSlippage: 0,
		venueMarketIds: { venue: partial.venue },
		orderType: "market",
		...partial,
	} as RouteLeg;
}

function minimalRoute(
	partial: Partial<RoutePlan> & Pick<RoutePlan, "side" | "requestedAmount">,
): RoutePlan {
	const leg = stubLeg({ venue: "polymarket", ...(partial.legs?.[0] ?? {}) });
	const { side, requestedAmount, ...rest } = partial;
	return {
		routeId: "test-route",
		pandaMatchId: "p1",
		outcome: "A",
		side,
		requestedAmount,
		totalShares: 10,
		totalCost: 5,
		totalFees: 0.5,
		totalBridgeCost: 0,
		remainder: 0,
		singleVenueBest: {
			venue: "polymarket",
			shares: 10,
			totalCost: 5,
			effectivePrice: 0.5,
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
		legs: partial.legs ?? [leg],
		...rest,
	};
}

describe("buildTradePreview", () => {
	it("uses book preview when no route", () => {
		const book = {
			...EMPTY_TRADE_PREVIEW,
			calculatedContracts: 10,
			estimatedCost: 5,
		};
		const q = buildTradePreview({
			tradingVenue: "polymarket",
			side: "buy",
			orderType: "market",
			amount: "5",
			executionRoute: null,
			bookPreview: book,
			predictFunFeeRateBps: undefined,
		});
		expect(q.source).toBe("book");
		expect(q.preview.calculatedContracts).toBe(10);
		expect(q.preview.estimatedCost).toBe(5);
	});

	it("overlays SOR buy on a single-venue tab when route matches amount", () => {
		const book = { ...EMPTY_TRADE_PREVIEW, calculatedContracts: 1, estimatedCost: 1 };
		const route = minimalRoute({ side: "buy", requestedAmount: 5 });
		const q = buildTradePreview({
			tradingVenue: "polymarket",
			side: "buy",
			orderType: "market",
			amount: "5",
			executionRoute: route,
			bookPreview: book,
			predictFunFeeRateBps: undefined,
		});
		expect(q.source).toBe("sor");
		expect(q.route).toBe(route);
		expect(q.preview.calculatedContracts).toBe(10);
		expect(q.preview.estimatedCost).toBe(5);
	});

	it("uses Pond-sized DFlow leg from executionRoute (server overlay)", () => {
		const book = { ...EMPTY_TRADE_PREVIEW };
		const route = minimalRoute({
			side: "buy",
			requestedAmount: 5,
			legs: [stubLeg({ venue: "dflow", shares: 12, fee: 0.1 })],
			totalShares: 12,
			totalCost: 5,
			totalFees: 0.1,
		});
		const q = buildTradePreview({
			tradingVenue: "dflow",
			side: "buy",
			orderType: "market",
			amount: "5",
			executionRoute: route,
			bookPreview: book,
			predictFunFeeRateBps: undefined,
		});
		expect(q.source).toBe("sor");
		expect(q.preview.calculatedContracts).toBe(12);
		expect(q.preview.estimatedCost).toBe(5);
		expect(q.preview.tradingFee).toBe(0.1);
	});

	it("uses SOR sell proceeds from execution leg", () => {
		const book = { ...EMPTY_TRADE_PREVIEW };
		const route = minimalRoute({
			side: "sell",
			requestedAmount: 10,
			legs: [
				stubLeg({
					venue: "polymarket",
					shares: 10,
					avgPrice: 0.4,
					fee: 0.1,
					executionAmountUsd: 3.9,
				}),
			],
		});
		const q = buildTradePreview({
			tradingVenue: "polymarket",
			side: "sell",
			orderType: "market",
			amount: "10",
			executionRoute: route,
			bookPreview: book,
			predictFunFeeRateBps: undefined,
		});
		expect(q.source).toBe("sor");
		expect(q.preview.grossReceive).toBe(3.9);
		expect(q.preview.netReceive).toBe(3.9);
	});
});

describe("mergeStateWithTradePreview", () => {
	it("spreads preview fields onto core state for legacy callers", () => {
		const core = {
			tradingVenue: "levelup" as const,
			selectedPosition: "yes" as const,
			amount: "5",
			price: "",
			orderType: "market" as const,
			side: "buy" as const,
			isLoading: false,
			orderResult: null,
		};
		const merged = mergeStateWithTradePreview(core, {
			preview: { ...EMPTY_TRADE_PREVIEW, estimatedCost: 5 },
			source: "book",
			route: null,
		});
		expect(merged.estimatedCost).toBe(5);
		expect(merged.amount).toBe("5");
	});
});
