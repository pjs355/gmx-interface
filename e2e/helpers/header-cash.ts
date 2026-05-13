/**
 * Header Cash helpers for Predict / LevelUp Playwright E2E.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS (post-trade reads were flaky)
 * ---------------------------------------------------------------------------
 * The trade cycle spec asserts that header “Cash” moves consistently with the
 * tradebox quoted Cost (buy) and Estimated Receive (sell). For a while we used
 * a single `expectHeaderCashUsd()` immediately after `waitForBuyShares()`. That
 * failed in practice with logs like: quoted Cost ~$5, header-implied spend ~$0.02
 * (cash barely moved), while manual wallet checks showed ~$5 spent once collateral
 * caught up.
 *
 * Root cause (verified against app source):
 * - Header Cash comes from `CollateralTokenContext` → summed stable balances in
 *   `PortfolioContext` → `AppHeaderUser` renders `data-qa-cash-amount`.
 * - `PortfolioContext` sets `cashLoading = Boolean(account) && !collateral.isFetched`.
 *   So “loading” only applies until the collateral query has succeeded once — NOT
 *   on every background refetch. During refetch after a trade, TanStack Query keeps
 *   showing the previous cached totals until `queryFn` returns; the DOM attribute
 *   can remain present with a stale number.
 * - `waitForBuyShares()` only waits on `[data-qa="my-positions-row"]` / venue
 *   position data — a different pipeline than collateral RPC refetch.
 * - After a successful SOR execution, `PredictionMarketTradeBox` invalidates
 *   position queries AND collateral (`COLLATERAL_TOKENS_QUERY_KEY`) and calls
 *   `collateralTokens.refetch()`; those completes can reorder vs the positions row.
 *
 * Polling until `(baselineCashUsd − headerCash)` matches the quoted Cost within tolerance
 * waits for collateral to align instead of snapshotting too early.
 *
 * ---------------------------------------------------------------------------
 * WHAT WE DID
 * ---------------------------------------------------------------------------
 * - `waitForHeaderCashAfterBuySpend`: poll `readHeaderCashUsd` until
 *   `|spent − quotedCost| <= tolerance` where `spent = baselineCash − current`.
 * - `waitForHeaderCashAfterSellReceive`: poll until header cash gain since
 *   post-buy baseline matches quoted receive within tolerance.
 * - Keep `expectHeaderCashUsd` for first-load / baseline reads where we only need
 *   “a settled number exists”, not “post-trade refetch finished”.
 *
 * ---------------------------------------------------------------------------
 * LIMITATIONS / FOLLOW-UPS (not guessed — explicit gaps)
 * ---------------------------------------------------------------------------
 * - Test 5 round-trip recovery still uses a single `expectHeaderCashUsd`; if that
 *   flakes for the same collateral lag, apply polling there too.
 * - If `MyPositionsRow` reports cumulative shares across lines, comparing row
 *   total to per-fill leg shares can fail when the user already had size; that is
 *   separate from header cash and lives in the trade-cycle spec.
 */

import { type Page, expect } from "@playwright/test";

/** How often we re-read header Cash while waiting for collateral after a trade. */
const POST_TRADE_CASH_POLL_MS = 400;
/**
 * Max wait for header Cash to match quoted leg amounts after a fill.
 * Collateral reads multiple chains in `readFundingStableBalancesHuman`; can exceed
 * a few seconds in CI or slow RPC.
 */
const POST_TRADE_CASH_MATCH_TIMEOUT_MS = 45_000;
/** DFlow / Kalshi: same SOR fill still hits Solana + multi-chain collateral refetch — often slower than EVM-only venues. */
const POST_TRADE_CASH_MATCH_TIMEOUT_DFLOW_MS = 180_000;

export function postTradeCashMatchTimeoutMsForVenueKey(venueKey: string): number {
	return venueKey === "dflow"
		? POST_TRADE_CASH_MATCH_TIMEOUT_DFLOW_MS
		: POST_TRADE_CASH_MATCH_TIMEOUT_MS;
}

/**
 * Read the live USD value from the header `data-qa="header-cash"` element.
 *
 * Prefers the numeric `data-qa-cash-amount` attribute (set in `AppHeaderUser.tsx`)
 * because it does not depend on locale formatting. Falls back to the rendered text
 * (`$1,234.56`) only if the attribute is missing or empty (e.g. early hydration).
 *
 * Returns `null` when the element is not yet visible or no number can be parsed.
 * Throwing is left to callers that want strict semantics.
 */
export async function readHeaderCashUsd(page: Page): Promise<number | null> {
	const cashBox = page.locator('[data-qa="header-cash"]').first();
	const visible = await cashBox.isVisible().catch(() => false);
	if (!visible) {
		return null;
	}
	// Logic must live entirely inside this callback — it runs in the browser, not in Node.
	return cashBox.evaluate((el) => {
		const attr = el.getAttribute("data-qa-cash-amount");
		if (attr !== null && attr.trim() !== "") {
			const fromAttr = Number(attr);
			if (Number.isFinite(fromAttr) && fromAttr >= 0) {
				return fromAttr;
			}
		}
		if (!(el instanceof HTMLElement)) {
			return null;
		}
		const text = el.innerText ?? "";
		const re = /\$([\d,]+(?:\.\d{1,2})?)/g;
		let last: string | null = null;
		for (;;) {
			const m = re.exec(text);
			if (m === null) {
				break;
			}
			last = m[1];
		}
		if (last === null) {
			return null;
		}
		const fromText = Number(last.replace(/,/g, ""));
		return Number.isFinite(fromText) && fromText >= 0 ? fromText : null;
	});
}

