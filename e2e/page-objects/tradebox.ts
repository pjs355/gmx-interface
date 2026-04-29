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

/** SOR route + price quote should arrive after a $5 buy/sell amount is typed. */
const QUOTE_READY_TIMEOUT_MS = 30_000;
/** Poll until amount field has a value and Trade is enabled, then click. */
const SUBMIT_READY_TIMEOUT_MS = 60_000;
const SUBMIT_POLL_MS = 150;
/** Buy fill → /predict (or other) positions API → React Query refetch can take seconds. */
const SHARES_VISIBLE_TIMEOUT_MS = 60_000;
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

	async selectVenue(venue: TradingVenue): Promise<void> {
		const trigger = this.root.locator('[data-qa="trade-venue-tab-Venue"]');
		await sleepBetweenTradeboxActions();
		await trigger.click();
		// Venue list may render in a portal attached to `document.body`.
		const option = this.page.locator(`[data-qa-venue="${venue}"]`);
		await expect(
			option,
			`venue option [data-qa-venue="${venue}"] not found in dropdown`,
		).toBeVisible({ timeout: 10_000 });
		await sleepBetweenTradeboxActions();
		await option.click();
		await sleepBetweenTradeboxActions();
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
		await input.click();
		// Do not `fill("")` first: empty `state.amount` makes `sorAmountUsd` 0, turns off
		// `useSorRoute` (`enabled: sorRouteEnabled`), and YES/NO previews can flip to "--"
		// until the route refetches (manual typing rarely commits a full clear).
		await input.press("ControlOrMeta+a");
		await input.pressSequentially(text, { delay: 30 });
		await sleepBetweenTradeboxActions();
	}

	async submit(): Promise<void> {
		// Logs go to the **terminal** that runs `yarn e2e` / `playwright test`, not the browser DevTools console.
		console.warn("[e2e tradebox] submit() entered");
		const input = this.root.locator('[data-qa="tradebox-amount-input"]');
		const button = this.root.locator('[data-qa="tradebox-submit"]');
		await logTradeboxDomSnapshot("submit: amount input (initial)", input);
		await logTradeboxDomSnapshot("submit: trade button (initial)", button);

		const deadline = Date.now() + SUBMIT_READY_TIMEOUT_MS;

		while (Date.now() < deadline) {
			const raw = await input.inputValue().catch(() => "");
			const amount = parseTradeboxAmountInput(raw);
			const enabled = await button.isEnabled().catch(() => false);
			if (amount > 0 && enabled) {
				console.warn(
					`[e2e tradebox] submit: clicking (amount=${amount} enabled=true)`,
				);
				await logTradeboxDomSnapshot(
					"submit: trade button (before click)",
					button,
				);
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
	 * `data-qa="sor-leg"` rows live under the Details collapsible, which starts
	 * collapsed in `PredictionMarketTradeBoxUI` (single-venue and multi-SOR).
	 */
	async expandSorDetailsIfCollapsed(): Promise<void> {
		const toggle = this.root.locator("button.sor-details-toggle").first();
		await expect(toggle).toBeVisible({ timeout: 15_000 });
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

	/** Read `data-leg-*` attributes from the currently rendered SOR leg row for the given side. */
	async readLegAttrs(
		legSide: LegSide,
		timeoutMs: number = QUOTE_READY_TIMEOUT_MS,
	): Promise<LegAttrs> {
		await this.expandSorDetailsIfCollapsed();
		const leg = this.root.locator(
			`[data-qa="sor-leg"][data-leg-side="${legSide}"]`,
		);
		await leg.waitFor({ state: "visible", timeout: timeoutMs });
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
		await this.expandSorDetailsIfCollapsed();
		const loc = this.root
			.locator('.sor-details-panel [data-qa="sor-leg-cost"][data-cost-usd]')
			.first();
		await loc.waitFor({ state: "visible", timeout: timeoutMs });
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
		await loc.waitFor({ state: "visible", timeout: timeoutMs });
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
	 * Poll the buy-side `MyPositionsRow` until it reports > 0 shares.
	 * Replaces the old fixed `await sleep(5000)` with a deterministic signal.
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
						return parsed;
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
		const winner = await Promise.race([
			success
				.waitFor({ state: "visible", timeout: FILL_TIMEOUT_MS })
				.then(() => "success" as const),
			failure
				.waitFor({ state: "visible", timeout: FILL_TIMEOUT_MS })
				.then(() => "error" as const),
		]);
		if (winner === "error") {
			const message = await failure
				.innerText()
				.catch(() => "(no message)");
			throw new Error(`Order failed: ${message}`);
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
