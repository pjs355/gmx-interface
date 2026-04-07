export function formatCurrency(value?: number | null): string {
	if (value === null || value === undefined || !isFinite(value)) return "—";
	const isInt = Math.abs(value % 1) < 1e-9;
	const formatted = isInt
		? value.toLocaleString("en-US", {
				minimumFractionDigits: 0,
				maximumFractionDigits: 0,
		  })
		: value.toLocaleString("en-US", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
		  });
	return `$${formatted}`;
}

export function toCentsString(value?: number | null): string {
	if (value === undefined || value === null || !isFinite(value)) return "--";
	return `${Math.round(value * 100)}¢`;
}
