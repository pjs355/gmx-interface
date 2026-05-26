/**
 * Limitless diagnostics in the browser console (opt-in only).
 *
 * Set `VITE_DEBUG_LIMITLESS=1` or `true` and rebuild.
 * Deeper order book samples: `VITE_DEBUG_LIMITLESS_VERBOSE=1`.
 */
export function isLimitlessConsoleDebugEnabled(): boolean {
	const v = import.meta.env.VITE_DEBUG_LIMITLESS;
	if (typeof v !== "string") return false;
	const t = v.trim().toLowerCase();
	return t === "1" || t === "true" || t === "yes";
}

export function isLimitlessOrderbookVerboseDebug(): boolean {
	return (
		import.meta.env.VITE_DEBUG_LIMITLESS_VERBOSE === "true" ||
		import.meta.env.VITE_DEBUG_LIMITLESS_VERBOSE === "1"
	);
}
