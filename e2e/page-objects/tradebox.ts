import { type Locator, type Page, expect } from "@playwright/test";

/**
 * `MarketPanels.tsx` mounts a tradebox in desktop `.right-panel` and another in
 * `.mobile-trading-container`. Both stay in the DOM; CSS toggles layouts per
 * `PredictionMarket.scss` (@media max-width 1100px vs min-width 1101px).
 */
const PREDICTION_MARKET_LAYOUT_BREAKPOINT_PX = 1100;

/** Resolves to exactly one `.prediction-market-tradebox` for the current viewport width. */
export function tradeboxRootLocator(page: Page): Locator {
	const w =
		page.viewportSize()?.width ??
		PREDICTION_MARKET_LAYOUT_BREAKPOINT_PX + 1;
	if (w <= PREDICTION_MARKET_LAYOUT_BREAKPOINT_PX) {
		return page.locator(
			".mobile-trading-container .prediction-market-tradebox",
		);
	}
	return page.locator(".right-panel .prediction-market-tradebox");
}

export type TradingVenue =
	| "all"
	| "levelup"
	| "polymarket"
	| "predictfun"
	| "dflow"
	| "limitless";
export type Side = "buy" | "sell";
export type Position = "yes" | "no";

const FILL_TIMEOUT_MS = 120_000;
const SETTLE_AFTER_FILL_MS = 5_000;
/** Slow down automation so React / SOR can keep up with real user timing. */
const BETWEEN_TRADEBOX_ACTIONS_MS = 200;

/** SOR route + price quote should arrive after a valid trade amount is typed. */
const QUOTE_READY_TIMEOUT_MS = 30_000;
/**
 * Default buy-side USD typed by `selectVenue` when smart routing rows are not
 * mounted yet (`SmartRoutingSection` gates on previews / loading). Uses $2 to match
 * `E2E_TRADE_NOTIONAL_USD` in per-venue specs (must stay ≥ `SOR_MIN_MARKET_BUY_USD`) so
 * subsequent `setAmount(TRADE_USD)` calls don't trigger an extra SOR refetch / auto-select.
 */
const SELECT_VENUE_PRIME_AMOUNT_USD = 2;
/** How long to wait for a venue surface to mount after priming SOR. */
const SELECT_VENUE_SURFACE_TIMEOUT_MS = 30_000;
/**
 * Single-venue Details row `[data-qa="sor-leg"][data-leg-side="market-sell"]` only mounts
 * when `sellAvgCents` is non-null (`PredictionMarketTradeBoxUI.tsx`). That can lag
 * `expectSubmitEnabled()` — especially Polymarket/Polygon after a fill — so do not use
 * the same 30s cap as buy legs. This is independent of header Cash polling
 * (`e2e/helpers/header-cash.ts`).
 */
/** Sell-side SOR quote + leg row can lag Polymarket/Polygon after a fill — use for `expectSubmitEnabled` on sells. */
export const MARKET_SELL_LEG_TIMEOUT_MS = 90_000;
/** Polymarket-only: submit often stays disabled until ~90s even after headline shares settle. */
export const POLYMARKET_SELL_SUBMIT_ENABLED_TIMEOUT_MS = 120_000;
/** Poll until amount field has a value and Trade is enabled, then click. */
const SUBMIT_READY_TIMEOUT_MS = 60_000;
const SUBMIT_POLL_MS = 150;
/** Buy fill → /predict (or other) positions API → React Query refetch can take seconds. */
const SHARES_VISIBLE_TIMEOUT_MS = 60_000;
/**
 * Polymarket/Polygon + CLOB inventory: cumulative shares in `MyPositionsRow` and the
 * per-line headline often land 20–30s after fill; 60s was too tight for predeploy.
 */
const SHARES_VISIBLE_TIMEOUT_POLYMARKET_MS = 120_000;
/**
 * DFlow positions come from on-chain trade history (`/api/dflow/onchain-trades`), not a
 * fast REST inventory — indexing / RPC lag after a fill routinely exceeds other venues.
 * E2E: use this for `waitForBuyShares*` / `waitForSharesCleared` when `venueKey === "dflow"`.
 */
export const SHARES_VISIBLE_TIMEOUT_DFLOW_MS = 180_000;
/**
 * Limitless: positions row can lag after fill while `LIMITLESS_QUERY_ROOT` refetches;
 * same class of flake as Polymarket (hard refresh shows shares before SPA catches up).
 */
const SHARES_VISIBLE_TIMEOUT_LIMITLESS_MS = 120_000;

/** Longer share-row polling for Kalshi/DFlow on-chain lag; other venues use 60s (`SHARES_VISIBLE_TIMEOUT_MS`). */
export function sharesVisiblePollTimeoutMsForVenueKey(
	venueKey: string,
): number {
	if (venueKey === "dflow") return SHARES_VISIBLE_TIMEOUT_DFLOW_MS;
	if (venueKey === "polymarket") return SHARES_VISIBLE_TIMEOUT_POLYMARKET_MS;
	if (venueKey === "limitless") return SHARES_VISIBLE_TIMEOUT_LIMITLESS_MS;
	return SHARES_VISIBLE_TIMEOUT_MS;
}

