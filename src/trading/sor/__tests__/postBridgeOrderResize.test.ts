import { describe, expect, it } from "vitest";
import { clampMarketBuyAmountToWallet } from "../prefund/postBridgeOrderResize";

describe("clampMarketBuyAmountToWallet", () => {
	it("passes the planned wire amount through when wallet covers fee + dust", () => {
		// Wire amount is notional (executionAmountUsd - fee). Wallet has wire + fee + slack.
		const wire = 24.456124; // = 24.889034 - 0.4329
		const r = clampMarketBuyAmountToWallet({
			plannedExecutionUsd: wire,
			walletUsd: 25.6,
			feeEstimateUsd: 0.4329,
			minOrderUsd: 1,
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.resized).toBe(false);
			expect(r.amountUsd).toBeCloseTo(wire, 6);
			expect(r.scale).toBe(1);
		}
	});

	it("does NOT resize when wallet covers wire + fee + dust (headroom from notional wire)", () => {
		// Bridging exec=notional+fee creates exactly the headroom the venue API check
		// (wallet >= wire + fee) needs. Even when LI.FI delivers at toAmountMin (25.27
		// instead of the ideal 25.32), wallet still covers wire (24.456) + fee (0.433)
		// + dust (0.005) = 24.894 with $0.38 to spare → no resize.
		const wire = 24.456124; // = exec(24.889) - fee(0.433)
		const r = clampMarketBuyAmountToWallet({
			plannedExecutionUsd: wire,
			walletUsd: 25.274037,
			feeEstimateUsd: 0.43291,
			minOrderUsd: 1,
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.resized).toBe(false);
			expect(r.amountUsd).toBeCloseTo(wire, 6);
			expect(r.scale).toBe(1);
		}
	});

	it("clamps wire to wallet − fee − dust floored to 2dp when LI.FI under-delivers below the headroom", () => {
		// Pathological under-delivery: bridge dropped wallet to less than wire + fee + dust.
		const wire = 24.456124;
		const r = clampMarketBuyAmountToWallet({
			plannedExecutionUsd: wire,
			walletUsd: 24.6,
			feeEstimateUsd: 0.43291,
			minOrderUsd: 1,
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.resized).toBe(true);
			// 24.6 − 0.43291 − 0.005 = 24.16209 → floor 2dp = 24.16
			expect(r.amountUsd).toBeCloseTo(24.16, 2);
			expect(r.scale).toBeCloseTo(24.16 / wire, 4);
		}
	});

	it("scale is 1 on identity passthrough, never resized", () => {
		const r = clampMarketBuyAmountToWallet({
			plannedExecutionUsd: 5,
			walletUsd: 100,
			feeEstimateUsd: 0.1,
			minOrderUsd: 1,
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.resized).toBe(false);
			expect(r.scale).toBe(1);
			expect(r.amountUsd).toBe(5);
		}
	});

	it("scale = amountUsd / planned for true under-delivery resizes", () => {
		// Wire 10, wallet 8, fee 0.5, dust 0.005 → cap = 7.495 → floor 2dp = 7.49
		const r = clampMarketBuyAmountToWallet({
			plannedExecutionUsd: 10,
			walletUsd: 8,
			feeEstimateUsd: 0.5,
			minOrderUsd: 1,
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.resized).toBe(true);
			expect(r.amountUsd).toBeCloseTo(7.49, 2);
			expect(r.scale).toBeCloseTo(7.49 / 10, 6);
		}
	});

	it("rejects wire == 0 (executionAmountUsd <= leg.fee corner case)", () => {
		const r = clampMarketBuyAmountToWallet({
			plannedExecutionUsd: 0,
			walletUsd: 100,
			feeEstimateUsd: 0.5,
			minOrderUsd: 1,
		});
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.scale).toBe(0);
		}
	});

	it("returns ok=false when wallet cannot cover fee + venue minimum", () => {
		const r = clampMarketBuyAmountToWallet({
			plannedExecutionUsd: 5,
			walletUsd: 1.2,
			feeEstimateUsd: 0.5,
			minOrderUsd: 1,
		});
		expect(r.ok).toBe(false);
	});

	it("clamps without going below the venue minimum when remainder is sub-cent", () => {
		// wallet=1.0049, fee=0, dust=0.005 → cap=−0.0001 → cap clamped to 0 → below min
		const r = clampMarketBuyAmountToWallet({
			plannedExecutionUsd: 1,
			walletUsd: 1.0049,
			feeEstimateUsd: 0,
			minOrderUsd: 1,
		});
		expect(r.ok).toBe(false);
	});

	it("never increases the planned amount", () => {
		const r = clampMarketBuyAmountToWallet({
			plannedExecutionUsd: 10,
			walletUsd: 1000,
			feeEstimateUsd: 0.1,
			minOrderUsd: 1,
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.amountUsd).toBe(10);
			expect(r.resized).toBe(false);
		}
	});

	it("treats NaN/negative inputs as zero", () => {
		const r = clampMarketBuyAmountToWallet({
			plannedExecutionUsd: 5,
			walletUsd: Number.NaN,
			feeEstimateUsd: -1,
			minOrderUsd: 1,
		});
		expect(r.ok).toBe(false);
	});

	it("floors the clamped amount to 2 decimals (matches CLOB makerAmount rounding)", () => {
		// wallet=2.005 − fee=0 − dust=0.005 = 2.00 exact → floor 2dp = 2.00
		const r = clampMarketBuyAmountToWallet({
			plannedExecutionUsd: 5,
			walletUsd: 2.005,
			feeEstimateUsd: 0,
			minOrderUsd: 1,
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.resized).toBe(true);
			expect(r.amountUsd).toBeCloseTo(2.0, 6);
		}
	});
});
