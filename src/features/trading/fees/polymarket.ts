/**
 * Polymarket taker fee — probability-weighted per category.
 *
 * Formula: fee = C × feeRate × p × (1 − p)
 * https://docs.polymarket.com/trading/fees
 */

export const POLYMARKET_FEE_RATES: Record<string, number> = {
	crypto: 0.072,
	sports: 0.03,
	esports: 0.03,
	finance: 0.04,
	politics: 0.04,
	mentions: 0.04,
	tech: 0.04,
	economics: 0.05,
	culture: 0.05,
	weather: 0.05,
	other: 0.05,
	general: 0.05,
	geopolitics: 0,
};

/** Default rate used for our esports / sports markets. */
export const POLYMARKET_DEFAULT_FEE_RATE = 0.03;

/**
 * @param contracts  Number of shares traded (C).
 * @param price      Fill probability 0–1 (p).
 * @param feeRate    Category taker rate (defaults to Sports 0.03).
 * @returns Fee in USDC, rounded to 5 decimal places.
 */
export function calculatePolymarketFee(
	contracts: number,
	price: number,
	feeRate: number = POLYMARKET_DEFAULT_FEE_RATE,
): number {
	if (contracts <= 0 || price <= 0 || price >= 1 || feeRate <= 0) return 0;
	const raw = contracts * feeRate * price * (1 - price);
	return Math.round(raw * 100_000) / 100_000;
}
