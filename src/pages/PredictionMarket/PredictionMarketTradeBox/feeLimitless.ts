/** Default Limitless taker fee (bps) when BFF does not return a per-market rate. */
export const LIMITLESS_DEFAULT_FEE_RATE_BPS = 300;

export function calculateLimitlessFee(notionalUsd: number, feeRateBps: number): number {
	if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) return 0;
	return (notionalUsd * feeRateBps) / 10_000;
}
