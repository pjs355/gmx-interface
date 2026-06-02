import { describe, expect, it } from "vitest";

import {
	isDota2TagLabel,
	isLeagueOfLegendsTagLabel,
	isRestrictedProductionTagLabel,
	isRestrictedProductionVideogameSlug,
	isValorantTagLabel,
	restrictedDefaultTagLabel,
} from "../restrictedMode";

describe("restrictedMode", () => {
	it("allowlists cs-go, league-of-legends, valorant, and dota-2 slugs", () => {
		expect(isRestrictedProductionVideogameSlug("cs-go")).toBe(true);
		expect(isRestrictedProductionVideogameSlug("league-of-legends")).toBe(true);
		expect(isRestrictedProductionVideogameSlug("valorant")).toBe(true);
		expect(isRestrictedProductionVideogameSlug("dota-2")).toBe(true);
		expect(isRestrictedProductionVideogameSlug("fifa")).toBe(false);
	});

	it("recognizes allowlisted tag labels", () => {
		expect(isLeagueOfLegendsTagLabel("League of Legends")).toBe(true);
		expect(isLeagueOfLegendsTagLabel("LOL")).toBe(true);
		expect(isValorantTagLabel("Valorant")).toBe(true);
		expect(isDota2TagLabel("Dota 2")).toBe(true);
		expect(isDota2TagLabel("dota2")).toBe(true);
		expect(isRestrictedProductionTagLabel("Counter-Strike 2")).toBe(true);
		expect(isRestrictedProductionTagLabel("Valorant")).toBe(true);
		expect(isRestrictedProductionTagLabel("Dota 2")).toBe(true);
		expect(isRestrictedProductionTagLabel("FIFA")).toBe(false);
	});

	it("defaults home pill to Counter-Strike when both CS2 and LoL tags exist", () => {
		const label = restrictedDefaultTagLabel([
			{ _id: "1", label: "League of Legends", slug: "lol" },
			{ _id: "2", label: "Counter-Strike 2", slug: "cs2" },
		] as any);
		expect(label).toBe("Counter-Strike 2");
	});
});
