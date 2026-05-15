/**
 * Outcome tokens + USDC on DFlow prediction routes use **6** base decimals
 * (same as USDC). Used by `useDflowOrderQuote`, `useSorLegExecutor`, and
 * `GET /api/dflow/order` `outAmount` parsing.
 */
export const DFLOW_OUTCOME_TOKEN_DECIMALS = 6;
export const DFLOW_OUTCOME_BASE_UNIT_FACTOR = 10 ** DFLOW_OUTCOME_TOKEN_DECIMALS;

/**
 * Converts DFlow `outAmount` / `inAmount` integer base units to human outcome
 * contracts or USDC (depending on leg). Returns `null` if missing or invalid.
 */
export function humanFromDflowBaseUnits(
	raw: string | number | undefined | null,
): number | null {
	if (raw === undefined || raw === null) return null;
	const n =
		typeof raw === "string"
			? Number(raw)
			: typeof raw === "number"
				? raw
				: NaN;
	if (!Number.isFinite(n) || n <= 0) return null;
	return n / DFLOW_OUTCOME_BASE_UNIT_FACTOR;
}