/**
 * Before reading `sharesBefore` for a market buy, wait for `MyPositionsRow` to leave
 * `data-qa-position-refreshing="true"` when the buy row is visible. Limitless (and
 * other REST-backed venues) can mount the row with `buyLines=[]` while refreshing,
 * so `data-qa-shares-count` is 0 even when the wallet already holds YES — a bogus
 * baseline makes `waitForBuySharesIncreaseSince` / delta-vs-quote assertions lie.
 */
export function buyRowBaselineSettleTimeoutMsForVenueKey(
	venueKey: string,
): number {
	if (venueKey === "limitless") return 90_000;
	if (venueKey === "dflow") return 60_000;
	if (venueKey === "polymarket") return 45_000;
	if (venueKey === "predictFun") return 45_000;
	return 25_000;
}
const SHARES_POLL_MS = 500;

export type LegSide = "limit" | "market-buy" | "market-sell";
export interface LegAttrs {
	venue: string;
	numShares: number;
	priceCents: number;
}

function sleepBetweenTradeboxActions(): Promise<void> {
	return new Promise((r) => setTimeout(r, BETWEEN_TRADEBOX_ACTIONS_MS));
}

function parseTradeboxAmountInput(raw: string): number {
	const n = Number.parseFloat(String(raw).replace(/[$,\s]/g, ""));
	return Number.isFinite(n) ? n : 0;
}

/**
 * Truncate toward zero at 2 decimal places (never round up). Matches
 * `formatShareCountDataQa` / sell `data-qa-shares-count` — always two fractional
 * digits (`20` → `"20.00"`) so the typed amount matches the DOM cap.
 */
export function sellShareAmountTextRoundedDownLikeUi(n: number): string {
	if (!Number.isFinite(n) || n < 0) {
		return String(n);
	}
	const hundredths = Math.floor(n * 100 + 1e-9);
	const whole = Math.trunc(hundredths / 100);
	const frac = hundredths % 100;
	return `${whole}.${frac.toString().padStart(2, "0")}`;
}

/** Logs real DOM from the resolved node (Playwright `Locator` is not loggable as HTML). */
async function logTradeboxDomSnapshot(
	label: string,
	locator: Locator,
): Promise<void> {
	const info = await locator
		.evaluate((el) => ({
			tag: el.tagName,
			disabled:
				el instanceof HTMLButtonElement ||
				el instanceof HTMLInputElement
					? el.disabled
					: null,
			ariaDisabled: el.getAttribute("aria-disabled"),
			text: (el as HTMLElement).innerText?.trim().slice(0, 200) ?? "",
			outerHTML: el.outerHTML.slice(0, 600),
		}))
		.catch((e: unknown) => ({ evaluateError: String(e) }));
	console.warn(`[e2e tradebox] ${label}`, JSON.stringify(info, null, 2));
}

export class Tradebox {
	private readonly root: Locator;

	constructor(private readonly page: Page) {
		this.root = tradeboxRootLocator(page);
	}

	async waitVisible(): Promise<void> {
		await this.root.waitFor({ state: "visible", timeout: 60_000 });
	}

	async selectVenue(
		venue: TradingVenue,
		opts?: { allowPrime?: boolean },
	): Promise<void> {
		const allowPrime = opts?.allowPrime ?? true;
		await sleepBetweenTradeboxActions();
		const smartRow =
			venue === "all"
				? this.root.locator('[data-qa="smart-routing-split-row"]')
				: this.root.locator(
						`[data-qa="smart-routing-venue-row-${venue}"]`,
					);

		// Initial page load (and post-trade reload) often has no amount typed.
		// `SmartRoutingSection` returns null until SOR has previews
		// (`sortedVenuePreviews || multiVenueSplit || isLoading`). Prime SOR with
		// the floor amount so venue rows become interactable before we click.
		let rowVisible = await smartRow.isVisible().catch(() => false);
		if (!rowVisible) {
			if (!allowPrime) {
				const start = Date.now();
				while (Date.now() - start < SELECT_VENUE_SURFACE_TIMEOUT_MS) {
					rowVisible = await smartRow.isVisible().catch(() => false);
					if (rowVisible) break;
					await new Promise((r) => setTimeout(r, 200));
				}
				if (!rowVisible) {
					throw new Error(
						`selectVenue(${venue}, { allowPrime: false }): smart routing row did not appear within ${SELECT_VENUE_SURFACE_TIMEOUT_MS}ms`,
					);
				}
			} else {
				console.warn(
					`[e2e tradebox] selectVenue(${venue}): smart routing row not visible; ` +
						`priming SOR by typing $${SELECT_VENUE_PRIME_AMOUNT_USD}`,
				);
				await this.setAmount(SELECT_VENUE_PRIME_AMOUNT_USD);
				await smartRow
					.waitFor({
						state: "visible",
						timeout: SELECT_VENUE_SURFACE_TIMEOUT_MS,
					})
					.catch(() => {});
				rowVisible = await smartRow.isVisible().catch(() => false);
			}
		}

		if (rowVisible) {
			if (venue === "all") {
				await smartRow
					.locator("button.smart-routing-row__main")
					.click();
			} else {
				await smartRow.click();
			}
			await sleepBetweenTradeboxActions();
			return;
		}

		throw new Error(
			`selectVenue(${venue}): smart routing row [data-qa="smart-routing-venue-row-${venue}"] ` +
				`(or split row for "all") did not become visible after priming SOR ` +
				`with $${SELECT_VENUE_PRIME_AMOUNT_USD}. Check that the umbrella has a live book for the venue ` +
				`and that the dev server is on :3010.`,
		);
	}

