/** Whole dollars omit cents; fractional amounts always show two decimals (e.g. 22.9 → "22.90"). */
export function formatUsdAmount(value: number): string {
	const isInt = Math.abs(value % 1) < 1e-9;
	return value.toLocaleString("en-US", {
		minimumFractionDigits: isInt ? 0 : 2,
		maximumFractionDigits: isInt ? 0 : 2,
	});
}

export function formatCurrency(value?: number | null): string {
	if (value === null || value === undefined || !isFinite(value)) return "—";
	return `$${formatUsdAmount(value)}`;
}

export function toCentsString(value?: number | null): string {
	if (value === undefined || value === null || !isFinite(value)) return "--";
	return `${Math.round(value * 100)}¢`;
}
