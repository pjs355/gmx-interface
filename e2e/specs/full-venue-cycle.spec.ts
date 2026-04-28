import { test, expect } from "../fixtures/test";
import {
	assertPerVenueSpreadsWithinE2eCap,
	partitionRequestedVenuePicks,
	tradingVenueSlugForKey,
	type RequiredVenueKey,
} from "../fixtures/matched-market";
import { fundingPrecheck } from "../fixtures/funding-precheck";
import { cleanupOpenPositions } from "../fixtures/cleanup";
import { PredictionsPage } from "../page-objects/predictions-page";
import { Tradebox } from "../page-objects/tradebox";

/**
 * Venues you want this spec to touch. Comment a line out to skip that venue entirely.
 * Any venue still listed here must have a live bid/ask in `/matched-markets` + venue-prices
 * or the test fails with `missingBook` (no silent skip).
 */
const REQUESTED_VENUES: RequiredVenueKey[] = [
	//"polymarket",
	"predictFun",
	//"limitless",
	//"dflow",
	// "levelup",
];

const TRADE_USD = 5;
const POST_TRADE_SETTLE_MS = 5_000;

function sleepMs(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

test.describe("prinx full venue cycle", () => {
	test("per-venue best umbrellas: buy YES + sell + LiFi on first pick", async ({
		authenticatedPage,
		perVenueBestPicks,
	}) => {
		const page = authenticatedPage;
		const predictions = new PredictionsPage(page);
		const tradebox = new Tradebox(page);

		if (REQUESTED_VENUES.length === 0) {
			throw new Error(
				"REQUESTED_VENUES is empty: uncomment at least one venue to run this spec.",
			);
		}

		const { withBook, missingBook } = partitionRequestedVenuePicks(
			REQUESTED_VENUES,
			perVenueBestPicks,
		);

		if (missingBook.length > 0) {
			throw new Error(
				`Requested venue(s) have no live bid/ask in upcoming rows: ${missingBook.join(", ")}. ` +
					`Remove them from REQUESTED_VENUES or fix venue-prices ingest. ` +
					`Venues with books: ${withBook.map((p) => p.venueKey).join(", ") || "(none)"}.`,
			);
		}

		const picksToTrade = withBook;

		await test.step("spread cap (requested venues with books)", async () => {
			assertPerVenueSpreadsWithinE2eCap(picksToTrade);
		});

		await test.step("funding precheck", async () => {
			await fundingPrecheck(page);
		});

		try {
			for (const pick of picksToTrade) {
				const slug = tradingVenueSlugForKey(pick.venueKey);
				await test.step(`@${slug} umbrella=${pick.umbrellaId} panda=${pick.pandaMatchId}`, async () => {
					await predictions.openUmbrellaTradingPageById(
						pick.umbrellaId,
					);
					await tradebox.waitVisible();
					await tradebox.selectVenue(slug);
					await tradebox.placeMarketBuy("yes", TRADE_USD);
					await sleepMs(POST_TRADE_SETTLE_MS);
					const sold = await tradebox.sellAll();
					expect(
						sold.yesShares + sold.noShares,
						`expected to sell shares on ${slug} (${pick.displayName})`,
					).toBeGreaterThan(0);
					await tradebox.expectClosed();
					await sleepMs(POST_TRADE_SETTLE_MS);
				});
			}

			await test.step("@lifi-rebalance re-trade first requested venue with book", async () => {
				const first = picksToTrade[0];
				await predictions.openUmbrellaTradingPageById(first.umbrellaId);
				await tradebox.waitVisible();
				await tradebox.selectVenue(
					tradingVenueSlugForKey(first.venueKey),
				);
				await tradebox.placeMarketBuy("yes", TRADE_USD);
				await sleepMs(POST_TRADE_SETTLE_MS);
				const result = await tradebox.sellAll();
				expect(
					result.yesShares,
					`expected YES shares sold during LiFi rebalance on ${first.venueKey}`,
				).toBeGreaterThan(0);
				await tradebox.expectClosed();
			});
		} finally {
			for (const pick of picksToTrade) {
				try {
					await predictions.openUmbrellaTradingPageById(
						pick.umbrellaId,
					);
					await tradebox.waitVisible();
					await cleanupOpenPositions(page);
				} catch (err) {
					console.error("error", err);
				}
			}
		}
	});
});
