/**
 * Predict.fun taker fee and net-held shares after buy (token-side fee skim).
 *
 * Matches SOR server `calculatePredictFee` in predictions-api.
 * Docs: https://docs.predict.fun/the-basics/predict-fees-and-limits
 */

function fin(n: number): boolean {
	return Number.isFinite(n) && n > 0;
}

/**
 * @param contracts   Number of shares traded (gross / pre token-fee skim).
 * @param price       Fill probability 0–1.
 * @param feeRateBps  Basis-point rate from the market (e.g. 200 = 2%).
 * @returns Fee in USDT (5 decimal places, same rounding as server).
 */
export function calculatePredictFee(contracts: number, price: number, feeRateBps: number): number {
	if (!fin(contracts) || !fin(price) || price >= 1 || !fin(feeRateBps)) return 0;
	const pFee = Math.min(price, 1 - price);
	return Math.round(contracts * pFee * (feeRateBps / 10_000) * 100_000) / 100_000;
}

/**
 * Outcome tokens the user **holds** after a Predict **buy** when the protocol
 * fee is taken from delivered tokens (token-side fee).
 */
export function predictFunNetOutcomeSharesHeldAfterBuy(
	grossShares: number,
	avgPrice: number,
	feeRateBps: number,
): number {
	if (!fin(grossShares)) return 0;
	if (!fin(avgPrice) || avgPrice >= 1) return grossShares;
	if (!fin(feeRateBps)) return grossShares;
	const feeUsd = calculatePredictFee(grossShares, avgPrice, feeRateBps);
	const shareSkim = feeUsd / avgPrice;
	const out = grossShares - shareSkim;
	return out > 0 && Number.isFinite(out) ? out : 0;
}
