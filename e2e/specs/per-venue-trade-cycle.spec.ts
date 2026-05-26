import { test as base, expect } from "@playwright/test";
import {
	openAuthenticatedSession,
	type AuthenticatedSession,
} from "../fixtures/authenticated-page";
import {
	resolvePerVenueBestPicks,
	partitionRequestedVenuePicks,
	tradingVenueSlugForKey,
	E2E_TRADE_NOTIONAL_USD,
	type PerVenueBestPick,
} from "../fixtures/matched-market";
import { evaluateVenueLiquidityBeforeTrade } from "../fixtures/e2e-venue-liquidity-at-test";
import { REQUESTED_VENUES } from "../fixtures/requested-venues";
import { fundingPrecheck } from "../fixtures/funding-precheck";
import { cleanupOpenPositions } from "../fixtures/cleanup";
import { PredictionsPage } from "../page-objects/predictions-page";
import {
	Tradebox,
	sharesVisiblePollTimeoutMsForVenueKey,
	buyRowBaselineSettleTimeoutMsForVenueKey,
	MARKET_SELL_LEG_TIMEOUT_MS,
	POLYMARKET_SELL_SUBMIT_ENABLED_TIMEOUT_MS,
	sellShareAmountTextRoundedDownLikeUi,
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
 * Cost ~$2 vs header implying ~$0 spend until refetch completed).
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
 * tab). While `positionSharesRefreshing` is true, the row can still expose
 * `data-qa-shares-count={0}` (empty `buyLines`) — call `waitForBuyRowBaselineSettled`
 * before reading `sharesBefore` so an existing Limitless YES bag is not mistaken
 * for zero. `buyQuotedShares` from test 1 is the Details leg (`data-leg-num-shares`)
 * at quote time (gross SOR `leg.shares` for most venues; **Predict.fun market buy**
 * uses **net-held** shares when fee bps is loaded — same basis as post-fill row delta).
 * **Kalshi/DFlow market buy:** when the debounced SOR route Pond overlay matches typed USD,
 * that attribute follows the quote’s contracts (matches post-fill `outAmount`); otherwise
 * the SOR leg. We take `readBuyRowTotalSharesOrZero()` **before** submit (`sharesBefore`)
 * and compare **delta** = after − before to `buyQuotedShares` using `buyShareFillDeltaTolerance`
 * (2% + floor; predictFun/limitless use a slightly wider relative band; DFlow still carries
 * `DFLOW_SHARE_FILL_QUOTE_EXTRA_ABS_TOLERANCE` for fractional vs cumulative row quirks). After fill we keep the
 * SPA session open (no reload) and let `waitForBuySharesIncreaseSince` poll the row
 * until chain/API lag catches up. This runs for **every** entry in `REQUESTED_VENUES`
 * (not Polymarket-only); DFlow / Predict / others use the same path after
 * `waitForFill()`. **DFlow** uses a longer shares poll cap
 * (`sharesVisiblePollTimeoutMsForVenueKey` in `tradebox.ts`) because positions read
 * on-chain trade history, not a fast venue inventory API.
 *
 * ---------------------------------------------------------------------------
 * Decimals (all venues, including DFlow)
 * ---------------------------------------------------------------------------
 * Share and dollar amounts are whatever the app puts on the DOM: `readLegAttrs` uses
 * `data-leg-num-shares` / price from the open smart-routing drawer leg row (same
 * numbers as the visible “X shares @ avg …” line; Predict.fun market buy uses
 * net-held when fee bps is known), `readQuotedBuyCostUsd` uses `data-cost-usd`
 * on the drawer Total Cost row, and positions use `data-qa-shares-count`. Sell
 * receive assertions use the visible venue row value-btn (`readVenueRowSellReceiveUsd`).
 * For **sell input**, the spec types
 * `sellShareAmountTextRoundedDownLikeUi` (same rule as sell `formatShareCountDataQa` /
 * `data-qa-shares-count`: floor to 2 dp, always two fractional digits) so automation
 * does not type a value above scoped max when the attribute still carries extra fractional precision.
 *
 * ---------------------------------------------------------------------------
 * Slippage (buy: 2% baseline; venue-specific widenings)
 * ---------------------------------------------------------------------------
 * - **Buy fill vs quote:** `SHARE_FILL_SLIPPAGE_PCT` (0.02) on `|deltaShares − buyQuotedShares|`
 *   with floor `SHARE_FILL_MIN_ABS`. **predictFun / limitless** use a slightly higher relative cap;
 *   **DFlow** also applies `DFLOW_SHARE_FILL_QUOTE_EXTRA_ABS_TOLERANCE` (integer / cumulative quirks).
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
 * `REQUESTED_VENUES` to omit it. If a venue has no matched-markets row with a live
 * `venue-prices` book for that venue, that venue block is skipped (logged). Immediately before each
 * venue block, `evaluateVenueLiquidityBeforeTrade` GETs **fresh** `/venue-prices` for
 * that panda only and skips if best-case round-trip loss on `E2E_TRADE_NOTIONAL_USD`
 * exceeds the live threshold, or (no ladders) if top-of-book spread is too wide.
 * `resolvePerVenueBestPicks` finds an upcoming row with `exchangeMatching.levelup`
 * and venue-prices returns a live `levelup` snapshot (same gate as other venues).
 *
 * Venues are toggled one at a time while each path is validated in E2E; keep
 * inactive entries commented — the goal is to run all of them in one pass later.
 */
