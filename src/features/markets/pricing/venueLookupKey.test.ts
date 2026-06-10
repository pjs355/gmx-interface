import { describe, expect, it } from "vitest";
import { isPerLegVenueKey, resolveUmbrellaVenueKey } from "./venueLookupKey";

describe("resolveUmbrellaVenueKey", () => {
	it("uses polymarketMarketId for spread props even when umbrella has pandascore_matchId", () => {
		const umbrella = { pandascore_matchId: "2326844" };
		const spread = {
			polymarketMarketId: "901234",
			marketType: "spread" as const,
		};
		expect(resolveUmbrellaVenueKey(umbrella, spread)).toBe("901234");
	});

	it("uses umbrella pandascore_matchId for esports series winner without polymarketMarketId", () => {
		const umbrella = { pandascore_matchId: "1525457" };
		expect(resolveUmbrellaVenueKey(umbrella, null)).toBe("1525457");
	});

	it("uses map wire key for esports per-map legs", () => {
		const umbrella = { pandascore_matchId: "1525457" };
		const mapLeg = {
			pandascore_eventType: "game" as const,
			pandascore_gamePosition: 2,
			polymarketMarketId: "should-not-win",
		};
		expect(resolveUmbrellaVenueKey(umbrella, mapLeg)).toBe("1525457-map-2");
	});
});

describe("isPerLegVenueKey", () => {
	it("is true when active question has polymarketMarketId", () => {
		expect(
			isPerLegVenueKey({ pandascore_matchId: "2326844" }, { polymarketMarketId: "901234" }),
		).toBe(true);
	});
});
