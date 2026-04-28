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

function sleepBetweenTradeboxActions(): Promise<void> {
	return new Promise((r) => setTimeout(r, BETWEEN_TRADEBOX_ACTIONS_MS));
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
		const button = this.root.locator('[data-qa="tradebox-submit"]');
		await expect(button, "submit button not enabled").toBeEnabled({
			timeout: 30_000,
		});
		await sleepBetweenTradeboxActions();
		await button.click();
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
			const message = await failure.innerText().catch(() => "(no message)");
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
