import { describe, expect, it } from "vitest";
import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";
import { buildVenuePriceRows } from "../buildVenuePriceRows";

function book(bestAsk: number, asks?: OrderbookData["asks"]): OrderbookData {
	return {
		bestBid: null,
		bestAsk,
		asks,
	};
}

function baseMatch(overrides: Partial<MatchedMarket> = {}): MatchedMarket {
	return {
		pandaMatchId: "p1",
		polyConditionId: "",
		pandaTeamA: "A",
		pandaTeamB: "B",
		polyTokenIdA: "",
		polyTokenIdB: "",
		sidesSwapped: false,
		...overrides,
	} as MatchedMarket;
}

describe("buildVenuePriceRows", () => {
	it("orders LevelUp first when it has resting quotes", () => {
		const rows = buildVenuePriceRows(
			baseMatch({
				polyConditionId: "c1",
				polyTokenIdA: "t1",
				polyPriceA: book(0.6),
				polyPriceB: book(0.4),
				levelUpPriceA: book(0.99, [{ price: 0.55, size: 10 }]),
			}),
		);
		expect(rows.map((r) => r.id)).toEqual(["levelup", "poly"]);
		expect(rows[0].askA).toBe(0.55);
	});

	it("omits LevelUp when only scalar BBO and no resting levels", () => {
		const rows = buildVenuePriceRows(
			baseMatch({
				polyConditionId: "c1",
				polyTokenIdA: "t1",
				polyPriceA: book(0.6),
				levelUpPriceA: book(0.55, []),
			}),
		);
		expect(rows.map((r) => r.id)).toEqual(["poly"]);
	});

	it("uses ladder-first for dflow and hides uninitialized empty row", () => {
		const rows = buildVenuePriceRows(
			baseMatch({
				dflow: {
					tickerA: "T-A",
					eventTicker: "E1",
					accountsInitializedA: false,
					accountsInitializedB: false,
				},
				dflowPriceA: book(0.99, [{ price: 0.52, size: 1 }]),
			}),
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe("dflow");
		expect(rows[0].askA).toBe(0.52);
	});

	it("hides dflow row when uninitialized and no quotes", () => {
		const rows = buildVenuePriceRows(
			baseMatch({
				dflow: {
					tickerA: "T-A",
					eventTicker: "E1",
					accountsInitializedA: false,
					accountsInitializedB: false,
				},
				dflowPriceA: { bestBid: null, bestAsk: null, asks: [] },
			}),
		);
		expect(rows).toHaveLength(0);
	});
});
