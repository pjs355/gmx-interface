/**
 * Optional hooks for future pricing/venue diagnostics. `priceDebugLog` is a no-op;
 * `isPredictionPricingDebugEnabled()` is true only when explicitly opted in via env or localStorage
 * (used to skip debug-only effect bodies).
 */
const LS_KEY = "DEBUG_PREDICTION_PRICING";

function envEnabled(): boolean {
	const v = import.meta.env.VITE_DEBUG_PREDICTION_PRICING;
	if (typeof v !== "string") return false;
	const t = v.trim().toLowerCase();
	return t === "1" || t === "true" || t === "yes";
}

function localStorageEnabled(): boolean {
	if (typeof window === "undefined") return false;
	try {
		return window.localStorage.getItem(LS_KEY) === "1";
	} catch {
		return false;
	}
}

export function isPredictionPricingDebugEnabled(): boolean {
	return envEnabled() || localStorageEnabled();
}

export function priceDebugLog(_label: string, _payload?: Record<string, unknown>): void {
	void _label;
	void _payload;
}
