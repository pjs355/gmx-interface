/** DFlow `/order/quote` uses USDC 1e6 rounding; align typed vs debounced USD for E2E sentinel. */
export function dflowTypedUsdMatchesDebouncedQuote(
	typedAmount: string,
	debouncedAmount: string,
): boolean {
	const norm = (s: string) =>
		Number.parseFloat(String(s).trim().replace(/,/g, ""));
	const a = norm(typedAmount);
	const b = norm(debouncedAmount);
	if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
		return false;
	}
	return Math.round(a * 1_000_000) === Math.round(b * 1_000_000);
}
