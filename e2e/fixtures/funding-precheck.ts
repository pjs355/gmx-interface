import { type Page, expect } from "@playwright/test";

const MIN_BALANCE_USD = 60;
/** Cash can climb after Base USDC + bridge balances hydrate (see PortfolioContext). */
const BALANCE_READY_TIMEOUT_MS = 90_000;
const POLL_MS = 400;
/** If header Cash stays finite and < min this long without increasing, fail (avoids a silent 90s wait). */
const STUCK_BELOW_MIN_MS = 15_000;
const PROGRESS_LOG_MS = 5_000;

async function readHeaderCashUsd(page: Page): Promise<number | null> {
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

export async function fundingPrecheck(page: Page): Promise<void> {
	const cashBox = page.locator('[data-qa="header-cash"]');

	console.log(
		`[funding-precheck] Checking header Cash is at least $${MIN_BALANCE_USD} (required for E2E trades).`,
	);

	await expect(
		cashBox,
		"header-cash element not found; user may not be logged in or header has not rendered yet",
	).toBeVisible({ timeout: 30_000 });

	const start = Date.now();
	let lastProgressLog = start;
	let bestSeen = -Infinity;
	let stuckBelowMinSince: number | null = null;

	while (Date.now() - start < BALANCE_READY_TIMEOUT_MS) {
		const parsed = await readHeaderCashUsd(page);

		if (parsed !== null && parsed >= MIN_BALANCE_USD) {
			console.log(
				`[funding-precheck] OK — header Cash is $${parsed.toFixed(2)} (>= $${MIN_BALANCE_USD}).`,
			);
			return;
		}

		if (parsed !== null && parsed < MIN_BALANCE_USD) {
			if (parsed > bestSeen + 0.000_001) {
				bestSeen = parsed;
				stuckBelowMinSince = null;
			} else if (stuckBelowMinSince === null) {
				stuckBelowMinSince = Date.now();
			} else if (Date.now() - stuckBelowMinSince >= STUCK_BELOW_MIN_MS) {
				const err = new Error(
					`Funding precheck failed: header Cash stayed at $${parsed.toFixed(2)} for ${STUCK_BELOW_MIN_MS}ms ` +
						`without reaching $${MIN_BALANCE_USD}. This checks the "Cash" metric (Base USDC + bridge stables), ` +
						`not Portfolio MTM. Top up spendable cash or lower MIN_BALANCE_USD in funding-precheck.ts.`,
				);
				console.error("error", err);
				throw err;
			}
		} else {
			stuckBelowMinSince = null;
		}

		const now = Date.now();
		if (now - lastProgressLog >= PROGRESS_LOG_MS) {
			lastProgressLog = now;
			const shown =
				parsed === null ? "(still loading / unreadable)" : `$${parsed.toFixed(2)}`;
			console.log(
				`[funding-precheck] Still checking header Cash >= $${MIN_BALANCE_USD}… ` +
					`${Math.round((now - start) / 1000)}s / ${BALANCE_READY_TIMEOUT_MS / 1000}s — current: ${shown}`,
			);
		}

		await new Promise((r) => setTimeout(r, POLL_MS));
	}

	const last = await readHeaderCashUsd(page);
	const err = new Error(
		`Funding precheck failed: timed out after ${BALANCE_READY_TIMEOUT_MS}ms. ` +
			`Last header Cash read: ${
				last === null ? "null (unreadable)" : `$${last.toFixed(2)}`
			}. ` +
			`Required minimum is $${MIN_BALANCE_USD} (header Cash, not Portfolio).`,
	);
	console.error("error", err);
	throw err;
}

export { MIN_BALANCE_USD };
