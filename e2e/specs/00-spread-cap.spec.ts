import { test, expect } from "../fixtures/test";
import { warnPerVenueSpreadsAboveE2eCap } from "../fixtures/matched-market";
import { REQUESTED_VENUES } from "../fixtures/requested-venues";

test.describe("per-venue spread cap (preflight)", () => {
	test("each requested venue with a live best book reports spread; warns at ≥25¢ top-of-book (no ladders)", async ({
		perVenueBestPicks,
	}) => {
		if (REQUESTED_VENUES.length === 0) {
			throw new Error(
				"REQUESTED_VENUES is empty: uncomment at least one venue in e2e/fixtures/requested-venues.ts.",
			);
		}
		const requestedPicks = perVenueBestPicks.filter((p) =>
			REQUESTED_VENUES.includes(p.venueKey),
		);
		const missingRequested = REQUESTED_VENUES.filter(
			(key) => !perVenueBestPicks.some((p) => p.venueKey === key),
		);
		if (missingRequested.length > 0) {
			throw new Error(
				`Requested venue(s) have no live bid/ask in upcoming rows: ${missingRequested.join(", ")}. ` +
					`Remove them from REQUESTED_VENUES (e2e/fixtures/requested-venues.ts) or fix venue-prices ingest.`,
			);
		}
		expect(requestedPicks.length).toBeGreaterThan(0);
		warnPerVenueSpreadsAboveE2eCap(requestedPicks);
		for (const p of requestedPicks) {
			expect(p.spread, `${p.venueKey} spread`).toBeGreaterThan(0);
		}
	});
});
