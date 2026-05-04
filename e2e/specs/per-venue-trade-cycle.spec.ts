import { test as base, expect } from "@playwright/test";
import {
	openAuthenticatedSession,
	type AuthenticatedSession,
} from "../fixtures/authenticated-page";
import {
	resolvePerVenueBestPicks,
	partitionRequestedVenuePicks,
	tradingVenueSlugForKey,
	type PerVenueBestPick,
} from "../fixtures/matched-market";
import { REQUESTED_VENUES } from "../fixtures/requested-venues";
import { fundingPrecheck } from "../fixtures/funding-precheck";
import { cleanupOpenPositions } from "../fixtures/cleanup";
import { PredictionsPage } from "../page-objects/predictions-page";
import {
	Tradebox,
	sharesVisiblePollTimeoutMsForVenueKey,
} from "../page-objects/tradebox";
import {
	expectHeaderCashUsd,
	postTradeCashMatchTimeoutMsForVenueKey,
	waitForHeaderCashAfterBuySpend,
	waitForHeaderCashAfterSellReceive,
} from "../helpers/header-cash";

/**
 * Prinx / Predict per-venue trade cycle (Playwright, serial per venue).
 *
 * ---------------------------------------------------------------------------
 * What this spec does
 * ---------------------------------------------------------------------------
 * For each `REQUESTED_VENUES` entry, runs a 5-step serial flow: quote buy →
 * market buy → quote sell → market sell → assert end-state Cash near pre-trade
 * (round-trip loss within `CASH_RECOVERY_TOLERANCE_USD`). Uses live API + real
 * wallet via `openAuthenticatedSession` (Chrome persistent profile from
 * `yarn e2e:seed-profile`). Requires matched-markets / venue-prices to expose a
 * book for the venue, and `funding-precheck` minimum header Cash.
 *
 * ---------------------------------------------------------------------------
 * Header Cash after trades (why we call `waitForHeaderCashAfterBuySpend` / …SellReceive)
 * ---------------------------------------------------------------------------
 * Do not replace those with a single `expectHeaderCashUsd()` right after fill +
 * `waitForBuyShares()`. Positions row updates and collateral balance refresh are
 * independent: header Cash is driven by `CollateralTokenContext` (multi-chain RPC),
 * while share counts come from venue position state. See the long comment at the
 * top of `e2e/helpers/header-cash.ts` for the exact failure mode we fixed (quoted
 * Cost ~$5 vs header implying ~$0 spend until refetch completed).
 *
 * `cashBeforeUsd` is captured once in `beforeAll` after venue selection — before
 * test 1 — and is used for test 5 round-trip recovery vs the venue block start.
 * Test 2 buy-spend polling uses a **fresh** `expectHeaderCashUsd` immediately before
 * `tradebox.submit()` so spend = baseline − post matches the same DOM moment as sells.
 *
 * ---------------------------------------------------------------------------
 * Shares assertion in test 2
 * ---------------------------------------------------------------------------
 * `Tradebox.waitForBuyShares()` reads `data-qa-shares-count` on the buy row.
 * In `MyPositionsRow.tsx`, that is `buyTotalShares` (cumulative for the market
 * tab). `buyQuotedShares` from test 1 is the Details leg (`data-leg-num-shares`)
 * at quote time. We take `readBuyRowTotalSharesOrZero()` **before** submit (`sharesBefore`)
 * and compare **delta** = after − before to `buyQuotedShares` using `buyShareFillDeltaTolerance`
 * (2% + floor; DFlow adds absolute slack when SOR shows fractional shares but on-chain
 * cumulative differs slightly — e.g. quoted 6.40 vs delta 6). After fill we
 * reload the umbrella page (`PredictionsPage.reloadUmbrellaPageForE2eBalances`) so
 * the row catches chain/API lag before we poll for the delta. This runs for **every**
 * entry in `REQUESTED_VENUES` (not Polymarket-only); DFlow / Predict / others use the
 * same path after `waitForFill()`. **DFlow** uses a longer shares poll cap
 * (`sharesVisiblePollTimeoutMsForVenueKey` in `tradebox.ts`) because positions read
 * on-chain trade history, not a fast venue inventory API.
 *
 * ---------------------------------------------------------------------------
 * Decimals (all venues, including DFlow)
 * ---------------------------------------------------------------------------
 * Share and dollar amounts are whatever the app puts on the DOM: `readLegAttrs` uses
 * `data-leg-num-shares` / price from the SOR leg row, `readQuotedBuyCostUsd` uses
 * `data-cost-usd`, `readQuotedSellReceiveUsd` uses `data-receive-usd`, and positions
 * use `data-qa-shares-count`. They are parsed with `Number(...)` like the rest of the
 * tradebox helpers — there is no separate “DFlow decimal mode” in E2E; correctness
 * depends on the product rendering the same attributes for the selected venue tab.
 *
 * ---------------------------------------------------------------------------
 * Slippage (2% relative)
 * ---------------------------------------------------------------------------
 * - **Buy fill vs quote:** `SHARE_FILL_SLIPPAGE_PCT` (0.02) on `|deltaShares − buyQuotedShares|`
 *   with floor `SHARE_FILL_MIN_ABS`. **DFlow** also applies `DFLOW_SHARE_FILL_QUOTE_EXTRA_ABS_TOLERANCE`
 *   (SOR fractional leg vs on-chain cumulative rounding).
 * - **Sell receive vs header:** `RECEIVE_SLIPPAGE_PCT` (0.02) scales tolerance vs quoted
 *   receive (`receiveTolUsd` in test 4), with floor `RECEIVE_TOLERANCE_MIN_ABS_USD`.
 * - These are separate from `CASH_QUOTE_VS_HEADER_TOLERANCE_USD` (header polling width).
 *
 * ---------------------------------------------------------------------------
 * Sell path console (tests 3–5)
 * ---------------------------------------------------------------------------
 * - **sell.quote** (end of test 3): shares typed for market sell, DOM “Estimated Receive”
 *   USD, market-sell leg price and `data-leg-num-shares`.
 * - **sell.submit** (start of test 4): header Cash immediately before clicking Sell,
 *   plus `cashAfterBuy` (post-buy poll baseline — `waitForHeaderCashAfterSellReceive`
 *   matches `headerCash − cashAfterBuy` to `quotedReceive`).
 * - **sell.settled** (end of test 4): header Cash after receive poll, **impliedReceiveVsPostBuy**
 *   (= what the assertion uses vs quote) and **impliedReceiveVsPreSubmit** (= cash after
 *   minus snapshot right before submit; usually ~0 if no drift between tests).
 * - **roundTrip** (test 5): cash at start of venue block vs after sell poll vs final read.
 *
 * ---------------------------------------------------------------------------
 * Test 5
 * ---------------------------------------------------------------------------
 * Uses one `expectHeaderCashUsd()` after the sell path; header polling was added
 * for tests 2 and 4 first. If test 5 flakes for the same collateral timing, add
 * polling there (see `header-cash.ts` “Limitations”).
 *
 * Config: 5 numbered tests per venue in `describe.serial`. Comment a venue in
 * `REQUESTED_VENUES` to skip. Listed venues must have a live bid/ask in
 * matched-markets + venue-prices or `beforeAll` throws. **LevelUp** runs whenever
 * `resolvePerVenueBestPicks` finds an upcoming row with `exchangeMatching.levelup`
 * and venue-prices returns a live `levelup` snapshot (same gate as other venues).
 *
 * Venues are toggled one at a time while each path is validated in E2E; keep
 * inactive entries commented — the goal is to run all of them in one pass later.
 */