	async setSide(side: Side): Promise<void> {
		await sleepBetweenTradeboxActions();
		await this.root.locator(`[data-qa="tradebox-side-${side}"]`).click();
	}

	async setPosition(position: Position): Promise<void> {
		await sleepBetweenTradeboxActions();
		await this.root
			.locator(`[data-qa="tradebox-position-${position}"]`)
			.click();
	}

	async setAmount(amount: string | number): Promise<void> {
		const input = this.root.locator('[data-qa="tradebox-amount-input"]');
		const text = String(amount);
		await sleepBetweenTradeboxActions();
		// `fill()` atomically replaces the input value via a single `input`
		// event. The previous Ctrl+A → `pressSequentially` flow lost its
		// selection between key events when React re-rendered the formatted
		// value (`$5` ← controlled), which made a second `setAmount(5)` after
		// a `$5` prime in `selectVenue` produce `$55` (the new "5" appended
		// instead of replaced). `fill(text)` with a non-empty value never
		// goes through `state.amount === ""`, so it does not disable
		// `useSorRoute` mid-keystroke (the original concern that ruled out
		// `fill("")` upstream).
		await input.fill(text);
		await sleepBetweenTradeboxActions();
	}

	/** Wait until sell (or buy) amount field is enabled — sell stays disabled until `maxScopedSellShares` catches up to positions. */
	async waitForAmountInputEnabled(
		timeoutMs: number = MARKET_SELL_LEG_TIMEOUT_MS,
	): Promise<void> {
		const input = this.root.locator('[data-qa="tradebox-amount-input"]');
		await expect(
			input,
			"tradebox-amount-input stayed disabled (e.g. sell locked until scoped sell shares load)",
		).toBeEnabled({ timeout: timeoutMs });
	}

	/**
	 * Raw `data-qa-line-shares` on `[data-qa="my-positions-buy-headline"]` — only
	 * present while the trade box is on the **buy** tab (`MyPositionsRow` switches
	 * to a sell-only layout after `setSide("sell")`). Do not call this after sell.
	 */
	async readBuyHeadlineLineSharesAttribute(): Promise<string | null> {
		const headline = this.root
			.locator('[data-qa="my-positions-buy-headline"]')
			.first();
		const visible = await headline.isVisible().catch(() => false);
		if (!visible) return null;
		const raw = await headline.getAttribute("data-qa-line-shares");
		return raw == null || raw.trim() === "" ? null : raw.trim();
	}

	/**
	 * Cumulative scoped sell shares from `[data-qa="my-positions-row"][data-qa-side="sell"]`
	 * — use **after** `setSide("sell")` so the sell row is mounted. This is the
	 * authoritative string to type into the amount field for SOR quote (matches
	 * `data-qa-shares-count`, same source as max-sell).
	 */
	async readSellRowSharesCountAttribute(): Promise<string | null> {
		const row = this.root.locator(
			'[data-qa="my-positions-row"][data-qa-side="sell"]',
		);
		const visible = await row.isVisible().catch(() => false);
		if (!visible) return null;
		const raw = await row.getAttribute("data-qa-shares-count");
		return raw == null || raw.trim() === "" ? null : raw.trim();
	}

