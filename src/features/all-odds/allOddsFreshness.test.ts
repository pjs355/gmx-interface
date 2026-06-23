import { describe, expect, it } from "vitest";
import {
	ALL_ODDS_STALE_AFTER_MS,
	isActiveAllOddsMarket,
	isPastAllOddsDisplayCutoff,
} from "./allOddsFreshness";
import type { AllOddsMarket } from "./types";

function market(eventDate?: string): AllOddsMarket {
	return {
		pandaMatchId: "m1",
		displayName: "Team A vs Team B",
		eventDate,
		polyPriceA: null,
		polyPriceB: null,
		predictFunPriceA: null,
		predictFunPriceB: null,
		limitlessPriceA: null,
		limitlessPriceB: null,
		kalshiPriceA: null,
		kalshiPriceB: null,
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
}

describe("allOddsFreshness", () => {
	it("drops markets whose kickoff was more than 6 hours ago", () => {
		const kickoff = new Date("2026-06-12T18:00:00");
		const now = kickoff.getTime() + ALL_ODDS_STALE_AFTER_MS + 1;
		expect(isPastAllOddsDisplayCutoff(kickoff.toISOString(), now)).toBe(true);
		expect(isActiveAllOddsMarket(market(kickoff.toISOString()), now)).toBe(false);
	});

	it("keeps markets within 6 hours of kickoff and markets without a start time", () => {
		const kickoff = new Date("2026-06-17T12:00:00");
		const now = kickoff.getTime() + ALL_ODDS_STALE_AFTER_MS - 60_000;
		expect(isActiveAllOddsMarket(market(kickoff.toISOString()), now)).toBe(true);
		expect(isActiveAllOddsMarket(market(undefined), now)).toBe(true);
	});

	it("drops finished matches more than 6 hours after kickoff", () => {
		const kickoff = new Date("2026-06-22T20:00:00");
		const now = new Date("2026-06-23T10:30:00").getTime();
		expect(isPastAllOddsDisplayCutoff(kickoff.toISOString(), now)).toBe(true);
		expect(isActiveAllOddsMarket(market(kickoff.toISOString()), now)).toBe(false);
	});
});
