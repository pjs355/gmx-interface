/**
 * LevelUp 2% fee — MUST match backend micro-unit rounding exactly.
 * Backend: Math.ceil(fee / 10000) * 10000 in USDC micro-units (6 decimals).
 */
export function calculateFeeMatchingBackend(amountInDollars: number): number {
	const amountMicro = Math.floor(amountInDollars * 1_000_000);
	const feeBeforeRounding = Math.floor((amountMicro * 2) / 100);
	const feeRoundedUp = Math.ceil(feeBeforeRounding / 10000) * 10000;
	return feeRoundedUp / 1_000_000;
}
