/**
 * Limitless CLOB fee helpers and net-held shares after buy.
 *
 * Default bps used when BFF omits per-market rate. Net-held uses
 * `limitlessClobFeeUsd` curve (see `./limitlessClobFeeCurve`).
 */
import { limitlessClobFeeUsd } from "./limitlessClobFeeCurve";

/** Default Limitless taker fee (bps) when BFF does not return a per-market rate. */
export const LIMITLESS_DEFAULT_FEE_RATE_BPS = 300;

export function calculateLimitlessFee(notionalUsd: number, feeRateBps: number): number {
	if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) return 0;
	return (notionalUsd * feeRateBps) / 10_000;
}

/**
 * Net outcome shares held after a Limitless **CLOB** market buy.
 */
export function limitlessNetOutcomeSharesHeldAfterBuy(
	grossShares: number,
	avgPrice: number,
): number {
	if (!Number.isFinite(grossShares) || grossShares <= 0) return 0;
	if (!Number.isFinite(avgPrice) || avgPrice <= 0 || avgPrice >= 1) {
		return grossShares;
	}
	const feeUsd = limitlessClobFeeUsd(grossShares, avgPrice, "buy");
	const shareSkim = feeUsd / avgPrice;
	const out = grossShares - shareSkim;
	return out > 0 && Number.isFinite(out) ? out : grossShares;
}