const TRADE_USD = E2E_TRADE_NOTIONAL_USD;
/** Small-$ round-trip can lose to spread + fees; keep slack for header vs quote drift. */
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
 * DFlow/Kalshi only: SOR market-buy leg can show fractional shares (e.g. 6.402 @ 77¢ for small notional),
 * while cumulative YES from `useDflowPositions` / on-chain balances may land ~0.4–1 share away
 * from that quote (venue rounding, contract lots, indexer). E2E compares **delta**
 * `(data-qa-shares-count after − before)` to `buyQuotedShares`; `before` already includes any
 * existing position — this constant widens **only** the allowed |delta − quoted| band for dflow.
 */
const DFLOW_SHARE_FILL_QUOTE_EXTRA_ABS_TOLERANCE = 1.25;
/**
 * Predict.fun / Limitless: quoted leg vs post-fill cumulative row can exceed 2% on
 * small notionals (fees, book walk, venue rounding).
 */
const SHARE_FILL_SLIPPAGE_PREDICT_OR_LIMITLESS_PCT = 0.038;

function buyShareFillDeltaTolerance(venueKey: string, buyQuotedShares: number): number {
	const relative = SHARE_FILL_SLIPPAGE_PCT * buyQuotedShares;
	const base = Math.max(relative, SHARE_FILL_MIN_ABS);
	if (venueKey === "dflow") {
		return Math.max(base, DFLOW_SHARE_FILL_QUOTE_EXTRA_ABS_TOLERANCE);
	}
	if (venueKey === "predictFun" || venueKey === "limitless") {
		const wider = SHARE_FILL_SLIPPAGE_PREDICT_OR_LIMITLESS_PCT * buyQuotedShares;
		return Math.max(base, wider);
	}
	return base;
}
/**
 * Header-implied spend must not exceed quoted DOM Cost by more than this (RPC /
 * stablecoin rounding). Separate from share slippage.
 */
