/**
 * Limitless diagnostics in the browser console.
 *
 * - Default: **on in `import.meta.env.DEV`** only.
 * - Staging/production: set `VITE_DEBUG_LIMITLESS=1` or `true` and rebuild.
 * - Deeper order book samples: `VITE_DEBUG_LIMITLESS_VERBOSE=1`.
 */
export function isLimitlessConsoleDebugEnabled(): boolean {
	return Boolean(
		import.meta.env.DEV ||
			import.meta.env.VITE_DEBUG_LIMITLESS === "true" ||
			import.meta.env.VITE_DEBUG_LIMITLESS === "1",
	);
}

export function isLimitlessOrderbookVerboseDebug(): boolean {
	return (
		import.meta.env.VITE_DEBUG_LIMITLESS_VERBOSE === "true" ||
		import.meta.env.VITE_DEBUG_LIMITLESS_VERBOSE === "1"
	);
}
