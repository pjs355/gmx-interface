import { type Locator, type Page, expect } from "@playwright/test";
import { FRONTEND_URL } from "../playwright.config";
import { tradeboxRootLocator } from "./tradebox";

/** After hard reload on umbrella page, book/header can lag `load`; let UI settle before trade steps. */
const POST_UMBRELLA_RELOAD_SETTLE_MS = 3_000;

export class PredictionsPage {
	constructor(private readonly page: Page) {}

	async goto(baseUrl: string): Promise<void> {
		await this.page.goto(baseUrl, { waitUntil: "domcontentloaded" });
	}

	findCardByUmbrellaId(umbrellaId: string): Locator {
		return this.page.locator(
			`[data-qa="prediction-card"][data-qa-umbrella-id="${umbrellaId}"]`,
		);
	}

	async openCardByUmbrellaId(umbrellaId: string): Promise<void> {
		const card = this.findCardByUmbrellaId(umbrellaId);
		await expect(
			card,
			`prediction card for umbrellaId ${umbrellaId} not found on /`,
		).toBeVisible({ timeout: 60_000 });
		await card.scrollIntoViewIfNeeded();
		await card.click();
		await this.page.waitForURL(`**/predictions/umbrella/${umbrellaId}`, {
			timeout: 60_000,
		});
		await tradeboxRootLocator(this.page).waitFor({
			state: "visible",
			timeout: 60_000,
		});
		// E2E-only: first paint sometimes shows 0¢ / empty book until a full reload (not reproduced manually).
		await this.page.reload({ waitUntil: "load" });
		await new Promise((r) => setTimeout(r, POST_UMBRELLA_RELOAD_SETTLE_MS));
		await tradeboxRootLocator(this.page).waitFor({
			state: "visible",
			timeout: 60_000,
		});
	}

	/**
	 * Deep-link to an umbrella market (no home-card click). Reload + settle so books match seed flow.
	 */
	async openUmbrellaTradingPageById(umbrellaId: string): Promise<void> {
		const path = `/predictions/umbrella/${encodeURIComponent(umbrellaId)}`;
		await this.page.goto(`${FRONTEND_URL}${path}`, {
			waitUntil: "load",
			timeout: 120_000,
		});
		await this.page.reload({ waitUntil: "load" });
		await new Promise((r) => setTimeout(r, POST_UMBRELLA_RELOAD_SETTLE_MS));
		await tradeboxRootLocator(this.page).waitFor({
			state: "visible",
			timeout: 60_000,
		});
	}
}
