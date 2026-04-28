/**
 * Google (and some IdPs) reject sign-in from Playwright’s **bundled Chromium**
 * (“This browser or app may not be secure”). Launching the **installed Google Chrome**
 * via `channel: "chrome"` matches what users normally use and avoids that block.
 *
 * Requires Google Chrome to be installed (stable). If launch fails, install Chrome
 * or complete seeding with email / wallet instead of Google.
 */
export const E2E_PERSISTENT_CONTEXT_OPTIONS = {
	channel: "chrome" as const,
	headless: false,
	viewport: { width: 1440, height: 900 },
	acceptDownloads: false,
};