	/**
	 * Sell share amount on the controlled React input. Prefer `fill()` (same as
	 * `setAmount`) so a formatted value is replaced atomically; fall back to
	 * select-all + `pressSequentially` if verification fails.
	 *
	 * @param expectedForParse — numeric target for `inputValue` verification (e.g. `buyShares`).
	 * @param textToType — optional exact string to type (e.g. sell row `data-qa-shares-count`);
	 *   defaults to `String(expectedForParse)`.
	 */
	async setSellShareAmountVerified(
		expectedForParse: number,
		absTolerance: number,
		textToType?: string,
	): Promise<void> {
		const text = (textToType ?? String(expectedForParse)).trim();
		if (text.length === 0) {
			throw new Error("setSellShareAmountVerified: empty amount text");
		}
		const input = this.root.locator('[data-qa="tradebox-amount-input"]');
		for (let attempt = 0; attempt < 12; attempt++) {
			await input.click();
			await input.fill(text);
			await sleepBetweenTradeboxActions();
			await sleepBetweenTradeboxActions();

			const raw = await input.inputValue().catch(() => "");
			const parsed = parseTradeboxAmountInput(raw);
			if (
				Math.abs(parsed - expectedForParse) <= absTolerance ||
				Math.abs(parsed - Number(text)) <= absTolerance
			) {
				return;
			}

			await input.click();
			await this.page.keyboard.press(
				process.platform === "darwin" ? "Meta+a" : "Control+a",
			);
			await input.pressSequentially(text, { delay: 25 });
			await sleepBetweenTradeboxActions();
			const raw2 = await input.inputValue().catch(() => "");
			const parsed2 = parseTradeboxAmountInput(raw2);
			if (
				Math.abs(parsed2 - expectedForParse) <= absTolerance ||
				Math.abs(parsed2 - Number(text)) <= absTolerance
			) {
				return;
			}
			await new Promise((r) => setTimeout(r, 450));
		}
		const last = await input.inputValue().catch(() => "(unreadable)");
		throw new Error(
			`setSellShareAmountVerified: could not settle amount to ~${expectedForParse} (typed "${text}", tol ${absTolerance}); last input=${JSON.stringify(last)}`,
		);
	}

	/**
	 * `[data-qa="my-positions-buy-headline"]` carries `data-qa-line-shares` per
	 * venue line — waits until it matches filled size (Polymarket lag vs row aggregate).
	 */
	async waitForBuyHeadlineSharesNear(
		expectedShares: number,
		absTolerance: number,
		timeoutMs: number = SHARES_VISIBLE_TIMEOUT_POLYMARKET_MS,
	): Promise<void> {
		const headline = this.root.locator(
			'[data-qa="my-positions-buy-headline"]',
		);
		const start = Date.now();
		while (Date.now() - start < timeoutMs) {
			const n = await headline.count().catch(() => 0);
			if (n > 0) {
				const raw = await headline
					.first()
					.getAttribute("data-qa-line-shares")
					.catch(() => null);
				if (raw !== null && raw.trim() !== "") {
					const v = Number(raw);
					if (
						Number.isFinite(v) &&
						Math.abs(v - expectedShares) <= absTolerance
					) {
						return;
					}
				}
			}
			await new Promise((r) => setTimeout(r, SHARES_POLL_MS));
		}
		throw new Error(
			`waitForBuyHeadlineSharesNear: headline data-qa-line-shares never matched ~${expectedShares} (±${absTolerance}) within ${timeoutMs}ms`,
		);
	}

	async submit(): Promise<void> {
		const input = this.root.locator('[data-qa="tradebox-amount-input"]');
		const button = this.root.locator('[data-qa="tradebox-submit"]');

		const deadline = Date.now() + SUBMIT_READY_TIMEOUT_MS;

		while (Date.now() < deadline) {
			const raw = await input.inputValue().catch(() => "");
			const amount = parseTradeboxAmountInput(raw);
			const enabled = await button.isEnabled().catch(() => false);
			if (amount > 0 && enabled) {
				await button.click();
				return;
			}
			await new Promise((r) => setTimeout(r, SUBMIT_POLL_MS));
		}

		const lastRaw = await input.inputValue().catch(() => "(unreadable)");
		const lastEnabled = await button.isEnabled().catch(() => false);
		throw new Error(
			`submit: need positive amount in input AND enabled Trade button within ${SUBMIT_READY_TIMEOUT_MS}ms ` +
				`(last inputValue=${JSON.stringify(lastRaw)} enabled=${lastEnabled})`,
		);
	}

	/** Just assert the submit button reaches the enabled state. Used by `*.price-populates` tests. */
	async expectSubmitEnabled(
		timeoutMs: number = QUOTE_READY_TIMEOUT_MS,
	): Promise<void> {
		const button = this.root.locator('[data-qa="tradebox-submit"]');
		await expect(
			button,
			"tradebox-submit did not become enabled (no SOR quote)",
		).toBeEnabled({ timeout: timeoutMs });
	}

