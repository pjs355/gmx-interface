import { describe, expect, it } from "vitest";
import {
	effectiveBuyImpliedProb,
	HL_TIER0_SETTLEMENT_BPS,
} from "./allOddsEffectiveBuyImplied";

describe("effectiveBuyImpliedProb", () => {
	const p = 0.5;

	it("raises Polymarket implied prob with sports taker fee", () => {
		const out = effectiveBuyImpliedProb("polymarket", p);
		expect(out).not.toBeNull();
		expect(out!).toBeGreaterThan(p);
	});

	it("raises Kalshi implied prob with DFlow taker fee", () => {
		const out = effectiveBuyImpliedProb("kalshi", p);
		expect(out).not.toBeNull();
		expect(out!).toBeGreaterThan(p);
	});

	it("raises Predict.fun implied prob via token skim", () => {
		const out = effectiveBuyImpliedProb("predictfun", p);
		expect(out).not.toBeNull();
		expect(out!).toBeGreaterThan(p);
	});

	it("raises Limitless implied prob via CLOB token skim", () => {
		const out = effectiveBuyImpliedProb("limitless", p);
		expect(out).not.toBeNull();
		expect(out!).toBeGreaterThan(p);
	});

	it("raises Myriad implied prob with default peak bps", () => {
		const out = effectiveBuyImpliedProb("myraid", p);
		expect(out).not.toBeNull();
		expect(out!).toBeGreaterThan(p);
	});

	it("raises Hyperliquid implied prob with settlement fee on $1 payout", () => {
		const out = effectiveBuyImpliedProb("hyperliquid", p);
		const settlementFee = HL_TIER0_SETTLEMENT_BPS / 10_000;
		expect(out).toBeCloseTo(p / (1 - settlementFee), 8);
		expect(out!).toBeGreaterThan(p);
	});

	it("raises BetDEX implied prob with 1% settlement commission on profit", () => {
		const out = effectiveBuyImpliedProb("betdex", p);
		const feeOnPayout = (1 / p - 1) * 0.01;
		expect(out).toBeCloseTo(p / (1 - feeOnPayout), 8);
		expect(out!).toBeGreaterThan(p);
	});

	it("leaves SX and Forkast at raw ask (no entry taker)", () => {
		expect(effectiveBuyImpliedProb("sxbet", p)).toBe(p);
		expect(effectiveBuyImpliedProb("forkast", p)).toBe(p);
	});

	it("returns null for out-of-range prices", () => {
		expect(effectiveBuyImpliedProb("polymarket", null)).toBeNull();
		expect(effectiveBuyImpliedProb("polymarket", 0.001)).toBeNull();
		expect(effectiveBuyImpliedProb("polymarket", 0.999)).toBeNull();
	});
});
