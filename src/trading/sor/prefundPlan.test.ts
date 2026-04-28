import { describe, expect, it } from "vitest";
import { resolveBuyPrefundAnchorUsd } from "./prefundPlan";
import { groupBridgeLegsByCorridor } from "./sorBridgeGroups";
import type { RouteLeg } from "./sor-types";

describe("resolveBuyPrefundAnchorUsd", () => {
	it("prefers execution notional over optimizer shortfall", () => {
		expect(resolveBuyPrefundAnchorUsd(1.37, 4.88)).toBeCloseTo(4.88, 8);
	});

	it("uses route when execution is zero (caller should validate buys)", () => {
		expect(resolveBuyPrefundAnchorUsd(2.5, 0)).toBeCloseTo(2.5, 8);
	});

	it("treats NaN inputs as zero on that side", () => {
		expect(resolveBuyPrefundAnchorUsd(Number.NaN, 5)).toBeCloseTo(5, 8);
		expect(resolveBuyPrefundAnchorUsd(3, Number.NaN)).toBeCloseTo(3, 8);
	});
});

describe("groupBridgeLegsByCorridor", () => {
	it("aggregates max(shortfall, execution) per leg", () => {
		const legs: RouteLeg[] = [
			{
				venue: "predictfun",
				chain: "bnb",
				outcome: "A",
				shares: 5,
				avgPrice: 0.93,
				executionAmountUsd: 4.88,
				fee: 0,
				priceImpact: 0,
				estimatedTimeSeconds: 60,
				minSharesAtSlippage: 4,
				venueMarketIds: { venue: "predictfun" },
				orderType: "market",
				bridge: {
					fromChain: "polygon",
					toChain: "bnb",
					amount: 1.37,
					estimatedCost: 0.1,
					estimatedTimeSeconds: 60,
				},
			},
		];
		const groups = groupBridgeLegsByCorridor(legs);
		expect(groups).toHaveLength(1);
		expect(groups[0]!.totalAmountUsd).toBeCloseTo(4.88, 8);
	});
});
