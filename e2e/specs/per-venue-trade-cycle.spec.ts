import { test as base, expect } from "@playwright/test";
import {
	openAuthenticatedSession,
	type AuthenticatedSession,
} from "../fixtures/authenticated-page";
import {
	resolvePerVenueBestPicks,
	partitionRequestedVenuePicks,
	tradingVenueSlugForKey,
	type RequiredVenueKey,
	type PerVenueBestPick,
} from "../fixtures/matched-market";
import { fundingPrecheck } from "../fixtures/funding-precheck";
import { cleanupOpenPositions } from "../fixtures/cleanup";
import { PredictionsPage } from "../page-objects/predictions-page";
import { Tradebox } from "../page-objects/tradebox";
import { expectHeaderCashUsd } from "../helpers/header-cash";

/**
 * Per-venue trade cycle: 5 numbered tests inside a `describe.serial` per venue.
 * Comment a venue out to skip it. Any venue still listed here MUST have a live
 * bid/ask in `/matched-markets` + venue-prices, otherwise `beforeAll` throws.
 *
 * `levelup` is intentionally absent: venue-prices does not currently feed it.
 */
const REQUESTED_VENUES: RequiredVenueKey[] = [
	// "polymarket",
	"predictFun",
	// "limitless",
	// "dflow",
	// "levelup",
];

const TRADE_USD = 5;
/** $5 round-trip can lose up to ~$0.50 to spread + fees on the tightest venues. */
const CASH_RECOVERY_TOLERANCE_USD = 0.5;
/**
 * Header `Cash` vs tradebox quoted Cost / Estimated Receive (rounding, hydration,
 * `Math.floor` in UI vs wallet timing).
 */
const CASH_QUOTE_VS_HEADER_TOLERANCE_USD = 0.6;
/** SOR `data-leg-num-shares` may differ slightly from MyPositionsRow `data-qa-shares-count`. */
const SHARE_COUNT_TOLERANCE_PCT = 0.01;
/**
 * When true, each venue block’s `afterAll` runs `cleanupOpenPositions` (flatten dust).
 * Off for now — the round-trip tests are intended to clear the position themselves.
 */
const ENABLE_POST_VENUE_CLEANUP_SWEEP = false;

const test = base;

let sharedSession: AuthenticatedSession | null = null;
let allPicks: PerVenueBestPick[] | null = null;

