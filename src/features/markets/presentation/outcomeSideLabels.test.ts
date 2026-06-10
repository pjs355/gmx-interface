import { describe, expect, it } from "vitest";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import {
	labelForOutcomeSide,
	labelForPortfolioSide,
	resolveOutcomeSideLabels,
} from "./outcomeSideLabels";

function minimalUmbrella(partial: Partial<Umbrella> & { displayName: string }): Umbrella {
	return {
		_id: "u1",
		children: [],
		createdAt: "",
		updatedAt: "",
		__v: 0,
		...partial,
	};
}

describe("resolveOutcomeSideLabels", () => {
	it("returns Over/Under from market title", () => {
		const r = resolveOutcomeSideLabels({
			market: {
				displayName: "Over 2.5 Players",
			} as never,
		});
		expect(r.kind).toBe("over_under");
		expect(r.yesLabel).toBe("Over");
		expect(r.noLabel).toBe("Under");
	});

	it("returns signed spread lines instead of Yes/No", () => {
		const r = resolveOutcomeSideLabels({
			market: {
				displayName: "Mexico -1.5",
				marketType: "spread",
				line: -1.5,
				spreadSide: "home",
			} as never,
			teamMappings: [
				{ displayName: "Mexico", shortCode: "MEX" },
				{ displayName: "South Africa", shortCode: "RSA" },
			],
		});
		expect(r.kind).toBe("binary");
		expect(r.yesLabel).toBe("MEX -1.5");
		expect(r.noLabel).toBe("RSA +1.5");
	});

	it("returns Over/Under with line for total props", () => {
		const r = resolveOutcomeSideLabels({
			market: {
				displayName: "O/U 1.5",
				marketType: "total",
				line: 1.5,
			} as never,
		});
		expect(r.kind).toBe("over_under");
		expect(r.yesLabel).toBe("Over 1.5");
		expect(r.noLabel).toBe("Under 1.5");
	});

	it("prefers umbrella teamMappings over title parse", () => {
		const r = resolveOutcomeSideLabels({
			umbrella: minimalUmbrella({
				displayName: "Other vs Names - Match Winner",
				teamMappings: [
					{ displayName: "FaZe Clan", slug: "faze" },
					{ displayName: "Natus Vincere", slug: "navi" },
				],
			}),
		});
		expect(r.kind).toBe("h2h");
		expect(r.yesLabel).toBe("FaZe Clan");
		expect(r.noLabel).toBe("Natus Vincere");
	});

	it("parses vs from umbrella displayName without teamMappings", () => {
		const r = resolveOutcomeSideLabels({
			umbrellaDisplayName: "Team Alpha vs Team Beta - Match Winner",
		});
		expect(r.kind).toBe("h2h");
		expect(r.yesLabel).toBe("Team Alpha");
		expect(r.noLabel).toBe("Team Beta");
	});

	it("strips tournament suffix from long panda umbrella displayName", () => {
		const r = resolveOutcomeSideLabels({
			umbrellaDisplayName:
				"Team Alpha vs Carstensz - Esports World Cup - Southeast Asia Closed Qualifier 2026",
		});
		expect(r.kind).toBe("h2h");
		expect(r.yesLabel).toBe("Team Alpha");
		expect(r.noLabel).toBe("Carstensz");
	});

	it("prefers child question vs title over long umbrella displayName", () => {
		const r = resolveOutcomeSideLabels({
			umbrella: minimalUmbrella({
				displayName:
					"Team Alpha vs Carstensz - Esports World Cup - Southeast Asia Closed Qualifier 2026",
				children: [
					{
						displayName: "Team Alpha vs Carstensz",
						tagIds: [],
						questionId: "q1",
						marketId: "m1",
					},
				],
			}),
		});
		expect(r.kind).toBe("h2h");
		expect(r.yesLabel).toBe("Team Alpha");
		expect(r.noLabel).toBe("Carstensz");
	});

	it("uses DFlow tickers when title parse fails", () => {
		const r = resolveOutcomeSideLabels({
			umbrella: minimalUmbrella({
				displayName: "Esports Match",
				exchangeMatching: {
					dflow: { tickerA: "LGD", tickerB: "XG" },
				},
			}),
		});
		expect(r.yesLabel).toBe("LGD");
		expect(r.noLabel).toBe("XG");
	});

	it("falls back to Yes/No when no h2h signal", () => {
		const r = resolveOutcomeSideLabels({
			market: { displayName: "Some proposition market" } as never,
		});
		expect(r.kind).toBe("binary");
		expect(r.yesLabel).toBe("Yes");
		expect(r.noLabel).toBe("No");
	});

	it("does not require umbrellaChildrenCount === 1 (trade box parity)", () => {
		const r = resolveOutcomeSideLabels({
			market: {
				displayName: "Child market",
				umbrellaChildrenCount: 3,
			} as never,
			umbrellaDisplayName: "Alpha vs Beta - Match Winner",
		});
		expect(r.kind).toBe("h2h");
		expect(labelForOutcomeSide(r, "Yes")).toBe("Alpha");
	});
});

describe("labelForPortfolioSide", () => {
	it("uses named venue outcome when not generic Yes/No", () => {
		const label = labelForPortfolioSide(
			{ hints: { marketTitle: "A vs B - Match Winner" } },
			"Yes",
			"Custom Outcome Name",
		);
		expect(label).toBe("Custom Outcome Name");
	});
});
