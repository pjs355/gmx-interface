import { type Locator, type Page, expect } from "@playwright/test";
import { FRONTEND_URL } from "../playwright.config";
import { expectHeaderCashUsd } from "../helpers/header-cash";
import { tradeboxRootLocator } from "./tradebox";

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

	/**
	 * Click the home-page match card, navigate to the umbrella page, and wait
	 * for the page to be interactable (tradebox visible + header Cash hydrated).
	 * No reload — keeps the test within a single SPA session.
	 */
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
		await this.waitForUmbrellaPageReady();
	}

	/**
	 * Deep-link to an umbrella market by URL (used when the card may not be
	 * visible on home due to filter state). No reload — waits deterministically
	 * for tradebox visibility and header Cash hydration so callers get a
	 * ready page in a single SPA session.
	 */
	async openUmbrellaTradingPageById(umbrellaId: string): Promise<void> {
		const path = `/predictions/umbrella/${encodeURIComponent(umbrellaId)}`;
		await this.page.goto(`${FRONTEND_URL}${path}`, {
			waitUntil: "load",
			timeout: 120_000,
		});
		await this.waitForUmbrellaPageReady();
	}

	/**
	 * Tradebox is visible AND header Cash has hydrated (i.e. the user-data
	 * context fetched at least once). Header Cash and positions hydrate from
	 * the same `PortfolioContext` pipeline, so a settled header value is the
	 * deterministic signal that user-side data has loaded.
	 */
	private async waitForUmbrellaPageReady(): Promise<void> {
		await tradeboxRootLocator(this.page).waitFor({
			state: "visible",
			timeout: 60_000,
		});
		await expectHeaderCashUsd(this.page);
	}
}
