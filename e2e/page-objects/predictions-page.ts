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

	locatorHomeTradeboxForUmbrella(umbrellaId: string): Locator {
		return this.page.locator(
			`[data-qa="prediction-tradebox"][data-qa-umbrella-id="${umbrellaId}"]`,
		);
	}

	/** `/` only — inline home trade dock is not mounted on umbrella routes. */
	private async ensureHomePathForInlineDock(): Promise<void> {
		let pathname = "/";
		try {
			pathname = new URL(this.page.url()).pathname;
		} catch {
			/* ignore */
		}
		if (pathname !== "/") {
			await this.page.goto(`${FRONTEND_URL}/`, {
				waitUntil: "domcontentloaded",
				timeout: 120_000,
			});
			await this.page.waitForLoadState("load").catch(() => {});
		}
	}

	/**
	 * Click the home-page match card, keep the SPA on `/`, and wait until the
	 * right-rail tradebox is bound to `umbrellaId` (visible + header Cash hydrated).
	 */
	async openCardByUmbrellaId(umbrellaId: string): Promise<void> {
		await this.ensureHomePathForInlineDock();
		const card = this.findCardByUmbrellaId(umbrellaId);
		await expect(
			card,
			`prediction card for umbrellaId ${umbrellaId} not found on /`,
		).toBeVisible({ timeout: 60_000 });
		await card.scrollIntoViewIfNeeded();
		await card.click();
		await this.locatorHomeTradeboxForUmbrella(umbrellaId).waitFor({
			state: "visible",
			timeout: 60_000,
		});
		await this.waitForTradeShellReady();
	}

	/**
	 * Open trading for an umbrella from the home inline dock (stay on `/`).
	 * Ensures we are on `/` first (e.g. after a prior non-home route in the same session).
	 */
	async openUmbrellaTradingPageById(umbrellaId: string): Promise<void> {
		await this.openCardByUmbrellaId(umbrellaId);
	}

	/**
	 * Tradebox body is visible AND header Cash has hydrated (i.e. the user-data
	 * context fetched at least once). Header Cash and positions hydrate from
	 * the same `PortfolioContext` pipeline, so a settled header value is the
	 * deterministic signal that user-side data has loaded.
	 */
	private async waitForTradeShellReady(): Promise<void> {
		await tradeboxRootLocator(this.page).waitFor({
			state: "visible",
			timeout: 60_000,
		});
		await expectHeaderCashUsd(this.page);
	}
}
