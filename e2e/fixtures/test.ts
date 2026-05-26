import { test as base, expect, type Page } from "@playwright/test";
import { openAuthenticatedSession, type AuthenticatedSession } from "./authenticated-page";
import { resolvePerVenueBestPicks, type PerVenueBestPick } from "./matched-market";

interface CustomFixtures {
	session: AuthenticatedSession;
	authenticatedPage: Page;
	perVenueBestPicks: PerVenueBestPick[];
}

export const test = base.extend<CustomFixtures>({
	session: async ({}, use) => {
		const session = await openAuthenticatedSession();
		try {
			await use(session);
		} finally {
			try {
				await session.context.close();
			} catch (err) {
				console.error("error", err);
			}
		}
	},
	authenticatedPage: async ({ session }, use) => {
		await use(session.page);
	},
	perVenueBestPicks: async ({}, use) => {
		const picks = await resolvePerVenueBestPicks();
		if (picks.length === 0) {
			console.warn(
				"[e2e] resolvePerVenueBestPicks returned no picks — venue preflight/trade-cycle blocks will skip or no-op.",
			);
		}
		await use(picks);
	},
});

export { expect };