	/**
	 * `data-qa="sor-leg"` rows live inside the visually-clipped E2E sentinel
	 * block in `PredictionMarketTradeBoxUI` (`.tradebox-e2e-sentinel`). The
	 * sentinel ships with `aria-expanded="true"` so this helper short-circuits
	 * once the toggle is attached — there is no real Details collapsible in
	 * the rendered UI to interact with.
	 *
	 * The sentinel only mounts after `sorRoute.executionRoute` has legs; on a
	 * single-venue tab (e.g. LevelUp) that channel can lag the Trade button by
	 * many seconds on a slow localhost book. Use the same timeout budget as
	 * {@link readLegAttrs} / quote readiness (defaults to {@link QUOTE_READY_TIMEOUT_MS}).
	 */
	async expandSorDetailsIfCollapsed(
		toggleAttachTimeoutMs: number = QUOTE_READY_TIMEOUT_MS,
	): Promise<void> {
		const toggle = this.root.locator("button.sor-details-toggle").first();
		await toggle.waitFor({
			state: "attached",
			timeout: toggleAttachTimeoutMs,
		});
		const expanded = await toggle.getAttribute("aria-expanded");
		if (expanded === "true") {
			return;
		}
		await toggle.click();
		await expect(toggle).toHaveAttribute("aria-expanded", "true", {
			timeout: 10_000,
		});
		await sleepBetweenTradeboxActions();
	}

	/**
	 * Visible smart-routing-row sub-text price reader.
	 *
	 * Used as the sell-side fallback for tests 3/4 because the SOR
	 * `[data-qa="sor-leg"][data-leg-side="market-sell"]` sentinel only renders
	 * when `sorRoute.executionRoute` is non-null (see `PredictionMarketTradeBoxUI.tsx`
	 * lines 1488-1534). On Polymarket sells right after a buy fill, the targeted
	 * execution channel can lag (`venuePositions` empty) while the omnibus display
	 * channel already populates `[data-qa="smart-routing-venue-row-${venue}"]`'s
	 * `.smart-routing-row__sub` with `formatLegAvg(displayAvgPrice) avg.` (see
	 * `SmartRoutingSection.tsx` line 1127). This helper polls past the
	 * `QuoteMetricSkeleton` state and parses the cents number.
	 *
	 * Assumes the seeded profile uses the **default** odds display style (cents,
	 * e.g. "71¢"). If a non-default style is in effect (american / decimal / etc.)
	 * the regex will not match and this throws with the raw text so the operator
	 * can flip the profile back to default.
	 */
	async readVenueRowAvgCents(
		venue: TradingVenue,
		timeoutMs: number = MARKET_SELL_LEG_TIMEOUT_MS,
	): Promise<number> {
		const row = this.root.locator(
			`[data-qa="smart-routing-venue-row-${venue}"]`,
		);
		const sub = row.locator(".smart-routing-row__sub").first();
		const start = Date.now();
		let lastText = "";
		while (Date.now() - start < timeoutMs) {
			await row
				.waitFor({ state: "attached", timeout: 1_000 })
				.catch(() => {});
			const visible = await sub.isVisible().catch(() => false);
			if (visible) {
				const text = (await sub.innerText().catch(() => "")).trim();
				lastText = text;
				const match = text.match(/(\d+(?:\.\d+)?)¢/);
				if (match !== null) {
					const parsed = Number(match[1]);
					if (Number.isFinite(parsed)) {
						return parsed;
					}
				}
			}
			await new Promise((r) => setTimeout(r, BETWEEN_TRADEBOX_ACTIONS_MS));
		}
		throw new Error(
			`readVenueRowAvgCents: smart-routing-venue-row-${venue} sub never produced a "X¢" value within ${timeoutMs}ms ` +
				`(lastText=${JSON.stringify(lastText)}). Likely a non-default oddsDisplayStyle in the seeded profile, ` +
				`or the row is still showing a QuoteMetricSkeleton.`,
		);
	}

