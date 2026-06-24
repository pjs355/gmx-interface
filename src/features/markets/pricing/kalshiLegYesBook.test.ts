import { describe, expect, it } from "vitest";

import { buildAllOddsGroups } from "@/features/all-odds/allOddsViewModel";
import { buildFifaThreeWayVenuePriceRows } from "@/features/markets/pricing/buildFifaThreeWayVenuePriceRows";
import { buildVenuePriceRows } from "@/features/markets/pricing/buildVenuePriceRows";
import {
	kalshiDflowWireSideForLeg,
	kalshiLegDisplayBooks,
	kalshiLegYesAskProb,
} from "@/features/markets/pricing/kalshiLegYesBook";
import { mergeKalshiBboOnlyUpdate } from "@/features/markets/pricing/kalshiSnapshotMerge";
import type { AllOddsMarket } from "@/features/all-odds/types";
import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";

function book(bestAsk: number, bids?: OrderbookData["bids"], asks?: OrderbookData["asks"]): OrderbookData {
	return {
		bestBid: bids?.[0]?.price ?? null,
		bestAsk,
		bids,
		asks,
		snapshotStatus: "live",
	};
}

function awayLegMatchedMarket(): MatchedMarket {
	const realB = book(0.08, [{ price: 0.07, size: 100 }], [{ price: 0.08, size: 50 }]);
	const ghostA = book(0.93, [{ price: 0.06, size: 100 }], [{ price: 0.93, size: 50 }]);
	return {
		pandaMatchId: "away-leg",
		polyConditionId: "c-away",
		pandaTeamA: "Colombia",
		pandaTeamB: "DR Congo",
		polyTokenIdA: "t-yes",
		polyTokenIdB: "t-no",
		sidesSwapped: false,
		moneylineLeg: "away",
		dflow: { tickerA: "KXWC-AWAY" },
		dflowPriceA: ghostA,
		dflowPriceB: realB,
	} as MatchedMarket;
}

describe("kalshiDflowWireSideForLeg", () => {
	it("mirrors backend pandaSideForDflowTickerSlot for away legs", () => {
		expect(kalshiDflowWireSideForLeg("home")).toBe("A");
		expect(kalshiDflowWireSideForLeg("draw")).toBe("A");
		expect(kalshiDflowWireSideForLeg("away")).toBe("B");
	});
});

describe("kalshiLegDisplayBooks", () => {
	it("swaps wire columns for away single-ticker per-leg rows", () => {
		const m = awayLegMatchedMarket();
		const { bookA, bookB } = kalshiLegDisplayBooks(m, "away");
		expect(bookA?.bestAsk).toBe(0.08);
		expect(bookB?.bestAsk).toBe(0.93);
	});
});

describe("kalshiLegYesAskProb", () => {
	it("reads real YES on B for away leg, not complement on A (93¢ ghost)", () => {
		const m = awayLegMatchedMarket();
		expect(kalshiLegYesAskProb(m, "away")).toBe(0.08);
		expect(kalshiLegYesAskProb(m, "away")).not.toBe(0.93);
	});
});

describe("buildVenuePriceRows dflow adapter", () => {
	it("maps away leg YES to askA via book swap", () => {
		const rows = buildVenuePriceRows(awayLegMatchedMarket());
		const kalshi = rows.find((r) => r.id === "dflow");
		expect(kalshi?.askA).toBe(0.08);
		expect(kalshi?.askA).not.toBe(0.93);
	});

	it("uses legHint when monitor row lacks moneylineLeg (stub before REST metadata)", () => {
		const stub = awayLegMatchedMarket();
		delete (stub as { moneylineLeg?: string }).moneylineLeg;
		const rows = buildVenuePriceRows(stub, { legHint: "away" });
		const kalshi = rows.find((r) => r.id === "dflow");
		expect(kalshi?.askA).toBe(0.08);
		expect(kalshi?.askA).not.toBe(0.93);
	});
});

describe("buildFifaThreeWayVenuePriceRows Kalshi", () => {
	it("shows away column from leg YES book, not complement", () => {
		const rows = buildFifaThreeWayVenuePriceRows({
			home: null,
			draw: null,
			away: awayLegMatchedMarket(),
		});
		const kalshi = rows.find((r) => r.id === "dflow");
		expect(kalshi?.askAway).toBe(0.08);
	});
});

describe("cross-surface parity", () => {
	it("All Odds Kalshi cell matches buildVenuePriceRows for away leg", () => {
		const m = awayLegMatchedMarket();
		const rows = buildVenuePriceRows(m);
		const kalshiRow = rows.find((r) => r.id === "dflow");

		const allOddsMarket: AllOddsMarket = {
			pandaMatchId: m.pandaMatchId,
			displayName: "Colombia vs DR Congo — DR Congo",
			homeTeamName: "Colombia",
			awayTeamName: "DR Congo",
			moneylineLeg: "away",
			kalshiPriceA: m.dflowPriceA as OrderbookData,
			kalshiPriceB: m.dflowPriceB as OrderbookData,
			exchangeMatching: { dflow: { tickerA: "KXWC-AWAY" } },
			polyPriceA: null,
			polyPriceB: null,
			predictFunPriceA: null,
			predictFunPriceB: null,
			limitlessPriceA: null,
			limitlessPriceB: null,
			myraidPriceA: null,
			myraidPriceB: null,
			betdexPriceA: null,
			betdexPriceB: null,
			forkastPriceA: null,
			forkastPriceB: null,
			sxbetPriceA: null,
			sxbetPriceB: null,
			hyperliquidPriceA: null,
			hyperliquidPriceB: null,
		};

		const groups = buildAllOddsGroups([allOddsMarket]);
		const awayRow = groups[0]?.primaryOutcomes.find((o) => o.label === "DR Congo");
		const kalshiCell = awayRow?.venueCells.find((c) => c.id === "kalshi");
		expect(kalshiCell?.ask).toBe(kalshiRow?.askA);
		expect(kalshiCell?.ask).toBe(0.08);
	});
});

describe("mergeKalshiBboOnlyUpdate", () => {
	it("preserves ladder when bbo-only tick updates scalars", () => {
		const prev = book(0.75, [{ price: 0.74, size: 10 }], [{ price: 0.75, size: 20 }]);
		const incoming = book(0.65);
		const merged = mergeKalshiBboOnlyUpdate(prev, incoming);
		expect(merged.asks?.[0]?.price).toBe(0.75);
		expect(merged.bestAsk).toBe(0.65);
	});
});
