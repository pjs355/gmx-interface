import { describe, expect, it } from "vitest";
import {
	complementPredictOrderbook,
	predictBookNeedsComplementForPosition,
	predictBookNeedsComplementForSorOutcome,
	predictSingleMarketNativeOutcomeSide,
} from "./predictSingleMarketBook";
import type { MatchedMarket } from "@/types/odds-monitor";

function matchedSingleMarket(overrides?: Partial<MatchedMarket["predictFun"]>): MatchedMarket {
	return {
		pandaTeamA: "team a",
		pandaTeamB: "team b",
		predictFun: {
			singleMarket: true,
			marketIdA: "368313",
			marketIdB: "",
			...overrides,
		},
	} as MatchedMarket;
}

describe("predictSingleMarketNativeOutcomeSide", () => {
	it("returns A when only marketIdA is set", () => {
		expect(
			predictSingleMarketNativeOutcomeSide({ marketIdA: "1", marketIdB: "" }),
		).toBe("A");
	});
	it("returns B when only marketIdB is set", () => {
		expect(
			predictSingleMarketNativeOutcomeSide({ marketIdA: "", marketIdB: "2" }),
		).toBe("B");
	});
});

describe("predictBookNeedsComplementForSorOutcome", () => {
	it("complements non-native outcome on single market", () => {
		const m = matchedSingleMarket();
		expect(predictBookNeedsComplementForSorOutcome(m, "A")).toBe(false);
		expect(predictBookNeedsComplementForSorOutcome(m, "B")).toBe(true);
	});
	it("never complements when not single market", () => {
		const m = matchedSingleMarket({ singleMarket: false });
		expect(predictBookNeedsComplementForSorOutcome(m, "B")).toBe(false);
	});
});

describe("complementPredictOrderbook", () => {
	it("swaps bids and asks at 1 - price", () => {
		const book = complementPredictOrderbook({
			marketId: 1,
			updateTimestampMs: 0,
			bids: [[0.66, 100]],
			asks: [[0.67, 50]],
		});
		expect(book.asks[0]?.[0]).toBeCloseTo(0.34, 6);
		expect(book.asks[0]?.[1]).toBe(100);
		expect(book.bids[0]?.[0]).toBeCloseTo(0.33, 6);
		expect(book.bids[0]?.[1]).toBe(50);
	});
});

describe("predictBookNeedsComplementForPosition", () => {
	it("needs complement for NO when native is A", () => {
		const m = matchedSingleMarket();
		expect(
			predictBookNeedsComplementForPosition(m, "yes", "Team A", "Team B"),
		).toBe(false);
		expect(
			predictBookNeedsComplementForPosition(m, "no", "Team A", "Team B"),
		).toBe(true);
	});
});