const BUDGET_OVERSPEND_EPS_USD = 0.05;
/** Typed notional cap on spend (`TRADE_USD`), with small epsilon (matches effectiveBuyBudget intent). */
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
			console.warn(
				"[per-venue-cycle] No per-venue picks (no live bid/ask on any canonical venue row) — all venue blocks will skip.",
			);
		}
		const { withBook, missingBook } = partitionRequestedVenuePicks(REQUESTED_VENUES, picks);
		if (missingBook.length > 0) {
			console.warn(
				`[per-venue-cycle] No matched-markets row with a live venue-prices book for: ${missingBook.join(", ")}. ` +
					`Browser tests will be skipped for those venues. Venues with picks: ${withBook.map((p) => p.venueKey).join(", ") || "(none)"}.`,
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
			/** Shares typed for market sell (test 3) — floored like UI; persists for submit in test 4. */
			let sellOrderShares = 0;

			test.beforeAll(async ({}, testInfo) => {
				if (sharedSession === null) {
					throw new Error("sharedSession not initialized");
				}
				if (allPicks === null) {
					throw new Error("allPicks not initialized");
				}
				const found = allPicks.find((p) => p.venueKey === venueKey);
				if (found === undefined) {
					console.warn(
						`[per-venue-cycle] No PerVenueBestPick for "${venueKey}" (no upcoming row with that venue + live bid/ask) — skipping venue block.`,
					);
					testInfo.skip(true, `no PerVenueBestPick for ${venueKey}`);
					return;
				}
				const gate = await evaluateVenueLiquidityBeforeTrade({
					venueKey,
					pandaMatchId: found.pandaMatchId,
					spreadAtPickTime: found.spread,
				});
				if (gate.skip) {
					console.warn(gate.warning);
					testInfo.skip(true, gate.reason);
					return;
				}
				pick = found;
				const predictions = new PredictionsPage(sharedSession.page);
				const tradebox = new Tradebox(sharedSession.page);
				await predictions.openUmbrellaTradingPageById(found.umbrellaId);
				await tradebox.waitVisible();
				// The inline trade dock keeps the same `PredictionMarketTradeBox`
				// instance mounted across umbrella switches (see
				// `PredictionsPage.openUmbrellaTradingPageById`), so internal
				// `coreState.side` survives. After the prior venue's test 4 it is
				// "sell"; on a venue with 0 held shares that triggers
				// `sellFieldsLocked` and disables the amount input the moment the
				// per-venue `balanceOf` query resolves to 0. Force "buy" before
				// `selectVenue()` (which itself primes the SOR row via
				// `setAmount`) so the input is always editable here.
				await tradebox.setSide("buy");
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
					throw new Error(`buyQuotedShares not set for ${venueKey}; test 1 must succeed first`);
				}
				const tradebox = new Tradebox(sharedSession.page);
				await tradebox.waitForBuyRowBaselineSettled(
					buyRowBaselineSettleTimeoutMsForVenueKey(venueKey),
				);
				const sharesBefore = await tradebox.readBuyRowTotalSharesOrZero();
				const buyCostQuoteUsd = await tradebox.readQuotedBuyCostUsd();
				const cashBaselineForBuySpend = await expectHeaderCashUsd(sharedSession.page);

				console.log(
					`[per-venue-cycle] ${venueKey} buy.submit · headerCash=$${cashBaselineForBuySpend.toFixed(2)} ` +
						`(venueBlockStart=$${cashBeforeUsd.toFixed(2)} — round-trip test 5 only)`,
				);
				await tradebox.submit();
				await tradebox.waitForFill();
				// Stay on the same venue — do **not** call `selectVenue` here: when the
				// smart-routing surface is briefly hidden post-fill, it would prime SOR
				// with $2 (looks like a second tiny buy) and leave junk in the amount
				// field before sell. Re-assert side/outcome only.
				await tradebox.setSide("buy");
				await tradebox.setPosition("yes");
				const sharesObserved = await tradebox.waitForBuySharesIncreaseSince(
					sharesBefore,
					sharesVisiblePollTimeoutMsForVenueKey(venueKey),
				);
				expect(sharesObserved).toBeGreaterThan(0);
				const deltaShares = sharesObserved - sharesBefore;
				const shareTol = buyShareFillDeltaTolerance(venueKey, buyQuotedShares);
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
				).toBeLessThanOrEqual(buyCostQuoteUsd + BUDGET_OVERSPEND_EPS_USD);
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
					throw new Error(`buyShares not set for ${venueKey}; test 2 must succeed before test 3`);
				}
				// Test 3: quote only — enables Trade + reads SOR leg for the typed sell size.
				// It does NOT call `submit()`. Test 4 runs the actual market sell.
				const tradebox = new Tradebox(sharedSession.page);
				const headlineTol = buyShareFillDeltaTolerance(venueKey, buyQuotedShares);
				if (venueKey === "polymarket") {
					await tradebox.waitForBuyHeadlineSharesNear(buyShares, Math.max(headlineTol, 0.02));
				}
				await tradebox.setSide("sell");
				await tradebox.setPosition("yes");
				const amountUnlockTimeoutMs =
					venueKey === "polymarket"
						? POLYMARKET_SELL_SUBMIT_ENABLED_TIMEOUT_MS
						: MARKET_SELL_LEG_TIMEOUT_MS;
				await tradebox.waitForAmountInputEnabled(amountUnlockTimeoutMs);
				// After `setSide("sell")`, buy-headline nodes unmount — read the sell
				// row `data-qa-shares-count` (same value SOR surfaces as "selling X").
				await new Promise((r) => setTimeout(r, venueKey === "polymarket" ? 450 : 250));
				const sharesFromSellRow = await tradebox.readSellRowSharesCountAttribute();
				const rawSellCap =
					sharesFromSellRow !== null && sharesFromSellRow.trim() !== ""
						? Number(sharesFromSellRow)
						: buyShares;
				if (!Number.isFinite(rawSellCap) || rawSellCap <= 0) {
					throw new Error(
						`invalid sell cap for ${venueKey}: sellRow=${JSON.stringify(sharesFromSellRow)} buyShares=${buyShares}`,
					);
				}
				const amountText = sellShareAmountTextRoundedDownLikeUi(rawSellCap);
				const sellParseTarget = Number.parseFloat(amountText.replace(/[$,\s]/g, ""));
				if (!Number.isFinite(sellParseTarget) || sellParseTarget <= 0) {
					throw new Error(
						`floored sell amount unusable for ${venueKey}: raw=${rawSellCap} text=${JSON.stringify(amountText)}`,
					);
				}
				await tradebox.setSellShareAmountVerified(
					sellParseTarget,
					Math.max(headlineTol, 0.02),
					amountText,
				);
				sellOrderShares = sellParseTarget;
				const sellSubmitTimeoutMs =
					venueKey === "polymarket"
						? POLYMARKET_SELL_SUBMIT_ENABLED_TIMEOUT_MS
						: MARKET_SELL_LEG_TIMEOUT_MS;
				await tradebox.expectSubmitEnabled(sellSubmitTimeoutMs);
				// Sell-side reads come from the visible smart-routing-row preview
				// (`SmartRoutingSection.tsx`), not the drawer `[data-qa="sor-leg"]`
				// row — that only mounts when the chevron is open and
				// `executionRoute` overlay is present; on Polymarket sells right
				// after a buy fill the targeted execution channel can lag
				// (`venuePositions` empty in `useSorRoute.ts`) while the omnibus
				// display channel already populates the row.
				const venueSlug = tradingVenueSlugForKey(venueKey);
				const priceCents = await tradebox.readVenueRowAvgCents(venueSlug, sellSubmitTimeoutMs);
				expect(
					priceCents,
					`market-sell smart-routing-row priceCents must be >0 for ${venueKey}`,
				).toBeGreaterThan(0);
				expect(
					priceCents,
					`market-sell smart-routing-row priceCents must be <100 for ${venueKey}`,
				).toBeLessThan(100);
				sellReceiveQuoteUsd = await tradebox.readVenueRowSellReceiveUsd(
					venueSlug,
					sellSubmitTimeoutMs,
				);

				console.log(
					`[per-venue-cycle] ${venueKey} sell.quote · sharesToSell=${sellOrderShares} ` +
						`(postBuyRow≈${buyShares}) ` +
						`quotedReceiveUsd=$${sellReceiveQuoteUsd.toFixed(4)} (from smart-routing-row preview) ` +
						`marketSell@${priceCents}¢`,
				);
			});

			test("4) sell.shares-clear: MyPositionsRow reports 0 shares", async () => {
				if (sharedSession === null) {
					throw new Error("sharedSession not initialized");
				}
				if (sellReceiveQuoteUsd <= 0) {
					throw new Error(`sellReceiveQuoteUsd not set for ${venueKey}; test 3 must succeed first`);
				}
				const tradebox = new Tradebox(sharedSession.page);
				const cashRightBeforeSell = await expectHeaderCashUsd(sharedSession.page);

				console.log(
					`[per-venue-cycle] ${venueKey} sell.submit · headerCash=$${cashRightBeforeSell.toFixed(2)} ` +
						`shares=${sellOrderShares} quotedReceiveUsd=$${sellReceiveQuoteUsd.toFixed(4)} ` +
						`(postBuyBaselineCash=$${cashAfterBuy.toFixed(2)} — used by receive poll)`,
				);
				await tradebox.submit();
				await tradebox.waitForFill();
				// Stay on the post-submit tradebox (same as after buy in test 2). Re-calling
				// `selectVenue` here often leaves SOR hidden for >30s with `allowPrime: false`
				// and does not help shares clear — poll the positions row in place.
				await tradebox.waitForSharesCleared(sharesVisiblePollTimeoutMsForVenueKey(venueKey));
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
				const impliedReceiveVsPreSubmit = cashAfterSell - cashRightBeforeSell;

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
				).toBeGreaterThanOrEqual(cashBeforeUsd - CASH_RECOVERY_TOLERANCE_USD);
			});
		});
	}
});