const TRADE_USD = 5;
/** $5 round-trip can lose up to ~$0.50 to spread + fees on the tightest venues. */
const CASH_RECOVERY_TOLERANCE_USD = 0.5;
/**
 * How close header `Cash` must be to the tradebox quoted Cost (buy) and
 * Estimated Receive (sell) after polling. Chosen to absorb rounding, short-lived
 * stale reads, and small fee/quote drift; the important fix is **polling** (see
 * `header-cash.ts`), not this dollar width alone.
 */
const CASH_QUOTE_VS_HEADER_TOLERANCE_USD = 0.6;
/** 2% relative on share fill delta vs quoted leg (`buyQuotedShares`), with floor `SHARE_FILL_MIN_ABS`. */
const SHARE_FILL_SLIPPAGE_PCT = 0.02;
/** Floor so tiny floats / rounding don’t flake on near-zero quotes. */
const SHARE_FILL_MIN_ABS = 0.0005;
/**
 * DFlow/Kalshi only: SOR market-buy leg can show fractional shares (e.g. 6.402 @ 77¢ for $5),
 * while cumulative YES from `useDflowPositions` / on-chain balances may land ~0.4–1 share away
 * from that quote (venue rounding, contract lots, indexer). E2E compares **delta**
 * `(data-qa-shares-count after − before)` to `buyQuotedShares`; `before` already includes any
 * existing position — this constant widens **only** the allowed |delta − quoted| band for dflow.
 */
