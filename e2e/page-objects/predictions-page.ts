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
	 * Open `/predictions/umbrella/:id` directly — matches production UX after a card
	 * click and avoids coupling tests to homepage card routing. Use homepage Yes/No
	 * odds buttons only when the scenario intentionally exercises the inline dock on `/`.
	 */
	async openUmbrellaTradingPageById(umbrellaId: string): Promise<void> {
		await this.page.goto(
			`${FRONTEND_URL}/predictions/umbrella/${encodeURIComponent(umbrellaId)}`,
			{
				waitUntil: "domcontentloaded",
				timeout: 120_000,
			},
		);
		await this.page.waitForLoadState("load").catch(() => {});
		await this.locatorHomeTradeboxForUmbrella(umbrellaId).waitFor({
			state: "visible",
			timeout: 60_000,
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
			timeout: 60_000,
		});
		await expectHeaderCashUsd(this.page);
	}
}
