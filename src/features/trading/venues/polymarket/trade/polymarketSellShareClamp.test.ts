import { describe, expect, it } from "vitest";
import { clampMarketSellSharesToCtfBalance } from "./polymarketSellShareClamp";

describe("clampMarketSellSharesToCtfBalance", () => {
	it("passes plannedShares through when CTF balance covers it (no resize)", () => {
		const r = clampMarketSellSharesToCtfBalance({
			plannedShares: 8.5,
			ctfBalanceWei: 10_000_000n, // 10 shares
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.resized).toBe(false);
			expect(r.amountShares).toBeCloseTo(8.5, 6);
			expect(r.scale).toBe(1);
		}
	});

	it("clamps to chain balance, tick-floored to the SDK's makerAmount step (the 8.96 vs 8.80 case)", () => {
		// Reproduces the production failure: Data API said 8.969823881585278
		// shares, on-chain CTF balanceOf was 8803570 (8.80357 shares) — the
		// CLOB SDK rounds makerAmount to 0.01, so clamping to 8.80 keeps
		// makerAmount = 8800000 ≤ on-chain balance 8803570.
		const r = clampMarketSellSharesToCtfBalance({
			plannedShares: 8.969823881585278,
			ctfBalanceWei: 8_803_570n,
			tickSize: 0.01,
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.resized).toBe(true);
			expect(r.amountShares).toBeCloseTo(8.8, 6);
			expect(r.scale).toBeCloseTo(8.8 / 8.969823881585278, 6);
		}
	});

	it("never lets the clamped amount exceed the on-chain balance even after SDK tick-floor", () => {
		// Edge case: balance is exactly on a tick boundary. The dust subtract
		// + floor must still produce ≤ balance.
		const r = clampMarketSellSharesToCtfBalance({
			plannedShares: 100,
			ctfBalanceWei: 10_000_000n, // exactly 10.00 shares
			tickSize: 0.01,
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.resized).toBe(true);
			expect(r.amountShares).toBeLessThanOrEqual(10);
			// One micro-share dust + tick floor ⇒ 9.99 (still safely sellable).
			expect(r.amountShares).toBeCloseTo(9.99, 6);
		}
	});

	it("respects a custom tickSize (0.001 / 0.1¢ markets)", () => {
		const r = clampMarketSellSharesToCtfBalance({
			plannedShares: 50,
			ctfBalanceWei: 12_345_678n, // 12.345678 shares
			tickSize: 0.001,
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.resized).toBe(true);
			// 12.345677 (after 1µ-share dust) → floor to 0.001 = 12.345
			expect(r.amountShares).toBeCloseTo(12.345, 6);
		}
	});

	it("returns ok:false when the Safe holds zero shares", () => {
		const r = clampMarketSellSharesToCtfBalance({
			plannedShares: 5,
			ctfBalanceWei: 0n,
		});
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.ctfBalanceShares).toBe(0);
			expect(r.error).toMatch(/no shares of this outcome/i);
		}
	});

	it("returns ok:false when the on-chain balance is below the venue minimum sell", () => {
		const r = clampMarketSellSharesToCtfBalance({
			plannedShares: 5,
			ctfBalanceWei: 5_000n, // 0.005 shares — below default 0.01 minimum
			tickSize: 0.01,
		});
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.ctfBalanceShares).toBeCloseTo(0.005, 6);
			expect(r.error).toMatch(/below the/i);
		}
	});

	it("rejects a non-positive plannedShares", () => {
		const r = clampMarketSellSharesToCtfBalance({
			plannedShares: 0,
			ctfBalanceWei: 100_000_000n,
		});
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toMatch(/empty Polymarket sell/i);
		}
	});

	it("treats a NaN/non-finite plannedShares as zero (rejected)", () => {
		const r = clampMarketSellSharesToCtfBalance({
			plannedShares: Number.NaN,
			ctfBalanceWei: 100_000_000n,
		});
		expect(r.ok).toBe(false);
	});

	it("scale = clampedShares / plannedShares (used for filledShares estimate)", () => {
		const planned = 20;
		const r = clampMarketSellSharesToCtfBalance({
			plannedShares: planned,
			ctfBalanceWei: 15_000_000n, // 15.00 shares
			tickSize: 0.01,
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.resized).toBe(true);
			expect(r.scale).toBeCloseTo(r.amountShares / planned, 6);
			expect(r.scale).toBeGreaterThan(0);
			expect(r.scale).toBeLessThanOrEqual(1);
		}
	});
});