const DFLOW_SHARE_FILL_QUOTE_EXTRA_ABS_TOLERANCE = 0.75;

function buyShareFillDeltaTolerance(
	venueKey: string,
	buyQuotedShares: number,
): number {
	const relative = SHARE_FILL_SLIPPAGE_PCT * buyQuotedShares;
	const base = Math.max(relative, SHARE_FILL_MIN_ABS);
	if (venueKey === "dflow") {
		return Math.max(base, DFLOW_SHARE_FILL_QUOTE_EXTRA_ABS_TOLERANCE);
	}
	return base;
}
/**
 * Header-implied spend must not exceed quoted DOM Cost by more than this (RPC /
 * stablecoin rounding). Separate from share slippage.
 */
const BUDGET_OVERSPEND_EPS_USD = 0.05;
/** Typed $5 notional cap on spend (`TRADE_USD`), with small epsilon (matches effectiveBuyBudget intent). */
const TRADE_NOTIONAL_CAP_EPS_USD = 0.05;
/**
 * 2% relative on header Cash receive vs quoted Estimated Receive (test 4).
 * Same for all venues.
 */
const RECEIVE_SLIPPAGE_PCT = 0.02;
const RECEIVE_TOLERANCE_MIN_ABS_USD = 0.05;
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
				"REQUESTED_VENUES is empty: uncomment at least one venue in e2e/fixtures/requested-venues.ts.",
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
						REQUESTED_VENUES.map((key) =>
							tradingVenueSlugForKey(key),
						),
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
				const sharesBefore =
					await tradebox.readBuyRowTotalSharesOrZero();
				const buyCostQuoteUsd = await tradebox.readQuotedBuyCostUsd();
				const cashBaselineForBuySpend = await expectHeaderCashUsd(
					sharedSession.page,
				);
				// eslint-disable-next-line no-console -- E2E operator visibility (buy baseline vs venue block)
				console.log(
					`[per-venue-cycle] ${venueKey} buy.submit · headerCash=$${cashBaselineForBuySpend.toFixed(2)} ` +
						`(venueBlockStart=$${cashBeforeUsd.toFixed(2)} — round-trip test 5 only)`,
				);
				await tradebox.submit();
				await tradebox.waitForFill();
				// Full-page reload + venue restore: applies to every REQUESTED_VENUES entry
				// (DFlow, Polymarket, …) so positions row / balances refetch after laggy fills.
				const predictionsPage = new PredictionsPage(sharedSession.page);
				await predictionsPage.reloadUmbrellaPageForE2eBalances();
				await tradebox.selectVenue(tradingVenueSlugForKey(venueKey));
				await tradebox.setSide("buy");
				await tradebox.setPosition("yes");
				const sharesObserved =
					await tradebox.waitForBuySharesIncreaseSince(
						sharesBefore,
						sharesVisiblePollTimeoutMsForVenueKey(venueKey),
					);
				expect(sharesObserved).toBeGreaterThan(0);
				const deltaShares = sharesObserved - sharesBefore;
				const shareTol = buyShareFillDeltaTolerance(
					venueKey,
					buyQuotedShares,
				);
				expect(
					Math.abs(deltaShares - buyQuotedShares),
					`shares mismatch on ${venueKey}: quotedShares(test1)=${buyQuotedShares} @${buyQuotedPriceCents}¢ ` +
						`deltaShares=${deltaShares} (row=${sharesObserved} before=${sharesBefore}) tol=${shareTol}`,
				).toBeLessThanOrEqual(shareTol);
				// Poll header Cash until spend matches quoted Cost — not a one-shot read.
				// See `e2e/helpers/header-cash.ts` and module comment above.
				cashAfterBuy = await waitForHeaderCashAfterBuySpend(
					sharedSession.page,
					cashBaselineForBuySpend,
					buyCostQuoteUsd,
					CASH_QUOTE_VS_HEADER_TOLERANCE_USD,
					postTradeCashMatchTimeoutMsForVenueKey(venueKey),
				);
				const spentUsd = cashBaselineForBuySpend - cashAfterBuy;
				expect(
					spentUsd,
					`buy spend exceeded quoted DOM Cost on ${venueKey}: quotedCost=$${buyCostQuoteUsd.toFixed(4)}`,
				).toBeLessThanOrEqual(
					buyCostQuoteUsd + BUDGET_OVERSPEND_EPS_USD,
				);
				expect(
					spentUsd,
					`buy spend exceeded typed notional TRADE_USD=$${TRADE_USD} on ${venueKey}`,
				).toBeLessThanOrEqual(TRADE_USD + TRADE_NOTIONAL_CAP_EPS_USD);
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
				// eslint-disable-next-line no-console -- E2E operator visibility (sell quote vs later cash)
				console.log(
					`[per-venue-cycle] ${venueKey} sell.quote · sharesToSell=${buyShares} ` +
						`quotedReceiveUsd=$${sellReceiveQuoteUsd.toFixed(4)} ` +
						`marketSell@${leg.priceCents}¢ legNumShares=${leg.numShares}`,
				);
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
				const cashRightBeforeSell = await expectHeaderCashUsd(
					sharedSession.page,
				);
				// eslint-disable-next-line no-console -- E2E operator visibility (cash vs sell submit)
				console.log(
					`[per-venue-cycle] ${venueKey} sell.submit · headerCash=$${cashRightBeforeSell.toFixed(2)} ` +
						`shares=${buyShares} quotedReceiveUsd=$${sellReceiveQuoteUsd.toFixed(4)} ` +
						`(postBuyBaselineCash=$${cashAfterBuy.toFixed(2)} — used by receive poll)`,
				);
				await tradebox.submit();
				await tradebox.waitForFill();
				// Same reload rationale as test 2 — sell-side row clearing after DFlow / any venue.
				const predictionsPage = new PredictionsPage(sharedSession.page);
				await predictionsPage.reloadUmbrellaPageForE2eBalances();
				await tradebox.selectVenue(tradingVenueSlugForKey(venueKey));
				await tradebox.setSide("sell");
				await tradebox.setPosition("yes");
				await tradebox.waitForSharesCleared(
					sharesVisiblePollTimeoutMsForVenueKey(venueKey),
				);
				const receiveTolUsd = Math.max(
					RECEIVE_TOLERANCE_MIN_ABS_USD,
					RECEIVE_SLIPPAGE_PCT * sellReceiveQuoteUsd,
				);
				// Same polling rationale as buy: sell proceeds hit header Cash when
				// collateral refetch reflects wallet state.
				cashAfterSell = await waitForHeaderCashAfterSellReceive(
					sharedSession.page,
					cashAfterBuy,
					sellReceiveQuoteUsd,
					receiveTolUsd,
					postTradeCashMatchTimeoutMsForVenueKey(venueKey),
				);
				const impliedReceiveVsPostBuy = cashAfterSell - cashAfterBuy;
				const impliedReceiveVsPreSubmit =
					cashAfterSell - cashRightBeforeSell;
				// eslint-disable-next-line no-console -- E2E operator visibility (actual $ in vs quote)
				console.log(
					`[per-venue-cycle] ${venueKey} sell.settled · headerCash=$${cashAfterSell.toFixed(2)} ` +
						`impliedReceiveVsPostBuy=$${impliedReceiveVsPostBuy.toFixed(4)} (matches poll vs quotedReceive) ` +
						`impliedReceiveVsPreSubmit=$${impliedReceiveVsPreSubmit.toFixed(4)} ` +
						`quotedReceive=$${sellReceiveQuoteUsd.toFixed(4)} tolUsd=$${receiveTolUsd.toFixed(4)}`,
				);
			});

			test("5) cash.recovered: header Cash within tolerance of pre-buy", async () => {
				if (sharedSession === null) {
					throw new Error("sharedSession not initialized");
				}
				// Single read: tests 2/4 already used polling. If this flakes, see
				// `header-cash.ts` “Limitations / follow-ups”.
				const cashAfter = await expectHeaderCashUsd(sharedSession.page);
				const drop = cashBeforeUsd - cashAfter;
				// eslint-disable-next-line no-console -- E2E round-trip summary (venue block start vs end)
				console.log(
					`[per-venue-cycle] ${venueKey} roundTrip · cashStartOfVenueBlock=$${cashBeforeUsd.toFixed(2)} ` +
						`cashAfterSellPoll=$${cashAfterSell.toFixed(2)} cashFinalRead=$${cashAfter.toFixed(2)} ` +
						`deltaVsVenueStart=$${(cashAfter - cashBeforeUsd).toFixed(2)} (drop=$${drop.toFixed(2)} tol=$${CASH_RECOVERY_TOLERANCE_USD.toFixed(2)})`,
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
