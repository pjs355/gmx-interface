import { describe, expect, it } from "vitest";
import {
	formatSorLegAvgForDisplay,
	sorBuyDrawerAllInCostUsd,
	sorBuyLegUsdcSpendUsd,
} from "./sorUiUtils";
import type { RouteLeg, RoutePlan } from "./sor-types";

function levelUpLeg(partial: Partial<RouteLeg> = {}): RouteLeg {
	return {
		venue: "levelup",
		chain: "base",
		outcome: "A",
		shares: 2,
		avgPrice: 0.92,
		executionAmountUsd: 1.84,
		fee: 0.04,
		priceImpact: 0,
		estimatedTimeSeconds: 0,
		bridge: null,
		minSharesAtSlippage: 0,
		venueMarketIds: { venue: "levelup" },
		orderType: "market",
		...partial,
	} as RouteLeg;
}

function buyRoute(
	legs: RouteLeg[],
	partial: Partial<RoutePlan> = {},
): Pick<RoutePlan, "side" | "legs" | "totalCost" | "totalBridgeCost"> {
	return {
		side: "buy",
		legs,
		totalCost: 1.84,
		totalBridgeCost: 0,
		...partial,
	};
}

describe("sorBuyLegUsdcSpendUsd", () => {
	it("adds LevelUp fee to notional when executionAmountUsd is notional-only", () => {
		expect(sorBuyLegUsdcSpendUsd(levelUpLeg())).toBeCloseTo(1.88, 8);
	});

	it("uses executionAmountUsd when it already includes the fee", () => {
		expect(sorBuyLegUsdcSpendUsd(levelUpLeg({ executionAmountUsd: 1.88 }))).toBeCloseTo(
			1.88,
			8,
		);
	});

	it("counts Polymarket collateral as notional only (fee taken from shares)", () => {
		const leg = levelUpLeg({
			venue: "polymarket",
			chain: "polygon",
			shares: 10,
			avgPrice: 0.5,
			executionAmountUsd: 5.075,
			fee: 0.075,
		});
		expect(sorBuyLegUsdcSpendUsd(leg)).toBeCloseTo(5, 8);
	});
});

describe("sorBuyDrawerAllInCostUsd", () => {
	it("matches leg gross + fees for guest LevelUp preview (2 @ 92¢ + 4¢ fee)", () => {
		const total = sorBuyDrawerAllInCostUsd(buyRoute([levelUpLeg()]));
		expect(total).toBeCloseTo(1.88, 8);
	});
});

describe("formatSorLegAvgForDisplay", () => {
	it("caps long decimal-odds strings (~53% implied)", () => {
		expect(formatSorLegAvgForDisplay(0.52677, "decimal")).toBe("1.9");
	});

	it("caps long Hong Kong cell strings", () => {
		expect(formatSorLegAvgForDisplay(0.52677, "hong_kong")).toBe("0.9");
	});

	it("keeps default as short whole-cent label", () => {
		expect(formatSorLegAvgForDisplay(0.52677, "default")).toBe("53¢");
	});

	it("does not rewrite fractional odds", () => {
		expect(formatSorLegAvgForDisplay(0.75, "fractional")).toBe("1/3");
	});
});
