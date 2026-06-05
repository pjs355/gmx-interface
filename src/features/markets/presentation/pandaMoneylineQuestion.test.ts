import { describe, expect, it } from "vitest";
import {
	filterPandaMoneylineQuestions,
	isPandaEsportsUmbrella,
	isPandaMoneylineQuestion,
	pickPandaMoneylineQuestion,
} from "./pandaMoneylineQuestion";

const PANDA_UMBRELLA = { pandascore_matchId: "1504737" };
const FIFA_UMBRELLA = { pandascore_matchId: "" };

describe("isPandaMoneylineQuestion", () => {
	it("accepts match-level winner-2-way", () => {
		expect(
			isPandaMoneylineQuestion({
				pandascore_template: "winner-2-way",
				pandascore_eventType: "match",
				displayName: "FaZe vs NAVI",
			}),
		).toBe(true);
	});

	it("rejects game-level winner-2-way (map leg)", () => {
		expect(
			isPandaMoneylineQuestion({
				pandascore_template: "winner-2-way",
				pandascore_eventType: "game",
				pandascore_gamePosition: 1,
				displayName: "FaZe vs NAVI",
			}),
		).toBe(false);
	});

	it("rejects map over under", () => {
		expect(
			isPandaMoneylineQuestion({
				pandascore_template: "map-over-under",
				pandascore_eventType: "match",
				displayName: "Total Maps O/U 2.5",
			}),
		).toBe(false);
	});
});

describe("pickPandaMoneylineQuestion", () => {
	it("picks match row when newer map legs are listed first", () => {
		const picked = pickPandaMoneylineQuestion([
			{
				displayName: "FaZe vs NAVI",
				pandascore_template: "winner-2-way",
				pandascore_eventType: "game",
				pandascore_gamePosition: 3,
			},
			{
				displayName: "FaZe vs NAVI",
				pandascore_template: "winner-2-way",
				pandascore_eventType: "game",
				pandascore_gamePosition: 1,
			},
			{
				displayName: "FaZe vs NAVI",
				pandascore_template: "winner-2-way",
				pandascore_eventType: "match",
			},
		]);
		expect(picked?.pandascore_eventType).toBe("match");
		expect(picked?.pandascore_gamePosition).toBeUndefined();
	});
});

describe("filterPandaMoneylineQuestions", () => {
	it("passes through unchanged for non-Panda umbrellas", () => {
		const rows = [
			{ displayName: "A", pandascore_template: "winner-2-way" },
			{ displayName: "B", pandascore_template: "winner-2-way" },
		];
		expect(filterPandaMoneylineQuestions(rows, FIFA_UMBRELLA)).toEqual(rows);
	});

	it("keeps only moneyline for Panda umbrellas", () => {
		const rows = [
			{
				displayName: "FaZe vs NAVI",
				pandascore_template: "winner-2-way",
				pandascore_eventType: "game",
				pandascore_gamePosition: 2,
			},
			{
				displayName: "FaZe vs NAVI",
				pandascore_template: "winner-2-way",
				pandascore_eventType: "match",
			},
		];
		const out = filterPandaMoneylineQuestions(rows, PANDA_UMBRELLA);
		expect(out).toHaveLength(1);
		expect(out[0]?.pandascore_eventType).toBe("match");
	});
});

describe("isPandaEsportsUmbrella", () => {
	it("requires non-empty pandascore_matchId", () => {
		expect(isPandaEsportsUmbrella({ pandascore_matchId: "1" })).toBe(true);
		expect(isPandaEsportsUmbrella({})).toBe(false);
	});
});
