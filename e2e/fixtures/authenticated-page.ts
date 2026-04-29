import { chromium, type BrowserContext, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";
import { E2E_ROOT, FRONTEND_URL } from "../playwright.config";
import { E2E_PERSISTENT_CONTEXT_OPTIONS } from "../persistent-context-options";

const USER_DATA_DIR = path.join(E2E_ROOT, ".user-data");

/**
 * Chrome leaves these under `user-data-dir`; if the browser was killed without a
 * clean shutdown, the next `launchPersistentContext` fails with ProcessSingleton.
 * Only call after a launch failure that matches that error, or you risk two live
 * processes using one profile.
 */
function removeChromeSingletonArtifacts(profileDir: string): void {
	const names = ["SingletonLock", "SingletonCookie", "SingletonSocket"] as const;
	for (const name of names) {
		const p = path.join(profileDir, name);
		try {
			if (fs.existsSync(p)) {
				fs.unlinkSync(p);
			}
		} catch (e: unknown) {
			console.error("error", e);
		}
	}
}

function isChromeProfileSingletonLaunchError(err: unknown): boolean {
	const msg =
		err instanceof Error
			? `${err.message}\n${err.stack ?? ""}`
			: String(err);
	return /ProcessSingleton|SingletonLock|profile is already in use|Failed to create a ProcessSingleton|File exists \(17\)/i.test(
		msg,
	);
}

async function launchPersistentContextOnce(): Promise<BrowserContext> {
	return chromium.launchPersistentContext(
		USER_DATA_DIR,
		E2E_PERSISTENT_CONTEXT_OPTIONS,
	);
}

/** Only present in the header when Privy + signer report an account (see AppHeaderUser). */
const SENTINEL_LOGGED_IN_USER = '[data-qa="user-address"]';
const SENTINEL_LOGGED_OUT = '[data-qa="connect-wallet-button"]';
/** @deprecated Prefer SENTINEL_LOGGED_IN_USER; portfolio box can lag behind Privy. */
const SENTINEL_LOGGED_IN = ".header-metric-box";

export interface AuthenticatedSession {
	context: BrowserContext;
	page: Page;
}

export async function openAuthenticatedSession(): Promise<AuthenticatedSession> {
	if (!fs.existsSync(USER_DATA_DIR)) {
		throw new Error(
			`Persistent profile not found at ${USER_DATA_DIR}. ` +
				`From prinx-interface run: yarn e2e:seed-profile ` +
				`(or npx tsx e2e/scripts/seed-profile.ts), complete Privy login, then close the browser.`,
		);
	}

	let context: BrowserContext;
	try {
		context = await launchPersistentContextOnce();
	} catch (err: unknown) {
		if (!isChromeProfileSingletonLaunchError(err)) {
			console.error("error", err);
			throw err;
		}
		console.warn(
			`[e2e] Chrome refused profile at ${USER_DATA_DIR} (singleton lock / already in use). ` +
				`Removing stale Singleton* files and retrying once. If this persists, quit any Chrome window ` +
				`that was opened with this same user-data dir (e.g. after yarn e2e:seed-profile).`,
		);
		removeChromeSingletonArtifacts(USER_DATA_DIR);
		try {
			context = await launchPersistentContextOnce();
		} catch (retryErr: unknown) {
			console.error("error", retryErr);
			throw retryErr;
		}
	}

	const pages = context.pages();
	const page = pages.length > 0 ? pages[0] : await context.newPage();

	await page.goto(FRONTEND_URL, { waitUntil: "domcontentloaded" });
	await page.waitForLoadState("load").catch(() => {});

	await assertLoggedIn(page);

	return { context, page };
}

async function assertLoggedIn(page: Page): Promise<void> {
	const userAddress = page.locator(SENTINEL_LOGGED_IN_USER).first();
	const connectBtn = page.locator(SENTINEL_LOGGED_OUT).first();

	const AUTH_TIMEOUT_MS = 90_000;
	const POLL_MS = 400;
	const MIN_GRACE_BEFORE_LOGGED_OUT_MS = 6_000;
	const start = Date.now();

	while (Date.now() - start < AUTH_TIMEOUT_MS) {
		if (await userAddress.isVisible().catch(() => false)) {
			return;
		}
		const elapsed = Date.now() - start;
		if (elapsed >= MIN_GRACE_BEFORE_LOGGED_OUT_MS) {
			if (await connectBtn.isVisible().catch(() => false)) {
				throw new Error(
					`Persistent profile at ${USER_DATA_DIR} is NOT authenticated. ` +
						`[data-qa="user-address"] never appeared, but [data-qa="connect-wallet-button"] did. ` +
						`Re-run yarn e2e:seed-profile (same Chrome channel as e2e/persistent-context-options.ts).`,
				);
			}
		}
		await new Promise((r) => setTimeout(r, POLL_MS));
	}

	throw new Error(
		`Could not confirm login on ${FRONTEND_URL} within ${AUTH_TIMEOUT_MS / 1000}s. ` +
			`[data-qa="user-address"] never became visible. Re-run yarn e2e:seed-profile or confirm the app loads.`,
	);
}

export { USER_DATA_DIR, SENTINEL_LOGGED_IN, SENTINEL_LOGGED_OUT, SENTINEL_LOGGED_IN_USER };
