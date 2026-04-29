import { type Page, expect } from "@playwright/test";

/**
 * Read the live USD value from the header `data-qa="header-cash"` element.
 *
 * Prefers the numeric `data-qa-cash-amount` attribute (set in `AppHeaderUser.tsx`)
 * because it does not depend on locale formatting. Falls back to the rendered text
 * (`$1,234.56`) only if the attribute is missing or empty (e.g. early hydration).
 *
 * Returns `null` when the element is not yet visible or no number can be parsed.
 * Throwing is left to callers that want strict semantics.
 */
export async function readHeaderCashUsd(page: Page): Promise<number | null> {
	const cashBox = page.locator('[data-qa="header-cash"]').first();
	const visible = await cashBox.isVisible().catch(() => false);
	if (!visible) {
		return null;
	}
	// Logic must live entirely inside this callback — it runs in the browser, not in Node.
	return cashBox.evaluate((el) => {
		const attr = el.getAttribute("data-qa-cash-amount");
		if (attr !== null && attr.trim() !== "") {
			const fromAttr = Number(attr);
			if (Number.isFinite(fromAttr) && fromAttr >= 0) {
				return fromAttr;
			}
		}
		if (!(el instanceof HTMLElement)) {
			return null;
		}
		const text = el.innerText ?? "";
		const re = /\$([\d,]+(?:\.\d{1,2})?)/g;
		let last: string | null = null;
		for (;;) {
			const m = re.exec(text);
			if (m === null) {
				break;
			}
			last = m[1];
		}
		if (last === null) {
			return null;
		}
		const fromText = Number(last.replace(/,/g, ""));
		return Number.isFinite(fromText) && fromText >= 0 ? fromText : null;
	});
}

/**
 * Strict variant: throws if `[data-qa="header-cash"]` is not visible after `timeoutMs`
 * or the rendered value is unreadable. Use this when the test must have a number.
 */
export async function expectHeaderCashUsd(
	page: Page,
	timeoutMs = 30_000,
): Promise<number> {
	const cashBox = page.locator('[data-qa="header-cash"]').first();
	await expect(
		cashBox,
		"header-cash element not found; user may not be logged in",
	).toBeVisible({ timeout: timeoutMs });
	const v = await readHeaderCashUsd(page);
	if (v === null) {
		throw new Error(
			"expectHeaderCashUsd: header-cash visible but data-qa-cash-amount and rendered text both unreadable",
		);
	}
	return v;
}