/**
 * Strict variant: throws if `[data-qa="header-cash"]` is not visible after `timeoutMs`
 * or the rendered value is unreadable. Use this when the test must have a number.
 *
 * Waits for `data-qa-cash-amount` to be attached. That attribute is omitted while
 * `cashLoading` is true in `PortfolioContext`, which is tied to the collateral
 * query not having completed **once** yet (`!collateral.isFetched`). After the first
 * successful fetch, the attribute generally stays attached during background
 * refetches, but the **numeric value** can still be stale until the refetch returns.
 * Therefore this function guarantees “collateral has hydrated at least once” and
 * “we parsed a number”, not “post-trade balance is final”. After trades, use
 * {@link waitForHeaderCashAfterBuySpend} / {@link waitForHeaderCashAfterSellReceive}.
 */
export async function expectHeaderCashUsd(
	page: Page,
	timeoutMs = 30_000,
): Promise<number> {
	const cashBox = page.locator('[data-qa="header-cash"]').first();
	await expect(
		cashBox,
		"header-cash element not found; user may not be logged in",
	).toBeVisible({ timeout: timeoutMs });
	const cashAttr = page
		.locator('[data-qa="header-cash"][data-qa-cash-amount]')
		.first();
	await expect(
		cashAttr,
		"header-cash never wrote data-qa-cash-amount within timeout — collateral query did not settle",
	).toBeAttached({ timeout: timeoutMs });
	const v = await readHeaderCashUsd(page);
	if (v === null) {
		throw new Error(
			"expectHeaderCashUsd: header-cash visible but data-qa-cash-amount and rendered text both unreadable",
		);
	}
	return v;
}

/**
 * After a buy fill: poll until header Cash implies spend matches the tradebox Cost.
 *
 * `baselineCashUsd` must be header Cash **immediately before** the buy was submitted
 * (same moment you would snapshot for a manual check). Do not use a stale value from
 * an earlier navigation or `beforeAll` — collateral can still show a pre-trade total
 * until refetch completes, and DFlow/Kalshi legs can lag EVM-only venues.
 *
 * Condition:
 *   `spentUsd = baselineCashUsd − headerCash`
 *   pass when `|spentUsd − quotedCostUsd| <= toleranceUsd`.
 *
 * Returns the header Cash value (`number`) at the first poll step that satisfies
 * the condition (not necessarily “stable forever” — good enough for assertions).
 *
 * On timeout, throws with last observed Cash so failures are diagnosable.
 */
export async function waitForHeaderCashAfterBuySpend(
	page: Page,
	baselineCashUsd: number,
	quotedCostUsd: number,
	toleranceUsd: number,
	timeoutMs: number = POST_TRADE_CASH_MATCH_TIMEOUT_MS,
): Promise<number> {
	const start = Date.now();
	let lastSeen: number | null = null;
	while (Date.now() - start < timeoutMs) {
		const v = await readHeaderCashUsd(page);
		if (v !== null) {
			lastSeen = v;
			const spentUsd = baselineCashUsd - v;
			if (
				Math.abs(spentUsd - quotedCostUsd) <= toleranceUsd
			) {
				return v;
			}
		}
		await new Promise((r) => setTimeout(r, POST_TRADE_CASH_POLL_MS));
	}
	throw new Error(
		`waitForHeaderCashAfterBuySpend: timeout ${timeoutMs}ms — baselineCash=${baselineCashUsd.toFixed(4)} ` +
			`quotedCost=${quotedCostUsd.toFixed(4)} tol=${toleranceUsd} ` +
			`lastCash=${lastSeen !== null ? lastSeen.toFixed(4) : "null"}`,
	);
}

/**
 * After a sell fill: poll until `(headerCash − cashAfterBuyUsd)` matches quoted
 * Estimated Receive within tolerance.
 *
 * `cashAfterBuyUsd` must be the value recorded after buy (from
 * `waitForHeaderCashAfterBuySpend`), so sell “receive” is consistent with the
 * same header Cash pipeline.
 */
export async function waitForHeaderCashAfterSellReceive(
	page: Page,
	cashAfterBuyUsd: number,
	quotedReceiveUsd: number,
	toleranceUsd: number,
	timeoutMs: number = POST_TRADE_CASH_MATCH_TIMEOUT_MS,
): Promise<number> {
	const start = Date.now();
	let lastSeen: number | null = null;
	while (Date.now() - start < timeoutMs) {
		const v = await readHeaderCashUsd(page);
		if (v !== null) {
			lastSeen = v;
			const receivedUsd = v - cashAfterBuyUsd;
			if (
				Math.abs(receivedUsd - quotedReceiveUsd) <= toleranceUsd
			) {
				return v;
			}
		}
		await new Promise((r) => setTimeout(r, POST_TRADE_CASH_POLL_MS));
	}
	throw new Error(
		`waitForHeaderCashAfterSellReceive: timeout ${timeoutMs}ms — cashAfterBuy=${cashAfterBuyUsd.toFixed(4)} ` +
			`quotedReceive=${quotedReceiveUsd.toFixed(4)} tol=${toleranceUsd} ` +
			`lastCash=${lastSeen !== null ? lastSeen.toFixed(4) : "null"}`,
	);
}
