import { test, expect } from "../fixtures/test";
import {
	MAX_E2E_VENUE_SPREAD_USD,
	warnPerVenueSpreadsAboveE2eCap,
} from "../fixtures/matched-market";
import { REQUESTED_VENUES } from "../fixtures/requested-venues";

test.describe("per-venue spread cap (preflight)", () => {
	test("REQUESTED_VENUES non-empty", () => {
		expect(REQUESTED_VENUES.length, "requested-venues.ts").toBeGreaterThan(0);
	});

	for (const venueKey of REQUESTED_VENUES) {
		test(`${venueKey}: live tightest spread > 0 (warn if ≥${MAX_E2E_VENUE_SPREAD_USD} without ladders)`, async ({
			perVenueBestPicks,
		}, testInfo) => {
			const p = perVenueBestPicks.find((x) => x.venueKey === venueKey);
			if (!p) {
				console.log(
					`[e2e spread cap] No live bid/ask pick for "${venueKey}" in upcoming matched-markets rows — skipping.`,
				);
				testInfo.skip(true, `no PerVenueBestPick for ${venueKey}`);
				return;
			}
			warnPerVenueSpreadsAboveE2eCap([p]);
			expect(p.spread, `${p.venueKey} spread`).toBeGreaterThan(0);
		});
	}
});
