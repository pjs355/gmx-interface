/** Implied probability 0–1 → bar width 0–100, or null when price is unknown. */
export function oddsBarPercent(price: number | null | undefined): number | null {
	if (price === undefined || price === null || !Number.isFinite(price)) {
		return null;
	}
	return Math.round(Math.max(0, Math.min(1, price)) * 100);
}
