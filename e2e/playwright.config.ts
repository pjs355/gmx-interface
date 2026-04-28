import { defineConfig } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const E2E_ROOT = path.resolve(__dirname);
const FRONTEND_URL = "http://localhost:3010";
const PREDICTIONS_API_URL = "http://localhost:8080";

export default defineConfig({
	testDir: path.join(E2E_ROOT, "specs"),
	timeout: 10 * 60 * 1000,
	globalTimeout: 60 * 60 * 1000,
	expect: {
		timeout: 30 * 1000,
	},
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: [
		["list"],
		["html", { outputFolder: path.join(E2E_ROOT, "playwright-report"), open: "never" }],
	],
	outputDir: path.join(E2E_ROOT, "test-results"),
	use: {
		baseURL: FRONTEND_URL,
		trace: "retain-on-failure",
		video: "retain-on-failure",
		screenshot: "only-on-failure",
		actionTimeout: 30 * 1000,
		navigationTimeout: 60 * 1000,
	},
});

export { FRONTEND_URL, PREDICTIONS_API_URL, E2E_ROOT };
