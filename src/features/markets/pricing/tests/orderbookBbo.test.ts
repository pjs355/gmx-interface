import { describe, expect, it } from "vitest";
import type { OrderbookData } from "@/types/odds-monitor";
import {
	bestAskProbFromBook,
	bestAskProbLadderFirst,
	bestAskProbRestingLevelsOnly,
} from "../orderbookBbo";

function book(overrides: Partial<OrderbookData> = {}): OrderbookData {
	return {
		bestBid: null,
		bestAsk: null,
		...overrides,
	};
}

describe("bestAskProbFromBook", () => {
	it("prefers scalar bestAsk when valid", () => {
		expect(bestAskProbFromBook(book({ bestAsk: 0.42 }))).toBe(0.42);
	});

	it("falls back to lowest resting ask", () => {
		expect(
			bestAskProbFromBook(
				book({
					bestAsk: null,
					asks: [
						{ price: 0.55, size: 10 },
						{ price: 0.51, size: 5 },
					],
				}),
			),
		).toBe(0.51);
	});

	it("ignores out-of-range prices", () => {
		expect(bestAskProbFromBook(book({ bestAsk: 0.001 }))).toBeNull();
	});
});

describe("bestAskProbRestingLevelsOnly", () => {
	it("ignores bare scalar BBO", () => {
		expect(bestAskProbRestingLevelsOnly(book({ bestAsk: 0.4, asks: [] }))).toBeNull();
	});
});

describe("bestAskProbLadderFirst", () => {
	it("uses ladder before scalar", () => {
		expect(
			bestAskProbLadderFirst(
				book({
					bestAsk: 0.99,
					asks: [{ price: 0.52, size: 1 }],
				}),
			),
		).toBe(0.52);
	});

	it("falls back to scalar when ladder empty", () => {
		expect(bestAskProbLadderFirst(book({ bestAsk: 0.48, asks: [] }))).toBe(0.48);
	});
});
