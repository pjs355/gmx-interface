import { describe, expect, it } from "vitest";
import {
	formatOddsPrice,
	formatAvgOddsValue,
	formatOrderbookLevelShares,
	impliedProbToAmericanOdds,
	parseOddsDisplayStyle,
	parseProbForOdds,
	ratioOddsInputs,
} from "../oddsDisplayFormat";

describe("parseOddsDisplayStyle", () => {
	it("maps snake_case storage values", () => {
		expect(parseOddsDisplayStyle("hong_kong")).toBe("hong_kong");
		expect(parseOddsDisplayStyle("decimal")).toBe("decimal");
	});

	it("falls back for unknown keys", () => {
		expect(parseOddsDisplayStyle("fancy")).toBe("default");
		expect(parseOddsDisplayStyle(null)).toBe("default");
	});
});

describe("parseProbForOdds / ratioOddsInputs", () => {
	it("rejects boundaries and non-finite", () => {
		expect(parseProbForOdds(0)).toBeNull();
		expect(parseProbForOdds(1)).toBeNull();
		expect(parseProbForOdds(NaN)).toBeNull();
		expect(parseProbForOdds(undefined)).toBeNull();
		expect(ratioOddsInputs(1)).toBeNull();
	});

	it("accepts interior probabilities", () => {
		expect(parseProbForOdds(0.5)).toBeCloseTo(0.5, 10);
		expect(ratioOddsInputs(0.75)?.hk).toBeCloseTo(1 / 3, 10);
		expect(ratioOddsInputs(0.75)?.d).toBeCloseTo(4 / 3, 10);
	});
});

describe("impliedProbToAmericanOdds", () => {
	it("matches spot-check p=0.09 → +1011", () => {
		expect(impliedProbToAmericanOdds(0.09)).toBe(1011);
	});

	it("handles even money", () => {
		expect(impliedProbToAmericanOdds(0.5)).toBe(100);
	});
});

describe("formatOddsPrice grid", () => {
	const cell = "cell" as const;

	it("decimal / multiplier / HK / Indo / Malay for plan sample p values", () => {
		expect(formatOddsPrice(0.09, "decimal", cell)).toMatch(/^11\.11/);
		expect(formatOddsPrice(0.09, "multiplier", cell)).toBe("×11.11");
		expect(formatOddsPrice(0.09, "hong_kong", cell)).toMatch(/^\+?10\.11/);
		expect(formatOddsPrice(0.09, "indonesian", cell)).toMatch(/^\+10\.11/);
		expect(formatOddsPrice(0.09, "malaysian", cell)).toMatch(/^\+10\.11/);

		expect(formatOddsPrice(0.25, "decimal", cell)).toBe("4");
		expect(formatOddsPrice(0.25, "indonesian", cell)).toBe("+3");

		expect(formatOddsPrice(0.5, "decimal", cell)).toBe("2");
		expect(formatOddsPrice(0.5, "indonesian", cell)).toBe("+1");
		expect(formatOddsPrice(0.5, "malaysian", cell)).toBe("+1");

		expect(formatOddsPrice(0.75, "indonesian", cell)).toBe("-3");
		expect(formatOddsPrice(0.75, "malaysian", cell)).toMatch(/^-0\.3333/);

		expect(formatOddsPrice(0.88, "indonesian", cell)).toMatch(/^-7\.3333/);
	});

	it("fractional approximates HK", () => {
		expect(formatOddsPrice(0.75, "fractional", cell)).toBe("1/3");
		expect(formatOddsPrice(0.5, "fractional", cell)).toBe("1/1");
	});

	it("percentage uses implied prob", () => {
		expect(formatOddsPrice(0.88, "percentage", cell)).toBe("88%");
		expect(formatOddsPrice(0.006, "percentage", cell)).toBe("0.6%");
	});

	it("invalid p yields dash for ratio styles", () => {
		expect(formatOddsPrice(0, "decimal", cell)).toBe("--");
		expect(formatOddsPrice(1, "decimal", cell)).toBe("--");
		expect(formatOddsPrice(NaN, "hong_kong", cell)).toBe("--");
	});

	it("default cents preserves sub-cent implied quotes", () => {
		expect(formatOddsPrice(0.00004, "default", cell)).toBe("0.004¢");
		expect(formatOddsPrice(0.003, "default", cell)).toBe("0.3¢");
	});

	it("default cents uses two decimals from 0.01¢ up to kill float noise", () => {
		expect(formatOddsPrice(0.00990331205, "default", cell)).toBe("0.99¢");
	});

	it("dualWithCents skips parens when primary is dash", () => {
		expect(formatOddsPrice(0, "decimal", "dualWithCents")).toBe("--");
		expect(formatOddsPrice(0.75, "decimal", "dualWithCents")).toMatch(/^1\.3333 \(75¢\)$/);
	});

	it("multiplier rounds decimal odds to two fractional digits", () => {
		expect(formatOddsPrice(0.5, "multiplier", cell)).toBe("×2.00");
		expect(formatOddsPrice(0.7, "multiplier", cell)).toBe("×1.43");
	});

	it("american dual unchanged shape", () => {
		expect(formatOddsPrice(0.75, "american", "dualWithCents")).toBe("-300 (75¢)");
	});
});

describe("formatAvgOddsValue", () => {
	it("follows style without dual cents", () => {
		expect(formatAvgOddsValue(0.25, "decimal")).toBe("4");
		expect(formatAvgOddsValue(0.88, "percentage")).toBe("88%");
		expect(formatAvgOddsValue(0.6, "default")).toBe("60%");
		expect(formatAvgOddsValue(0.00005, "default")).toBe("<0.01%");
		expect(formatAvgOddsValue(0.006, "default")).toBe("0.6%");
	});
});

describe("formatOrderbookLevelShares", () => {
	it("keeps fractional Polymarket sizes readable", () => {
		expect(formatOrderbookLevelShares(0)).toBe("0");
		expect(formatOrderbookLevelShares(12)).toBe("12");
		expect(formatOrderbookLevelShares(0.0047)).toBe("0.0047");
		expect(formatOrderbookLevelShares(123.456789)).toBe("123.456789");
	});
});
