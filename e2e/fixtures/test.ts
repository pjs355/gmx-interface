import { test as base, expect, type Page } from "@playwright/test";
import {
	openAuthenticatedSession,
	type AuthenticatedSession,
} from "./authenticated-page";
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
			throw new Error(
				"No per-venue best picks: no upcoming matched row had a live bid/ask on any venue.",
			);
		}
		await use(picks);
	},
});

export { expect };
