import { chromium } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { E2E_PERSISTENT_CONTEXT_OPTIONS } from "../persistent-context-options";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_DATA_DIR = path.resolve(__dirname, "..", ".user-data");
const FRONTEND_URL = "http://localhost:3010";
const WAIT_FOR_FRONTEND_MS = 120_000;
const POLL_MS = 1_000;

async function waitForFrontendReady(): Promise<void> {
	const start = Date.now();
	let lastErr: unknown = null;
	let nextHintAt = start + 10_000;
	while (Date.now() - start < WAIT_FOR_FRONTEND_MS) {
		try {
			const res = await fetch(FRONTEND_URL, { method: "GET", signal: AbortSignal.timeout(5_000) });
			if (res.ok || res.status === 304) {
				console.log(`[seed-profile] ${FRONTEND_URL} responded after ${Date.now() - start}ms`);
				return;
			}
			lastErr = new Error(`HTTP ${res.status} ${res.statusText}`);
		} catch (err) {
			lastErr = err;
		}
		const now = Date.now();
		if (now >= nextHintAt) {
			nextHintAt = now + 10_000;
			const elapsedSec = Math.round((now - start) / 1000);
			console.log(
				`[seed-profile] still waiting for ${FRONTEND_URL} (${elapsedSec}s) …`,
			);
			console.log(
				"            In another terminal from prinx-interface, start the app on port 3010, e.g.:",
			);
			console.log("            yarn dev:live");
			console.log("            (or `yarn dev` and choose LIVE so Vite binds to :3010.)");
		}
		await new Promise((r) => setTimeout(r, POLL_MS));
	}
	console.error("error", lastErr);
	throw new Error(
		`${FRONTEND_URL} never became reachable within ${WAIT_FOR_FRONTEND_MS / 1000}s. ` +
			`Start the frontend on port 3010, then re-run: yarn e2e:seed-profile`,
	);
}

async function main(): Promise<void> {
	if (!fs.existsSync(USER_DATA_DIR)) {
		fs.mkdirSync(USER_DATA_DIR, { recursive: true });
	}

	console.log(`[seed-profile] persistent profile directory: ${USER_DATA_DIR}`);
	console.log(`[seed-profile] target URL: ${FRONTEND_URL}`);
	console.log("");
	console.log("[seed-profile] waiting for the app to accept connections …");
	await waitForFrontendReady();
	console.log("");
	console.log(
		"Opening Google Chrome (Playwright channel: chrome) — required for Google sign-in …",
	);
	console.log("");
	console.log("Complete the Privy login flow manually in the browser window.");
	console.log("When you see the portfolio header showing your balance, the");
	console.log("session is saved. Close the browser window when done.");
	console.log("");

	const context = await chromium.launchPersistentContext(
		USER_DATA_DIR,
		E2E_PERSISTENT_CONTEXT_OPTIONS,
	);

	const page = context.pages()[0] ?? (await context.newPage());
	await page.goto(FRONTEND_URL, { waitUntil: "domcontentloaded" });

	await new Promise<void>((resolve) => {
		context.on("close", () => {
			console.log("Browser closed; persistent profile saved.");
			resolve();
		});
	});
}

main().catch((err) => {
	console.error("error", err);
	process.exit(1);
});
