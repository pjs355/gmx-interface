import { describe, expect, it } from "vitest";
import type { OrderbookData } from "@/types/odds-monitor";
import { bboFromBook, bboPolicyForTradingVenue } from "../bboFromBook";

function book(overrides: Partial<OrderbookData> = {}): OrderbookData {
	return {
		bestBid: null,
		bestAsk: null,
		...overrides,
	};
}

describe("bboFromBook", () => {
	it("standard policy prefers scalar BBO", () => {
		expect(bboFromBook("standard", book({ bestAsk: 0.42, bestBid: 0.38 }))).toEqual({
			bestAsk: 0.42,
			bestBid: 0.38,
		});
	});

	it("restingOnly ignores bare scalar BBO", () => {
		expect(
			bboFromBook(
				"restingOnly",
				book({
					bestAsk: 0.4,
					bestBid: 0.35,
					asks: [{ price: 0.52, size: 10 }],
					bids: [{ price: 0.48, size: 5 }],
				}),
			),
		).toEqual({ bestAsk: 0.52, bestBid: 0.48 });
	});

	it("ladderFirst prefers resting ladder over stale scalar", () => {
		expect(
			bboFromBook(
				"ladderFirst",
				book({
					bestAsk: 0.99,
					asks: [{ price: 0.51, size: 1 }],
				}),
			),
		).toEqual({ bestAsk: 0.51, bestBid: null });
	});

	it("returns nulls for missing book", () => {
		expect(bboFromBook("standard", null)).toEqual({
			bestAsk: null,
			bestBid: null,
		});
	});
});

describe("bboPolicyForTradingVenue", () => {
	it("maps venues to adapter policies", () => {
		expect(bboPolicyForTradingVenue("levelup")).toBe("restingOnly");
		expect(bboPolicyForTradingVenue("dflow")).toBe("ladderFirst");
		expect(bboPolicyForTradingVenue("polymarket")).toBe("standard");
		expect(bboPolicyForTradingVenue("predictfun")).toBe("standard");
	});
});
