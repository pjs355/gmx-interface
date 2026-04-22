/**
 * Opt-in verbose trading / SOR / umbrella logs (`VITE_DEBUG_TRADING=true`).
 * Keeps default dev builds quiet so real failures stand out.
 */
export function isTradingDebugLoggingEnabled(): boolean {
	return (
		typeof import.meta.env !== "undefined" &&
		import.meta.env.VITE_DEBUG_TRADING === "true"
	);
}
