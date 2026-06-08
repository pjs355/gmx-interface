import { describe, expect, it } from "vitest";
import { resolveEsportsLegs } from "./esportsLegs";

const PANDA_UMBRELLA = { pandascore_matchId: "1504737" } as any;
const FIFA_UMBRELLA = { pandascore_matchId: "" } as any;

describe("resolveEsportsLegs", () => {
	it("returns [] for non-Panda umbrellas", () => {
		const out = resolveEsportsLegs(FIFA_UMBRELLA, [
			{
				displayName: "FaZe vs NAVI",
				pandascore_template: "winner-2-way",
				pandascore_eventType: "match",
			} as any,
		]);
		expect(out).toEqual([]);
	});

	it("returns [] when there are no questions", () => {
		expect(resolveEsportsLegs(PANDA_UMBRELLA, [])).toEqual([]);
		expect(resolveEsportsLegs(PANDA_UMBRELLA, null)).toEqual([]);
	});

	it("orders series first then maps by ascending slot", () => {
		const out = resolveEsportsLegs(PANDA_UMBRELLA, [
			{
				_id: "map2",
				pandascore_template: "winner-2-way",
				pandascore_eventType: "game",
				pandascore_gamePosition: 2,
			} as any,
			{
				_id: "series",
				pandascore_template: "winner-2-way",
				pandascore_eventType: "match",
			} as any,
			{
				_id: "map1",
				pandascore_template: "winner-2-way",
				pandascore_eventType: "game",
				pandascore_gamePosition: 1,
			} as any,
		]);
		expect(out.map((l) => l.label)).toEqual(["Moneyline", "Map 1", "Map 2"]);
		expect(out.map((l) => l.wireKey)).toEqual([
			"1504737",
			"1504737-map-1",
			"1504737-map-2",
		]);
	});

	it("keeps tradeable: false map legs (settled / view-only)", () => {
		// User-facing rule: "make it so that Map 1 is still showing even if it is
		// over and we show Map 2". The resolver must not filter by tradeable —
		// the accordion renders the leg as view-only with last-known odds.
		const out = resolveEsportsLegs(PANDA_UMBRELLA, [
			{
				_id: "series",
				pandascore_template: "winner-2-way",
				pandascore_eventType: "match",
				tradeable: true,
			} as any,
			{
				_id: "map1",
				pandascore_template: "winner-2-way",
				pandascore_eventType: "game",
				pandascore_gamePosition: 1,
				tradeable: false,
			} as any,
			{
				_id: "map2",
				pandascore_template: "winner-2-way",
				pandascore_eventType: "game",
				pandascore_gamePosition: 2,
				tradeable: true,
			} as any,
		]);
		expect(out.map((l) => l.label)).toEqual(["Moneyline", "Map 1", "Map 2"]);
	});

	it("excludes over-under templates (no team-vs-team binary book)", () => {
		const out = resolveEsportsLegs(PANDA_UMBRELLA, [
			{
				_id: "series",
				pandascore_template: "winner-2-way",
				pandascore_eventType: "match",
			} as any,
			{
				_id: "ou",
				pandascore_template: "map-over-under",
				pandascore_eventType: "match",
			} as any,
		]);
		expect(out.map((l) => l.label)).toEqual(["Moneyline"]);
	});

	it("dedupes by slot — keeps first occurrence", () => {
		const out = resolveEsportsLegs(PANDA_UMBRELLA, [
			{
				_id: "map1-a",
				pandascore_template: "winner-2-way",
				pandascore_eventType: "game",
				pandascore_gamePosition: 1,
			} as any,
			{
				_id: "map1-b",
				pandascore_template: "winner-2-way",
				pandascore_eventType: "game",
				pandascore_gamePosition: 1,
			} as any,
		]);
		expect(out).toHaveLength(1);
		expect(out[0].question._id).toBe("map1-a");
	});

	it("returns just the series leg for series-only umbrellas", () => {
		const out = resolveEsportsLegs(PANDA_UMBRELLA, [
			{
				_id: "series",
				pandascore_template: "winner-2-way",
				pandascore_eventType: "match",
			} as any,
		]);
		expect(out).toHaveLength(1);
		expect(out[0].slot).toBeNull();
		expect(out[0].label).toBe("Moneyline");
		expect(out[0].wireKey).toBe("1504737");
	});
});
