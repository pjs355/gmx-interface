import { describe, expect, it } from "vitest";
import { resolveDefaultTradeQuestion } from "./defaultTradeQuestion";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";

function moneyline(leg: "home" | "draw" | "away", id: string): PredictionMarket {
	return {
		_id: id,
		marketType: "moneyline",
		moneylineLeg: leg,
		tradeable: true,
	} as PredictionMarket;
}

function spread(id: string): PredictionMarket {
	return {
		_id: id,
		marketType: "spread",
		tradeable: true,
	} as PredictionMarket;
}

function groupLeg(team: string, sortOrder: number): PredictionMarket {
	return {
		_id: `group-${team}`,
		marketType: "winner",
		segment: "group_a",
		sortOrder,
		question: `Will ${team} win Group A in the 2026 FIFA World Cup?`,
		tradeable: true,
	} as PredictionMarket;
}

describe("resolveDefaultTradeQuestion", () => {
	it("picks Team A moneyline over spread and draw regardless of list order", () => {
		const questions = [spread("spread-1"), moneyline("draw", "draw"), moneyline("home", "home")];
		expect(resolveDefaultTradeQuestion(questions)?._id).toBe("home");
	});

	it("picks the first group-winner team by sortOrder, not list order", () => {
		const questions = [
			groupLeg("Mexico", 2),
			groupLeg("South Africa", 0),
			groupLeg("South Korea", 1),
		];
		expect(resolveDefaultTradeQuestion(questions)?._id).toBe("group-South Africa");
	});
});
