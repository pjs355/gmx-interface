import { describe, expect, it } from "vitest";

import { resolveFifaThreeWayOddsContext } from "../resolveFifaThreeWayOddsContext";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";

function umbrella(partial: Partial<Umbrella> & Pick<Umbrella, "_id" | "displayName">): Umbrella {
	return {
		children: [],
		createdAt: "",
		updatedAt: "",
		__v: 0,
		source: "polymarket",
		teamMappings: [
			{ displayName: "Mexico", slug: "mexico" },
			{ displayName: "South Africa", slug: "south-africa" },
		],
		...partial,
	};
}

function q(leg: "home" | "draw" | "away", marketId: string): PredictionMarket {
	return {
		_id: leg,
		conditionId: "",
		marketId: marketId,
		question: "",
		questionId: leg,
		yesTokenId: "",
		noTokenId: "",
		registered: false,
		createdAt: "",
		updatedAt: "",
		__v: 0,
		historicalPricesYes: [],
		historicalPricesNo: [],
		historicalPrices: [],
		moneylineLeg: leg,
		polymarketMarketId: marketId,
	};
}

describe("resolveFifaThreeWayOddsContext", () => {
	it("returns 3 subscribe keys and column labels when all legs present", () => {
		const ctx = resolveFifaThreeWayOddsContext(umbrella({ _id: "u1", displayName: "MEX vs RSA" }), [
			q("home", "101"),
			q("draw", "102"),
			q("away", "103"),
		]);
		expect(ctx).not.toBeNull();
		expect(ctx?.subscriptionKeys).toEqual(["101", "102", "103"]);
		expect(ctx?.columns).toEqual({
			home: "Mexico",
			draw: "Draw",
			away: "South Africa",
		});
	});

	it("returns null when a leg is missing", () => {
		const ctx = resolveFifaThreeWayOddsContext(umbrella({ _id: "u2", displayName: "MEX vs RSA" }), [
			q("home", "101"),
			q("away", "103"),
		]);
		expect(ctx).toBeNull();
	});
});
