import { describe, expect, it } from "vitest";
import {
	computePrefundNeedUsdHuman,
	LIFI_BRIDGE_AMOUNT_MARGIN,
	resolveBuyPrefundAnchorUsd,
} from "./prefundPlan";
import { groupBridgeLegsByCorridor } from "./sorBridgeGroups";
import type { RouteLeg } from "./sor-types";

describe("LIFI_BRIDGE_AMOUNT_MARGIN", () => {
	it("is 0 — per-corridor budgetUsd cap is the only enforcement", () => {
		expect(LIFI_BRIDGE_AMOUNT_MARGIN).toBe(0);
	});
});

describe("computePrefundNeedUsdHuman", () => {
	it("returns the input unchanged with the default zero margin", () => {
		expect(computePrefundNeedUsdHuman(25)).toBe(25);
		expect(computePrefundNeedUsdHuman(4.88)).toBe(4.88);
	});

	it("never adds a fixed dollar buffer (used to add 0.01)", () => {
		expect(computePrefundNeedUsdHuman(0)).toBe(0);
		expect(computePrefundNeedUsdHuman(1)).toBe(1);
	});
});

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

	it("uses route when shortfall exceeds execution notional", () => {
		expect(resolveBuyPrefundAnchorUsd(10, 8)).toBeCloseTo(10, 8);
	});

	it("does NOT add venue fee on top — fee is handled at wire layer", () => {
		// Anchoring on `executionAmountUsd` keeps source-wallet debit at the
		// optimizer's `alloc.cost`. Fee headroom for venue API balance checks
		// is provided by sending `wireAmount = exec - fee`, not by bridging more.
		expect(resolveBuyPrefundAnchorUsd(20, 24.889)).toBeCloseTo(24.889, 8);
	});

	it("anchor equals max(routeBridgeUsd, executionAmountUsd) for arbitrary inputs", () => {
		const cases = [
			[0, 0],
			[1, 0],
			[0, 1],
			[5, 3],
			[3, 5],
			[10, 10],
			[24.5, 25],
			[25, 24.5],
		] as const;
		for (const [r, e] of cases) {
			expect(resolveBuyPrefundAnchorUsd(r, e)).toBeCloseTo(Math.max(r, e), 10);
		}
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
		expect(groups[0]!.groupBridgeCostUsd).toBeCloseTo(0.1, 8);
	});

	it("does NOT add per-leg fee into the corridor aggregate", () => {
		// Two polymarket legs sharing bnb→polygon. Aggregate is Σmax(shortfall, exec)
		// only — fee is encoded in `executionAmountUsd` already (alloc.cost), and
		// adding it again would push source-wallet debit past `request.amount`.
		const mkLeg = (exec: number, fee: number, share: number): RouteLeg => ({
			venue: "polymarket",
			chain: "polygon",
			outcome: "A",
			shares: share,
			avgPrice: 0.42,
			executionAmountUsd: exec,
			fee,
			priceImpact: 0,
			estimatedTimeSeconds: 60,
			minSharesAtSlippage: share,
			venueMarketIds: { venue: "polymarket" },
			orderType: "market",
			bridge: {
				fromChain: "bnb",
				toChain: "polygon",
				amount: exec,
				estimatedCost: 0.1,
				estimatedTimeSeconds: 60,
			},
		});
		const legs: RouteLeg[] = [mkLeg(24.889, 0.4329, 59.24), mkLeg(15, 0.26, 35.7)];
		const groups = groupBridgeLegsByCorridor(legs);
		expect(groups).toHaveLength(1);
		expect(groups[0]!.totalAmountUsd).toBeCloseTo(24.889 + 15, 4);
		expect(groups[0]!.groupBridgeCostUsd).toBeCloseTo(0.2, 8);
	});
});
