/**
 * Predict.fun fee — per-market feeRateBps from their API.
 *
 * The rate is returned on each market object via GET /markets and signed into
 * every order by the @predictdotfun/sdk.  This function is for UI display only.
 *
 * Formula:  fee = contracts × price × feeRateBps / 10 000
 */

/**
 * @param contracts   Number of shares traded.
 * @param price       Fill probability 0–1.
 * @param feeRateBps  Basis-point rate from the market (e.g. 200 = 2%).
 * @returns Fee in USDT.
 */
export function calculatePredictFee(
	contracts: number,
	price: number,
	feeRateBps: number,
): number {
	if (contracts <= 0 || price <= 0 || price >= 1 || feeRateBps <= 0) return 0;
	return contracts * price * (feeRateBps / 10_000);
}
