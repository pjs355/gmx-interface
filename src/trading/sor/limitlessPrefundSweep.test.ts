import { describe, expect, it } from "vitest";
import {
	bridgeShortfallUsdToDesiredSweepMicrosFloor,
	isLimitlessSweepInsufficientBalanceError,
	planLimitlessScwSweepMicros,
	recappedSweepForSend,
} from "./limitlessPrefundSweep";

const MIN_CHUNK = 0.02;

describe("bridgeShortfallUsdToDesiredSweepMicrosFloor", () => {
	it("floors USD shortfall to micros", () => {
		expect(bridgeShortfallUsdToDesiredSweepMicrosFloor(1.904334)).toBe(1904334n);
	});
	it("returns 0 for non-finite or non-positive", () => {
		expect(bridgeShortfallUsdToDesiredSweepMicrosFloor(NaN)).toBe(0n);
		expect(bridgeShortfallUsdToDesiredSweepMicrosFloor(-1)).toBe(0n);
	});
});

describe("planLimitlessScwSweepMicros", () => {
	it("caps sweep by live balance below shortfall", () => {
		const shortfall = 1.904334;
		const balanceMicros = 1_000_000n; // 1 USDC
		const p = planLimitlessScwSweepMicros(shortfall, balanceMicros, MIN_CHUNK);
		expect(p.plannedSweepMicros).toBe(1_000_000n);
		expect(p.sweepAmountHuman).toBe(1);
		expect(p.lifiNeedUsd).toBeCloseTo(0.904334, 6);
	});

	it("when live balance is below shortfall, lifiNeed forces Li.FI path", () => {
		const shortfall = 1.904334;
		const balanceMicros = 500_000n; // 0.5 USDC
		const p = planLimitlessScwSweepMicros(shortfall, balanceMicros, MIN_CHUNK);
		expect(p.plannedSweepMicros).toBe(500_000n);
		expect(p.lifiNeedUsd).toBeCloseTo(1.404334, 6);
	});

	it("zeros dust sweeps and sends full shortfall to Li.FI", () => {
		const shortfall = 1.5;
		const balanceMicros = 10_000n; // 0.01 USDC < MIN_CHUNK
		const p = planLimitlessScwSweepMicros(shortfall, balanceMicros, MIN_CHUNK);
		expect(p.plannedSweepMicros).toBe(0n);
		expect(p.lifiNeedUsd).toBe(shortfall);
	});
});

describe("recappedSweepForSend", () => {
	it("when latest balance is lower than planned, increases lifi remainder", () => {
		const planned = 1_904_334n;
		const latest = 1_000_000n;
		const r = recappedSweepForSend(planned, latest, 1.904334, MIN_CHUNK);
		expect(r.plannedSweepMicros).toBe(1_000_000n);
		expect(r.lifiNeedUsd).toBeCloseTo(0.904334, 6);
	});

	it("when recap makes sweep dust, clears sweep", () => {
		const planned = 50_000n; // 0.05 USDC
		const latest = 10_000n; // 0.01 USDC — below MIN_CHUNK
		const r = recappedSweepForSend(planned, latest, 1.9, MIN_CHUNK);
		expect(r.plannedSweepMicros).toBe(0n);
		expect(r.lifiNeedUsd).toBe(1.9);
	});
});

describe("isLimitlessSweepInsufficientBalanceError", () => {
	it("detects ERC20 exceeds balance wording", () => {
		expect(
			isLimitlessSweepInsufficientBalanceError(
				new Error("Execution reverted with reason: ERC20: transfer amount exceeds balance."),
			),
		).toBe(true);
		expect(isLimitlessSweepInsufficientBalanceError(new Error("user rejected"))).toBe(false);
	});
});
