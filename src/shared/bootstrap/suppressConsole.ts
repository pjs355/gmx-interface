/**
 * Console Suppression for Production
 *
 * This module disables console.log and console.debug in production builds
 * to prevent users from seeing internal logs in the browser console.
 *
 * console.error and console.warn are kept enabled for critical issues.
 *
 * USAGE: Import this file as early as possible in index.tsx (before other imports)
 *
 * NOTE: This must be called BEFORE any other code runs to suppress all logs.
 */

// Store original console methods (useful for debugging if needed)
const originalConsole = {
	log: console.log,
	debug: console.debug,
	info: console.info,
	warn: console.warn,
	error: console.error,
};

// Store original fetch
const originalFetch = window.fetch;

// No-op function for suppressed logs
const noop = () => {};

// URLs to block (unused dependencies that make failing requests)
const BLOCKED_URLS = [
	"api.web3modal.org",
	"api.web3modal.com",
	"pulse.walletconnect.org",
	"pulse.walletconnect.com",
];

/** Opt-in verbose dev console (`console.debug`, e.g. Privy Embedded1193Provider). */
function isDevConsoleDebugEnabled(): boolean {
	const trading = import.meta.env.VITE_DEBUG_TRADING;
	const consoleFlag = import.meta.env.VITE_DEBUG_CONSOLE;
	return trading === "true" || consoleFlag === "true" || consoleFlag === "1";
}

/**
 * Initialize console suppression based on environment
 * Call this once at app startup
 */
export function initConsoleSuppress() {
	// Check if we're in production (Vite sets import.meta.env.PROD)
	const isProduction = import.meta.env.PROD;
	const quietDev = !isProduction && !isDevConsoleDebugEnabled();

	// Block unused web3modal/walletconnect API calls (in both dev and prod)
	// These are from transitive dependencies we don't use
	window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

		if (BLOCKED_URLS.some((blocked) => url.includes(blocked))) {
			// Return a fake successful response instead of making the request
			return new Response(JSON.stringify({}), { status: 200 });
		}

		return originalFetch(input, init);
	};

	if (isProduction) {
		// Suppress verbose logging in production
		console.log = noop;
		console.debug = noop;
		console.info = noop;

		// Keep console.warn and console.error for critical issues
		// These are important for debugging production problems

		// Log once that we've suppressed console (this will be the only log)
		originalConsole.log("[Production] Console logging suppressed");
	} else if (quietDev) {
		// Default dev builds: hide SDK console.debug noise (Privy Embedded1193Provider, etc.)
		console.debug = noop;
	}
}

/**
 * Restore original console methods (useful for debugging)
 * Can be called from browser console: window.__restoreConsole()
 */
export function restoreConsole() {
	console.log = originalConsole.log;
	console.debug = originalConsole.debug;
	console.info = originalConsole.info;
	console.warn = originalConsole.warn;
	console.error = originalConsole.error;
	console.log("[Debug] Console logging restored");
}

// Expose restore function globally for emergency debugging in production
if (typeof window !== "undefined") {
	(window as any).__restoreConsole = restoreConsole;
}
