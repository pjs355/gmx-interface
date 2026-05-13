import { type Locator, type Page } from "@playwright/test";
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

	/**
	 * Prepare the trade UI for `umbrellaId` **from `/`** without loading `/predictions/umbrella/:id`.
	 *
	 * Clicks the card’s Yes odds so `HomeInlineTradeLayout` focuses the dock; then waits for the
	 * same `.right-panel .prediction-market-tradebox` sentinel as the umbrella detail page.
	 *
	 * When the prior venue navigated to an umbrella URL (legacy / manual), performs one `goto('/')`
	 * — otherwise **stays on `/`** so Cash / portfolio keep the existing SPA hydration.
	 */
	async openUmbrellaTradingPageById(umbrellaId: string): Promise<void> {
		if (this.page.url().includes("/predictions/umbrella/")) {
			await this.page.goto(`${FRONTEND_URL}/`, {
				waitUntil: "domcontentloaded",
				timeout: 120_000,
			});
			await this.page.waitForLoadState("load").catch(() => {});
		}

		const card = this.findCardByUmbrellaId(umbrellaId);
		await card.scrollIntoViewIfNeeded();
		await card.waitFor({ state: "visible", timeout: 90_000 });

		const yesBtn = card.locator("button.action-button.yes-button").first();
		await yesBtn.click({ timeout: 45_000 });

		await this.locatorHomeTradeboxForUmbrella(umbrellaId).waitFor({
			state: "visible",
			timeout: 90_000,
		});
		await this.waitForTradeShellReady();
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
			timeout: 90_000,
		});
		await expectHeaderCashUsd(this.page);
	}
}
