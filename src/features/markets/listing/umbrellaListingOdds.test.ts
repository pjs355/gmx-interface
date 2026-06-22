import { describe, expect, it } from "vitest";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { MatchedMarket } from "@/types/odds-monitor";
import {
	isDeemphasizedSettledLeanOdds,
	umbrellaHasListableCrossVenueOdds,
} from "./umbrellaListingOdds";

function baseUmbrella(overrides: Partial<Umbrella> = {}): Umbrella {
	return {
		_id: "umb-1",
		displayName: "Team A vs Team B",
		pandascore_matchId: "panda-123",
		active: true,
		children: [{ _id: "q1" } as Umbrella["children"][0]],
		...overrides,
	} as Umbrella;
}

function baseMatched(overrides: Partial<MatchedMarket> = {}): MatchedMarket {
	return {
		pandaMatchId: "panda-123",
		umbrellaId: "umb-1",
		polyConditionId: "0xcond",
		pandaTeamA: "Team A",
		pandaTeamB: "Team B",
		polyTokenIdA: "tok-a",
		polyTokenIdB: "tok-b",
		sidesSwapped: false,
		polyPriceA: null,
		polyPriceB: null,
		dflowPriceA: null,
		dflowPriceB: null,
		predictFunPriceA: null,
		predictFunPriceB: null,
		limitlessPriceA: null,
		limitlessPriceB: null,
		levelUpPriceA: null,
		levelUpPriceB: null,
		...overrides,
	};
}

describe("umbrellaHasListableCrossVenueOdds", () => {
	it("shows while matchedMarkets catalog is still loading", () => {
		expect(umbrellaHasListableCrossVenueOdds(baseUmbrella(), null)).toBe(true);
	});

	it("shows when no monitor row exists yet for this fixture", () => {
		expect(umbrellaHasListableCrossVenueOdds(baseUmbrella(), [])).toBe(true);
	});

	it("shows when row exists but venue links have no price ticks yet", () => {
		const markets = [baseMatched()];
		expect(umbrellaHasListableCrossVenueOdds(baseUmbrella(), markets)).toBe(true);
	});

	it("hides one-sided books with bids but no valid asks", () => {
		const markets = [
			baseMatched({
				polyPriceA: { bestAsk: null, bestBid: 0.5, asks: [], bids: [] },
				polyPriceB: { bestAsk: null, bestBid: 0.5, asks: [], bids: [] },
			}),
		];
		expect(umbrellaHasListableCrossVenueOdds(baseUmbrella(), markets)).toBe(false);
	});

	it("shows fixtures with valid cross-venue quotes", () => {
		const markets = [
			baseMatched({
				polyPriceA: { bestAsk: 0.45, bestBid: 0.44, asks: [], bids: [] },
				polyPriceB: { bestAsk: 0.56, bestBid: 0.55, asks: [], bids: [] },
			}),
		];
		expect(umbrellaHasListableCrossVenueOdds(baseUmbrella(), markets)).toBe(true);
	});

	it("hides settled-lean fixtures", () => {
		const markets = [
			baseMatched({
				polyPriceA: { bestAsk: 0.99, bestBid: 0.98, asks: [], bids: [] },
				polyPriceB: { bestAsk: 0.01, bestBid: null, asks: [], bids: [] },
			}),
		];
		expect(umbrellaHasListableCrossVenueOdds(baseUmbrella(), markets)).toBe(false);
	});

	it("passes through non-panda umbrellas", () => {
		expect(
			umbrellaHasListableCrossVenueOdds(
				baseUmbrella({ pandascore_matchId: undefined as unknown as string }),
				[],
			),
		).toBe(true);
	});
});

describe("isDeemphasizedSettledLeanOdds", () => {
	it("demotes missing sides", () => {
		expect(isDeemphasizedSettledLeanOdds(0.5, null)).toBe(true);
	});
});
