import { describe, expect, it } from "vitest";

import { buildFifaThreeWayVenuePriceRows } from "../buildFifaThreeWayVenuePriceRows";
import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";

function book(bestAsk: number): OrderbookData {
	return { bestBid: null, bestAsk, asks: [{ price: bestAsk, size: 10 }] };
}

function legMatch(id: string, ask: number): MatchedMarket {
	return {
		pandaMatchId: id,
		polyConditionId: `c-${id}`,
		pandaTeamA: "Mexico",
		pandaTeamB: "South Africa",
		polyTokenIdA: `t-${id}-yes`,
		polyTokenIdB: `t-${id}-no`,
		sidesSwapped: false,
		polyPriceA: book(ask),
		polyPriceB: book(1 - ask),
	} as MatchedMarket;
}

describe("buildFifaThreeWayVenuePriceRows", () => {
	it("maps each leg YES ask into home / draw / away columns for Polymarket", () => {
		const rows = buildFifaThreeWayVenuePriceRows({
			home: legMatch("home", 0.67),
			draw: legMatch("draw", 0.22),
			away: legMatch("away", 0.13),
		});
		const poly = rows.find((r) => r.id === "poly");
		expect(poly).toBeDefined();
		expect(poly?.askHome).toBe(0.67);
		expect(poly?.askDraw).toBe(0.22);
		expect(poly?.askAway).toBe(0.13);
	});

	it("routes away Kalshi YES through wire B even when stub lacks moneylineLeg", () => {
		const realB = { bestBid: 0.07, bestAsk: 0.08, asks: [{ price: 0.08, size: 50 }] };
		const ghostA = { bestBid: 0.06, bestAsk: 0.93, asks: [{ price: 0.93, size: 50 }] };
		const awayStub = {
			...legMatch("away", 0.13),
			dflow: { tickerA: "KXWC-AWAY" },
			dflowPriceA: ghostA,
			dflowPriceB: realB,
		} as MatchedMarket;
		const rows = buildFifaThreeWayVenuePriceRows({
			home: null,
			draw: null,
			away: awayStub,
		});
		const kalshi = rows.find((r) => r.id === "dflow");
		expect(kalshi?.askAway).toBe(0.08);
		expect(kalshi?.askAway).not.toBe(0.93);
	});
});
