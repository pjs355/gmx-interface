import { describe, expect, it } from "vitest";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import {
	isMatchWinnerMarketQuestion,
	parseEsportsUmbrellaHeadlineParts,
	pickMatchWinnerQuestion,
	resolveEsportsCardGameHeadline,
} from "./esportsHomeCard";

describe("parseEsportsUmbrellaHeadlineParts", () => {
	it("splits teams from full tournament suffix", () => {
		const r = parseEsportsUmbrellaHeadlineParts(
			"Team Alpha vs Carstensz - Esports World Cup - Southeast Asia Closed Qualifier 2026",
		);
		expect(r.teamsLine).toBe("Team Alpha vs Carstensz");
		expect(r.tournamentLabel).toBe("Esports World Cup - Southeast Asia Closed Qualifier 2026");
	});

	it("returns empty tournament when absent", () => {
		const r = parseEsportsUmbrellaHeadlineParts("The Bandits vs mCon esports");
		expect(r.teamsLine).toBe("The Bandits vs mCon esports");
		expect(r.tournamentLabel).toBe("");
	});
});

describe("pickMatchWinnerQuestion", () => {
	it("prefers winner-2-way over O/U props", () => {
		const picked = pickMatchWinnerQuestion([
			{ displayName: "Total Maps O/U 2.5", pandascore_template: "map-over-under" },
			{ displayName: "FaZe vs NAVI", pandascore_template: "winner-2-way" },
		]);
		expect(picked?.displayName).toBe("FaZe vs NAVI");
	});

	it("prefers vs title when templates missing", () => {
		const picked = pickMatchWinnerQuestion([
			{ displayName: "Total Rounds O/U 21.5" },
			{ displayName: "Alpha vs Beta" },
		]);
		expect(picked?.displayName).toBe("Alpha vs Beta");
	});
});

describe("resolveEsportsCardGameHeadline", () => {
	const tags = [
		{ _id: "esports", label: "ESPORTS" },
		{ _id: "cs2", label: "Counter-Strike" },
		{ _id: "dota", label: "Dota 2" },
	];

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

	it("uses umbrella.game even when displayName has tournament suffix", () => {
		const headline = resolveEsportsCardGameHeadline(
			minimalUmbrella({
				displayName: "Alpha vs Beta - ESL Pro League Season 22",
				game: "Counter-Strike",
			}),
			tags,
		);
		expect(headline).toBe("Counter-Strike");
	});

	it("uses umbrella.game for dota long titles", () => {
		const headline = resolveEsportsCardGameHeadline(
			minimalUmbrella({
				displayName:
					"Alpha vs Carstensz - Esports World Cup - Southeast Asia Closed Qualifier 2026",
				game: "Dota 2",
			}),
			tags,
		);
		expect(headline).toBe("Dota 2");
	});

	it("falls back to game tag when game field missing", () => {
		const headline = resolveEsportsCardGameHeadline(
			minimalUmbrella({
				displayName: "The Bandits vs mCon esports",
				children: [{ displayName: "Q", questionId: "q1", marketId: "m1", tagIds: ["cs2"] }],
			}),
			tags,
		);
		expect(headline).toBe("Counter-Strike");
	});
});

describe("isMatchWinnerMarketQuestion", () => {
	it("rejects map over under", () => {
		expect(
			isMatchWinnerMarketQuestion({
				displayName: "Total Maps O/U 2.5",
				pandascore_template: "map-over-under",
			}),
		).toBe(false);
	});
});
