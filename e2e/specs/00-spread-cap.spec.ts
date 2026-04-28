import { test, expect } from "../fixtures/test";
import {
	assertPerVenueSpreadsWithinE2eCap,
	MAX_E2E_VENUE_SPREAD_USD,
} from "../fixtures/matched-market";

test.describe("per-venue spread cap", () => {
	test("each venue with a live best book has tightest spread under 20¢", async ({
		perVenueBestPicks,
	}) => {
		expect(perVenueBestPicks.length).toBeGreaterThan(0);
		assertPerVenueSpreadsWithinE2eCap(perVenueBestPicks);
		for (const p of perVenueBestPicks) {
			expect(p.spread, `${p.venueKey} spread`).toBeLessThan(MAX_E2E_VENUE_SPREAD_USD);
			expect(p.spread, `${p.venueKey} spread`).toBeGreaterThan(0);
		}
	});
});
