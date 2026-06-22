import { describe, expect, it } from "vitest";
import {
	impliedProbToChartDisplayPct,
	isValidChartDisplayPct,
	sanitizeChartDisplayPct,
} from "./chartDisplayPrice";

describe("chartDisplayPrice", () => {
	it("rejects 0% and 100% display ticks", () => {
		expect(isValidChartDisplayPct(0)).toBe(false);
		expect(isValidChartDisplayPct(100)).toBe(false);
		expect(sanitizeChartDisplayPct(0)).toBeNull();
		expect(sanitizeChartDisplayPct(100)).toBeNull();
	});

	it("accepts in-range percentages", () => {
		expect(isValidChartDisplayPct(0.5)).toBe(true);
		expect(isValidChartDisplayPct(50)).toBe(true);
		expect(isValidChartDisplayPct(99.5)).toBe(true);
	});

	it("maps implied probability to display percent", () => {
		expect(impliedProbToChartDisplayPct(0)).toBeNull();
		expect(impliedProbToChartDisplayPct(0.004)).toBeNull();
		expect(impliedProbToChartDisplayPct(0.42)).toBe(42);
	});
});
