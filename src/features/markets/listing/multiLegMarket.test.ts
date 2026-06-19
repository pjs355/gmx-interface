import { describe, expect, it } from "vitest";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import {
	isMultiLegBinaryUmbrella,
	isNonMatchHomeListing,
	multiLegLegLabel,
	multiLegUmbrellaShortTitle,
	orderMultiLegs,
	resolveMultiLegLayout,
	resolveTopN,
	worldCupSectionForUmbrella,
} from "./multiLegMarket";

function multiLegQuestion(input: {
	id: string;
	segment: string;
	sortOrder: number;
	label: string;
	polymarketMarketId?: string;
}): PredictionMarket {
	return {
		_id: input.id,
		marketType: "winner",
		segment: input.segment,
		sortOrder: input.sortOrder,
		question: `Will ${input.label} win Group A in the 2026 FIFA World Cup?`,
		polymarketMarketId: input.polymarketMarketId ?? input.id,
		tradeable: true,
	} as PredictionMarket;
}

describe("multiLegMarket", () => {
	it("resolves layout profiles per segment", () => {
		expect(resolveMultiLegLayout("group_a")?.homeTopN).toBe("all");
		expect(resolveMultiLegLayout("future_tournament_winner")?.homeTopN).toBe(2);
		expect(resolveMultiLegLayout("award_golden_boot")?.imageMode).toBe("none");
	});

	it("resolveTopN caps numeric limits", () => {
		expect(resolveTopN(2, 10)).toBe(2);
		expect(resolveTopN("all", 10)).toBe(10);
	});

	it("orders group legs by sortOrder", () => {
		const profile = resolveMultiLegLayout("group_a")!;
		const ordered = orderMultiLegs(
			[
				multiLegQuestion({ id: "b", segment: "group_a", sortOrder: 2, label: "Mexico" }),
				multiLegQuestion({ id: "a", segment: "group_a", sortOrder: 0, label: "South Africa" }),
				multiLegQuestion({ id: "c", segment: "group_a", sortOrder: 1, label: "South Korea" }),
			],
			profile,
		);
		expect(ordered.map((q) => q._id)).toEqual(["a", "c", "b"]);
	});

	it("orders futures legs by yes price when profile.sortBy is yesPrice", () => {
		const profile = resolveMultiLegLayout("future_tournament_winner")!;
		const legs = [
			multiLegQuestion({
				id: "usa",
				segment: "future_tournament_winner",
				sortOrder: 0,
				label: "USA",
				polymarketMarketId: "pm-usa",
			}),
			multiLegQuestion({
				id: "bra",
				segment: "future_tournament_winner",
				sortOrder: 1,
				label: "Brazil",
				polymarketMarketId: "pm-bra",
			}),
			multiLegQuestion({
				id: "fra",
				segment: "future_tournament_winner",
				sortOrder: 2,
				label: "France",
				polymarketMarketId: "pm-fra",
			}),
		];
		const yesPriceByMarketId = new Map([
			["pm-usa", 0.12],
			["pm-bra", 0.18],
			["pm-fra", 0.09],
		]);
		const ordered = orderMultiLegs(legs, profile, yesPriceByMarketId);
		expect(ordered.map((q) => q._id)).toEqual(["bra", "usa", "fra"]);
	});

	it("classifies umbrella World Cup sections from segment registry", () => {
		expect(
			worldCupSectionForUmbrella({
				children: [{ segment: "future_reach_final", marketType: "winner" }],
			} as never),
		).toBe("futures");
		expect(
			worldCupSectionForUmbrella({
				children: [{ segment: "award_golden_ball", marketType: "prop" }],
			} as never),
		).toBe("awards");
	});

	it("treats groups, futures, and awards as non-match home listings", () => {
		expect(
			isNonMatchHomeListing({
				children: [{ segment: "group_a", marketType: "winner" }],
			} as never),
		).toBe(true);
		expect(
			isNonMatchHomeListing({
				children: [{ segment: "future_tournament_winner", marketType: "winner" }],
			} as never),
		).toBe(true);
		expect(
			isNonMatchHomeListing({
				children: [{ segment: "moneyline", marketType: "winner" }],
			} as never),
		).toBe(false);
		expect(isNonMatchHomeListing({ children: [] } as never)).toBe(false);
	});

	it("detects multi-leg binary umbrellas with two or more legs", () => {
		const one = [multiLegQuestion({ id: "a", segment: "group_a", sortOrder: 0, label: "Mexico" })];
		const two = [
			multiLegQuestion({ id: "a", segment: "group_a", sortOrder: 0, label: "Mexico" }),
			multiLegQuestion({ id: "b", segment: "group_a", sortOrder: 1, label: "South Africa" }),
		];
		expect(isMultiLegBinaryUmbrella(one)).toBe(false);
		expect(isMultiLegBinaryUmbrella(two)).toBe(true);
	});

	it("extracts leg labels and umbrella titles", () => {
		const q = multiLegQuestion({
			id: "a",
			segment: "group_b",
			sortOrder: 0,
			label: "England",
		});
		expect(multiLegLegLabel(q)).toBe("England");
		expect(multiLegUmbrellaShortTitle([q])).toBe("Group B");
		expect(multiLegUmbrellaShortTitle([{ ...q, segment: "award_golden_boot" }])).toBe(
			"Golden Boot",
		);
	});
});
