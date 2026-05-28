import { describe, expect, it } from "vitest";

import {
	hasCrossVenueOddsSubscription,
	resolveOddsSubscriptionKey,
} from "../resolveOddsSubscriptionKey";
import type { Umbrella } from "@/services/api/umbrellaDataService";

function umbrella(partial: Partial<Umbrella> & Pick<Umbrella, "_id" | "displayName">): Umbrella {
	return {
		children: [],
		createdAt: "",
		updatedAt: "",
		__v: 0,
		...partial,
	};
}

describe("resolveOddsSubscriptionKey", () => {
	it("returns pandascore_matchId for esports umbrellas", () => {
		const key = resolveOddsSubscriptionKey(
			umbrella({
				_id: "u1",
				displayName: "A vs B",
				source: "pandascore",
				pandascore_matchId: "999",
			}),
			null,
		);
		expect(key).toBe("999");
	});

	it("returns polymarketMarketId for polymarket source with active question", () => {
		const key = resolveOddsSubscriptionKey(
			umbrella({
				_id: "u2",
				displayName: "Mexico vs South Africa",
				source: "polymarket",
			}),
			{ polymarketMarketId: "351716" },
		);
		expect(key).toBe("351716");
	});

	it("returns null for polymarket without active question market id", () => {
		const key = resolveOddsSubscriptionKey(
			umbrella({
				_id: "u2",
				displayName: "Mexico vs South Africa",
				source: "polymarket",
			}),
			null,
		);
		expect(key).toBeNull();
	});

	it("hasCrossVenueOddsSubscription mirrors key presence", () => {
		expect(
			hasCrossVenueOddsSubscription(
				umbrella({ _id: "u3", displayName: "x", pandascore_matchId: "1" }),
				null,
			),
		).toBe(true);
		expect(
			hasCrossVenueOddsSubscription(
				umbrella({
					_id: "u4",
					displayName: "x",
					source: "polymarket",
				}),
				null,
			),
		).toBe(false);
	});
});
