import { describe, expect, it } from "vitest";
import {
	buildPrefundSteps,
	computePrefundBridgeShortfallUsdHuman,
	computePrefundNeedUsdHuman,
	LIFI_BRIDGE_AMOUNT_MARGIN,
} from "./prefundPlan";
import type { FundingStableBalancesHuman } from "./fundingStableBalances";
describe("prefundPlan", () => {
	it("computePrefundNeedUsdHuman applies margin and buffer", () => {
		const n = computePrefundNeedUsdHuman(5, LIFI_BRIDGE_AMOUNT_MARGIN);
		expect(n).toBeCloseTo(5 * 1.01 + 0.01, 6);
	});

	it("computePrefundBridgeShortfallUsdHuman subtracts venue balance capped by need", () => {
		const need = computePrefundNeedUsdHuman(5);
		const balances: FundingStableBalancesHuman = {
			base: 2.92,
			polygon: 0,
			solana: 0,
			bnb: 0,
		};
		const s = computePrefundBridgeShortfallUsdHuman(need, "base", balances);
		expect(s).toBeCloseTo(need - 2.92, 6);
	});

	it("computePrefundBridgeShortfallUsdHuman is zero when venue exceeds need", () => {
		const need = computePrefundNeedUsdHuman(5);
		const balances: FundingStableBalancesHuman = {
			base: 100,
			polygon: 0,
			solana: 0,
			bnb: 0,
		};
		expect(computePrefundBridgeShortfallUsdHuman(need, "base", balances)).toBe(0);
	});

	it("buildPrefundSteps single-source succeeds when primary covers need", () => {
		const balances: FundingStableBalancesHuman = {
			base: 0,
			polygon: 0,
			solana: 0,
			bnb: 10,
		};
		const steps = buildPrefundSteps(5.06, "bnb", "base", balances, false);
		expect(steps).toHaveLength(1);
		expect(steps[0]!.fromChain).toBe("bnb");
		expect(Number(steps[0]!.amountHuman)).toBeCloseTo(5.06, 2);
	});

	it("buildPrefundSteps single-source throws when primary insufficient", () => {
		const balances: FundingStableBalancesHuman = {
			base: 0,
			polygon: 0,
			solana: 0,
			bnb: 2,
		};
		expect(() =>
			buildPrefundSteps(5.06, "bnb", "base", balances, false),
		).toThrow(/Not enough/);
	});

	it("buildPrefundSteps multisource splits across chains", () => {
		const balances: FundingStableBalancesHuman = {
			base: 0,
			polygon: 0,
			solana: 2.6,
			bnb: 2.6,
		};
		const need = computePrefundNeedUsdHuman(5);
		const steps = buildPrefundSteps(need, "bnb", "base", balances, true);
		const fromChains = new Set(steps.map((s) => s.fromChain));
		expect(fromChains.has("bnb")).toBe(true);
		expect(fromChains.has("solana")).toBe(true);
		const total = steps.reduce((s, x) => s + Number(x.amountHuman), 0);
		expect(total).toBeGreaterThanOrEqual(need - 0.02);
	});

	it("buildPrefundSteps multisource uses shortfall after venue balance on destination", () => {
		const balances: FundingStableBalancesHuman = {
			base: 2,
			polygon: 0,
			solana: 2.6,
			bnb: 2.6,
		};
		const fullNeed = computePrefundNeedUsdHuman(5);
		const shortfall = computePrefundBridgeShortfallUsdHuman(fullNeed, "base", balances);
		const steps = buildPrefundSteps(shortfall, "bnb", "base", balances, true, {
			fullPrefundNeedUsdHuman: fullNeed,
		});
		const total = steps.reduce((s, x) => s + Number(x.amountHuman), 0);
		expect(total).toBeGreaterThanOrEqual(shortfall - 0.02);
		expect(total).toBeLessThan(fullNeed - 0.5);
	});
});
