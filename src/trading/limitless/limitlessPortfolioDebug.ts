/** Opt-in: `VITE_DEBUG_LIMITLESS_PORTFOLIO=1` (default dev builds stay quiet). */
export function debugLimitlessPortfolio(message: string, data?: unknown): void {
	if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
	if (import.meta.env.VITE_DEBUG_LIMITLESS_PORTFOLIO !== "1") return;
	if (data !== undefined) console.log("[LimitlessPortfolio]", message, data);
	else console.log("[LimitlessPortfolio]", message);
}

/** Opt-in: `VITE_DEBUG_LIMITLESS_PORTFOLIO=1`. */
export function debugLimitlessPortfolioTable(
	message: string,
	rows: Record<string, unknown>[],
): void {
	if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
	if (import.meta.env.VITE_DEBUG_LIMITLESS_PORTFOLIO !== "1") return;
	if (rows.length === 0) return;
	console.log("[LimitlessPortfolio]", message, `(n=${rows.length})`);
	console.table(rows);
}

/** Opt-in: `VITE_DEBUG_LIMITLESS_PORTFOLIO=1`. */
export function debugLimitlessShallowRowShape(label: string, row: unknown): void {
	if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
	if (import.meta.env.VITE_DEBUG_LIMITLESS_PORTFOLIO !== "1") return;
	if (!row || typeof row !== "object") {
		debugLimitlessPortfolio(`${label}: (empty row)`);
		return;
	}
	const o = row as Record<string, unknown>;
	const keys = Object.keys(o).filter((k) => !/secret|password|privateKey/i.test(k));
	const details = o.details;
	const detailKeys =
		details && typeof details === "object"
			? Object.keys(details as object).slice(0, 25)
			: [];
	debugLimitlessPortfolio(`${label}: row shape`, {
		topKeys: keys.slice(0, 35),
		detailsKeyCount:
			details && typeof details === "object"
				? Object.keys(details as object).length
				: 0,
		detailsKeysSample: detailKeys,
	});
}
