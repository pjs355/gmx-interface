import { describe, expect, it } from "vitest";
import {
	bestBidAskFromConsolidatedSides,
	effectiveMinDisplayableRestingSize,
	filterRestingLevelsByMinSize,
	flattenAndConsolidateRestingLevels,
} from "./orderbookDisplayLevels";

describe("orderbookDisplayLevels", () => {
	it("effectiveMinDisplayableRestingSize uses ~1 contract for whole-book", () => {
		const m = effectiveMinDisplayableRestingSize(true, undefined);
		expect(m).toBeGreaterThanOrEqual(1 - 1e-8);
		expect(m).toBeLessThanOrEqual(1);
	});

	it("effectiveMinDisplayableRestingSize defaults fractional dust floor", () => {
		expect(effectiveMinDisplayableRestingSize(false, undefined)).toBe(1e-6);
		expect(effectiveMinDisplayableRestingSize(false, 0)).toBe(0);
	});

	it("flattenAndConsolidateRestingLevels uses direct size when orders array is empty", () => {
		const out = flattenAndConsolidateRestingLevels([
			{ price: 0.5, size: 12, orders: [] },
		]);
		expect(out).toHaveLength(1);
		expect(out[0].size).toBe(12);
	});

	it("filterRestingLevelsByMinSize drops dust", () => {
		const flat = [
			{ price: 0.21, size: 1e-12, id: "a" },
			{ price: 0.22, size: 10, id: "b" },
		];
		const f = filterRestingLevelsByMinSize(flat, 1e-6);
		expect(f).toHaveLength(1);
		expect(f[0].price).toBe(0.22);
	});

	it("bestBidAskFromConsolidatedSides matches ladder touch", () => {
		const asks = [
			{ price: 0.42, size: 1, id: "1" },
			{ price: 0.41, size: 2, id: "2" },
		];
		const bids = [{ price: 0.38, size: 5, id: "b" }];
		const { bestAsk, bestBid } = bestBidAskFromConsolidatedSides(asks, bids);
		expect(bestAsk).toBe(0.41);
		expect(bestBid).toBe(0.38);
	});
});
