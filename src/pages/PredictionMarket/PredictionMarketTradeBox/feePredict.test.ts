import { describe, expect, it } from "vitest";
import { limitlessNetOutcomeSharesHeldAfterBuy } from "./feeLimitless";
import {
	calculatePredictFee,
	predictFunNetOutcomeSharesHeldAfterBuy,
} from "./feePredict";
import {
	sorBuyNetHeldTotalSharesFromLegs,
	sorBuyPredictLegNetHeldShares,
} from "@/trading/sor/sorPredictNetHeldDisplay";
import type { RouteLeg } from "@/trading/sor/sor-types";

describe("calculatePredictFee (SOR server parity)", () => {
	it("uses min(price, 1-price) and 5dp rounding", () => {
		const contracts = 100;
		const bps = 200;
		expect(calculatePredictFee(contracts, 0.38, bps)).toBe(0.76);
		expect(calculatePredictFee(contracts, 0.62, bps)).toBe(0.76);
	});

	it("p>0.5: fee uses (1-p) not p", () => {
		expect(calculatePredictFee(10, 0.8, 200)).toBe(0.04);
		expect(calculatePredictFee(10, 0.2, 200)).toBe(0.04);
	});
});

describe("predictFunNetOutcomeSharesHeldAfterBuy", () => {
	it("p<=0.5: net/gross tracks (1 - bps/10000) via feeUsd/avg path", () => {
		const gross = 100;
		const p = 0.4;
		const bps = 200;
		const net = predictFunNetOutcomeSharesHeldAfterBuy(gross, p, bps);
		expect(net / gross).toBeCloseTo(0.98, 8);
	});

	it("regression: ~4.8947 gross @ 0.38 & 200bps → ~4.7968 net", () => {
		const net = predictFunNetOutcomeSharesHeldAfterBuy(4.8947, 0.38, 200);
		expect(net).toBeCloseTo(4.796805263157895, 6);
	});

	it("p>0.5: net differs from gross*(1-bps/10000)", () => {
		const gross = 10;
		const p = 0.8;
		const bps = 200;
		const net = predictFunNetOutcomeSharesHeldAfterBuy(gross, p, bps);
		const naive = gross * (1 - bps / 10_000);
		expect(naive).toBe(9.8);
		expect(net).toBeCloseTo(9.95, 8);
		expect(net).not.toBeCloseTo(naive, 4);
	});

	it("monotone in gross for fixed p,bps", () => {
		let prev = 0;
		for (const g of [1, 2, 5, 10, 50, 100]) {
			const n = predictFunNetOutcomeSharesHeldAfterBuy(g, 0.45, 200);
			expect(n).toBeGreaterThan(prev);
			prev = n;
			expect(calculatePredictFee(g, 0.45, 200)).toBeGreaterThan(0);
		}
	});

	it("guards: invalid avgPrice or bps returns gross passthrough", () => {
		expect(predictFunNetOutcomeSharesHeldAfterBuy(5, 0, 200)).toBe(5);
		expect(predictFunNetOutcomeSharesHeldAfterBuy(5, 1, 200)).toBe(5);
		expect(predictFunNetOutcomeSharesHeldAfterBuy(5, 0.5, 0)).toBe(5);
	});
});

describe("limitlessNetOutcomeSharesHeldAfterBuy (CLOB curve)", () => {
	it("regression: ~5.54785 gross @ 35¢ → ~5.381412 net (E2E vs SOR gross leg)", () => {
		const gross = 5.547850208044383;
		const net = limitlessNetOutcomeSharesHeldAfterBuy(gross, 0.35);
		expect(net).toBeCloseTo(5.381412, 5);
	});

	it("guards: invalid avgPrice returns gross passthrough", () => {
		expect(limitlessNetOutcomeSharesHeldAfterBuy(5, 0)).toBe(5);
		expect(limitlessNetOutcomeSharesHeldAfterBuy(5, 1)).toBe(5);
	});
});

describe("sorPredictNetHeldDisplay", () => {
	const predictLeg = (shares: number, avg: number): RouteLeg =>
		({
			venue: "predictfun",
			shares,
			avgPrice: avg,
		}) as RouteLeg;

	const limitlessLeg = (shares: number, avg: number): RouteLeg =>
		({
			venue: "limitless",
			shares,
			avgPrice: avg,
		}) as RouteLeg;

	const polyLeg = (shares: number): RouteLeg =>
		({
			venue: "polymarket",
			shares,
			avgPrice: 0.5,
		}) as RouteLeg;

	it("Predict leg nets; other venues stay gross", () => {
		const legs = [predictLeg(10, 0.38), polyLeg(5)];
		const net = sorBuyNetHeldTotalSharesFromLegs(legs, 200);
		const predictNet = sorBuyPredictLegNetHeldShares(predictLeg(10, 0.38), 200);
		expect(predictNet).toBeCloseTo(9.8, 8);
		expect(net).toBeCloseTo(predictNet + 5, 8);
	});

	it("missing bps: Predict leg unchanged", () => {
		const leg = predictLeg(10, 0.38);
		expect(sorBuyPredictLegNetHeldShares(leg, undefined)).toBe(10);
		expect(sorBuyNetHeldTotalSharesFromLegs([leg], undefined)).toBe(10);
	});

	it("Limitless leg nets without predict bps; polymarket stays gross", () => {
		const lx = limitlessLeg(5.547850208044383, 0.35);
		const lxNet = sorBuyPredictLegNetHeldShares(lx, undefined);
		expect(lxNet).toBeCloseTo(5.381412, 5);
		const legs = [lx, polyLeg(2)];
		expect(sorBuyNetHeldTotalSharesFromLegs(legs, undefined)).toBeCloseTo(
			lxNet + 2,
			5,
		);
	});
});
