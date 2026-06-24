import { describe, expect, it } from "vitest";

import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";
import {
	dflowKalshiDisplayBooks,
	dflowKalshiOrderbookForPosition,
} from "@/features/trading/venues/dflow/catalog/monitorDflowBooks";

function book(bestAsk: number): OrderbookData {
	return {
		bestBid: bestAsk - 0.01,
		bestAsk,
		asks: [{ price: bestAsk, size: 50 }],
		bids: [{ price: bestAsk - 0.01, size: 100 }],
	};
}

function awayLegMonitor(): MatchedMarket {
	const realB = book(0.73);
	const ghostA = book(0.27);
	return {
		pandaMatchId: "away-brazil",
		pandaTeamA: "Opponent",
		pandaTeamB: "Brazil",
		dflow: { tickerA: "KXWC-BRA" },
		dflowPriceA: ghostA,
		dflowPriceB: realB,
	} as MatchedMarket;
}

describe("dflowKalshiDisplayBooks", () => {
	it("maps away single-ticker YES to wire B for orderbooks tab", () => {
		const { bookA, bookB } = dflowKalshiDisplayBooks(awayLegMonitor(), "away");
		expect(bookA?.bestAsk).toBe(0.73);
		expect(bookB?.bestAsk).toBe(0.27);
	});

	it("keeps raw wire columns for dual-ticker esports H2H", () => {
		const m = {
			pandaMatchId: "h2h",
			pandaTeamA: "Team A",
			pandaTeamB: "Team B",
			dflow: { tickerA: "T-A", tickerB: "T-B" },
			dflowPriceA: book(0.55),
			dflowPriceB: book(0.45),
		} as MatchedMarket;
		const { bookA, bookB } = dflowKalshiDisplayBooks(m);
		expect(bookA?.bestAsk).toBe(0.55);
		expect(bookB?.bestAsk).toBe(0.45);
	});
});

describe("dflowKalshiOrderbookForPosition", () => {
	it("trade box YES reads wire B for away leg without label fallback to A", () => {
		const m = awayLegMonitor();
		const yesBook = dflowKalshiOrderbookForPosition(m, "yes", "Unknown", "Other", "away");
		expect(yesBook?.bestAsk).toBe(0.73);
		expect(yesBook?.bestAsk).not.toBe(0.27);
	});
});
