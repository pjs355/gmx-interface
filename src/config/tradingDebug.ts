/**
 * Opt-in verbose trading / SOR / umbrella / venue-activation telemetry
 * (`VITE_DEBUG_TRADING=true`). Keeps default dev builds quiet so real failures stand out.
 * Production builds also strip `console.info` via `initConsoleSuppress()` in `index.tsx`.
 */
export function isTradingDebugLoggingEnabled(): boolean {
	return (
		typeof import.meta.env !== "undefined" &&
		import.meta.env.VITE_DEBUG_TRADING === "true"
	);
}
