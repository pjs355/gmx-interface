import { describe, expect, it } from "vitest";
import { ALL_ODDS_STALE_AFTER_MS } from "./allOddsFreshness";
import { buildAllOddsGroups, countLinkedVenuesForGroup } from "./allOddsViewModel";
import type { AllOddsMarket } from "./types";

function ask(price: number): AllOddsMarket["polyPriceA"] {
	return {
		bestAsk: price,
		bestBid: null,
		snapshotStatus: "live",
	};
}

function baseMarket(overrides: Partial<AllOddsMarket> & Pick<AllOddsMarket, "pandaMatchId" | "displayName">): AllOddsMarket {
	return {
		umbrellaId: "umb-1",
		game: "soccer",
		homeTeamName: "Algeria",
		awayTeamName: "Argentina",
		pandaTeamA: "Algeria",
		pandaTeamB: "Argentina",
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
		...overrides,
	};
}

describe("buildAllOddsGroups", () => {
	it("shows only moneyline legs in primary for 3-way soccer fixtures", () => {
		const markets: AllOddsMarket[] = [
			baseMarket({
				pandaMatchId: "1234567",
				displayName: "Algeria vs Argentina",
				polyPriceA: ask(0.01),
				polyPriceB: ask(0.99),
			}),
			baseMarket({
				pandaMatchId: "900001",
				displayName: "Algeria",
				moneylineLeg: "home",
				polyPriceA: ask(0.02),
			}),
			baseMarket({
				pandaMatchId: "900002",
				displayName: "Draw",
				moneylineLeg: "draw",
				polyPriceA: ask(0.15),
			}),
			baseMarket({
				pandaMatchId: "900003",
				displayName: "Argentina",
				moneylineLeg: "away",
				polyPriceA: ask(0.83),
			}),
			baseMarket({
				pandaMatchId: "900010",
				displayName: "Algeria",
				polyPriceA: ask(0.06),
			}),
			baseMarket({
				pandaMatchId: "900011",
				displayName: "Argentina",
				polyPriceA: ask(0.95),
			}),
		];

		const groups = buildAllOddsGroups(markets);
		expect(groups).toHaveLength(1);
		const primaryLabels = groups[0]!.primaryOutcomes.map((o) => o.label);
		expect(primaryLabels).toEqual(["Algeria", "Argentina", "Draw"]);
		expect(groups[0]!.primaryOutcomes).toHaveLength(3);
	});

	it("does not treat numeric polymarket ids as match-winner two-way rows", () => {
		const markets: AllOddsMarket[] = [
			baseMarket({
				pandaMatchId: "1234567",
				displayName: "Algeria vs Argentina",
				polyPriceA: ask(0.4),
				polyPriceB: ask(0.6),
			}),
			baseMarket({
				pandaMatchId: "555001",
				displayName: "Algeria",
				polyPriceA: ask(0.02),
			}),
			baseMarket({
				pandaMatchId: "555002",
				displayName: "Argentina",
				polyPriceA: ask(0.98),
			}),
		];

		const groups = buildAllOddsGroups(markets);
		expect(groups).toHaveLength(1);
		expect(groups[0]!.primaryOutcomes.map((o) => o.label)).toEqual(["Algeria", "Argentina"]);
		expect(groups[0]!.primaryOutcomes).toHaveLength(2);
	});

	it("groups FIFA futures by market title with top-two primary rows", () => {
		const markets: AllOddsMarket[] = [
			baseMarket({
				pandaMatchId: "semi-alg",
				umbrellaId: "umb-semifinals",
				displayName: "Reach Semifinals — FIFA World Cup — Algeria",
				marketType: "winner",
				segment: "future_reach_semifinals",
				polyPriceA: ask(0.05),
			}),
			baseMarket({
				pandaMatchId: "semi-arg",
				umbrellaId: "umb-semifinals",
				displayName: "Reach Semifinals — FIFA World Cup — Argentina",
				marketType: "winner",
				segment: "future_reach_semifinals",
				polyPriceA: ask(0.38),
			}),
			baseMarket({
				pandaMatchId: "semi-bra",
				umbrellaId: "umb-semifinals",
				displayName: "Reach Semifinals — FIFA World Cup — Brazil",
				marketType: "winner",
				segment: "future_reach_semifinals",
				polyPriceA: ask(0.26),
			}),
		];

		const groups = buildAllOddsGroups(markets);
		expect(groups).toHaveLength(1);
		expect(groups[0]!.kind).toBe("multileg");
		expect(groups[0]!.title).toBe("Reach Semifinals — FIFA World Cup");
		expect(groups[0]!.primaryOutcomes.map((o) => o.label)).toEqual(["Argentina", "Brazil"]);
		expect(groups[0]!.moreSections).toHaveLength(1);
		expect(groups[0]!.moreSections[0]!.outcomes.map((o) => o.label)).toEqual(["Algeria"]);
	});

	it("does not mix futures legs into a head-to-head fixture group", () => {
		const markets: AllOddsMarket[] = [
			baseMarket({
				pandaMatchId: "1234567",
				displayName: "Algeria vs Argentina",
				polyPriceA: ask(0.4),
				polyPriceB: ask(0.6),
			}),
			baseMarket({
				pandaMatchId: "final-alg",
				umbrellaId: "umb-final",
				displayName: "Reach Final — FIFA World Cup — Algeria",
				marketType: "winner",
				segment: "future_reach_final",
				polyPriceA: ask(0.02),
			}),
			baseMarket({
				pandaMatchId: "final-arg",
				umbrellaId: "umb-final",
				displayName: "Reach Final — FIFA World Cup — Argentina",
				marketType: "winner",
				segment: "future_reach_final",
				polyPriceA: ask(0.2),
			}),
		];

		const groups = buildAllOddsGroups(markets);
		expect(groups).toHaveLength(2);
		const matchGroup = groups.find((g) => g.kind === "fixture");
		const futuresGroup = groups.find((g) => g.kind === "multileg");
		expect(matchGroup?.title).toBe("Algeria vs Argentina");
		expect(futuresGroup?.title).toBe("Reach Final — FIFA World Cup");
		expect(futuresGroup?.moreSections.flatMap((s) => s.outcomes)).toHaveLength(0);
		expect(futuresGroup?.primaryOutcomes.map((o) => o.label)).toEqual(["Argentina", "Algeria"]);
	});

	it("excludes fixture groups when kickoff was more than 24 hours ago", () => {
		const kickoff = new Date("2026-06-12T18:00:00");
		const now = kickoff.getTime() + ALL_ODDS_STALE_AFTER_MS + 1;
		const markets: AllOddsMarket[] = [
			baseMarket({
				pandaMatchId: "1234567",
				displayName: "Algeria vs Argentina",
				eventDate: kickoff.toISOString(),
				polyPriceA: ask(0.4),
				polyPriceB: ask(0.6),
			}),
		];

		expect(buildAllOddsGroups(markets, now)).toHaveLength(0);
	});

	it("reads Kalshi YES ask from column B for away moneyline legs", () => {
		const em = { dflow: { tickerA: "KXWCGAME-MEX-RSA" } };
		const markets: AllOddsMarket[] = [
			baseMarket({
				pandaMatchId: "wc-home",
				displayName: "Mexico vs South Africa — Mexico",
				homeTeamName: "Mexico",
				awayTeamName: "South Africa",
				moneylineLeg: "home",
				kalshiPriceA: ask(0.68),
				exchangeMatching: em,
			}),
			baseMarket({
				pandaMatchId: "wc-away",
				displayName: "Mexico vs South Africa — South Africa",
				homeTeamName: "Mexico",
				awayTeamName: "South Africa",
				moneylineLeg: "away",
				kalshiPriceA: ask(0.89),
				kalshiPriceB: ask(0.12),
				exchangeMatching: em,
			}),
			baseMarket({
				pandaMatchId: "wc-draw",
				displayName: "Mexico vs South Africa — Draw",
				homeTeamName: "Mexico",
				awayTeamName: "South Africa",
				moneylineLeg: "draw",
				kalshiPriceA: ask(0.22),
				exchangeMatching: em,
			}),
		];

		const groups = buildAllOddsGroups(markets);
		expect(groups).toHaveLength(1);
		const awayRow = groups[0]!.primaryOutcomes.find((o) => o.label === "South Africa");
		expect(awayRow).toBeDefined();
		const kalshi = awayRow!.venueCells.find((c) => c.id === "kalshi");
		expect(kalshi?.ask).toBe(0.12);
	});

	it("sorts groups by linked venue count descending", () => {
		const markets: AllOddsMarket[] = [
			baseMarket({
				pandaMatchId: "thin",
				displayName: "Alpha vs Beta",
				homeTeamName: "Alpha",
				awayTeamName: "Beta",
				pandaTeamA: "Alpha",
				pandaTeamB: "Beta",
				polyPriceA: ask(0.5),
				polyPriceB: ask(0.5),
				exchangeMatching: {
					polymarket: { conditionId: "0x1", tokenIdA: "1", tokenIdB: "2" },
				},
			}),
			baseMarket({
				pandaMatchId: "wide",
				displayName: "Charlie vs Delta",
				homeTeamName: "Charlie",
				awayTeamName: "Delta",
				pandaTeamA: "Charlie",
				pandaTeamB: "Delta",
				polyPriceA: ask(0.5),
				polyPriceB: ask(0.5),
				predictFunPriceA: ask(0.48),
				limitlessPriceA: ask(0.52),
				kalshiPriceA: ask(0.49),
				exchangeMatching: {
					polymarket: { conditionId: "0x2", tokenIdA: "3", tokenIdB: "4" },
					predictFun: { marketIdA: "pf-1" },
					limitless: { slug: "lim-1" },
					dflow: { tickerA: "KX-1" },
				},
			}),
		];

		const groups = buildAllOddsGroups(markets);
		expect(groups).toHaveLength(2);
		expect(groups[0]!.title).toBe("Charlie vs Delta");
		expect(countLinkedVenuesForGroup(groups[0]!)).toBeGreaterThan(
			countLinkedVenuesForGroup(groups[1]!),
		);
	});

	it("splits total markets into separate Over and Under outcome rows", () => {
		const markets: AllOddsMarket[] = [
			baseMarket({
				pandaMatchId: "ml-1",
				displayName: "Algeria vs Argentina",
				homeTeamName: "Algeria",
				awayTeamName: "Argentina",
				moneylineLeg: "home",
				polyPriceA: ask(0.4),
			}),
			baseMarket({
				pandaMatchId: "ml-2",
				displayName: "Algeria vs Argentina",
				homeTeamName: "Algeria",
				awayTeamName: "Argentina",
				moneylineLeg: "away",
				polyPriceA: ask(0.35),
			}),
			baseMarket({
				pandaMatchId: "total-25",
				displayName: "Algeria vs Argentina — Over/Under 2.5",
				homeTeamName: "Algeria",
				awayTeamName: "Argentina",
				marketType: "total",
				polyPriceA: ask(0.52),
				polyPriceB: ask(0.51),
				predictFunPriceA: ask(0.53),
				predictFunPriceB: ask(0.49),
			}),
		];

		const groups = buildAllOddsGroups(markets);
		expect(groups).toHaveLength(1);
		const totals = groups[0]!.moreSections.find((s) => s.sectionKey === "totals");
		expect(totals).toBeDefined();
		expect(totals!.outcomes.map((o) => o.label)).toEqual(["Over 2.5 goals", "Under 2.5 goals"]);
		expect(totals!.outcomes.map((o) => o.yesSide)).toEqual(["A", "B"]);
		const over = totals!.outcomes.find((o) => o.label === "Over 2.5 goals");
		const under = totals!.outcomes.find((o) => o.label === "Under 2.5 goals");
		expect(over?.venueCells.find((c) => c.id === "polymarket")?.ask).toBe(0.52);
		expect(under?.venueCells.find((c) => c.id === "polymarket")?.ask).toBe(0.51);
	});

	it("groups spreads together then totals in the More section", () => {
		const markets: AllOddsMarket[] = [
			baseMarket({
				pandaMatchId: "ml-home",
				displayName: "Mexico vs South Africa",
				homeTeamName: "Mexico",
				awayTeamName: "South Africa",
				moneylineLeg: "home",
				polyPriceA: ask(0.55),
			}),
			baseMarket({
				pandaMatchId: "spread-home",
				displayName: "Mexico vs South Africa — Mexico -1.5",
				homeTeamName: "Mexico",
				awayTeamName: "South Africa",
				marketType: "spread",
				spreadSide: "home",
				line: -1.5,
				polyPriceA: ask(0.42),
			}),
			baseMarket({
				pandaMatchId: "total-05",
				displayName: "Mexico vs South Africa — Over/Under 0.5",
				homeTeamName: "Mexico",
				awayTeamName: "South Africa",
				marketType: "total",
				line: 0.5,
				polyPriceA: ask(0.6),
				polyPriceB: ask(0.41),
			}),
			baseMarket({
				pandaMatchId: "spread-away",
				displayName: "Mexico vs South Africa — South Africa -1.5",
				homeTeamName: "Mexico",
				awayTeamName: "South Africa",
				marketType: "spread",
				spreadSide: "away",
				line: -1.5,
				polyPriceA: ask(0.38),
			}),
		];

		const groups = buildAllOddsGroups(markets);
		expect(groups).toHaveLength(1);
		const more = groups[0]!.moreSections.flatMap((s) => s.outcomes);
		expect(more.map((o) => o.label)).toEqual([
			"Mexico -1.5",
			"South Africa -1.5",
			"Over 0.5 goals",
			"Under 0.5 goals",
		]);
		expect(groups[0]!.moreSections.map((s) => s.sectionKey)).toEqual(["spreads", "totals"]);
	});

	it("uses kickoff time as tiebreaker when venue counts match", () => {
		const em = {
			polymarket: { conditionId: "0x1", tokenIdA: "1", tokenIdB: "2" },
		};
		const markets: AllOddsMarket[] = [
			baseMarket({
				pandaMatchId: "later",
				displayName: "Later vs Match",
				homeTeamName: "Later",
				awayTeamName: "Match",
				pandaTeamA: "Later",
				pandaTeamB: "Match",
				eventDate: "2026-06-20T20:00:00.000Z",
				polyPriceA: ask(0.5),
				polyPriceB: ask(0.5),
				exchangeMatching: em,
			}),
			baseMarket({
				pandaMatchId: "sooner",
				displayName: "Sooner vs Match",
				homeTeamName: "Sooner",
				awayTeamName: "Match",
				pandaTeamA: "Sooner",
				pandaTeamB: "Match",
				eventDate: "2026-06-18T15:00:00.000Z",
				polyPriceA: ask(0.5),
				polyPriceB: ask(0.5),
				exchangeMatching: em,
			}),
			baseMarket({
				pandaMatchId: "notime",
				displayName: "No Time vs Match",
				homeTeamName: "No Time",
				awayTeamName: "Match",
				pandaTeamA: "No Time",
				pandaTeamB: "Match",
				polyPriceA: ask(0.5),
				polyPriceB: ask(0.5),
				exchangeMatching: em,
			}),
		];

		const groups = buildAllOddsGroups(markets);
		expect(groups.map((g) => g.title)).toEqual([
			"Sooner vs Match",
			"Later vs Match",
			"No Time vs Match",
		]);
	});

	it("shows team winner rows for esports long Panda titles when team names match exactly", () => {
		const markets: AllOddsMarket[] = [
			baseMarket({
				pandaMatchId: "1540333",
				displayName:
					"OG vs InterActive Philippines - The International - Southeast Asia Closed Qualifier 2026",
				game: "DotA 2",
				homeTeamName: "OG",
				awayTeamName: "InterActive Philippines",
				pandaTeamA: "OG",
				pandaTeamB: "InterActive Philippines",
				polyPriceA: ask(0.93),
				polyPriceB: ask(0.07),
			}),
		];

		const groups = buildAllOddsGroups(markets);
		expect(groups).toHaveLength(1);
		expect(groups[0]!.title).toBe("OG vs InterActive Philippines");
		expect(groups[0]!.primaryOutcomes.map((o) => o.label).sort()).toEqual([
			"InterActive Philippines",
			"OG",
		]);
		expect(groups[0]!.moreSections).toHaveLength(0);
	});

	it("shows team winner rows for esports long Panda titles when display uses shorter team names", () => {
		const markets: AllOddsMarket[] = [
			baseMarket({
				pandaMatchId: "1510146",
				displayName: "Team Vitality vs Leviatán - VCT - Masters London 2026",
				game: "Valorant",
				homeTeamName: "Team Vitality",
				awayTeamName: "Leviatán Esports",
				pandaTeamA: "Team Vitality",
				pandaTeamB: "Leviatán Esports",
				polyPriceA: ask(0.07),
				polyPriceB: ask(0.95),
			}),
		];

		const groups = buildAllOddsGroups(markets);
		expect(groups).toHaveLength(1);
		expect(groups[0]!.title).toBe("Team Vitality vs Leviatán Esports");
		expect(groups[0]!.primaryOutcomes.map((o) => o.label).sort()).toEqual([
			"Leviatán Esports",
			"Team Vitality",
		]);
		expect(groups[0]!.moreSections).toHaveLength(0);
	});

	it("hides groups with only display-only venue quotes and no tradable market prices", () => {
		const markets: AllOddsMarket[] = [
			baseMarket({
				pandaMatchId: "thin-arb",
				displayName: "Alpha vs Beta",
				homeTeamName: "Alpha",
				awayTeamName: "Beta",
				pandaTeamA: "Alpha",
				pandaTeamB: "Beta",
				myraidPriceA: ask(0.55),
				myraidPriceB: ask(0.48),
				exchangeMatching: {
					myraid: { marketIdA: "m-1" },
				},
			}),
		];

		expect(buildAllOddsGroups(markets)).toHaveLength(0);
	});
});