test.describe("prinx per-venue trade cycle", () => {
	test.beforeAll(async () => {
		if (REQUESTED_VENUES.length === 0) {
			throw new Error(
				"REQUESTED_VENUES is empty: uncomment at least one venue to run this spec.",
			);
		}
		const picks = await resolvePerVenueBestPicks();
		if (picks.length === 0) {
			throw new Error(
				"No per-venue best picks: no upcoming matched row had a live bid/ask on any venue.",
			);
		}
		const { withBook, missingBook } = partitionRequestedVenuePicks(
			REQUESTED_VENUES,
			picks,
		);
		if (missingBook.length > 0) {
			throw new Error(
				`Requested venue(s) have no live bid/ask in upcoming rows: ${missingBook.join(", ")}. ` +
					`Remove them from REQUESTED_VENUES or fix venue-prices ingest. ` +
					`Venues with books: ${withBook.map((p) => p.venueKey).join(", ") || "(none)"}.`,
			);
		}
		allPicks = picks;
		sharedSession = await openAuthenticatedSession();
		await fundingPrecheck(sharedSession.page);
	});

	test.afterAll(async () => {
		if (sharedSession === null) return;
		try {
			await sharedSession.context.close();
		} catch (err) {
			console.error("error", err);
		}
		sharedSession = null;
	});

	for (const venueKey of REQUESTED_VENUES) {
		test.describe.serial(`venue=${venueKey}`, () => {
			let pick: PerVenueBestPick | null = null;
			let cashBeforeUsd = 0;
			/** Buy leg quote from test 1 — compared to `MyPositionsRow` after fill in test 2. */
			let buyQuotedShares = 0;
			let buyQuotedPriceCents = 0;
			let sellReceiveQuoteUsd = 0;
			let cashAfterBuy = 0;
			let cashAfterSell = 0;
			let buyShares = 0;

			test.beforeAll(async () => {
				if (sharedSession === null) {
					throw new Error("sharedSession not initialized");
				}
				if (allPicks === null) {
					throw new Error("allPicks not initialized");
				}
				const found = allPicks.find((p) => p.venueKey === venueKey);
				if (found === undefined) {
					throw new Error(`No PerVenueBestPick for ${venueKey}`);
				}
				pick = found;
				const predictions = new PredictionsPage(sharedSession.page);
				const tradebox = new Tradebox(sharedSession.page);
				await predictions.openUmbrellaTradingPageById(found.umbrellaId);
				await tradebox.waitVisible();
				await tradebox.selectVenue(tradingVenueSlugForKey(venueKey));
				cashBeforeUsd = await expectHeaderCashUsd(sharedSession.page);
				console.log(
					`[per-venue-cycle] ${venueKey} umbrella=${found.umbrellaId} ` +
						`panda=${found.pandaMatchId} cashBefore=$${cashBeforeUsd.toFixed(2)}`,
				);
			});

			test.afterAll(async () => {
				if (!ENABLE_POST_VENUE_CLEANUP_SWEEP) {
					return;
				}
				if (sharedSession === null) return;
				try {
					await cleanupOpenPositions(
						sharedSession.page,
						REQUESTED_VENUES.map((key) => tradingVenueSlugForKey(key)),
					);
				} catch (err) {
					console.error("error", err);
				}
			});

			test("1) buy.price-populates: submit enabled with priced leg", async () => {
				if (sharedSession === null) {
					throw new Error("sharedSession not initialized");
				}
				const tradebox = new Tradebox(sharedSession.page);
				await tradebox.setSide("buy");
				await tradebox.setPosition("yes");
				await tradebox.setAmount(TRADE_USD);
				await tradebox.expectSubmitEnabled();
				const leg = await tradebox.readLegAttrs("market-buy");
				expect(
					leg.priceCents,
					`market-buy leg priceCents must be >0 for ${venueKey}`,
				).toBeGreaterThan(0);
				expect(
					leg.priceCents,
					`market-buy leg priceCents must be <100 for ${venueKey}`,
				).toBeLessThan(100);
				expect(
					leg.numShares,
					`market-buy leg numShares must be >0 for ${venueKey}`,
				).toBeGreaterThan(0);
				buyQuotedShares = leg.numShares;
				buyQuotedPriceCents = leg.priceCents;
			});

			test("2) buy.shares-appear: MyPositionsRow reports shares > 0", async () => {
				if (sharedSession === null) {
					throw new Error("sharedSession not initialized");
				}
				if (buyQuotedShares <= 0) {
					throw new Error(
						`buyQuotedShares not set for ${venueKey}; test 1 must succeed first`,
					);
				}
				const tradebox = new Tradebox(sharedSession.page);
				const buyCostQuoteUsd = await tradebox.readQuotedBuyCostUsd();
				await tradebox.submit();
				await tradebox.waitForFill();
				const sharesObserved = await tradebox.waitForBuyShares();
				expect(sharesObserved).toBeGreaterThan(0);
				const tol = Math.max(
					SHARE_COUNT_TOLERANCE_PCT * buyQuotedShares,
					0.0005,
				);
				expect(
					Math.abs(sharesObserved - buyQuotedShares),
					`shares mismatch on ${venueKey}: quotedShares(test1)=${buyQuotedShares} @${buyQuotedPriceCents}¢ ` +
						`rowShares=${sharesObserved} tol=${tol}`,
				).toBeLessThanOrEqual(tol);
				cashAfterBuy = await expectHeaderCashUsd(sharedSession.page);
				const spentUsd = cashBeforeUsd - cashAfterBuy;
				expect(
					Math.abs(spentUsd - buyCostQuoteUsd),
					`${venueKey} buy: header cash drop vs quoted Cost — spent=${spentUsd.toFixed(4)} ` +
						`quotedCost=${buyCostQuoteUsd.toFixed(4)} cashBefore=${cashBeforeUsd.toFixed(2)} ` +
						`cashAfterBuy=${cashAfterBuy.toFixed(2)} tol=$${CASH_QUOTE_VS_HEADER_TOLERANCE_USD}`,
				).toBeLessThanOrEqual(CASH_QUOTE_VS_HEADER_TOLERANCE_USD);
				buyShares = sharesObserved;
			});

			test("3) sell.price-populates: submit enabled with priced leg", async () => {
				if (sharedSession === null) {
					throw new Error("sharedSession not initialized");
				}
				if (buyShares <= 0) {
					throw new Error(
						`buyShares not set for ${venueKey}; test 2 must succeed before test 3`,
					);
				}
				const tradebox = new Tradebox(sharedSession.page);
				await tradebox.setSide("sell");
				await tradebox.setPosition("yes");
				await tradebox.setAmount(buyShares);
				await tradebox.expectSubmitEnabled();
				const leg = await tradebox.readLegAttrs("market-sell");
				expect(
					leg.priceCents,
					`market-sell leg priceCents must be >0 for ${venueKey}`,
				).toBeGreaterThan(0);
				expect(
					leg.priceCents,
					`market-sell leg priceCents must be <100 for ${venueKey}`,
				).toBeLessThan(100);
				sellReceiveQuoteUsd = await tradebox.readQuotedSellReceiveUsd();
			});

			test("4) sell.shares-clear: MyPositionsRow reports 0 shares", async () => {
				if (sharedSession === null) {
					throw new Error("sharedSession not initialized");
				}
				if (sellReceiveQuoteUsd <= 0) {
					throw new Error(
						`sellReceiveQuoteUsd not set for ${venueKey}; test 3 must succeed first`,
					);
				}
				const tradebox = new Tradebox(sharedSession.page);
				await tradebox.submit();
				await tradebox.waitForFill();
				await tradebox.waitForSharesCleared();
				cashAfterSell = await expectHeaderCashUsd(sharedSession.page);
				const receivedUsd = cashAfterSell - cashAfterBuy;
				expect(
					Math.abs(receivedUsd - sellReceiveQuoteUsd),
					`${venueKey} sell: header cash gain vs quoted Estimated Receive — ` +
						`received=${receivedUsd.toFixed(4)} quotedReceive=${sellReceiveQuoteUsd.toFixed(4)} ` +
						`cashAfterBuy=${cashAfterBuy.toFixed(2)} cashAfterSell=${cashAfterSell.toFixed(2)} ` +
						`tol=$${CASH_QUOTE_VS_HEADER_TOLERANCE_USD}`,
				).toBeLessThanOrEqual(CASH_QUOTE_VS_HEADER_TOLERANCE_USD);
			});

			test("5) cash.recovered: header Cash within tolerance of pre-buy", async () => {
				if (sharedSession === null) {
					throw new Error("sharedSession not initialized");
				}
				const cashAfter = await expectHeaderCashUsd(sharedSession.page);
				const drop = cashBeforeUsd - cashAfter;
				console.log(
					`[per-venue-cycle] ${venueKey} cashAfter=$${cashAfter.toFixed(2)} ` +
						`drop=$${drop.toFixed(2)} tol=$${CASH_RECOVERY_TOLERANCE_USD.toFixed(2)}`,
				);
				expect(
					cashAfter,
					`header Cash should recover to within $${CASH_RECOVERY_TOLERANCE_USD} of pre-buy ` +
						`($${cashBeforeUsd.toFixed(2)}) on ${venueKey} after a $${TRADE_USD} round-trip; ` +
						`actual = $${cashAfter.toFixed(2)} (drop=$${drop.toFixed(2)})`,
				).toBeGreaterThanOrEqual(
					cashBeforeUsd - CASH_RECOVERY_TOLERANCE_USD,
				);
			});
		});
	}
});
