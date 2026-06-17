import { describe, expect, it } from "vitest";
import {
	isPropOrNonMatchHomeCard,
	shouldShowHomeCardKickoffSchedule,
} from "./homeCardSchedule";

describe("homeCardSchedule", () => {
	it("treats NegRisk multi-leg umbrellas as prop cards", () => {
		const questions = [
			{ segment: "future_reach_semifinals", marketType: "winner", polymarketMarketId: "a" },
			{ segment: "future_reach_semifinals", marketType: "winner", polymarketMarketId: "b" },
		] as Parameters<typeof isPropOrNonMatchHomeCard>[0]["questions"];

		expect(
			isPropOrNonMatchHomeCard({
				isDailyUmbrella: false,
				isThreeWayMoneyline: false,
				useEsportsMatchWinnerCard: false,
				questions,
			}),
		).toBe(true);
		expect(
			shouldShowHomeCardKickoffSchedule({
				isDailyUmbrella: false,
				isThreeWayMoneyline: false,
				useEsportsMatchWinnerCard: false,
				questions,
			}),
		).toBe(false);
	});

	it("keeps kickoff schedule for three-way moneyline matches", () => {
		expect(
			isPropOrNonMatchHomeCard({
				isDailyUmbrella: false,
				isThreeWayMoneyline: true,
				useEsportsMatchWinnerCard: false,
				questions: [],
			}),
		).toBe(false);
		expect(
			shouldShowHomeCardKickoffSchedule({
				isDailyUmbrella: false,
				isThreeWayMoneyline: true,
				useEsportsMatchWinnerCard: false,
				questions: [],
			}),
		).toBe(true);
	});

	it("keeps kickoff schedule for esports match-winner cards", () => {
		expect(
			isPropOrNonMatchHomeCard({
				isDailyUmbrella: false,
				isThreeWayMoneyline: false,
				useEsportsMatchWinnerCard: true,
				questions: [],
			}),
		).toBe(false);
		expect(
			shouldShowHomeCardKickoffSchedule({
				isDailyUmbrella: false,
				isThreeWayMoneyline: false,
				useEsportsMatchWinnerCard: true,
				questions: [],
			}),
		).toBe(true);
	});

	it("does not apply prop layout to daily umbrellas", () => {
		expect(
			isPropOrNonMatchHomeCard({
				isDailyUmbrella: true,
				isThreeWayMoneyline: false,
				useEsportsMatchWinnerCard: false,
				questions: [],
			}),
		).toBe(false);
	});
});