	/**
	 * Visible smart-routing-row USD value reader.
	 *
	 * Sell-side companion to `readVenueRowAvgCents`. Reads the row's
	 * `.smart-routing-row__value-btn` text (`$ ${formatSorSellProceedsUsdDisplay(displayProceeds)}`
	 * — see `SmartRoutingSection.tsx` line 1155) and parses USD. Independent of
	 * `oddsDisplayStyle` (always rendered with `$` and 2 fractional digits).
	 */
	async readVenueRowSellReceiveUsd(
		venue: TradingVenue,
		timeoutMs: number = MARKET_SELL_LEG_TIMEOUT_MS,
	): Promise<number> {
		const row = this.root.locator(
			`[data-qa="smart-routing-venue-row-${venue}"]`,
		);
		// `data-qa="smart-routing-venue-row-${venue}"` is on the inner main button
		// (`SmartRoutingSection.tsx` line 1109), so the value-btn is a sibling under
		// the parent `.smart-routing-block`. Walk up to that block, then locate the
		// value-btn so we read the same row's USD figure.
		const block = row.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' smart-routing-block ')][1]");
		const valueBtn = block.locator(".smart-routing-row__value-btn").first();
		const start = Date.now();
		let lastText = "";
		while (Date.now() - start < timeoutMs) {
			await row
				.waitFor({ state: "attached", timeout: 1_000 })
				.catch(() => {});
			const visible = await valueBtn.isVisible().catch(() => false);
			if (visible) {
				const text = (await valueBtn.innerText().catch(() => "")).trim();
				lastText = text;
				const match = text.match(/\$\s*([\d,]+\.\d{2})/);
				if (match !== null) {
					const cleaned = match[1].replace(/[,\s]/g, "");
					const parsed = Number.parseFloat(cleaned);
					if (Number.isFinite(parsed) && parsed > 0) {
						return parsed;
					}
				}
			}
			await new Promise((r) => setTimeout(r, BETWEEN_TRADEBOX_ACTIONS_MS));
		}
		throw new Error(
			`readVenueRowSellReceiveUsd: smart-routing-venue-row-${venue} value-btn never produced a "$X.XX" value within ${timeoutMs}ms ` +
				`(lastText=${JSON.stringify(lastText)}). Likely a QuoteMetricSkeleton that never resolved.`,
		);
	}

	/** Read `data-leg-*` attributes from the currently rendered SOR leg row for the given side. */
	async readLegAttrs(
		legSide: LegSide,
		timeoutMs: number = QUOTE_READY_TIMEOUT_MS,
	): Promise<LegAttrs> {
		const effectiveTimeout =
			legSide === "market-sell" && timeoutMs === QUOTE_READY_TIMEOUT_MS
				? MARKET_SELL_LEG_TIMEOUT_MS
				: timeoutMs;
		await this.expandSorDetailsIfCollapsed(effectiveTimeout);
		const leg = this.root.locator(
			`[data-qa="sor-leg"][data-leg-side="${legSide}"]`,
		);
		await leg.waitFor({ state: "attached", timeout: effectiveTimeout });
		const venue = await leg.getAttribute("data-leg-venue");
		const numSharesAttr = await leg.getAttribute("data-leg-num-shares");
		const priceCentsAttr = await leg.getAttribute("data-leg-price-cents");
		if (
			venue === null ||
			numSharesAttr === null ||
			priceCentsAttr === null
		) {
			throw new Error(
				`sor-leg[data-leg-side="${legSide}"] missing one of data-leg-{venue,num-shares,price-cents}: ` +
					`venue=${venue} numShares=${numSharesAttr} priceCents=${priceCentsAttr}`,
			);
		}
		const numShares = Number(numSharesAttr);
		const priceCents = Number(priceCentsAttr);
		if (!Number.isFinite(numShares) || !Number.isFinite(priceCents)) {
			throw new Error(
				`sor-leg[data-leg-side="${legSide}"] non-numeric attrs: numShares=${numSharesAttr} priceCents=${priceCentsAttr}`,
			);
		}
		return { venue, numShares, priceCents };
	}

	/**
	 * Single-venue market buy: Details "Cost:" row exposes `data-cost-usd` on
	 * `[data-qa="sor-leg-cost"]`.
	 */
	async readQuotedBuyCostUsd(
		timeoutMs: number = QUOTE_READY_TIMEOUT_MS,
	): Promise<number> {
		await this.expandSorDetailsIfCollapsed(timeoutMs);
		const loc = this.root
			.locator(
				'.sor-details-panel [data-qa="sor-leg-cost"][data-cost-usd]',
			)
			.first();
		await loc.waitFor({ state: "attached", timeout: timeoutMs });
		const raw = await loc.getAttribute("data-cost-usd");
		if (raw === null || raw.trim() === "") {
			throw new Error(
				"readQuotedBuyCostUsd: missing data-cost-usd on sor-leg-cost in Details",
			);
		}
		const n = Number(raw);
		if (!Number.isFinite(n) || n < 0) {
			throw new Error(
				`readQuotedBuyCostUsd: invalid data-cost-usd=${JSON.stringify(raw)}`,
			);
		}
		return n;
	}

	/** Single-venue market sell: Estimated Receive exposes `data-receive-usd`. */
	async readQuotedSellReceiveUsd(
		timeoutMs: number = QUOTE_READY_TIMEOUT_MS,
	): Promise<number> {
		const loc = this.root.locator(
			'[data-qa="tradebox-estimated-receive-usd"][data-receive-usd]',
		);
		await loc.waitFor({ state: "attached", timeout: timeoutMs });
		const raw = await loc.getAttribute("data-receive-usd");
		if (raw === null || raw.trim() === "") {
			throw new Error(
				"readQuotedSellReceiveUsd: missing data-receive-usd on tradebox-estimated-receive-usd",
			);
		}
		const n = Number(raw);
		if (!Number.isFinite(n) || n < 0) {
			throw new Error(
				`readQuotedSellReceiveUsd: invalid data-receive-usd=${JSON.stringify(raw)}`,
			);
		}
		return n;
	}

	/**
	 * Current cumulative shares on the buy-side `MyPositionsRow` (same attribute as
	 * {@link waitForBuyShares}), or `0` if the row is absent / unreadable — baseline
	 * for delta-vs-quote assertions after a fill.
	 */
	async readBuyRowTotalSharesOrZero(): Promise<number> {
		const row = this.root.locator(
			'[data-qa="my-positions-row"][data-qa-side="buy"]',
		);
		const visible = await row.isVisible().catch(() => false);
		if (!visible) return 0;
		const sharesAttr = await row.getAttribute("data-qa-shares-count");
		if (sharesAttr === null || sharesAttr.trim() === "") return 0;
		const parsed = Number(sharesAttr);
		return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
	}

	/**
	 * When the buy row exists, wait until `data-qa-position-refreshing` is not `"true"`
	 * so `readBuyRowTotalSharesOrZero()` reflects hydrated venue positions (not the
	 * loading shell that keeps `data-qa-shares-count` at 0). No-op if the row is absent.
	 */
	async waitForBuyRowBaselineSettled(timeoutMs: number): Promise<void> {
		const row = this.root.locator(
			'[data-qa="my-positions-row"][data-qa-side="buy"]',
		);
		const start = Date.now();
		while (Date.now() - start < timeoutMs) {
			const visible = await row.isVisible().catch(() => false);
			if (!visible) {
				return;
			}
			const refreshing = await row.getAttribute(
				"data-qa-position-refreshing",
			);
			if (refreshing !== "true") {
				return;
			}
			await new Promise((r) => setTimeout(r, SHARES_POLL_MS));
		}
		throw new Error(
			`waitForBuyRowBaselineSettled: buy row stayed data-qa-position-refreshing="true" within ${timeoutMs}ms ` +
				`(positions may not have hydrated — see MyPositionsRow + venue queries).`,
		);
	}

	/**
	 * Poll the buy-side `MyPositionsRow` until it reports > 0 shares **and**
	 * `data-qa-position-refreshing` is not `"true"` (shares can bump while sync
	 * is still in flight — Polymarket/Polygon sell quote needs settled state).
	 * Replaces the old fixed `await sleep(5000)` with a deterministic signal.
	 *
	 * If the account already holds shares on this outcome, use
	 * {@link waitForBuySharesIncreaseSince} so we wait for the **post-fill** bump,
	 * not the first `> 0` poll (which would return immediately).
	 */
	async waitForBuyShares(
		timeoutMs: number = SHARES_VISIBLE_TIMEOUT_MS,
	): Promise<number> {
		const row = this.root.locator(
			'[data-qa="my-positions-row"][data-qa-side="buy"]',
		);
		const start = Date.now();
		while (Date.now() - start < timeoutMs) {
			const visible = await row.isVisible().catch(() => false);
			if (visible) {
				const sharesAttr = await row.getAttribute(
					"data-qa-shares-count",
				);
				if (sharesAttr !== null) {
					const parsed = Number(sharesAttr);
					if (Number.isFinite(parsed) && parsed > 0) {
						const refreshing = await row.getAttribute(
							"data-qa-position-refreshing",
						);
						if (refreshing !== "true") {
							return parsed;
						}
					}
				}
			}
			await new Promise((r) => setTimeout(r, SHARES_POLL_MS));
		}
		throw new Error(
			`waitForBuyShares: my-positions-row[data-qa-side="buy"] never reported > 0 shares within ${timeoutMs}ms ` +
				`(after a successful fill confirmation). Likely positions API lag, query staleness, or position-to-market mismatch.`,
		);
	}

	/**
	 * Like {@link waitForBuyShares}, but when `sharesBefore > 0` waits until the
	 * cumulative buy row **strictly exceeds** that baseline (new fill reflected).
	 * Does not return while `data-qa-position-refreshing` is still `"true"` after
	 * the bump, so the trade box sell path and SOR can see final scoped shares.
	 */
	async waitForBuySharesIncreaseSince(
		sharesBefore: number,
		timeoutMs: number = SHARES_VISIBLE_TIMEOUT_MS,
	): Promise<number> {
		const row = this.root.locator(
			'[data-qa="my-positions-row"][data-qa-side="buy"]',
		);
		const start = Date.now();
		let sawIncreasedButStillRefreshing: number | null = null;
		while (Date.now() - start < timeoutMs) {
			const visible = await row.isVisible().catch(() => false);
			if (visible) {
				const sharesAttr = await row.getAttribute(
					"data-qa-shares-count",
				);
				if (sharesAttr !== null) {
					const parsed = Number(sharesAttr);
					const ok =
						sharesBefore <= 0
							? Number.isFinite(parsed) && parsed > 0
							: Number.isFinite(parsed) && parsed > sharesBefore;
					if (ok) {
						const refreshing = await row.getAttribute(
							"data-qa-position-refreshing",
						);
						if (refreshing !== "true") {
							return parsed;
						}
						sawIncreasedButStillRefreshing = parsed;
						// Shares count moved but row still loading — keep polling so
						// trade-box max sell shares / SOR can settle (Polymarket).
					}
				}
			}
			await new Promise((r) => setTimeout(r, SHARES_POLL_MS));
		}
		if (sawIncreasedButStillRefreshing !== null) {
			throw new Error(
				`waitForBuySharesIncreaseSince: buy row shares exceeded baseline but ` +
					`data-qa-position-refreshing stayed "true" for the rest of the ${timeoutMs}ms window ` +
					`(lastShares=${sawIncreasedButStillRefreshing}).`,
			);
		}
		throw new Error(
			`waitForBuySharesIncreaseSince: buy row never ${sharesBefore <= 0 ? "reported > 0" : `exceeded baseline ${sharesBefore}`} within ${timeoutMs}ms ` +
				`(after fill confirmation).`,
		);
	}

	/** Poll until the rendered `MyPositionsRow` reports `data-qa-shares-count <= 0`. */
	async waitForSharesCleared(
		timeoutMs: number = SHARES_VISIBLE_TIMEOUT_MS,
	): Promise<void> {
		const row = this.root.locator('[data-qa="my-positions-row"]');
		const start = Date.now();
		while (Date.now() - start < timeoutMs) {
			const visible = await row.isVisible().catch(() => false);
			if (visible) {
				const sharesAttr = await row.getAttribute(
					"data-qa-shares-count",
				);
				if (sharesAttr !== null) {
					const parsed = Number(sharesAttr);
					if (Number.isFinite(parsed) && parsed <= 0) {
						return;
					}
				}
			} else {
				return;
			}
			await new Promise((r) => setTimeout(r, SHARES_POLL_MS));
		}
		throw new Error(
			`waitForSharesCleared: my-positions-row never reached data-qa-shares-count <= 0 within ${timeoutMs}ms`,
		);
	}

	async waitForFill(): Promise<void> {
		const success = this.root.locator(
			'[data-qa="tradebox-fill-confirmation"][data-qa-fill-status="success"]',
		);
		const failure = this.root.locator(
			'[data-qa="tradebox-fill-confirmation"][data-qa-fill-status="error"]',
		);
		// Outcome node is a visually clipped sentinel (`trade-notification-e2e-sentinel`), not a toast —
		// `visible` would time out even when the fill completed.
		const winner = await Promise.race([
			success
				.waitFor({ state: "attached", timeout: FILL_TIMEOUT_MS })
				.then(() => "success" as const),
			failure
				.waitFor({ state: "attached", timeout: FILL_TIMEOUT_MS })
				.then(() => "error" as const),
		]);
		if (winner === "error") {
			const message = await failure
				.getAttribute("data-qa-fill-error")
				.catch(() => null);
			throw new Error(`Order failed: ${message ?? "(no message)"}`);
		}
		await new Promise((r) => setTimeout(r, SETTLE_AFTER_FILL_MS));
	}

	async placeMarketBuy(position: Position, amountUsd: number): Promise<void> {
		await this.setSide("buy");
		await this.setPosition(position);
		await this.setAmount(amountUsd);
		await this.submit();
		await this.waitForFill();
	}

	async getSellableShares(position: Position): Promise<number> {
		await this.setSide("sell");
		await this.setPosition(position);
		await sleepBetweenTradeboxActions();
		const row = this.root.locator('[data-qa="my-positions-row"]');
		await row.waitFor({ state: "visible", timeout: 10_000 });
		const sharesAttr = await row.getAttribute("data-qa-shares-count");
		if (sharesAttr === null) {
			throw new Error(
				`my-positions-row missing data-qa-shares-count for position=${position}`,
			);
		}
		const parsed = Number(sharesAttr);
		if (!Number.isFinite(parsed)) {
			throw new Error(
				`my-positions-row data-qa-shares-count not numeric for position=${position}: ${sharesAttr}`,
			);
		}
		return parsed;
	}

	async sellPosition(position: Position): Promise<number> {
		const shares = await this.getSellableShares(position);
		if (shares <= 0) {
			return 0;
		}
		await this.setAmount(shares);
		await this.submit();
		await this.waitForFill();
		return shares;
	}

	async sellAll(): Promise<{ yesShares: number; noShares: number }> {
		const yesShares = await this.sellPosition("yes");
		const noShares = await this.sellPosition("no");
		return { yesShares, noShares };
	}

	async expectClosed(): Promise<void> {
		const yesRemaining = await this.getSellableShares("yes");
		const noRemaining = await this.getSellableShares("no");
		expect(
			yesRemaining,
			`expected 0 YES shares after sellAll, got ${yesRemaining}`,
		).toBeLessThanOrEqual(0);
		expect(
			noRemaining,
			`expected 0 NO shares after sellAll, got ${noRemaining}`,
		).toBeLessThanOrEqual(0);
	}
}
